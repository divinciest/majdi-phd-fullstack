// CreteXtract Crawler - History Page

const CONFIG_DEFAULTS = {
  serverBaseUrl: 'http://localhost:5007',
};

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CONFIG_DEFAULTS, resolve);
  });
}

async function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authUser'], resolve);
  });
}

async function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['authToken', 'authUser'], resolve);
  });
}

async function requireAuth() {
  const auth = await getAuth();
  if (!auth.authToken || !auth.authUser) {
    window.location.href = 'login.html';
    return null;
  }
  
  const cfg = await getConfig();
  try {
    const resp = await fetch(`${cfg.serverBaseUrl}/me`, {
      headers: { 'Authorization': `Bearer ${auth.authToken}` }
    });
    if (!resp.ok) {
      await clearAuth();
      window.location.href = 'login.html';
      return null;
    }
  } catch (e) {
    console.log('[history] Auth check failed:', e);
  }
  
  return auth;
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

async function loadHistory() {
  const container = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');
  
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['crawlHistory'], resolve);
    });
    
    const history = data.crawlHistory || [];
    countEl.textContent = `${history.length} items`;
    
    if (history.length === 0) {
      container.innerHTML = '<div class="text-muted text-center" style="padding: 40px;">No crawl history yet</div>';
      return;
    }
    
    // Sort by timestamp descending
    const sorted = [...history].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    
    container.innerHTML = sorted.map(item => {
      const statusIcon = item.status === 'ok' ? '✓' : '✗';
      const statusColor = item.status === 'ok' ? 'var(--success)' : 'var(--error)';
      const time = formatTime(item.ts);
      const size = item.size ? `${(item.size / 1024).toFixed(1)} KB` : '-';
      
      return `
        <div class="history-item">
          <div class="history-meta">
            <div>
              <span style="color: ${statusColor}; font-weight: 600;">${statusIcon}</span>
              <strong style="margin-left: 8px;">${item.domain || 'Unknown'}</strong>
            </div>
            <span class="text-muted" style="font-size: 0.8rem;">${time}</span>
          </div>
          <div class="history-url">${item.url || '-'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
            ${item.jobId ? `Job: ${item.jobId}` : ''} 
            ${size !== '-' ? `• Size: ${size}` : ''}
            ${item.error ? `• Error: ${item.error}` : ''}
          </div>
        </div>
      `;
    }).join('');
    
  } catch (e) {
    container.innerHTML = `<div class="text-muted text-center" style="padding: 40px;">Error loading history: ${e.message}</div>`;
  }
}

async function clearHistory() {
  if (!confirm('Clear all crawl history?')) return;
  
  await new Promise((resolve) => {
    chrome.storage.local.remove(['crawlHistory', 'crawlStats'], resolve);
  });
  
  await loadHistory();
}

async function logout() {
  await clearAuth();
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  const auth = await requireAuth();
  if (!auth) return;
  
  // Display user info
  document.getElementById('user-email').textContent = auth.authUser?.email || '';
  
  // Load history
  await loadHistory();
  
  // Event listeners
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('refresh-btn').addEventListener('click', loadHistory);
  document.getElementById('clear-btn').addEventListener('click', clearHistory);
});
