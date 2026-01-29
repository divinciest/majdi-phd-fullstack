// GatherGrid Crawler Service Worker (MV3)
// Responsibilities:
// - Poll server /crawl/jobs globally via alarms
// - Open tab for job.url, wait for load, request full outer HTML from content script
// - POST {jobId, html} to /crawl/result

const DEFAULTS = {
  serverBaseUrl: 'http://localhost:5007',
  pollingEnabled: true,
  pollIntervalSec: 30,
  autoCloseTab: false,
  allowedDomains: {},
  autoApproveDomains: true,  // Auto-approve ALL domains from server jobs
  redirectDetectionEnabled: true,
  redirectMinTextLength: 3000,
  redirectMaxWaitMs: 30000,
};

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, (cfg) => resolve(cfg));
  });
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken'], (data) => resolve(data.authToken || null));
  });
}

async function getAuthHeaders() {
  const token = await getAuthToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  }
  return { 'Content-Type': 'application/json' };
}

async function isAuthenticated() {
  const token = await getAuthToken();
  return !!token;
}

// Aggressive keepalive to prevent service worker termination
let _lastKeepalive = Date.now();
setInterval(() => {
  _lastKeepalive = Date.now();
  console.log('[gg-sw] KEEPALIVE tick', { uptime: Math.floor((Date.now() - _lastKeepalive) / 1000) + 's' });
}, 20000);

// Activity logging for debug panel and log stream
async function logActivity(level, message, details = null, url = null) {
  try {
    const timestamp = new Date().toISOString();
    const entry = { 
      timestamp, 
      level, 
      message, 
      source: 'background'
    };
    if (details) entry.details = details;
    if (url) entry.url = url;
    
    // Get existing log
    const result = await new Promise(r => chrome.storage.local.get(['extensionLogs', 'activityLog'], r));
    
    // Update new unified log for log stream
    const extensionLogs = result.extensionLogs || [];
    extensionLogs.push(entry);
    const trimmedExtension = extensionLogs.slice(-2000); // Keep last 2000
    
    // Also update legacy activityLog for backward compatibility with debug panel
    const activityLog = result.activityLog || [];
    activityLog.push(entry);
    const trimmedActivity = activityLog.slice(-100);
    
    // Save both
    await new Promise(r => chrome.storage.local.set({ 
      extensionLogs: trimmedExtension,
      activityLog: trimmedActivity
    }, r));
    
    // Also console log with icon
    const icon = { 'ERROR': '❌', 'WARN': '⚠️', 'INFO': 'ℹ️', 'SUCCESS': '✅', 'POLL': '🔄', 'JOB': '📋', 'DOMAIN': '🌐' }[level] || 'ℹ️';
    console.log(`${icon} [${level}]`, message, details || '');
  } catch (e) {
    console.error('[gg-sw] logActivity error:', e);
  }
}

// Update active jobs list for debug panel
async function updateActiveJobs(jobs) {
  try {
    await new Promise(r => chrome.storage.local.set({ activeJobs: jobs || [] }, r));
  } catch (e) {
    console.error('[gg-sw] updateActiveJobs error:', e);
  }
}

// Update last poll info for debug panel
async function updatePollInfo(result) {
  try {
    await new Promise(r => chrome.storage.local.set({ 
      lastPollTime: new Date().toISOString(),
      lastPollResult: result || {}
    }, r));
  } catch (e) {
    console.error('[gg-sw] updatePollInfo error:', e);
  }
}

// Extension logging to unified logs.txt
let _logBuffer = [];
const LOG_BATCH_SIZE = 20;
const LOG_FLUSH_INTERVAL_MS = 3000;
const MAX_LOG_BUFFER = 100;

async function logToServer(runId, level, message, context = null) {
  if (!runId) {
    console.log('[gg-sw] logToServer: no runId provided', { level, message });
    return;
  }
  try {
    _logBuffer.push({ runId, level, message, context });
    
    // Enforce max buffer size to prevent memory leak
    if (_logBuffer.length > MAX_LOG_BUFFER) {
      console.warn('[gg-sw] log buffer overflow, dropping oldest entries', { size: _logBuffer.length });
      _logBuffer = _logBuffer.slice(-MAX_LOG_BUFFER);
    }
    
    if (_logBuffer.length >= LOG_BATCH_SIZE) {
      await flushLogs();
    }
  } catch (e) {
    console.log('[gg-sw] logToServer: error', { error: String(e) });
  }
}

async function flushLogs() {
  if (_logBuffer.length === 0) return;
  const batch = _logBuffer.splice(0, LOG_BATCH_SIZE);
  
  console.log('[gg-sw] flushLogs: flushing', { count: batch.length });
  
  // Group by runId
  const byRun = {};
  for (const entry of batch) {
    const rid = entry.runId;
    if (!byRun[rid]) byRun[rid] = [];
    byRun[rid].push({
      source: 'extension',
      level: entry.level,
      message: entry.message,
      context: entry.context
    });
  }
  
  // Send batches per run
  const cfg = await getConfig();
  const base = (cfg.serverBaseUrl || '').replace(/\/$/, '');
  
  if (!base) {
    console.log('[gg-sw] flushLogs: no serverBaseUrl configured');
    // Re-queue the batch
    _logBuffer.unshift(...batch);
    return;
  }
  
  const failedBatches = [];
  
  for (const [runId, entries] of Object.entries(byRun)) {
    try {
      const url = `${base}/runs/${runId}/logs/append`;
      console.log('[gg-sw] flushLogs: posting', { url, count: entries.length, runId });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const authHeaders = await getAuthHeaders();
      const resp = await fetch(url, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ entries }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!resp.ok) {
        console.log('[gg-sw] flushLogs: HTTP error', { status: resp.status, runId });
        // Re-queue for retry on non-400 errors
        if (resp.status >= 500) {
          failedBatches.push(...batch.filter(e => e.runId === runId));
        }
      } else {
        console.log('[gg-sw] flushLogs: success', { runId, count: entries.length });
      }
    } catch (e) {
      console.log('[gg-sw] flushLogs: fetch error', { runId, error: String(e) });
      // Re-queue failed entries for retry
      failedBatches.push(...batch.filter(e => e.runId === runId));
    }
  }
  
  // Re-queue failed batches at front of buffer (with limit)
  if (failedBatches.length > 0 && _logBuffer.length < MAX_LOG_BUFFER - failedBatches.length) {
    console.log('[gg-sw] flushLogs: re-queuing failed entries', { count: failedBatches.length });
    _logBuffer.unshift(...failedBatches);
  }
}

// Periodic log flushing
setInterval(flushLogs, LOG_FLUSH_INTERVAL_MS);

// Periodic diagnostic: log buffer state every 30 seconds
setInterval(() => {
  if (_logBuffer.length > 0) {
    console.log('[gg-sw] DIAGNOSTIC: log buffer status', { bufferSize: _logBuffer.length, nextFlushIn: '3s' });
  }
}, 30000);

// On-demand sync of domain scripts for the popup browser
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'gg-sync-scripts') return;
  (async () => {
    try {
      const cfg = await getConfig();
      const base = (cfg.serverBaseUrl || '').replace(/\/$/, '');
      if (!base) { sendResponse({ ok: false, error: 'no base' }); return; }
      const sc = await getScriptsCache();
      const cacheEmpty = !sc.byDomain || Object.keys(sc.byDomain).length === 0;
      let q = 'limit=0&mode=peek';
      if (cacheEmpty) {
        q += `&since=${encodeURIComponent('0000-01-01T00:00:00Z')}`;
      } else if (sc.etag) {
        q += `&scriptsEtag=${encodeURIComponent(sc.etag)}`;
      } else if (sc.since) {
        q += `&since=${encodeURIComponent(sc.since)}`;
      }
      const url = `${base}/crawl/jobs?${q}&includeScripts=1`;
      const msgHeaders = await getAuthHeaders();
      const r = await fetch(url, { method: 'GET', headers: msgHeaders, cache: 'no-cache' });
      if (!r.ok) { sendResponse({ ok: false, error: `HTTP ${r.status}` }); return; }
      const data = await r.json();
      const scripts = (data && data.scripts) || [];
      const newByDomain = Object.assign({}, sc.byDomain);
      let newestUpdated = sc.since || '';
      for (const s of scripts) {
        try {
          const d = normalizeScriptDomain(s && s.domain);
          if (!d) continue;
          newByDomain[d] = {
            hash: s && s.hash,
            script: s && s.script,
            condition: s && s.condition,
            waitBeforeMs: Number((s && s.waitBeforeMs) || 0),
            waitAfterMs: Number((s && s.waitAfterMs) || 0),
            createdAt: s && s.createdAt,
            updatedAt: s && s.updatedAt,
          };
          if (s && s.updatedAt && String(s.updatedAt) > String(newestUpdated)) {
            newestUpdated = String(s.updatedAt);
          }
        } catch (_) {}
      }
      const newEtag = (data && data.scriptsEtag) || sc.etag || '';
      await setScriptsCache({ byDomain: newByDomain, etag: newEtag, since: newestUpdated });
      sendResponse({ ok: true, byDomain: newByDomain, etag: newEtag, since: newestUpdated });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async
});

function evalConditionOnTab(tabId, condCode, domainLabel) {
  return new Promise((resolve) => {
    try {
      if (!condCode || typeof condCode !== 'string') return resolve(false);
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: (code, dLabel) => {
          try {
            const ts = new Date().toISOString();
            console.log('[gg-cond] eval.begin', { domain: dLabel, at: ts });
            let result = false;
            try {
              const fn = new Function('"use strict";\nreturn (function(){\n' + code + '\n})();');
              const r = fn();
              result = !!r;
            } catch (e) {
              console.log('[gg-cond] eval.error', { domain: dLabel, err: String(e) });
              result = false;
            }
            console.log('[gg-cond] eval.end', { domain: dLabel, result });
            return result;
          } catch (e) {
            console.log('[gg-cond] eval.exec.error', { domain: dLabel, err: String(e) });
            return false;
          }
        },
        args: [condCode, domainLabel],
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.log('[gg-sw] evalCondition executeScript error', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        try {
          const ok = Array.isArray(results) && results.length ? !!results[0].result : false;
          resolve(ok);
        } catch (_) {
          resolve(false);
        }
      });
    } catch (e) {
      resolve(false);
    }
  });
}

