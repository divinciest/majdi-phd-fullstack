// Shared defaults and storage helpers at top-level to avoid scoping issues in handlers
const DEFAULTS = {
  serverBaseUrl: 'http://localhost:5007',
  pollingEnabled: true,
  pollIntervalSec: 15,
  autoCloseTab: true,
  lastStatus: '—',
  allowedDomains: {},
};

function getCfg() { return new Promise((resolve) => chrome.storage.sync.get(DEFAULTS, resolve)); }
function setCfg(patch) { return new Promise((resolve) => chrome.storage.sync.set(patch, resolve)); }
// Also attach to window to avoid scope issues in event handlers
window.DEFAULTS = DEFAULTS;
window.getCfg = getCfg;
window.setCfg = setCfg;
// Backward-compat aliases used elsewhere in this file
const cfgGet = getCfg;
const cfgSet = setCfg;

document.addEventListener('DOMContentLoaded', async () => {
  const serverBaseUrl = document.getElementById('serverBaseUrl');
  const pollingEnabled = document.getElementById('pollingEnabled');
  const pollIntervalSec = document.getElementById('pollIntervalSec');
  const autoCloseTab = document.getElementById('autoCloseTab');
  const redirectDetectionEnabled = document.getElementById('redirectDetectionEnabled');
  const redirectMinTextLength = document.getElementById('redirectMinTextLength');
  const redirectMaxWaitMs = document.getElementById('redirectMaxWaitMs');
  const crawlCacheEnabled = document.getElementById('crawlCacheEnabled');
  const llmCacheEnabled = document.getElementById('llmCacheEnabled');
  const applyCacheSetting = document.getElementById('applyCacheSetting');
  const testUrl = document.getElementById('testUrl');
  const testGo = document.getElementById('testGo');
  const refreshHistoryBtn = document.getElementById('refreshHistory');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const scriptsPanel = document.getElementById('scriptsPanel');
  const syncScriptsBtn = document.getElementById('syncScripts');
  const saveBtn = document.getElementById('save');
  const lastStatus = document.getElementById('lastStatus');
  const liveStatus = document.getElementById('liveStatus');
  const pendingDomainsEl = document.getElementById('pendingDomains');
  const allowedDomainsEl = document.getElementById('allowedDomains');
  function normalizeBase(host) {
    try {
      let h = String(host || '').toLowerCase();
      return h.replace(/^www\./, '').replace(/^m\./, '').replace(/^amp\./, '');
    } catch (_) { return host; }
  }

  function renderScripts(byDomain) {
    try {
      const map = byDomain && typeof byDomain === 'object' ? byDomain : {};
      const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
      if (!entries.length) {
        scriptsPanel.innerHTML = '<div class="status">No scripts cached</div>';
        return;
      }
      const html = entries.map(([d, rec]) => {
        const wb = Number(rec && rec.waitBeforeMs || 0);
        const wa = Number(rec && rec.waitAfterMs || 0);
        const createdAt = rec && rec.createdAt ? String(rec.createdAt) : '';
        const updatedAt = rec && rec.updatedAt ? String(rec.updatedAt) : '';
        const cond = rec && rec.condition ? String(rec.condition) : '';
        const code = rec && rec.script ? String(rec.script) : '';
        return `<div class="status" style="margin-bottom:8px">
          <div><strong>${d}</strong> <span style="font-size:12px;color:#666">hash=${(rec && rec.hash) || ''}</span></div>
          <div style="font-size:12px">waitBefore=${wb}ms · waitAfter=${wa}ms</div>
          <div style="font-size:12px">created=${createdAt} · updated=${updatedAt}</div>
          ${cond ? `<details><summary style="cursor:pointer">Condition</summary><pre style="white-space:pre-wrap">${cond.replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre></details>` : ''}
          ${code ? `<details><summary style="cursor:pointer">Script</summary><pre style="white-space:pre-wrap">${code.replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre></details>` : ''}
        </div>`;
      }).join('');
      scriptsPanel.innerHTML = html;
    } catch (e) {
      scriptsPanel.innerHTML = `<div class="status">Error rendering scripts: ${String(e)}</div>`;
    }
  }

  function collapseDomainMap(map) {
    const out = {};
    for (const [k, rec] of Object.entries(map || {})) {
      const base = normalizeBase(k);
      const prev = out[base] || {};
      out[base] = Object.assign({}, prev, rec, { allowed: !!(prev.allowed || rec.allowed) });
    }
    return out;
  }

  function renderDomains(map) {
    const collapsed = collapseDomainMap(map || {});
    const entries = Object.entries(collapsed);
    const pending = entries.filter(([d, rec]) => !rec.allowed).map(([d]) => d);
    const allowed = entries.filter(([d, rec]) => !!rec.allowed).map(([d]) => d);
    pendingDomainsEl.innerHTML = `Pending (${pending.length}):` + '<br>' + pending.map(d => `<div class="flex"><code>${d}</code><button class="btn" data-domain="${d}" data-action="allow">Allow</button><button class="btn" data-domain="${d}" data-action="remove">Remove</button></div>`).join('');
    allowedDomainsEl.innerHTML = `Allowed (${allowed.length}):` + '<br>' + allowed.map(d => `<div class="flex"><code>${d}</code><button class="btn" data-domain="${d}" data-action="remove">Remove</button></div>`).join('');
    pendingDomainsEl.querySelectorAll('button').forEach(btn => btn.addEventListener('click', onDomainAction));
    allowedDomainsEl.querySelectorAll('button').forEach(btn => btn.addEventListener('click', onDomainAction));
  }

  async function loadHistory() {
    return new Promise((resolve) => chrome.storage.local.get(['crawlHistory'], resolve));
  }

  function formatAbsolute(d) {
    try {
      const pad = (n) => String(n).padStart(2, '0');
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function timeAgo(ts) {
    const now = Date.now();
    const t = Number(ts || 0);
    if (!isFinite(t) || t <= 0) return '';
    const s = Math.max(0, Math.floor((now - t) / 1000));
    if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
    const y = Math.floor(mo / 12);
    return `${y} year${y === 1 ? '' : 's'} ago`;
  }

  function renderHistory(items) {
    const list = (Array.isArray(items) ? items : []).slice().sort((a, b) => Number(b && b.ts || 0) - Number(a && a.ts || 0));
    if (!list.length) {
      historyList.innerHTML = '<div class="status">No crawls yet</div>';
      return;
    }
    const html = list.map((it, idx) => {
      const d = new Date(Number(it.ts || Date.now()));
      const abs = isNaN(d.getTime()) ? '' : formatAbsolute(d);
      const rel = timeAgo(it.ts);
      const when = [abs, rel].filter(Boolean).join(' · ');
      const safeUrl = String(it.url || '');
      const status = String(it.status || '');
      const err = String(it.error || '');
      const size = Number(it.size || 0);
      const phases = it.phases || {};
      const parts = [];
      if (phases.conditionMs != null) parts.push(`cond ${phases.conditionMs}ms`);
      if (phases.scriptMs != null) parts.push(`script ${phases.scriptMs}ms`);
      if (phases.submitMs != null) parts.push(`submit ${phases.submitMs}ms`);
      const times = parts.join(' · ');
      const meta = [it.kind || 'server', it.jobId != null ? `job ${it.jobId}` : ''].filter(Boolean).join(' · ');
      const hasHtml = it.html && String(it.html).length > 0;
      const htmlInfo = hasHtml ? `(HTML: ${String(it.html).length.toLocaleString()} bytes)` : '(no HTML stored)';
      const redirectInfo = it.redirectOccurred ? 
        `<div style="font-size:11px;color:#e67e22;margin-top:2px">🔄 Redirect detected: ${it.redirectReason || 'unknown'} (${it.phases && it.phases.redirectCheckMs || 0}ms) · Text: ${it.initialTextLength || 0} → ${it.finalTextLength || it.initialTextLength || 0} chars</div>` : 
        (it.initialTextLength != null ? `<div style="font-size:11px;color:#27ae60;margin-top:2px">✓ No redirect (${it.initialTextLength} chars)</div>` : '');
      return `<div class="status" style="margin-bottom:6px">
        <div><strong>${it.domain || ''}</strong><span style="font-size:12px; color:#666"> — ${meta}</span></div>
        <div style="font-size:12px">${when}${times ? ' · ' + times : ''}${size ? ' · ' + size + ' bytes' : ''} <span style="color:#999">${htmlInfo}</span></div>
        ${redirectInfo}
        <div style="font-size:12px; word-break: break-all"><a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a></div>
        <div style="font-size:12px">status: <strong>${status}</strong>${err ? ' · error: ' + err : ''}</div>
        ${hasHtml ? `<div style="margin-top:4px"><button class="btn" data-history-idx="${idx}">Preview HTML</button></div>` : ''}
      </div>`;
    }).join('');
    historyList.innerHTML = html;
    
    // Attach preview button handlers
    historyList.querySelectorAll('button[data-history-idx]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-history-idx'), 10);
        const item = list[idx];
        if (item && item.html) {
          chrome.runtime.sendMessage({ type: 'gg-preview-html', html: item.html }, (res) => {
            if (!res || !res.ok) {
              lastStatus.textContent = `status: preview error ${res && res.error ? res.error : ''}`;
            }
          });
        }
      });
    });
  }

  async function onDomainAction(e) {
    const el = e.currentTarget;
    const domain = el.getAttribute('data-domain');
    const action = el.getAttribute('data-action');
    const cfg = await cfgGet();
    const map = Object.assign({}, cfg.allowedDomains || {});
    const base = normalizeBase(domain);
    // remove any variants and apply only on base key
    for (const k of Object.keys(map)) {
      if (normalizeBase(k) === base) delete map[k];
    }
    if (action === 'allow') {
      map[base] = Object.assign({}, map[base] || {}, { allowed: true, allowedAt: Date.now() });
    } else if (action === 'remove') {
      // ensure removed
      delete map[base];
    }
    await cfgSet({ allowedDomains: map });
    renderDomains(map);
  }
  async function refresh() {
    const cfg = await cfgGet();
    serverBaseUrl.value = cfg.serverBaseUrl || DEFAULTS.serverBaseUrl;
    pollingEnabled.checked = !!cfg.pollingEnabled;
    pollIntervalSec.value = parseInt(cfg.pollIntervalSec || DEFAULTS.pollIntervalSec, 10);
    autoCloseTab.checked = !!cfg.autoCloseTab;
    redirectDetectionEnabled.checked = cfg.redirectDetectionEnabled !== false;
    redirectMinTextLength.value = parseInt(cfg.redirectMinTextLength || 3000, 10);
    redirectMaxWaitMs.value = parseInt(cfg.redirectMaxWaitMs || 30000, 10);
    lastStatus.textContent = `status: ${cfg.lastStatus || '—'}`;
    // Load current live status once
    try {
      const v = await new Promise((resolve) => chrome.storage.local.get(['liveCrawl'], resolve));
      const st = v && v.liveCrawl;
      if (st) {
        const parts = [st.mode, st.phase, st.domain].filter(Boolean).join(' · ');
        liveStatus.textContent = `live: ${parts}`;
      } else {
        liveStatus.textContent = 'live: —';
      }
    } catch (_) {}
    // Load server cache settings (both crawl and LLM)
    try {
      const base = (serverBaseUrl.value || '').replace(/\/$/, '');
      console.log('[cache] Fetching settings from:', base);
      if (base) {
        const r = await fetch(`${base}/crawl/cache/settings`, { method: 'GET', cache: 'no-cache' });
        console.log('[cache] Fetch response status:', r.status, r.ok);
        if (r.ok) {
          const js = await r.json();
          console.log('[cache] Raw response:', js);
          console.log('[cache] crawlCacheEnabled element:', crawlCacheEnabled);
          console.log('[cache] llmCacheEnabled element:', llmCacheEnabled);
          crawlCacheEnabled.checked = !!js.crawlCacheEnabled;
          llmCacheEnabled.checked = !!js.llmCacheEnabled;
          console.log('[cache] Set crawlCacheEnabled.checked =', crawlCacheEnabled.checked);
          console.log('[cache] Set llmCacheEnabled.checked =', llmCacheEnabled.checked);
          console.log('[cache] ✅ Loaded settings from server:', js);
        } else {
          console.warn('[cache] ❌ Failed to load settings from server:', r.status);
        }
      } else {
        console.warn('[cache] ⚠️ No server base URL configured');
      }
    } catch (e) {
      console.error('[cache] ❌ Exception loading settings:', e);
      // leave checkboxes as-is
    }
    // one-time migration to collapse existing keys
    const collapsed = collapseDomainMap(cfg.allowedDomains || {});
    await cfgSet({ allowedDomains: collapsed });
    renderDomains(collapsed);
    const hist = await loadHistory();
    renderHistory(hist && hist.crawlHistory);
    try {
      const v = await new Promise((resolve) => chrome.storage.local.get(['scriptsByDomain'], resolve));
      renderScripts(v && v.scriptsByDomain);
    } catch (_) {}
    
    // Load cache stats
    try {
      await fetchCacheStats();
    } catch (_) {}
  }

  // Auto-save autoCloseTab on change (no need to click Save button)
  autoCloseTab.addEventListener('change', async () => {
    try {
      await cfgSet({ autoCloseTab: !!autoCloseTab.checked });
      console.log('[settings] autoCloseTab saved:', autoCloseTab.checked);
    } catch (e) {
      console.error('[settings] Failed to save autoCloseTab:', e);
    }
  });

  saveBtn.addEventListener('click', async () => {
    const next = {
      serverBaseUrl: (serverBaseUrl.value || '').trim(),
      pollingEnabled: !!pollingEnabled.checked,
      pollIntervalSec: Math.max(5, parseInt(pollIntervalSec.value || '15', 10)),
      autoCloseTab: !!autoCloseTab.checked,
      redirectDetectionEnabled: !!redirectDetectionEnabled.checked,
      redirectMinTextLength: Math.max(500, parseInt(redirectMinTextLength.value || '3000', 10)),
      redirectMaxWaitMs: Math.max(5000, parseInt(redirectMaxWaitMs.value || '30000', 10)),
    };
    await cfgSet(next);
    await refresh();
  });

  testGo.addEventListener('click', async () => {
    const url = (testUrl.value || '').trim();
    if (!url) { lastStatus.textContent = 'status: enter a URL'; return; }
    lastStatus.textContent = 'status: starting test crawl...';
    chrome.runtime.sendMessage({ type: 'gg-test-crawl', url }, (res) => {
      if (!res || !res.ok) {
        lastStatus.textContent = `status: test crawl error ${res && res.error ? res.error : ''}`;
      } else {
        lastStatus.textContent = 'status: test crawl done';
      }
    });
  });

  refreshHistoryBtn.addEventListener('click', async () => {
    const hist = await loadHistory();
    renderHistory(hist && hist.crawlHistory);
  });

  clearHistoryBtn.addEventListener('click', async () => {
    await new Promise((resolve) => chrome.storage.local.set({ crawlHistory: [] }, resolve));
    renderHistory([]);
  });

  syncScriptsBtn.addEventListener('click', async () => {
    try {
      const base = (serverBaseUrl.value || '').replace(/\/$/, '');
      if (!base) { lastStatus.textContent = 'status: set Server Base URL first'; return; }
      lastStatus.textContent = 'status: syncing scripts...';
      chrome.runtime.sendMessage({ type: 'gg-sync-scripts' }, (res) => {
        if (!res || !res.ok) {
          lastStatus.textContent = `status: sync failed ${res && res.error ? res.error : ''}`;
        } else {
          renderScripts(res.byDomain);
          lastStatus.textContent = 'status: scripts synced';
        }
      });
    } catch (e) {
      lastStatus.textContent = `status: sync error ${String(e)}`;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.lastStatus) {
        const v = changes.lastStatus.newValue;
        lastStatus.textContent = `status: ${v}`;
      }
      if (changes.allowedDomains) {
        renderDomains(changes.allowedDomains.newValue || {});
      }
    }
    if (area === 'local') {
      if (changes.crawlHistory) {
        renderHistory(changes.crawlHistory.newValue || []);
      }
      if (changes.liveCrawl) {
        const st = changes.liveCrawl.newValue;
        if (st) {
          const parts = [st.mode, st.phase, st.domain].filter(Boolean).join(' · ');
          liveStatus.textContent = `live: ${parts}`;
        } else {
          liveStatus.textContent = 'live: —';
        }
      }
    }
  });

  await refresh();

  applyCacheSetting.addEventListener('click', async () => {
    try {
      const base = (serverBaseUrl.value || '').replace(/\/$/, '');
      if (!base) {
        lastStatus.textContent = 'status: ⚠️ Set Server Base URL first';
        console.error('[cache] No server URL configured');
        return;
      }
      const body = {
        crawlCacheEnabled: !!crawlCacheEnabled.checked,
        llmCacheEnabled: !!llmCacheEnabled.checked
      };
      
      console.log('[cache] Applying settings to', base, body);
      lastStatus.textContent = 'status: Applying cache settings...';
      
      const r = await fetch(`${base}/crawl/cache/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        const errorMsg = `Cache settings failed (${r.status})`;
        lastStatus.textContent = `status: ❌ ${errorMsg}`;
        console.error('[cache] Apply failed:', r.status, t);
        
        if (r.status === 0 || r.status === 404) {
          alert(`Cannot connect to server at ${base}\n\nPlease check:\n1. Server is running\n2. Server URL is correct (check port: 5007 or 8000?)\n3. No CORS issues`);
        }
      } else {
        const result = await r.json().catch(() => body);
        const parts = [];
        if (crawlCacheEnabled.checked) parts.push('crawl');
        if (llmCacheEnabled.checked) parts.push('LLM');
        const enabled = parts.length ? parts.join(' + ') : 'none';
        lastStatus.textContent = `status: ✅ Cache enabled: ${enabled}`;
        console.log('[cache] Settings applied successfully:', result);
      }
    } catch (e) {
      const errorMsg = e.message || String(e);
      lastStatus.textContent = `status: ❌ Error: ${errorMsg}`;
      console.error('[cache] Exception:', e);
      
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        alert(`Cannot connect to server!\n\nError: ${errorMsg}\n\nPlease check:\n1. Server is running\n2. Server URL matches actual port\n3. No firewall blocking connection`);
      }
    }
  });

  // ===== CACHE STATS AND CLEARING =====
  
  async function fetchCacheStats() {
    try {
      const base = (serverBaseUrl.value || '').replace(/\/$/, '');
      if (!base) return;
      
      // Fetch crawl cache stats
      try {
        const crawlStatsResp = await fetch(`${base}/crawl/cache/stats`, { 
          method: 'GET', 
          cache: 'no-cache' 
        });
        if (crawlStatsResp.ok) {
          const crawlStats = await crawlStatsResp.json();
          const crawlMB = (crawlStats.totalSizeBytes / 1024 / 1024).toFixed(2);
          document.getElementById('crawlCacheStats').textContent = 
            `Crawl: ${crawlStats.entriesCount} entries, ${crawlMB} MB`;
        }
      } catch (e) {
        document.getElementById('crawlCacheStats').textContent = 'Crawl: error loading stats';
      }
      
      // Fetch LLM cache stats (list all providers)
      try {
        const llmProvidersResp = await fetch(`${base}/cache/providers`, { 
          method: 'GET', 
          cache: 'no-cache' 
        });
        if (llmProvidersResp.ok) {
          const providers = await llmProvidersResp.json();
          const totalEntries = providers.reduce((sum, p) => sum + (p.entriesCount || 0), 0);
          const totalBytes = providers.reduce((sum, p) => sum + (p.totalSizeBytes || 0), 0);
          const llmMB = (totalBytes / 1024 / 1024).toFixed(2);
          document.getElementById('llmCacheStats').textContent = 
            `LLM: ${totalEntries} entries, ${llmMB} MB`;
        }
      } catch (e) {
        document.getElementById('llmCacheStats').textContent = 'LLM: error loading stats';
      }
    } catch (e) {
      console.error('[cache-stats] error', e);
    }
  }

  const clearCrawlCacheBtn = document.getElementById('clearCrawlCache');
  const clearLLMCacheBtn = document.getElementById('clearLLMCache');
  const clearAllCachesBtn = document.getElementById('clearAllCaches');

  clearCrawlCacheBtn.addEventListener('click', async () => {
    if (!confirm('Clear all crawl cache? This will delete all cached HTML pages.')) {
      return;
    }
    
    try {
      const base = (serverBaseUrl.value || '').replace(/\/$/, '');
      if (!base) {
        lastStatus.textContent = 'status: set Server Base URL first';
        return;
      }
      
      clearCrawlCacheBtn.disabled = true;
      clearCrawlCacheBtn.textContent = 'Clearing...';
      lastStatus.textContent = 'status: clearing crawl cache...';
      
      const r = await fetch(`${base}/crawl/cache/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        lastStatus.textContent = `status: crawl cache clear failed ${r.status}`;
      } else {
        lastStatus.textContent = 'status: crawl cache cleared ✓';
        await fetchCacheStats();
      }
    } catch (e) {
      lastStatus.textContent = `status: error clearing crawl cache: ${String(e)}`;
    } finally {
      clearCrawlCacheBtn.disabled = false;
      clearCrawlCacheBtn.textContent = 'Clear Crawl Cache';
    }
  });

  clearLLMCacheBtn.addEventListener('click', async () => {
    if (!confirm('Clear all LLM cache? This will delete all cached LLM responses.')) {
      return;
    }
    
    try {
      const base = (serverBaseUrl.value || '').replace(/\/$/, '');
      if (!base) {
        lastStatus.textContent = 'status: set Server Base URL first';
        return;
      }
      
      clearLLMCacheBtn.disabled = true;
      clearLLMCacheBtn.textContent = 'Clearing...';
      lastStatus.textContent = 'status: clearing LLM cache...';
      
      const r = await fetch(`${base}/cache/clear-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        lastStatus.textContent = `status: LLM cache clear failed ${r.status}`;
      } else {
        lastStatus.textContent = 'status: LLM cache cleared ✓';
        await fetchCacheStats();
      }
    } catch (e) {
      lastStatus.textContent = `status: error clearing LLM cache: ${String(e)}`;
    } finally {
      clearLLMCacheBtn.disabled = false;
      clearLLMCacheBtn.textContent = 'Clear LLM Cache';
    }
  });

  clearAllCachesBtn.addEventListener('click', async () => {
    if (!confirm('⚠️ Clear ALL caches (Crawl + LLM)? This cannot be undone.')) {
      return;
    }
    
    try {
      const base = (serverBaseUrl.value || '').replace(/\/$/, '');
      if (!base) {
        lastStatus.textContent = 'status: set Server Base URL first';
        return;
      }
      
      clearAllCachesBtn.disabled = true;
      clearAllCachesBtn.textContent = 'Clearing...';
      lastStatus.textContent = 'status: clearing all caches...';
      
      // Clear both sequentially
      const [crawlResp, llmResp] = await Promise.all([
        fetch(`${base}/crawl/cache/clear`, { method: 'POST' }),
        fetch(`${base}/cache/clear-all`, { method: 'POST' })
      ]);
      
      if (!crawlResp.ok || !llmResp.ok) {
        lastStatus.textContent = `status: partial clear (crawl: ${crawlResp.status}, llm: ${llmResp.status})`;
      } else {
        lastStatus.textContent = 'status: all caches cleared ✓';
        await fetchCacheStats();
      }
    } catch (e) {
      lastStatus.textContent = `status: error clearing caches: ${String(e)}`;
    } finally {
      clearAllCachesBtn.disabled = false;
      clearAllCachesBtn.textContent = '⚠️ Clear All Caches';
    }
  });

  const clearNoTableCacheBtn = document.getElementById('clearNoTableCache');

  clearNoTableCacheBtn.addEventListener('click', async () => {
    if (!confirm('Clear crawl cache entries that don\'t contain data tables? Files with tables will be kept.')) {
      return;
    }
    
    try {
      const cfg = await window.getCfg();
      const base = (cfg && cfg.serverBaseUrl || window.DEFAULTS.serverBaseUrl || '').replace(/\/+$/, '');
      
      if (!base) {
        lastStatus.textContent = 'status: no server base URL';
        return;
      }
      
      clearNoTableCacheBtn.disabled = true;
      clearNoTableCacheBtn.textContent = 'Scanning...';
      lastStatus.textContent = 'status: scanning cache for files without tables...';
      
      const r = await fetch(`${base}/crawl/cache/clear-no-tables`, {
        method: 'POST',
        cache: 'no-cache'
      });
      
      if (r.ok) {
        const result = await r.json();
        const scanned = result.scanned || 0;
        const cleared = result.cleared || 0;
        const kept = result.kept || 0;
        const errors = result.errors || 0;
        
        lastStatus.textContent = `status: cleared ${cleared} files (scanned: ${scanned}, kept: ${kept}, errors: ${errors})`;
        
        // Refresh cache stats
        await updateCacheStats();
      } else {
        lastStatus.textContent = `status: error clearing no-table cache (${r.status})`;
      }
    } catch (e) {
      lastStatus.textContent = `status: error clearing no-table cache: ${String(e)}`;
    } finally {
      clearNoTableCacheBtn.disabled = false;
      clearNoTableCacheBtn.textContent = '🗑️ Clear Cache (No Tables)';
    }
  });

  // ===== DEBUG PANEL =====
  const openLogsBtn = document.getElementById('openLogsBtn');
  const expandAllBtn = document.getElementById('expandAllBtn');
  const collapseAllBtn = document.getElementById('collapseAllBtn');
  const refreshDebugBtn = document.getElementById('refreshDebugBtn');
  
  function openLogStream() {
    const url = chrome.runtime.getURL('logs.html');
    chrome.tabs.create({ url });
  }
  
  function expandAll() {
    document.querySelectorAll('details[id^="debug"]').forEach(d => d.open = true);
  }
  
  function collapseAll() {
    document.querySelectorAll('details[id^="debug"]').forEach(d => d.open = false);
  }
  
  async function refreshDebugPanel() {
    try {
      // Get all relevant data
      const [cfg, local, alarms] = await Promise.all([
        getCfg(),
        new Promise(r => chrome.storage.local.get(null, r)),
        new Promise(r => chrome.alarms.getAll(r))
      ]);

      // 1. Live Status
      const now = new Date();
      const liveStatusEl = document.getElementById('debugLiveStatusContent');
      const pollingStatus = cfg.pollingEnabled ? '✅ ENABLED' : '❌ DISABLED';
      const serverUrl = cfg.serverBaseUrl || 'NOT SET';
      liveStatusEl.textContent = [
        `Time: ${now.toLocaleTimeString()}`,
        `Polling: ${pollingStatus}`,
        `Server: ${serverUrl}`,
        `Interval: ${cfg.pollIntervalSec || 15}s`,
        `Auto-close: ${cfg.autoCloseTab ? 'YES' : 'NO'}`
      ].join('\n');

      // 2. Polling Status
      const pollingEl = document.getElementById('debugPollingContent');
      const lastPoll = local.lastPollTime ? new Date(local.lastPollTime) : null;
      const lastPollStr = lastPoll ? `${lastPoll.toLocaleTimeString()} (${Math.round((now - lastPoll) / 1000)}s ago)` : 'NEVER';
      const lastPollResult = local.lastPollResult || {};
      const jobsFetched = lastPollResult.jobsCount || 0;
      const scriptsFetched = lastPollResult.scriptsCount || 0;
      const lastPollError = lastPollResult.error || 'none';
      
      pollingEl.textContent = [
        `Last Poll: ${lastPollStr}`,
        `Jobs Fetched: ${jobsFetched}`,
        `Scripts Fetched: ${scriptsFetched}`,
        `Last Error: ${lastPollError}`,
        ``,
        `Next Poll: ${cfg.pollingEnabled ? `~${cfg.pollIntervalSec || 15}s` : 'DISABLED'}`
      ].join('\n');

      // 3. Active Jobs
      const jobsEl = document.getElementById('debugJobsContent');
      const activeJobs = local.activeJobs || {};
      const jobsList = Array.isArray(activeJobs) ? activeJobs : Object.values(activeJobs);
      if (jobsList.length === 0) {
        jobsEl.textContent = 'No active jobs';
      } else {
        jobsEl.textContent = jobsList.map((j, i) => {
          try {
            const domain = new URL(j.url).hostname;
            const status = j.status || 'pending';
            return `[${i + 1}] Job ${j.jobId} · ${domain}\n    Status: ${status}\n    URL: ${j.url}`;
          } catch (e) {
            return `[${i + 1}] Job ${j.jobId} · (invalid URL)`;
          }
        }).join('\n\n');
      }

      // 4. Domain Status
      const domainsEl = document.getElementById('debugDomainsContent');
      const domainMap = cfg.allowedDomains || {}; // Domains are in sync storage, not local
      const domainEntries = Object.entries(domainMap);
      if (domainEntries.length === 0) {
        domainsEl.textContent = 'No domains tracked';
      } else {
        const allowed = domainEntries.filter(([d, r]) => r.allowed);
        const pending = domainEntries.filter(([d, r]) => !r.allowed);
        domainsEl.textContent = [
          `✅ ALLOWED (${allowed.length}):`,
          ...allowed.map(([d]) => `  • ${d}`),
          ``,
          `⏳ PENDING (${pending.length}):`,
          ...pending.map(([d]) => `  • ${d}`),
          ``,
          `📌 Jobs will be REJECTED if domain not in ALLOWED list`
        ].join('\n');
      }

      // 5. Activity Log
      const logEl = document.getElementById('debugLogContent');
      const activityLog = local.activityLog || [];
      if (activityLog.length === 0) {
        logEl.textContent = 'No activity logged';
      } else {
        logEl.textContent = activityLog.slice(-50).reverse().map(entry => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          const level = entry.level || 'INFO';
          const icon = {
            'ERROR': '❌',
            'WARN': '⚠️',
            'INFO': 'ℹ️',
            'SUCCESS': '✅',
            'POLL': '🔄',
            'JOB': '📋',
            'DOMAIN': '🌐'
          }[level] || 'ℹ️';
          return `${icon} ${time} [${level}] ${entry.message}`;
        }).join('\n');
      }

      // 6. Alarms
      const alarmsEl = document.getElementById('debugAlarmsContent');
      if (!alarms || alarms.length === 0) {
        alarmsEl.textContent = '⚠️ NO ALARMS ACTIVE!\n\nThis means polling will NOT work.\nExtension may need restart.';
        alarmsEl.style.background = '#ffe0e0';
      } else {
        alarmsEl.style.background = '#f4f4f4';
        alarmsEl.textContent = alarms.map(a => {
          const nextRun = new Date(a.scheduledTime);
          const inSeconds = Math.round((nextRun - now) / 1000);
          return `⏰ ${a.name}\n   Next: ${nextRun.toLocaleTimeString()} (in ${inSeconds}s)\n   Period: ${a.periodInMinutes || 'N/A'} min`;
        }).join('\n\n');
      }

    } catch (error) {
      console.error('[debug-panel] refresh error', error);
      document.getElementById('debugLiveStatusContent').textContent = `Error: ${error.message}`;
    }
  }

  // Initial load
  refreshDebugPanel();
  
  // Auto-refresh every 2 seconds while popup is open
  const debugRefreshInterval = setInterval(refreshDebugPanel, 2000);
  
  // Auto-refresh cache stats every 5 seconds while popup is open
  const cacheStatsInterval = setInterval(fetchCacheStats, 5000);
  
  // Cleanup on popup close
  window.addEventListener('unload', () => {
    clearInterval(debugRefreshInterval);
    clearInterval(cacheStatsInterval);
  });
  
  // ============================================================================
  // QUEUE MANAGEMENT
  // ============================================================================
  
  async function fetchQueueStats() {
    try {
      const cfg = await getCfg();
      const baseUrl = cfg.serverBaseUrl || 'http://localhost:5007';
      
      const resp = await fetch(`${baseUrl}/crawl/queue/stats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      
      const data = await resp.json();
      
      // Update UI
      document.getElementById('queueTotal').textContent = data.total || 0;
      document.getElementById('queuePending').textContent = data.pending || 0;
      document.getElementById('queueClaimed').textContent = data.claimed || 0;
      document.getElementById('queueDone').textContent = data.done || 0;
      document.getElementById('queueFailed').textContent = data.failed || 0;
      
      // Color code based on status
      const queueStatsEl = document.getElementById('queueStats');
      const pending = data.pending || 0;
      const claimed = data.claimed || 0;
      
      if (pending > 50) {
        queueStatsEl.style.background = '#ffe0e0'; // Red - many pending
      } else if (claimed > 10) {
        queueStatsEl.style.background = '#fff3cd'; // Yellow - many claimed
      } else {
        queueStatsEl.style.background = '#f4f4f4'; // Normal
      }
      
    } catch (error) {
      console.error('[queue-stats] fetch error', error);
      document.getElementById('queueTotal').textContent = 'Error';
      document.getElementById('queuePending').textContent = '—';
      document.getElementById('queueClaimed').textContent = '—';
      document.getElementById('queueDone').textContent = '—';
      document.getElementById('queueFailed').textContent = '—';
    }
  }
  
  async function clearQueue(status = null) {
    try {
      const cfg = await getCfg();
      const baseUrl = cfg.serverBaseUrl || 'http://localhost:5007';
      
      let confirmMsg = status ? 
        `Clear all ${status} jobs from the queue?` : 
        'Clear ALL jobs from the queue? This cannot be undone!';
      
      if (!confirm(confirmMsg)) {
        return;
      }
      
      const payload = status ? { status: status } : { clearAll: true };
      
      const resp = await fetch(`${baseUrl}/crawl/queue/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      
      const data = await resp.json();
      alert(`Cleared ${data.cleared} jobs. ${data.remaining} remaining.`);
      
      // Refresh stats
      await fetchQueueStats();
      
    } catch (error) {
      console.error('[queue-clear] error', error);
      alert(`Failed to clear queue: ${error.message}`);
    }
  }
  
  // Queue button handlers
  const refreshQueueBtn = document.getElementById('refreshQueue');
  const clearPendingJobsBtn = document.getElementById('clearPendingJobs');
  const clearAllJobsBtn = document.getElementById('clearAllJobs');
  const pauseExtensionBtn = document.getElementById('pauseExtension');
  const clearPendingTopBtn = document.getElementById('clearPendingTop');
  
  if (refreshQueueBtn) {
    refreshQueueBtn.addEventListener('click', fetchQueueStats);
  }
  
  if (clearPendingJobsBtn) {
    clearPendingJobsBtn.addEventListener('click', () => clearQueue('PENDING'));
  }
  
  if (clearAllJobsBtn) {
    clearAllJobsBtn.addEventListener('click', () => clearQueue(null));
  }
  
  // Top buttons - Pause Extension
  if (pauseExtensionBtn) {
    // Update button state based on current polling status
    async function updatePauseButton() {
      const cfg = await getCfg();
      if (cfg.pollingEnabled) {
        pauseExtensionBtn.textContent = '⏸️ Pause';
        pauseExtensionBtn.style.background = '#f39c12';
        pauseExtensionBtn.style.borderColor = '#f39c12';
      } else {
        pauseExtensionBtn.textContent = '▶️ Resume';
        pauseExtensionBtn.style.background = '#27ae60';
        pauseExtensionBtn.style.borderColor = '#27ae60';
      }
    }
    updatePauseButton();
    
    pauseExtensionBtn.addEventListener('click', async () => {
      const cfg = await getCfg();
      const newState = !cfg.pollingEnabled;
      await setCfg({ pollingEnabled: newState });
      pollingEnabled.checked = newState;
      await updatePauseButton();
      lastStatus.textContent = newState ? 'status: Extension resumed' : 'status: Extension paused';
    });
  }
  
  // Top button - Clear Pending (duplicate of the one below for convenience)
  if (clearPendingTopBtn) {
    clearPendingTopBtn.addEventListener('click', () => clearQueue('PENDING'));
  }
  
  // Initial queue stats fetch
  fetchQueueStats();
  
  // Auto-refresh queue stats every 10 seconds
  const queueStatsInterval = setInterval(fetchQueueStats, 10000);
  
  // Update cleanup on popup close
  window.addEventListener('unload', () => {
    clearInterval(debugRefreshInterval);
    clearInterval(cacheStatsInterval);
    clearInterval(queueStatsInterval);
  });
  
  // Button handlers
  openLogsBtn.addEventListener('click', openLogStream);
  expandAllBtn.addEventListener('click', expandAll);
  collapseAllBtn.addEventListener('click', collapseAll);
  refreshDebugBtn.addEventListener('click', refreshDebugPanel);
});