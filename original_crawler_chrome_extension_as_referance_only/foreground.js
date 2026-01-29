(() => {
  // Foreground logging to unified log stream
  async function logActivity(level, message, details = null) {
    try {
      const timestamp = new Date().toISOString();
      const entry = {
        timestamp,
        level,
        message,
        source: 'foreground',
        url: window.location.href
      };
      if (details) entry.details = details;
      
      // Get existing log
      const result = await new Promise(r => chrome.storage.local.get(['extensionLogs'], r));
      const extensionLogs = result.extensionLogs || [];
      extensionLogs.push(entry);
      const trimmed = extensionLogs.slice(-500);
      
      // Save back
      await new Promise(r => chrome.storage.local.set({ extensionLogs: trimmed }, r));
      
      // Also console log
      const icon = { 'ERROR': '❌', 'WARN': '⚠️', 'INFO': 'ℹ️', 'SUCCESS': '✅' }[level] || 'ℹ️';
      console.log(`${icon} [FG:${level}]`, message, details || '');
    } catch (e) {
      console.error('[gg-fg] logActivity error:', e);
    }
  }

  function getOuterHTML() {
    try {
      if (document.documentElement) return document.documentElement.outerHTML;
      if (document.body) return document.body.outerHTML;
      const all = document.all && document.all[0];
      return all ? all.outerHTML : "";
    } catch (e) {
      console.log('[gg-fg] html error', String(e));
      logActivity('ERROR', 'Failed to get HTML', { error: String(e) });
      return "";
    }
  }

  async function waitForDocumentComplete(timeoutMs = 30000) {
    if (document.readyState === 'complete') {
      await logActivity('INFO', 'Document already complete');
      return;
    }
    console.log('[gg-fg] wait for document complete');
    await logActivity('INFO', 'Waiting for document complete', { timeout: timeoutMs });
    await new Promise((resolve) => {
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; resolve(); } }, timeoutMs);
      if (document.readyState === 'complete') {
        clearTimeout(to);
        resolve();
        return;
      }
      window.addEventListener('load', () => {
        if (done) return;
        done = true;
        clearTimeout(to);
        resolve();
      }, { once: true });
    });
    await logActivity('SUCCESS', 'Document load complete');
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitForDomIdle(idleMs = 5000, maxWaitMs = 120000) {
    try {
      await logActivity('INFO', 'Waiting for DOM idle', { idleMs, maxWaitMs });
      const start = Date.now();
      let lastChange = Date.now();
      let mutationCount = 0;
      const observer = new MutationObserver((mutations) => {
        if (!mutations || mutations.length === 0) return;
        mutationCount += mutations.length;
        lastChange = Date.now();
      });
      try {
        const cfg = { childList: true, subtree: true, attributes: true, characterData: true };
        if (document.documentElement) observer.observe(document.documentElement, cfg);
        else if (document.body) observer.observe(document.body, cfg);
      } catch (e) {
        console.log('[gg-fg] observer error', String(e));
        await logActivity('ERROR', 'MutationObserver failed', { error: String(e) });
      }
      return await new Promise(async (resolve) => {
        const check = setInterval(async () => {
          const now = Date.now();
          if (now - start >= maxWaitMs) {
            clearInterval(check);
            try { observer.disconnect(); } catch (_) {}
            console.log('[gg-fg] dom idle timeout', { waited_ms: now - start, mutations: mutationCount });
            await logActivity('WARN', 'DOM idle timeout reached', { waitedMs: now - start, mutations: mutationCount });
            resolve();
            return;
          }
          if (now - lastChange >= idleMs) {
            clearInterval(check);
            try { observer.disconnect(); } catch (_) {}
            console.log('[gg-fg] dom idle reached', { idle_ms: idleMs, since_last_ms: now - lastChange, mutations: mutationCount });
            await logActivity('SUCCESS', 'DOM idle reached', { idleMs, mutations: mutationCount });
            resolve();
          }
        }, 250);
      });
    } catch (e) {
      console.log('[gg-fg] waitForDomIdle error', String(e));
      await logActivity('ERROR', 'DOM idle wait failed', { error: String(e) });
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "GG_GET_HTML") {
      (async () => {
        try {
          await logActivity('INFO', 'Received HTML extraction request');
          await waitForDocumentComplete(30000);
          console.log('[gg-fg] load complete; watching DOM for idle (5s)');
          await waitForDomIdle(5000, 180000);
          const html = getOuterHTML();
          const htmlSize = new Blob([html]).size;
          await logActivity('SUCCESS', 'HTML extracted successfully', { sizeBytes: htmlSize });
          sendResponse({ ok: true, html, url: location.href });
        } catch (e) {
          console.log('[gg-fg] wait error', String(e));
          await logActivity('ERROR', 'HTML extraction failed', { error: String(e) });
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }
  });
})();