async function waitForCrawlCondition(tabId, condCode, maxWaitMs, intervalMs) {
  const deadline = Date.now() + (maxWaitMs || 60000);
  const step = Math.max(200, intervalMs || 1000);
  while (Date.now() < deadline) {
    const ok = await evalConditionOnTab(tabId, condCode, '');
    if (ok) return true;
    await new Promise(r => setTimeout(r, step));
  }
  return false;
}

// History helpers (non-invasive; stored in chrome.storage.local)
function getHistory() {
  return new Promise((resolve) => chrome.storage.local.get(['crawlHistory'], (v) => resolve((v && v.crawlHistory) || [])));
}
function setHistory(list) {
  return new Promise((resolve) => chrome.storage.local.set({ crawlHistory: Array.isArray(list) ? list : [] }, resolve));
}
async function pushHistory(item) {
  try {
    const list = await getHistory();
    list.push(Object.assign({}, item, { ts: Date.now() }));
    // cap to last 100 items to bound storage (HTML is heavy)
    while (list.length > 100) list.shift();
    await setHistory(list);
  } catch (_) {}
}

// Live crawl status helpers (rendered by popup in real time)
function setLiveStatus(obj) {
  try {
    return new Promise((resolve) => chrome.storage.local.set({ liveCrawl: Object.assign({}, obj, { ts: Date.now() }) }, resolve));
  } catch (_) { return Promise.resolve(); }
}
function getLiveStatus() {
  return new Promise((resolve) => chrome.storage.local.get(['liveCrawl'], (v) => resolve(v && v.liveCrawl)));
}
function clearLiveStatus() {
  return new Promise((resolve) => chrome.storage.local.remove(['liveCrawl'], resolve));
}

// Auto-retry helper: when a domain becomes allowed, re-trigger a pending test crawl URL once
function autoRetryTestCrawl(domain, url) {
  try {
    const base = normalizeDomain(String(domain || ''));
    const onChange = async (changes, area) => {
      try {
        if (area !== 'sync' || !changes || !changes.allowedDomains) return;
        const cfg = await getConfig();
        if (isDomainAllowed(cfg, base)) {
          chrome.storage.onChanged.removeListener(onChange);
          chrome.runtime.sendMessage({ type: 'gg-test-crawl', url });
        }
      } catch (_) {}
    };
    chrome.storage.onChanged.addListener(onChange);
  } catch (_) {}
}

// Preview HTML result in new tab
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'gg-preview-html') return;
  (async () => {
    try {
      const html = msg.html || '';
      if (!html) {
        sendResponse({ ok: false, error: 'No HTML to preview' });
        return;
      }
      // Store HTML temporarily for preview page to read
      await new Promise((resolve) => chrome.storage.local.set({ previewHtml: html }, resolve));
      // Open preview page
      const previewUrl = chrome.runtime.getURL('preview.html');
      await chrome.tabs.create({ url: previewUrl, active: true });
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async
});

// Local test crawl entry point: open URL, apply condition/script if present, collect HTML, record timings; no server submission
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'gg-test-crawl') return;
  (async () => {
    const url = String(msg.url || '').trim();
    if (!url) { sendResponse({ ok: false, error: 'empty url' }); return; }
    const domain = getDomainFromUrl(url);
    try {
      const cfg = await getConfig();
      if (!isDomainAllowed(cfg, domain)) {
        await registerPendingDomain(domain);
        await setLiveStatus({ mode: 'local', phase: 'domain_disallowed', url, domain });
        autoRetryTestCrawl(domain, url);
        sendResponse({ ok: false, error: `domain not allowed: ${domain}. Approve in popup -> Domains` });
        return;
      }
    } catch (_) {}
    const sc = await getScriptsCache();
    const d = normalizeScriptDomain(domain);
    const rec = sc.byDomain && sc.byDomain[d];
    const hist = { kind: 'local', url, domain, ts: Date.now(), phases: {}, status: 'begin' };
    try {
      await setLiveStatus({ mode: 'local', phase: 'open', url, domain });
      const tabId = await openOrCreateTab(url);
      hist.phases.opened = Date.now();
      console.log('[gg-sw] Test Crawl: tab opened', { tabId, domain: d, url });
      
      const logToPage = (msg) => {
        try {
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (m) => { console.log('[gg-page]', m); },
            args: [msg],
          }, (results) => {
            const err = chrome.runtime.lastError;
            if (err) console.log('[gg-sw] logToPage error', { msg, error: err.message });
          });
        } catch (e) {
          console.log('[gg-sw] logToPage exception', { msg, error: String(e) });
        }
      };
      
      console.log('[gg-sw] Test Crawl: cache lookup', { domain: d, hasScript: !!(rec && rec.script), cacheKeys: sc && sc.byDomain ? Object.keys(sc.byDomain) : [] });
      
      let condPromise = Promise.resolve(true);
      if (rec && rec.condition && String(rec.condition).trim()) {
        await setLiveStatus({ mode: 'local', phase: 'wait_condition', url, domain });
        hist.phases.conditionBegin = Date.now();
        condPromise = waitForCrawlCondition(tabId, rec.condition, 60000, 500);
      }
      await setLiveStatus({ mode: 'local', phase: 'wait_load', url, domain });
      console.log('[gg-sw] Test Crawl: waiting for tab complete...');
      await waitForTabComplete(tabId, 30000);
      console.log('[gg-sw] Test Crawl: tab complete');
      
      // Redirect detection phase for test crawl
      if (cfg.redirectDetectionEnabled !== false) {
        try {
          await setLiveStatus({ mode: 'local', phase: 'check_redirect', url, domain });
          
          const redirectResult = await waitForRedirectOrContent(
            tabId,
            cfg.redirectMinTextLength || 3000,
            cfg.redirectMaxWaitMs || 30000
          );
          
          console.log('[gg-sw] Test Crawl: redirect check complete', redirectResult);
          
          if (redirectResult.redirectOccurred) {
            console.log('[gg-sw] Test Crawl: redirect detected, waiting for new page load');
            await waitForTabComplete(tabId, 30000);
          }
          
          hist.phases.redirectCheckMs = redirectResult.waitedMs;
          hist.redirectOccurred = redirectResult.redirectOccurred;
          hist.redirectReason = redirectResult.reason;
          hist.finalUrl = redirectResult.finalUrl;
          hist.initialTextLength = redirectResult.initialTextLength;
          hist.finalTextLength = redirectResult.finalTextLength;
        } catch (e) {
          console.log('[gg-sw] Test Crawl: redirect detection error, continuing anyway', String(e));
        }
      }
      
      console.log('[gg-sw] Test Crawl: now calling logToPage...');
      const ok = await condPromise;
      if (hist.phases.conditionBegin) hist.phases.conditionMs = Date.now() - hist.phases.conditionBegin;
      if (!ok) throw new Error('crawl condition timeout');
      if (rec && rec.script) {
        console.log('[gg-sw] Test Crawl: script found, logging to page and executing');
        logToPage(`Test Crawl: domain script found for ${d}, size: ${(rec.script && rec.script.length) || 0} bytes`);
        await setLiveStatus({ mode: 'local', phase: 'run_script', url, domain });
        hist.phases.scriptBegin = Date.now();
        await runScriptOnTab(tabId, rec.script, d);
        hist.phases.scriptMs = Date.now() - hist.phases.scriptBegin;
        console.log('[gg-sw] Test Crawl: script execution complete');
      } else {
        console.log('[gg-sw] Test Crawl: NO script in cache for domain', { domain: d });
        logToPage(`Test Crawl: no domain script configured for ${d}`);
      }
      await setLiveStatus({ mode: 'local', phase: 'extract_html', url, domain });
      const html = await getHtmlFromTab(tabId); // Use default 200s timeout
      hist.size = (html && html.length) || 0;
      hist.html = html; // Store HTML for preview
      hist.status = 'ok';
      await pushHistory(hist);
      await clearLiveStatus();
      sendResponse({ ok: true });
    } catch (e) {
      hist.error = String(e);
      hist.status = 'error';
      await pushHistory(hist);
      await setLiveStatus({ mode: 'local', phase: 'error', url, domain, error: String(e) });
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async
});

// REMOVED: Local doneJobs cache - never cache job completion state locally
// The server is the single source of truth for job status

async function setConfig(patch) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(patch, () => {
      if (chrome.runtime.lastError) {
        console.error('[gg-sw] setConfig error:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

async function initConfigDefaults() {
  const existing = await getConfig();
  const updates = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (existing[key] === undefined) {
      updates[key] = value;
    }
  }
  if (Object.keys(updates).length > 0) {
    console.log('[gg-sw] setting missing config defaults', updates);
    await setConfig(updates);
  }
}

function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys || null, resolve));
}
function setLocal(patch) {
  return new Promise((resolve) => chrome.storage.local.set(patch || {}, resolve));
}

function getActiveJobs() {
  return new Promise((resolve) => chrome.storage.local.get(['activeJobs'], (v) => {
    const map = (v && v.activeJobs) || {};
    const now = Date.now();
    const out = {};
    const staleThresholdMs = 5 * 60 * 1000; // 5 minutes
    let hadStale = false;
    for (const [k, rec] of Object.entries(map)) {
      const ts = Number(rec && rec.ts || 0);
      if (now - ts < staleThresholdMs) {
        out[k] = rec;
      } else {
        console.log('[gg-sw] activeJobs: dropping stale entry', { jobId: k, age_ms: now - ts });
        hadStale = true;
      }
    }
    // Persist cleaned map if we dropped stale entries
    if (hadStale) {
      chrome.storage.local.set({ activeJobs: out }, () => resolve(out));
    } else {
      resolve(out);
    }
  }));
}

function setActiveJobs(map) {
  return new Promise((resolve) => chrome.storage.local.set({ activeJobs: map || {} }, resolve));
}

// Manual poll trigger for debugging and immediate polling
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'POLL_NOW') return;
  (async () => {
    try {
      console.log('[gg-sw] POLL_NOW message received, triggering manual poll');
      await logActivity('POLL', 'Manual poll triggered via message');
      const cfg = await getConfig();
      if (!cfg.pollingEnabled) {
        console.log('[gg-sw] POLL_NOW: polling disabled in config');
        sendResponse({ ok: false, error: 'Polling is disabled' });
        return;
      }
      await pollOnce(cfg);
      console.log('[gg-sw] POLL_NOW: poll complete');
      sendResponse({ ok: true, message: 'Poll completed' });
    } catch (e) {
      console.log('[gg-sw] POLL_NOW error', String(e));
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // Keep channel open for async response
});

chrome.runtime.onInstalled.addListener(async () => {
  // Initialize defaults if missing (doesn't overwrite existing values)
  await initConfigDefaults();
  const cfg = await getConfig();
  console.log('[gg-sw] onInstalled: config loaded', { 
    pollingEnabled: cfg.pollingEnabled, 
    pollIntervalSec: cfg.pollIntervalSec,
    serverBaseUrl: cfg.serverBaseUrl
  });
  await logActivity('INFO', 'Extension installed - initializing...');
  
  // Clear stale active jobs on fresh start
  await setActiveJobs({});
  console.log('[gg-sw] cleared stale active jobs');
  
  const pollInterval = Number(cfg.pollIntervalSec || 30);
  // Chrome alarms have 1-minute minimum for unpacked extensions
  chrome.alarms.create('gg-crawl-poll', { 
    delayInMinutes: Math.max(1, pollInterval / 60),
    periodInMinutes: Math.max(1, pollInterval / 60) 
  });
  chrome.alarms.create('gg-keepalive', { 
    delayInMinutes: 0.33,
    periodInMinutes: 0.33 
  });
  await ensureOffscreen();
  console.log('[gg-sw] onInstalled: alarms scheduled', { pollIntervalSec: pollInterval });
  console.log('[gg-sw] onInstalled: log buffer size', { bufferSize: _logBuffer.length });
  
  // Verify alarms were created
  chrome.alarms.getAll(async (alarms) => {
    console.log('[gg-sw] onInstalled: active alarms', { count: alarms.length, names: alarms.map(a => a.name) });
    await logActivity('SUCCESS', `Extension ready - ${alarms.length} alarms active, polling ${cfg.pollingEnabled ? 'ENABLED' : 'DISABLED'}`);
  });
  
  // Trigger immediate poll after installation if enabled
  if (cfg.pollingEnabled) {
    console.log('[gg-sw] onInstalled: triggering immediate first poll');
    setTimeout(async () => {
      try {
        await pollOnce(cfg);
        console.log('[gg-sw] onInstalled: first poll completed');
      } catch (e) {
        console.log('[gg-sw] onInstalled: first poll error', String(e));
      }
    }, 2000);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const cfg = await getConfig();
  
  // Clear stale active jobs on restart
  await setActiveJobs({});
  console.log('[gg-sw] onStartup: cleared stale active jobs');
  
  const pollInterval = Number(cfg.pollIntervalSec || 30);
  // Chrome alarms have 1-minute minimum for unpacked extensions
  chrome.alarms.create('gg-crawl-poll', { 
    delayInMinutes: Math.max(1, pollInterval / 60),
    periodInMinutes: Math.max(1, pollInterval / 60) 
  });
  chrome.alarms.create('gg-keepalive', { 
    delayInMinutes: 0.33,
    periodInMinutes: 0.33 
  });
  await ensureOffscreen();
  console.log('[gg-sw] onStartup: alarms scheduled', { pollIntervalSec: pollInterval });
  
  // Trigger immediate poll after startup if enabled
  if (cfg.pollingEnabled) {
    console.log('[gg-sw] onStartup: triggering immediate first poll');
    setTimeout(async () => {
      try {
        await pollOnce(cfg);
        console.log('[gg-sw] onStartup: first poll completed');
      } catch (e) {
        console.log('[gg-sw] onStartup: first poll error', String(e));
      }
    }, 2000);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  // Wrap in IIFE to properly handle async in Chrome alarm listener
  (async () => {
    try {
      console.log('[gg-sw] alarm fired', { name: alarm.name, scheduledTime: alarm.scheduledTime });
      
      if (alarm.name === 'gg-keepalive') {
        // Ensure alarms and offscreen doc persist
        const cfg = await getConfig();
        const pollInterval = Number(cfg.pollIntervalSec || 30);
        chrome.alarms.create('gg-crawl-poll', { 
          delayInMinutes: Math.max(1, pollInterval / 60),
          periodInMinutes: Math.max(1, pollInterval / 60) 
        });
        chrome.alarms.create('gg-keepalive', { 
          delayInMinutes: 0.33,
          periodInMinutes: 0.33 
        });
        await ensureOffscreen();
        chrome.alarms.getAll((all) => {
          const names = (all || []).map(a => a.name);
          console.log('[gg-sw] keepalive tick: ensured alarms/offscreen', { alarms: names, pollIntervalSec: pollInterval });
        });
        return;
      }
      if (alarm.name === 'gg-crawl-poll') {
        const cfg = await getConfig();
        if (!cfg.pollingEnabled) {
          console.log('[gg-sw] poll alarm: polling disabled');
          await logActivity('WARN', 'Poll alarm fired but polling is DISABLED in settings');
          return;
        }
        console.log('[gg-sw] poll alarm: begin');
        await logActivity('POLL', 'Poll alarm fired - starting poll cycle');
        await pollOnce(cfg);
        console.log('[gg-sw] poll alarm: end');
      } else {
        console.log('[gg-sw] unknown alarm fired', { name: alarm.name });
      }
    } catch (e) {
      console.log('[gg-sw] onAlarm error', String(e));
      try {
        await setConfig({ lastStatus: `poll error: ${String(e)}` });
      } catch (e2) {
        console.log('[gg-sw] failed to update lastStatus', String(e2));
      }
    }
  })();
});

// Aggressive fallback polling since Chrome alarms are unreliable for <1min intervals
// Primary polling mechanism via setInterval since alarm API has 1-minute minimum
let _lastPollTime = 0;
let _fallbackPollingActive = true; // Always active for reliability

setInterval(async () => {
  try {
    const cfg = await getConfig();
    if (!cfg.pollingEnabled) return;
    
    const pollInterval = Number(cfg.pollIntervalSec || 30) * 1000; // Convert to ms
    const timeSinceLastPoll = Date.now() - _lastPollTime;
    
    // Poll based on configured interval
    if (timeSinceLastPoll >= pollInterval) {
      console.log('[gg-sw] setInterval poll executing', { 
        interval_sec: pollInterval / 1000,
        timeSinceLastPoll_sec: Math.floor(timeSinceLastPoll / 1000) 
      });
      await pollOnce(cfg);
      console.log('[gg-sw] setInterval poll complete');
    }
  } catch (e) {
    console.log('[gg-sw] setInterval polling error', String(e));
  }
}, 5000); // Check every 5 seconds

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  const keys = Object.keys(changes || {});
  
  // Log domain approval changes and retry pending jobs
  if (keys.includes('allowedDomains')) {
    try {
      const newDomains = changes.allowedDomains.newValue || {};
      const oldDomains = changes.allowedDomains.oldValue || {};
      for (const domain in newDomains) {
        const newState = newDomains[domain];
        const oldState = oldDomains[domain];
        if (newState && newState.allowed && (!oldState || !oldState.allowed)) {
          console.log('[gg-sw] domain approved by user', { domain, timestamp: Date.now() });
          
          // Retry pending jobs for this domain
          const pendingJobs = await getPendingDomainJobs();
          const jobs = pendingJobs[domain] || [];
          if (jobs.length > 0) {
            console.log('[gg-sw] retrying pending jobs for approved domain', { domain, count: jobs.length });
            // Clear these jobs from pending
            delete pendingJobs[domain];
            await setPendingDomainJobs(pendingJobs);
            
            // Reset jobs on server to PENDING so they'll be picked up in next poll
            const base = (await getConfig()).serverBaseUrl || '';
            for (const job of jobs) {
              try {
                const resetAuthHeaders = await getAuthHeaders();
                const resetResp = await fetch(`${base}/crawl/jobs/${job.jobId}/reset`, { method: 'POST', headers: resetAuthHeaders });
                if (resetResp.ok) {
                  console.log('[gg-sw] job reset for retry after domain approval', { jobId: job.jobId, domain });
                }
              } catch (e) {
                console.log('[gg-sw] failed to reset job for retry', { jobId: job.jobId, error: String(e) });
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('[gg-sw] domain change tracking error', String(e));
    }
  }
  
  if (keys.includes('pollIntervalSec') || keys.includes('pollingEnabled')) {
    try {
      const cfg = await getConfig();
      if (cfg.pollingEnabled) {
        const pollInterval = Number(cfg.pollIntervalSec || 30);
        chrome.alarms.create('gg-crawl-poll', { 
          delayInMinutes: Math.max(1, pollInterval / 60),
          periodInMinutes: Math.max(1, pollInterval / 60) 
        });
        chrome.alarms.create('gg-keepalive', { 
          delayInMinutes: 0.33,
          periodInMinutes: 0.33 
        });
        await ensureOffscreen();
        console.log('[gg-sw] storage change: rescheduled alarms', { pollIntervalSec: pollInterval });
      } else {
        chrome.alarms.clear('gg-crawl-poll');
        chrome.alarms.clear('gg-keepalive');
        console.log('[gg-sw] storage change: cleared alarms');
      }
    } catch (e) {
      console.log('[gg-sw] alarm reschedule error', String(e));
    }
  }
});

async function hasOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    try {
      return await chrome.offscreen.hasDocument();
    } catch (e) {
      return false;
    }
  }
  // Fallback: try to ping known offscreen URL by creating if needed
  return false;
}

async function ensureOffscreen() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) return;
  const exists = await hasOffscreenDocument();
  if (exists) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Keep service worker active for continuous crawl polling and HTML processing',
    });
    console.log('[gg-sw] offscreen document created');
  } catch (e) {
    // If already exists or not allowed, ignore
    console.log('[gg-sw] offscreen create error', String(e));
  }
}

async function getScriptsCache() {
  const data = await getLocal(['scriptsByDomain', 'scriptsEtag', 'lastScriptsSince']);
  return {
    byDomain: (data && data.scriptsByDomain) || {},
    etag: (data && data.scriptsEtag) || '',
    since: (data && data.lastScriptsSince) || '',
  };
}

async function setScriptsCache(patch) {
  const cur = await getScriptsCache();
  const next = {
    byDomain: patch.byDomain !== undefined ? patch.byDomain : cur.byDomain,
    etag: patch.etag !== undefined ? patch.etag : cur.etag,
    since: patch.since !== undefined ? patch.since : cur.since,
  };
  await setLocal({ scriptsByDomain: next.byDomain, scriptsEtag: next.etag, lastScriptsSince: next.since });
}

// Force-fetch scripts from server and update local cache immediately
async function fetchScriptsNow() {
  try {
    const cfg = await getConfig();
    const base = (cfg.serverBaseUrl || '').replace(/\/$/, '');
    if (!base) return false;
    const sc = await getScriptsCache();
    const cacheEmpty = !sc.byDomain || Object.keys(sc.byDomain).length === 0;
    let q = 'limit=0&mode=peek';
    if (cacheEmpty) q += `&since=${encodeURIComponent('0000-01-01T00:00:00Z')}`;
    else if (sc.etag) q += `&scriptsEtag=${encodeURIComponent(sc.etag)}`;
    else if (sc.since) q += `&since=${encodeURIComponent(sc.since)}`;
    const url = `${base}/crawl/jobs?${q}&includeScripts=1`;
    const headers = await getAuthHeaders();
    const r = await fetch(url, { method: 'GET', headers, cache: 'no-cache' });
    if (!r.ok) return false;
    const data = await r.json();
    const scripts = (data && data.scripts) || [];
    const newByDomain = Object.assign({}, sc.byDomain);
    let newestUpdated = sc.since || '';
    for (const s of scripts) {
      try {
        const d = normalizeScriptDomain(s && s.domain);
        if (!d) continue;
        newByDomain[d] = {
          hash: s && s.hash,
          script: s && s.script,
          condition: s && s.condition,
          waitBeforeMs: Number((s && s.waitBeforeMs) || 0),
          waitAfterMs: Number((s && s.waitAfterMs) || 0),
          createdAt: s && s.createdAt,
          updatedAt: s && s.updatedAt,
        };
        if (s && s.updatedAt && String(s.updatedAt) > String(newestUpdated)) {
          newestUpdated = String(s.updatedAt);
        }
      } catch (_) {}
    }
    const newEtag = (data && data.scriptsEtag) || sc.etag || '';
    await setScriptsCache({ byDomain: newByDomain, etag: newEtag, since: newestUpdated });
    return !!scripts.length;
  } catch (_) {
    return false;
  }
}

function normalizeScriptDomain(host) {
  try {
    if (!host) return '';
    let h = String(host).toLowerCase();
    h = h.replace(/^www\./, '').replace(/^m\./, '').replace(/^amp\./, '');
    return h;
  } catch (_) { return host; }
}

// Maintain a small seen-jobs map in local storage to avoid re-processing the same pending jobs
function getSeenJobs() {
  return new Promise((resolve) => chrome.storage.local.get(['seenJobs'], (v) => {
    const map = (v && v.seenJobs) || {};
    // compact entries older than 24h
    const now = Date.now();
    const out = {};
    let cleaned = false;
    for (const [k, rec] of Object.entries(map)) {
      const ts = Number(rec && rec.ts || 0);
      if (now - ts < 24 * 60 * 60 * 1000) {
        out[k] = rec;
      } else {
        cleaned = true;
      }
    }
    // Persist cleaned map if we removed stale entries
    if (cleaned) {
      chrome.storage.local.set({ seenJobs: out }, () => resolve(out));
    } else {
      resolve(out);
    }
  }));
}

function setSeenJobs(map) {
  return new Promise((resolve) => chrome.storage.local.set({ seenJobs: map || {} }, resolve));
}

async function claimJob(base, jobId) {
  try {
    const url = `${String(base || '').replace(/\/$/, '')}/crawl/claim`;
    console.log('[gg-sw] claiming job', { jobId, url });
    const headers = await getAuthHeaders();
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jobId }),
    });
    if (!r.ok) {
      console.log('[gg-sw] claim HTTP error', { status: r.status, jobId });
      return false;
    }
    const js = await r.json();
    const st = (js && js.status) || '';
    console.log('[gg-sw] claim response', { jobId, status: st });
    const claimed = String(st).toUpperCase() === 'CLAIMED';
    if (!claimed) {
      console.log('[gg-sw] claim failed - job in wrong state', { jobId, status: st });
    }
    return claimed;
  } catch (e) {
    console.log('[gg-sw] claim error', { jobId, error: String(e) });
    return false;
  }
}

async function pollOnce(cfg) {
  // Update last poll time for interval tracking
  _lastPollTime = Date.now();
  
  const base = (cfg.serverBaseUrl || '').replace(/\/$/, '');
  if (!base) {
    await logActivity('WARN', 'Poll skipped - no server URL configured');
    return;
  }
  
  // Check authentication
  const authToken = await getAuthToken();
  if (!authToken) {
    await logActivity('WARN', 'Poll skipped - not authenticated. Please login in Settings.');
    await updatePollInfo({ error: 'Not authenticated', jobsCount: 0, scriptsCount: 0 });
    return;
  }
  
  await logActivity('POLL', `Starting poll - server: ${base}`);
  
  const sc = await getScriptsCache();
  const cacheEmpty = !sc.byDomain || Object.keys(sc.byDomain).length === 0;
  let q = `limit=10&maxClaimAgeSec=300`;
  if (cacheEmpty) {
    q += `&since=${encodeURIComponent('0000-01-01T00:00:00Z')}`;
  } else if (sc.etag) {
    q += `&scriptsEtag=${encodeURIComponent(sc.etag)}`;
  } else if (sc.since) {
    q += `&since=${encodeURIComponent(sc.since)}`;
  }
  const url = `${base}/crawl/jobs?${q}&mode=claim${cacheEmpty ? '&includeScripts=1' : ''}`;
  let data;
  try {
    console.log('[gg-sw] fetch jobs begin', { url });
    const t0 = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const headers = await getAuthHeaders();
    const resp = await fetch(url, { method: 'GET', headers, cache: 'no-cache', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const errMsg = `HTTP ${resp.status} - ${resp.statusText}`;
      console.log('[gg-sw] jobs HTTP error', { status: resp.status });
      await logActivity('ERROR', `Poll failed: ${errMsg}`);
      await updatePollInfo({ error: errMsg, jobsCount: 0, scriptsCount: 0 });
      return;
    }
    data = await resp.json();
    const jobsCount = (data && data.jobs && data.jobs.length) || 0;
    const scriptsCount = (data && data.scripts && data.scripts.length) || 0;
    console.log('[gg-sw] fetch jobs ok', { elapsed_ms: Date.now() - t0, hasJobs: Array.isArray(data && data.jobs), count: jobsCount });
    
    await logActivity('POLL', `Poll complete - ${jobsCount} jobs, ${scriptsCount} scripts`, { elapsedMs: Date.now() - t0 });
    await updatePollInfo({ error: null, jobsCount, scriptsCount });
    
    // Log polling result for each run
    if (data && data.jobs && data.jobs.length > 0) {
      const runGroups = {};
      for (const j of data.jobs) {
        if (j.run_id) {
          if (!runGroups[j.run_id]) runGroups[j.run_id] = [];
          runGroups[j.run_id].push(j.jobId);
        }
      }
      for (const [runId, jobIds] of Object.entries(runGroups)) {
        await logToServer(runId, 'INFO', 'Jobs fetched from server', { jobIds, count: jobIds.length, elapsed_ms: Date.now() - t0 });
      }
    }
  } catch (e) {
    console.log('[gg-sw] jobs fetch error', String(e));
    return;
  }
  try {
    const scripts = (data && data.scripts) || [];
    const newByDomain = Object.assign({}, sc.byDomain);
    let newestUpdated = sc.since || '';
    for (const s of scripts) {
      try {
        const d = normalizeScriptDomain(s && s.domain);
        if (!d) continue;
        newByDomain[d] = {
          hash: s && s.hash,
          script: s && s.script,
          condition: s && s.condition,
          waitBeforeMs: Number((s && s.waitBeforeMs) || 0),
          waitAfterMs: Number((s && s.waitAfterMs) || 0),
          createdAt: s && s.createdAt,
          updatedAt: s && s.updatedAt,
        };
        if (s && s.updatedAt && String(s.updatedAt) > String(newestUpdated)) {
          newestUpdated = String(s.updatedAt);
        }
      } catch (e) {
        console.log('[gg-sw] scripts delta apply error', String(e));
      }
    }
    // Only update etag if we actually fetched scripts OR cache already had entries
    const newEtag = (scripts && scripts.length) || (!cacheEmpty) ? ((data && data.scriptsEtag) || sc.etag || '') : sc.etag || '';
    await setScriptsCache({ byDomain: newByDomain, etag: newEtag, since: newestUpdated });
    if (scripts && scripts.length) {
      console.log('[gg-sw] scripts delta applied', { count: scripts.length, etag: newEtag });
    }
  } catch (e) {
    console.log('[gg-sw] scripts process error', String(e));
  }

  const jobs = (data && data.jobs) || [];
  if (!jobs.length) {
    console.log('[gg-sw] no jobs available from server');
    await logActivity('INFO', 'Poll complete - no jobs available');
    return;
  }
  console.log('[gg-sw] processing jobs', { count: jobs.length, jobIds: jobs.map(j => j.jobId) });
  await logActivity('JOB', `Processing ${jobs.length} job(s)`, { jobIds: jobs.map(j => j.jobId) });
  
  // Use a mutable config reference that can be refreshed
  let currentCfg = cfg;
  
  for (const j of jobs) {
    try {
      const domain = getDomainFromUrl(j && j.url);
      // AUTO-APPROVE: Any job from server is trusted - auto-approve its domain
      if (!isDomainAllowed(currentCfg, domain)) {
        console.log('[gg-sw] auto-approving domain for server job', { domain, jobId: j.jobId, runId: j.run_id });
        await autoApproveDomain(domain);
        await logActivity('DOMAIN', `Auto-approved domain "${domain}" for crawl job`);
        await logToServer(j.run_id, 'INFO', 'Domain auto-approved for crawl', { jobId: j.jobId, domain, url: j.url });
        // Refresh config after auto-approval
        currentCfg = await getConfig();
      }
      await logActivity('JOB', `Job ${j.jobId} - domain "${domain}" allowed, proceeding`);
      // Skip if currently being processed in this worker lifecycle
      const active = await getActiveJobs();
      if (active[j.jobId]) {
        console.log('[gg-sw] job currently active, skip', { jobId: j.jobId });
        await logToServer(j.run_id, 'DEBUG', 'Job already active, skipping', { jobId: j.jobId });
        continue;
      }
      // Smart de-duplication: only check server status if job was seen recently AND is in error state
      // Jobs returned from mode=claim are already CLAIMED by us, so we should process them
      const seen = await getSeenJobs();
      const sj = seen[j.jobId];
      if (sj && sj.status === 'error' && (Date.now() - sj.ts < 2 * 60 * 1000)) {
        // Only skip if we recently had an error with this job (2 min cooldown)
        console.log('[gg-sw] job had recent error, brief cooldown', { jobId: j.jobId, seenAgo: Math.floor((Date.now() - sj.ts) / 1000) });
        await logActivity('INFO', `Job ${j.jobId} had recent error, waiting for cooldown`);
        continue;
      }
      // Clear any stale seen entries
      if (sj) {
        delete seen[j.jobId];
        await setSeenJobs(seen);
      }
      // Skip double-claim verification - mode=claim already claimed it on server
      // Just verify it's ours and proceed
      console.log('[gg-sw] job already claimed by mode=claim, proceeding', { jobId: j.jobId });
      // Mark as active
      active[j.jobId] = { ts: Date.now(), claimedAt: Date.now() };
      await setActiveJobs(active);
      await setSeenJobs(Object.assign(seen, { [j.jobId]: { ts: Date.now(), status: 'claimed' } }));
      console.log('[gg-sw] handle job begin', { jobId: j && j.jobId, url: j && j.url, domain, claimedAt: Date.now() });
      await logToServer(j.run_id, 'INFO', 'Job claimed successfully and processing started', { jobId: j.jobId, url: j.url, domain });
      const jobStartTime = Date.now();
      await handleJob(currentCfg, j);
      const jobDuration = Date.now() - jobStartTime;
      console.log('[gg-sw] handle job end', { jobId: j && j.jobId });
      await logToServer(j.run_id, 'INFO', 'Job processing completed successfully', { jobId: j.jobId, duration_ms: jobDuration });
      await setConfig({ lastStatus: `submitted job ${j.jobId}` });
      // Server now owns job state - no local caching
      // Clear seen entry on success
      const seen2 = await getSeenJobs();
      if (seen2[j.jobId]) { delete seen2[j.jobId]; await setSeenJobs(seen2); }
      // Clear active on success
      const active2 = await getActiveJobs();
      if (active2[j.jobId]) { delete active2[j.jobId]; await setActiveJobs(active2); }
    } catch (e) {
      const errorMsg = String(e);
      console.log('[gg-sw] job error', { jobId: j && j.jobId, err: errorMsg });
      await logToServer(j.run_id, 'ERROR', 'Job processing failed with exception', { jobId: j.jobId, error: errorMsg, url: j.url, domain: getDomainFromUrl(j.url) });
      await logActivity('ERROR', `Job ${j.jobId} failed: ${errorMsg.substring(0, 100)}`);
      await setConfig({ lastStatus: `job ${j && j.jobId} error: ${String(e)}` });
      
      // Mark job as FAILED on server with error details
      try {
        const failHeaders = await getAuthHeaders();
        await fetch(`${base}/crawl/jobs/${j.jobId}/fail`, { 
          method: 'POST', 
          headers: failHeaders,
          body: JSON.stringify({ error: errorMsg.substring(0, 500) })
        });
        console.log('[gg-sw] job marked as FAILED on server', { jobId: j.jobId });
      } catch (failErr) {
        console.log('[gg-sw] failed to mark job as FAILED', { jobId: j.jobId, error: String(failErr) });
      }
      
      // Brief backoff to prevent tight loops
      try {
        const seenErr = await getSeenJobs();
        seenErr[j.jobId] = { ts: Date.now(), status: 'error' };
        await setSeenJobs(seenErr);
      } catch (_) {}
      
      // Clear from active jobs
      try {
        const active3 = await getActiveJobs();
        if (active3[j.jobId]) { delete active3[j.jobId]; await setActiveJobs(active3); }
      } catch (_) {}
    }
  }
}

function getDomainFromUrl(u) {
  try {
    if (!u) return '';
    const { hostname } = new URL(u);
    return hostname || '';
  } catch (_) { return ''; }
}

function normalizeDomain(host) {
  try {
    if (!host) return '';
    let h = String(host).toLowerCase();
    // strip common prefixes
    h = h.replace(/^www\./, '').replace(/^m\./, '').replace(/^amp\./, '');
    return h;
  } catch (_) { return host; }
}

function isDomainAllowed(cfg, domain) {
  if (!domain) return false;
  const map = cfg && cfg.allowedDomains;
  if (!map || typeof map !== 'object') return false;
  const base = normalizeDomain(String(domain).toLowerCase());
  const recBase = map[base];
  return !!(recBase && recBase.allowed === true);
}

async function autoApproveDomain(domain) {
  if (!domain) return;
  const cfg = await getConfig();
  const map = Object.assign({}, cfg.allowedDomains || {});
  const base = normalizeDomain(String(domain).toLowerCase());
  map[base] = { allowed: true, addedAt: Date.now(), lastSeenAt: Date.now(), autoApproved: true };
  console.log('[gg-sw] domain auto-approved for server job', { domain: base });
  await setConfig({ allowedDomains: map });
}

async function registerPendingDomain(domain, jobId = null, runId = null) {
  if (!domain) return;
  const cfg = await getConfig();
  const map = Object.assign({}, cfg.allowedDomains || {});
  const base = normalizeDomain(String(domain).toLowerCase());
  if (!map[base]) {
    map[base] = { allowed: false, addedAt: Date.now(), lastSeenAt: Date.now() };
    console.log('[gg-sw] domain registered, awaiting user approval', { domain: base, jobId });
  } else {
    map[base].lastSeenAt = Date.now();
    console.log('[gg-sw] domain still pending approval', { domain: base, jobId });
  }
  
  // Track pending job for retry when domain approved
  if (jobId && runId) {
    const pendingJobs = await getPendingDomainJobs();
    if (!pendingJobs[base]) pendingJobs[base] = [];
    if (!pendingJobs[base].find(j => j.jobId === jobId)) {
      pendingJobs[base].push({ jobId, runId, addedAt: Date.now() });
      await setPendingDomainJobs(pendingJobs);
      console.log('[gg-sw] job queued for domain approval', { domain: base, jobId, runId });
    }
  }
  
  await setConfig({ allowedDomains: map, lastStatus: `pending domain: ${base}` });
}

function getPendingDomainJobs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['pendingDomainJobs'], (v) => resolve((v && v.pendingDomainJobs) || {}));
  });
}

function setPendingDomainJobs(map) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ pendingDomainJobs: map || {} }, resolve);
  });
}

async function handleJob(cfg, job) {
  const targetUrl = job && job.url;
  if (!targetUrl) {
    await logActivity('ERROR', `Job ${job.jobId} has no URL, skipping`);
    return;
  }
  
  await logActivity('JOB', `Starting job ${job.jobId} processing`, { url: targetUrl });
  
  // Domain is already auto-approved in pollOnce, but double-check and auto-approve if needed
  const domain = getDomainFromUrl(targetUrl);
  if (!isDomainAllowed(cfg, domain)) {
    console.log('[gg-sw] handleJob: domain not in allowedDomains, auto-approving now', { jobId: job && job.jobId, domain });
    await autoApproveDomain(domain);
    await logActivity('DOMAIN', `Auto-approved domain "${domain}" in handleJob`);
  }
  
  const tabId = await openOrCreateTab(targetUrl);
  console.log('[gg-sw] tab created', { tabId, url: targetUrl });
  await logToServer(job.run_id, 'INFO', 'Tab created for job', { jobId: job.jobId, tabId, url: targetUrl, domain });
  // wait for load complete
  const t0 = Date.now();
  // If a crawl condition exists, start polling immediately (from near page start)
  let condPromise = Promise.resolve(true);
  const hist = { kind: 'server', jobId: job && job.jobId, url: targetUrl, domain, ts: Date.now(), phases: {}, status: 'begin' };
  await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'open' });
  
  // PDFs are handled server-side, extension only handles HTML content
  // If a PDF URL somehow reaches here, skip it (server downloads PDFs directly)
  await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'check_content_type' });
  const pdfCheck = await checkIfPdf(tabId);
  
  if (pdfCheck.isPdf) {
    console.log('[gg-sw] PDF detected - skipping (PDFs handled server-side)', { jobId: job.jobId, method: pdfCheck.method });
    await logToServer(job.run_id, 'INFO', 'PDF detected - skipping job (PDFs are downloaded server-side)', { jobId: job.jobId, url: targetUrl, detectionMethod: pdfCheck.method });
    await logActivity('INFO', `Job ${job.jobId} is a PDF - skipping (server handles PDFs)`, { url: targetUrl.substring(0, 100) });
    
    // Close tab and return - server will handle this PDF
    if (cfg.autoCloseTab) {
      try { chrome.tabs.remove(tabId); } catch (e) {}
    }
    
    hist.status = 'skipped_pdf';
    hist.isPdf = true;
    await pushHistory(hist);
    await clearLiveStatus();
    return;
  }
  
  // Proceed with HTML extraction flow
  console.log('[gg-sw] HTML content detected, proceeding with extraction', { jobId: job.jobId });
  await logToServer(job.run_id, 'INFO', 'HTML content detected, proceeding with extraction', { jobId: job.jobId });
  
  try {
    const sc = await getScriptsCache();
    const d = normalizeScriptDomain(domain);
    const rec = sc.byDomain && sc.byDomain[d];
    if (rec && rec.condition && String(rec.condition).trim().length) {
      console.log('[gg-sw] condition.poll.begin', { domain: d });
      await logToServer(job.run_id, 'INFO', 'Waiting for crawl condition', { jobId: job.jobId, domain: d, condition: rec.condition.substring(0, 100) });
      await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'wait_condition' });
      hist.phases.conditionBegin = Date.now();
      condPromise = waitForCrawlCondition(tabId, rec.condition, 60000, 1000);
    }
  } catch (_) {}
  await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'wait_load' });
  await waitForTabComplete(tabId, 30000);
  const loadTime = Date.now() - t0;
  console.log('[gg-sw] tab load complete', { tabId, elapsed_ms: loadTime });
  await logToServer(job.run_id, 'INFO', 'Tab load complete', { jobId: job.jobId, elapsed_ms: loadTime });
  
  // Redirect detection phase
  if (cfg.redirectDetectionEnabled !== false) {
    try {
      await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'check_redirect' });
      
      const redirectResult = await waitForRedirectOrContent(
        tabId,
        cfg.redirectMinTextLength || 3000,
        cfg.redirectMaxWaitMs || 30000
      );
      
      await logToServer(job.run_id, 'INFO', 'Redirect check complete', { jobId: job.jobId, ...redirectResult });
      
      if (redirectResult.redirectOccurred) {
        console.log('[gg-sw] redirect detected, waiting for new page load', { oldUrl: targetUrl.substring(0, 100), newUrl: redirectResult.finalUrl.substring(0, 100) });
        
        await waitForTabComplete(tabId, 30000);
        await logToServer(job.run_id, 'INFO', 'Redirected page loaded', { jobId: job.jobId, finalUrl: redirectResult.finalUrl.substring(0, 100) });
      }
      
      hist.phases.redirectCheckMs = redirectResult.waitedMs;
      hist.redirectOccurred = redirectResult.redirectOccurred;
      hist.redirectReason = redirectResult.reason;
      hist.finalUrl = redirectResult.finalUrl;
      hist.initialTextLength = redirectResult.initialTextLength;
      hist.finalTextLength = redirectResult.finalTextLength;
    } catch (e) {
      console.log('[gg-sw] redirect detection error, continuing anyway', String(e));
      await logToServer(job.run_id, 'WARN', 'Redirect detection failed, proceeding with extraction', { jobId: job.jobId, error: String(e) });
    }
  }
  
  // Enforce crawl readiness if condition provided
  try {
    const ok = await condPromise;
    if (!ok) {
      console.log('[gg-sw] condition.poll.timeout', { tabId, maxMs: 60000 });
      await logToServer(job.run_id, 'ERROR', 'Crawl condition timeout', { jobId: job.jobId, maxMs: 60000 });
      await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'error', error: 'crawl condition timeout' });
      hist.status = 'condition_error';
      hist.error = 'crawl condition timeout';
      await pushHistory(hist);
      throw new Error('crawl condition timeout');
    }
    console.log('[gg-sw] condition.poll.ready', { tabId });
    await logToServer(job.run_id, 'INFO', 'Crawl condition satisfied', { jobId: job.jobId, waitedMs: Date.now() - (hist.phases.conditionBegin || Date.now()) });
    await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'condition_ready' });
    if (hist.phases.conditionBegin) hist.phases.conditionMs = Date.now() - hist.phases.conditionBegin;
  } catch (e) {
    throw e;
  }
  // Domain-specific script execution with before/after waits
  try {
    const logToPage = (msg) => {
      try {
        chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: (m) => { console.log('[gg-page]', m); },
          args: [msg],
        }, () => {});
      } catch (_) {}
    };

    let sc = await getScriptsCache();
    const d = normalizeScriptDomain(domain);
    let rec = sc.byDomain && sc.byDomain[d];
    if (!rec || !rec.script) {
      console.log('[gg-sw] no domain script cached, fetching now', { domain: d });
      await logToServer(job.run_id, 'INFO', 'Domain script not cached, fetching from server', { jobId: job.jobId, domain: d });
      logToPage(`no domain script cached for ${d}, fetching from server...`);
      await fetchScriptsNow();
      sc = await getScriptsCache();
      rec = sc.byDomain && sc.byDomain[d];
      if (rec && rec.script) {
        console.log('[gg-sw] domain script loaded after sync', { domain: d });
        await logToServer(job.run_id, 'INFO', 'Domain script fetched successfully', { jobId: job.jobId, domain: d, scriptBytes: rec.script.length });
        logToPage(`domain script for ${d} loaded after sync, size: ${(rec.script && rec.script.length) || 0} bytes`);
      } else {
        console.log('[gg-sw] still no domain script after sync', { domain: d });
        await logToServer(job.run_id, 'WARN', 'No domain script available after fetch', { jobId: job.jobId, domain: d });
        logToPage(`no domain script found for ${d} even after server sync`);
      }
    } else {
      await logToServer(job.run_id, 'INFO', 'Domain script found in cache', { jobId: job.jobId, domain: d, scriptBytes: rec.script.length });
      logToPage(`domain script for ${d} found in cache, size: ${(rec.script && rec.script.length) || 0} bytes`);
    }
    if (rec && rec.script) {
      const wb = Math.max(0, Number(rec.waitBeforeMs || 0));
      const wa = Math.max(0, Number(rec.waitAfterMs || 0));
      if (wb > 0) {
        console.log('[gg-sw] script.waitBefore', { domain: d, wb });
        await logToServer(job.run_id, 'INFO', 'Waiting before script execution', { jobId: job.jobId, domain: d, waitMs: wb });
        await new Promise(r => setTimeout(r, wb));
      }
      await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'run_script' });
      console.log('[gg-sw] script.exec.begin', { domain: d, hash: rec.hash, bytes: (rec.script && rec.script.length) || 0 });
      await logToServer(job.run_id, 'INFO', 'Executing domain script', { jobId: job.jobId, domain: d, scriptBytes: (rec.script && rec.script.length) || 0 });
      const tExec = Date.now();
      hist.phases.scriptBegin = tExec;
      await runScriptOnTab(tabId, rec.script, d);
      const scriptTime = Date.now() - tExec;
      console.log('[gg-sw] script.exec.ok', { domain: d, elapsed_ms: scriptTime });
      await logToServer(job.run_id, 'INFO', 'Script execution complete', { jobId: job.jobId, elapsed_ms: scriptTime });
      hist.phases.scriptMs = Date.now() - tExec;
      if (wa > 0) {
        console.log('[gg-sw] script.waitAfter', { domain: d, wa });
        await logToServer(job.run_id, 'INFO', 'Waiting after script execution', { jobId: job.jobId, domain: d, waitMs: wa });
        await new Promise(r => setTimeout(r, wa));
      }
    } else {
      console.log('[gg-sw] script.none_for_domain', { domain: d });
      await logToServer(job.run_id, 'INFO', 'No domain script configured', { jobId: job.jobId, domain: d });
    }
  } catch (e) {
    console.log('[gg-sw] script.exec.error', String(e));
    await logToServer(job.run_id, 'ERROR', 'Script execution failed', { jobId: job.jobId, error: String(e) });
    await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'error', error: String(e) });
    hist.status = 'script_error';
    hist.error = String(e);
    await pushHistory(hist);
  }
  // request HTML via content script
  await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'extract_html' });
  const t1 = Date.now();
  const html = await getHtmlFromTab(tabId); // Use default 200s timeout
  const extractTime = Date.now() - t1;
  console.log('[gg-sw] got html from tab', { tabId, elapsed_ms: extractTime, bytes: (html && html.length) || 0 });
  await logToServer(job.run_id, 'INFO', 'HTML extracted from tab', { jobId: job.jobId, htmlBytes: (html && html.length) || 0, elapsed_ms: extractTime });
  
  if (!html) {
    await logActivity('ERROR', `Job ${job.jobId} - HTML extraction returned empty`, { tabId });
    await logToServer(job.run_id, 'ERROR', 'Empty HTML from tab', { jobId: job.jobId });
    throw new Error('empty html');
  }
  
  await logActivity('SUCCESS', `Job ${job.jobId} - HTML extracted (${Math.round(html.length/1024)}KB)`, { elapsedMs: extractTime });
  
  // submit result
  await setLiveStatus({ mode: 'server', jobId: job && job.jobId, url: targetUrl, domain, phase: 'submit_result' });
  const t2 = Date.now();
  await postResult(cfg, job.jobId, html, job.run_id);
  const submitMs = Date.now() - t2;
  console.log('[gg-sw] result posted', { jobId: job.jobId, elapsed_ms: submitMs });
  await logToServer(job.run_id, 'INFO', 'HTML submitted to server', { jobId: job.jobId, elapsed_ms: submitMs, htmlBytes: (html && html.length) || 0 });
  hist.phases.submitMs = submitMs;
  hist.status = 'ok';
  hist.size = (html && html.length) || 0;
  // Don't store HTML for server jobs - it's already on the server in sources/ directory
  // hist.html = html;
  await pushHistory(hist);
  await clearLiveStatus();
  await appendCrawlHistory({ url: targetUrl, jobId: job.jobId, domain, ts: Date.now() });
  
  await logActivity('SUCCESS', `Job ${job.jobId} COMPLETE - Total time: ${Math.round((Date.now() - t0)/1000)}s`, { 
    domain, 
    sizeKB: Math.round(html.length/1024),
    submitMs 
  });
  
  if (cfg.autoCloseTab) {
    try { 
      chrome.tabs.remove(tabId);
      await logActivity('INFO', `Tab ${tabId} auto-closed for job ${job.jobId}`);
      await logToServer(job.run_id, 'INFO', 'Tab auto-closed', { jobId: job.jobId, tabId });
    } catch (e) {}
  } else {
    await logActivity('INFO', `Tab ${tabId} kept open (auto-close disabled)`);
    await logToServer(job.run_id, 'INFO', 'Tab kept open (autoClose disabled)', { jobId: job.jobId, tabId });
  }
}
function runScriptOnTab(tabId, codeString, domainLabel) {
  return new Promise((resolve) => {
    try {
      if (!codeString || typeof codeString !== 'string') return resolve();

      // Log to page that we're about to attempt script execution
      const logToPage = (msg) => {
        try {
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (m) => { console.log('[gg-page]', m); },
            args: [msg],
          }, () => {});
        } catch (_) {}
      };

      logToPage(`domain script execution starting for: ${domainLabel}, code size: ${(codeString && codeString.length) || 0} bytes`);

      const execInWorld = (world) => new Promise((res) => {
        try {
          logToPage(`attempting execution in ${world} world`);
          chrome.scripting.executeScript({
            target: { tabId },
            world,
            func: (userCode, dLabel, wLabel) => {
              try {
                const startedAt = Date.now();
                const beginTs = new Date().toISOString();
                const meta = {
                  domain: dLabel,
                  at: beginTs,
                  href: (typeof location !== 'undefined' && location && location.href) ? String(location.href) : '',
                  readyState: (typeof document !== 'undefined' && document) ? String(document.readyState) : 'n/a',
                  world: wLabel,
                  codeBytes: (userCode && userCode.length) || 0,
                };
                console.log('[gg-page] ═══════════════════════════════════════════════');
                console.log('[gg-page] DOMAIN SCRIPT EXECUTION BEGIN');
                console.log('[gg-page] script.begin.meta', meta);
                // Log the exact script source just before executing it
                try {
                  console.log('[gg-page] script.source', { world: wLabel, bytes: (userCode && userCode.length) || 0, code: String(userCode) });
                } catch(_) {}
                try {
                  const fn = new Function('"use strict";\nreturn (async function(){\n' + userCode + '\n})();');
                  return Promise.resolve(fn())
                    .then(() => {
                      const elapsed = Date.now() - startedAt;
                      console.log('[gg-page] script.end.ok', { domain: dLabel, elapsed_ms: elapsed, at: new Date().toISOString(), world: wLabel });
                      console.log('[gg-page] DOMAIN SCRIPT EXECUTION END - SUCCESS');
                      console.log('[gg-page] ═══════════════════════════════════════════════');
                      return true;
                    })
                    .catch((e) => {
                      const err = { name: e && e.name, message: e && e.message, stack: e && e.stack ? String(e.stack) : String(e) };
                      const elapsed = Date.now() - startedAt;
                      console.log('[gg-page] script.end.error', { domain: dLabel, elapsed_ms: elapsed, error: err, world: wLabel });
                      console.log('[gg-page] DOMAIN SCRIPT EXECUTION END - ERROR');
                      console.log('[gg-page] ═══════════════════════════════════════════════');
                      return false;
                    });
                } catch (e) {
                  const err = { name: e && e.name, message: e && e.message, stack: e && e.stack ? String(e.stack) : String(e) };
                  console.log('[gg-page] script.user.error', { domain: dLabel, error: err, world: wLabel });
                  console.log('[gg-page] DOMAIN SCRIPT EXECUTION END - USER ERROR');
                  console.log('[gg-page] ═══════════════════════════════════════════════');
                  return false;
                }
              } catch (e) {
                const err = { name: e && e.name, message: e && e.message, stack: e && e.stack ? String(e.stack) : String(e) };
                console.log('[gg-page] script.exec.error', { domain: dLabel, error: err, world: wLabel });
                console.log('[gg-page] DOMAIN SCRIPT EXECUTION END - EXEC ERROR');
                console.log('[gg-page] ═══════════════════════════════════════════════');
                return false;
              }
            },
            args: [codeString, domainLabel, world],
          }, (results) => {
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              console.log('[gg-sw] executeScript error', { world, msg: lastErr.message });
              logToPage(`${world} world execution failed: ${lastErr.message}`);
              res(false);
              return;
            }
            try {
              const ok = Array.isArray(results) && results.length ? !!results[0].result : false;
              res(ok);
            } catch (_) {
              res(false);
            }
          });
        } catch (e) {
          res(false);
        }
      });

      // Prefer MAIN (page world) first, then fall back to ISOLATED
      logToPage('trying MAIN world first...');
      execInWorld('MAIN').then((ok) => {
        if (ok) {
          logToPage('MAIN world execution succeeded');
          resolve();
          return;
        }
        logToPage('MAIN world failed, falling back to ISOLATED world...');
        execInWorld('ISOLATED').then((isolated_ok) => {
          if (isolated_ok) {
            logToPage('ISOLATED world execution succeeded');
          } else {
            logToPage('ISOLATED world execution also failed');
          }
          resolve();
        });
      }).catch(() => resolve());
    } catch (_) {
      resolve();
    }
  });
}

async function openOrCreateTab(url) {
  await logActivity('INFO', `Opening tab for URL`, { url });
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, async (tab) => {
      await logActivity('SUCCESS', `Tab opened - ID ${tab.id}`, { url });
      resolve(tab.id);
    });
  });
}

async function waitForTabComplete(tabId, timeoutMs) {
  await logActivity('INFO', `Waiting for tab ${tabId} to load`, { timeout: timeoutMs });
  return new Promise(async (resolve, reject) => {
    let done = false;
    const timer = setTimeout(async () => {
      if (done) return;
      done = true;
      try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) { console.log('[gg-sw] cleanup error', e); }
      console.log('[gg-sw] tab load timeout', { tabId, timeoutMs });
      await logActivity('WARN', `Tab ${tabId} load timeout`, { timeoutMs });
      resolve(); // proceed anyway
    }, timeoutMs || 30000);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) { console.log('[gg-sw] cleanup error', e); }
        console.log('[gg-sw] tab load event complete', { tabId });
        logActivity('SUCCESS', `Tab ${tabId} loaded successfully`);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForRedirectOrContent(tabId, minTextLength = 3000, maxWaitMs = 30000) {
  await logActivity('INFO', `Checking for redirect page on tab ${tabId}`, { minTextLength, maxWaitMs });
  
  return new Promise(async (resolve) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      const initialUrl = tab.url;
      let settled = false;
      
      const checkContentLength = async () => {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              try {
                if (!document.body) return 0;
                const innerText = document.body.innerText || document.body.textContent || '';
                return innerText.trim().length;
              } catch (e) {
                return 0;
              }
            }
          });
          
          if (results && results[0]) {
            const textLen = results[0].result || 0;
            await logActivity('INFO', `Tab ${tabId} body text length: ${textLen}`, { url: tab.url.substring(0, 100) });
            return textLen;
          }
          return 0;
        } catch (e) {
          console.log('[gg-sw] content length check error', String(e));
          await logActivity('ERROR', `Failed to check content length for tab ${tabId}`, { error: String(e) });
          return 0;
        }
      };
      
      const initialTextLength = await checkContentLength();
      
      if (initialTextLength >= minTextLength) {
        await logActivity('SUCCESS', `Tab ${tabId} has sufficient content (${initialTextLength} chars), no redirect wait needed`);
        resolve({ redirectOccurred: false, finalUrl: initialUrl, waitedMs: 0, reason: 'sufficient_content', initialTextLength, finalTextLength: initialTextLength });
        return;
      }
      
      await logActivity('WARN', `Tab ${tabId} has minimal content (${initialTextLength} chars < ${minTextLength}), monitoring for redirect`, { initialUrl: initialUrl.substring(0, 100) });
      
      const startTime = Date.now();
      let contentCheckInterval = null;
      
      const cleanup = () => {
        try {
          if (contentCheckInterval) clearInterval(contentCheckInterval);
          chrome.tabs.onUpdated.removeListener(urlChangeListener);
          chrome.tabs.onRemoved.removeListener(tabRemovedListener);
          if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
            chrome.webNavigation.onCompleted.removeListener(navCompleteListener);
          }
          if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
            chrome.webNavigation.onErrorOccurred.removeListener(navErrorListener);
          }
        } catch (e) {
          console.log('[gg-sw] cleanup error (non-critical)', String(e));
        }
      };
      
      const timeoutHandle = setTimeout(async () => {
        if (settled) return;
        settled = true;
        
        const waitedMs = Date.now() - startTime;
        const finalTextLength = await checkContentLength();
        
        await logActivity('WARN', `Tab ${tabId} redirect wait timeout after ${waitedMs}ms`, { initialTextLength, finalTextLength, urlChanged: false });
        
        cleanup();
        
        resolve({ redirectOccurred: false, finalUrl: initialUrl, waitedMs, reason: 'timeout', initialTextLength, finalTextLength });
      }, maxWaitMs);
      
      const urlChangeListener = async (updatedTabId, changeInfo, updatedTab) => {
        if (settled || updatedTabId !== tabId) return;
        
        if (changeInfo.url && changeInfo.url !== initialUrl) {
          settled = true;
          clearTimeout(timeoutHandle);
          const waitedMs = Date.now() - startTime;
          
          await logActivity('SUCCESS', `Tab ${tabId} REDIRECT detected after ${waitedMs}ms`, { from: initialUrl.substring(0, 100), to: changeInfo.url.substring(0, 100) });
          
          cleanup();
          
          await new Promise(r => setTimeout(r, 2000));
          
          resolve({ redirectOccurred: true, finalUrl: changeInfo.url, waitedMs, reason: 'url_changed', initialTextLength });
        }
      };
      
      const navCompleteListener = async (details) => {
        if (settled || details.tabId !== tabId || details.frameId !== 0) return;
        
        if (details.url && details.url !== initialUrl) {
          settled = true;
          clearTimeout(timeoutHandle);
          const waitedMs = Date.now() - startTime;
          
          await logActivity('SUCCESS', `Tab ${tabId} navigation completed to new URL after ${waitedMs}ms`, { from: initialUrl.substring(0, 100), to: details.url.substring(0, 100) });
          
          cleanup();
          
          await new Promise(r => setTimeout(r, 2000));
          
          resolve({ redirectOccurred: true, finalUrl: details.url, waitedMs, reason: 'navigation_completed', initialTextLength });
        }
      };
      
      const navErrorListener = async (details) => {
        if (settled || details.tabId !== tabId || details.frameId !== 0) return;
        
        settled = true;
        clearTimeout(timeoutHandle);
        const waitedMs = Date.now() - startTime;
        
        await logActivity('ERROR', `Tab ${tabId} navigation error`, { error: details.error });
        
        cleanup();
        
        resolve({ redirectOccurred: false, finalUrl: details.url, waitedMs, reason: 'navigation_error', error: details.error, initialTextLength });
      };
      
      const tabRemovedListener = (removedTabId) => {
        if (removedTabId === tabId && !settled) {
          settled = true;
          clearTimeout(timeoutHandle);
          
          cleanup();
          
          resolve({ redirectOccurred: false, finalUrl: null, waitedMs: Date.now() - startTime, reason: 'tab_closed', initialTextLength });
        }
      };
      
      contentCheckInterval = setInterval(async () => {
        if (settled) {
          clearInterval(contentCheckInterval);
          return;
        }
        
        const currentTextLength = await checkContentLength();
        
        if (currentTextLength >= minTextLength) {
          settled = true;
          clearTimeout(timeoutHandle);
          clearInterval(contentCheckInterval);
          const waitedMs = Date.now() - startTime;
          
          await logActivity('SUCCESS', `Tab ${tabId} content increased to ${currentTextLength} chars after ${waitedMs}ms (no URL change)`, { url: initialUrl.substring(0, 100) });
          
          cleanup();
          
          resolve({ redirectOccurred: false, finalUrl: initialUrl, waitedMs, reason: 'content_increased', initialTextLength, finalTextLength: currentTextLength });
        }
      }, 1000);
      
      chrome.tabs.onUpdated.addListener(urlChangeListener);
      chrome.tabs.onRemoved.addListener(tabRemovedListener);
      if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
        chrome.webNavigation.onCompleted.addListener(navCompleteListener);
      }
      if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
        chrome.webNavigation.onErrorOccurred.addListener(navErrorListener);
      }
      
    } catch (e) {
      console.log('[gg-sw] waitForRedirectOrContent error', String(e));
      await logActivity('ERROR', `Redirect detection failed for tab ${tabId}`, { error: String(e) });
      resolve({ redirectOccurred: false, finalUrl: null, waitedMs: 0, reason: 'error', error: String(e) });
    }
  });
}

async function getHtmlFromTab(tabId, timeoutMs) {
  await logActivity('INFO', `Requesting HTML from tab ${tabId}`, { timeout: timeoutMs });
  
  // FALLBACK: Direct HTML extraction using executeScript (bypasses content script entirely)
  const extractHtmlDirect = async () => {
    try {
      console.log('[gg-sw] attempting direct HTML extraction via executeScript', { tabId });
      await logActivity('INFO', `Attempting direct HTML extraction for tab ${tabId}`);
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            if (document.documentElement) return document.documentElement.outerHTML;
            if (document.body) return document.body.outerHTML;
            return '';
          } catch (e) {
            return '';
          }
        }
      });
      if (results && results[0] && results[0].result) {
        const html = results[0].result;
        console.log('[gg-sw] direct extraction success', { tabId, bytes: html.length });
        await logActivity('SUCCESS', `Direct HTML extraction succeeded for tab ${tabId}`, { sizeBytes: html.length });
        return html;
      }
      return '';
    } catch (e) {
      console.log('[gg-sw] direct extraction failed', { tabId, error: String(e) });
      await logActivity('ERROR', `Direct HTML extraction failed for tab ${tabId}`, { error: String(e) });
      return '';
    }
  };
  
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      console.log('[gg-sw] getHtmlFromTab timeout', { tabId, timeoutMs });
      await logActivity('ERROR', `HTML extraction timeout for tab ${tabId}`, { timeoutMs });
      // Last resort: try direct extraction on timeout
      const directHtml = await extractHtmlDirect();
      resolve(directHtml);
    }, timeoutMs || 200000); // 200s = 3min 20s, exceeds foreground's 180s max
    
    const trySend = async (attempt) => {
      try {
        // ALWAYS inject foreground script first to ensure it's ready
        // This is idempotent - if already injected, it just re-runs (harmless)
        if (attempt <= 1) {
          try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['foreground.js'] });
            console.log('[gg-sw] foreground injected', { attempt });
            await logActivity('INFO', `Foreground script injected into tab ${tabId}`);
            // Give the script a moment to initialize
            await new Promise(r => setTimeout(r, 100));
          } catch (e) {
            console.log('[gg-sw] inject foreground error', String(e));
            await logActivity('WARN', `Foreground injection issue for tab ${tabId}`, { error: String(e) });
            // Continue anyway - manifest content_scripts might have it loaded
          }
        }
        
        chrome.tabs.sendMessage(tabId, { type: 'GG_GET_HTML' }, async (resp) => {
          if (settled) return;
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || '';
            console.log('[gg-sw] sendMessage error', { msg, attempt });
            // Retry up to 3 times with increasing delays
            if (attempt < 3 && /Receiving end does not exist/i.test(msg)) {
              await logActivity('WARN', `Tab ${tabId} content script not ready, retry ${attempt + 1}/3`);
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
              trySend(attempt + 1);
              return;
            }
            // FALLBACK: Try direct extraction when content script fails
            await logActivity('WARN', `Content script failed, trying direct extraction for tab ${tabId}`);
            const directHtml = await extractHtmlDirect();
            if (directHtml) {
              settled = true;
              clearTimeout(timer);
              resolve(directHtml);
              return;
            }
            await logActivity('ERROR', `All HTML extraction methods failed for tab ${tabId}`, { error: msg });
            settled = true;
            clearTimeout(timer);
            resolve('');
            return;
          }
          settled = true;
          clearTimeout(timer);
          const html = resp && resp.html;
          const htmlBytes = (html && html.length) || 0;
          console.log('[gg-sw] sendMessage ok', { tabId, bytes: htmlBytes });
          await logActivity('SUCCESS', `HTML received from tab ${tabId}`, { sizeBytes: htmlBytes });
          resolve(html);
        });
      } catch (e) {
        if (settled) return;
        // FALLBACK: Try direct extraction on exception
        await logActivity('WARN', `Exception in content script, trying direct extraction for tab ${tabId}`);
        const directHtml = await extractHtmlDirect();
        if (directHtml) {
          settled = true;
          clearTimeout(timer);
          resolve(directHtml);
          return;
        }
        settled = true;
        clearTimeout(timer);
        await logActivity('ERROR', `HTML extraction failed for tab ${tabId}`, { error: String(e) });
        resolve('');
      }
    };
    trySend(0);
  });
}

async function checkIfPdf(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || '';
    
    // Check URL extension
    if (url.endsWith('.pdf')) {
      console.log('[gg-sw] PDF detected by URL extension', { url: url.substring(0, 100) });
      return { isPdf: true, url, method: 'url_extension' };
    }
    
    // Check Content-Type via fetch
    try {
      const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      const contentType = resp.headers.get('content-type') || '';
      
      if (contentType.toLowerCase().includes('application/pdf')) {
        console.log('[gg-sw] PDF detected by Content-Type', { url: url.substring(0, 100), contentType });
        return { isPdf: true, url, contentType, method: 'content_type' };
      }
    } catch (e) {
      console.log('[gg-sw] PDF check fetch error (non-fatal)', { error: String(e) });
    }
    
    return { isPdf: false, url };
  } catch (e) {
    console.log('[gg-sw] checkIfPdf error', { error: String(e) });
    return { isPdf: false, url: null };
  }
}

// NOTE: postResultPdf removed - PDFs are now downloaded and processed server-side

async function postResult(cfg, jobId, html, runId) {
  const base = (cfg.serverBaseUrl || '').replace(/\/$/, '');
  const url = `${base}/crawl/result`;
  const payload = { jobId, html };
  const htmlBytes = (html && html.length) || 0;
  console.log('[gg-sw] postResult begin', { jobId, url, htmlBytes });
  await logActivity('INFO', `Submitting HTML for job ${jobId}`, { sizeBytes: htmlBytes });
  
  let attempt = 0;
  const maxAttempts = 3;
  let lastErr = null;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const headers = await getAuthHeaders();
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        console.log('[gg-sw] postResult ok', { jobId, status: resp.status });
        await logActivity('SUCCESS', `Job ${jobId} submitted successfully`, { sizeBytes: htmlBytes });
        return;
      }
      const text = await resp.text().catch(() => '');
      lastErr = `HTTP ${resp.status} ${text.slice(0, 300)}`;
      console.log('[gg-sw] postResult http error', { jobId, status: resp.status, attempt, body: text.slice(0, 500) });
      await logActivity('ERROR', `Job ${jobId} submit failed - HTTP ${resp.status}`, { attempt, error: text.slice(0, 200) });
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e);
      console.log('[gg-sw] postResult fetch error', { jobId, attempt, err: lastErr });
      await logActivity('ERROR', `Job ${jobId} submit network error`, { attempt, error: lastErr });
    }
    if (attempt < maxAttempts) {
      const delayMs = Math.min(5000, 500 * attempt);
      console.log('[gg-sw] postResult retrying', { jobId, attempt, delayMs });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  const err = new Error(`postResult failed after ${maxAttempts} attempts: ${lastErr}`);
  console.log('[gg-sw] postResult failed permanently', { jobId, error: String(err) });
  await logActivity('ERROR', `Job ${jobId} permanently failed after ${maxAttempts} attempts`, { error: lastErr });
  throw err;
}

async function appendCrawlHistory(entry) {
  try {
    const current = await getLocal(['crawlHistory']);
    const list = Array.isArray(current && current.crawlHistory) ? current.crawlHistory : [];
    const next = [{
      url: String(entry && entry.url || ''),
      jobId: entry && entry.jobId,
      domain: String(entry && entry.domain || ''),
      ts: Number(entry && entry.ts || Date.now()),
      status: 'ok',
    }, ...list].slice(0, 100);
    await setLocal({ crawlHistory: next });
    console.log('[gg-sw] history.append', { size: next.length, head: next[0] && next[0].domain });
  } catch (e) {
    console.log('[gg-sw] history.append.error', String(e));
  }
}

