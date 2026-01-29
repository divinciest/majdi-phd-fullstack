// CreteXtract Crawler - Dashboard Page

const CONFIG_DEFAULTS = {
  serverBaseUrl: 'http://localhost:5007',
  pollingEnabled: true,
  pollIntervalSec: 30,
};

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CONFIG_DEFAULTS, resolve);
  });
}

async function setConfig(patch) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(patch, resolve);
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
  
  // Validate token
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
    console.log('[dashboard] Auth check failed:', e);
  }
  
  return auth;
}

async function testServer() {
  const cfg = await getConfig();
  const serverBadge = document.getElementById('server-badge');
  const banner = document.getElementById('connection-banner');
  const bannerText = document.getElementById('connection-text');
  
  try {
    const resp = await fetch(`${cfg.serverBaseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (resp.ok) {
      serverBadge.textContent = 'Connected';
      serverBadge.className = 'badge badge-success';
      banner.className = 'alert alert-success mb-4';
      bannerText.textContent = '✓ Connected to server';
      return true;
    } else {
      throw new Error(`HTTP ${resp.status}`);
    }
  } catch (e) {
    serverBadge.textContent = 'Offline';
    serverBadge.className = 'badge badge-error';
    banner.className = 'alert alert-error mb-4';
    bannerText.textContent = `✗ Cannot connect to server: ${e.message}`;
    return false;
  }
}

async function refreshStatus() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['lastPollTime', 'lastPollResult', 'activeJobs', 'crawlStats'], resolve);
    });
    
    const cfg = await getConfig();
    
    // Stats
    const pending = data.lastPollResult?.jobsCount || 0;
    const active = data.activeJobs ? Object.keys(data.activeJobs).length : 0;
    const done = data.crawlStats?.done || 0;
    
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-done').textContent = done;
    
    // Last poll
    if (data.lastPollTime) {
      const d = new Date(data.lastPollTime);
      document.getElementById('last-poll').textContent = d.toLocaleTimeString();
    }
    
    // Polling status
    document.getElementById('polling-status').textContent = cfg.pollingEnabled ? 'Enabled' : 'Disabled';
    document.getElementById('polling-toggle').checked = cfg.pollingEnabled;
    
    // Crawler badge
    const crawlerBadge = document.getElementById('crawler-badge');
    if (active > 0) {
      crawlerBadge.textContent = 'Active';
      crawlerBadge.className = 'badge badge-success';
    } else if (pending > 0) {
      crawlerBadge.textContent = 'Pending';
      crawlerBadge.className = 'badge badge-warning';
    } else {
      crawlerBadge.textContent = 'Idle';
      crawlerBadge.className = 'badge badge-neutral';
    }
    
  } catch (e) {
    console.log('[dashboard] Status refresh error:', e);
  }
}

async function loadRecentActivity() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['crawlHistory'], resolve);
    });
    
    const container = document.getElementById('recent-activity');
    const history = data.crawlHistory || [];
    
    if (history.length === 0) {
      container.innerHTML = '<div class="text-muted">No recent activity</div>';
      return;
    }
    
    const recent = history.slice(0, 5);
    container.innerHTML = recent.map(item => {
      const time = new Date(item.ts).toLocaleTimeString();
      const status = item.status === 'ok' ? '✓' : '✗';
      const statusColor = item.status === 'ok' ? 'var(--success)' : 'var(--error)';
      return `
        <div style="padding: 8px 0; border-bottom: 1px solid var(--border);">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: ${statusColor}">${status}</span>
            <span class="text-muted">${time}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${item.domain || item.url || '-'}
          </div>
        </div>
      `;
    }).join('');
    
  } catch (e) {
    console.log('[dashboard] Activity load error:', e);
  }
}

async function pollNow() {
  const btn = document.getElementById('poll-now-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Polling...';
  
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'POLL_NOW' }, resolve);
    });
    
    if (response && response.ok) {
      btn.textContent = '✓ Poll Complete';
    } else {
      btn.textContent = '✗ Poll Failed';
    }
  } catch (e) {
    btn.textContent = '✗ Error';
  }
  
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = '🔄 Poll for Jobs Now';
    refreshStatus();
    loadRecentActivity();
  }, 2000);
}

async function togglePolling() {
  const enabled = document.getElementById('polling-toggle').checked;
  await setConfig({ pollingEnabled: enabled });
  document.getElementById('polling-status').textContent = enabled ? 'Enabled' : 'Disabled';
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
  
  // Load config and display server URL
  const cfg = await getConfig();
  document.getElementById('server-url').textContent = cfg.serverBaseUrl;
  
  // Test server connection
  await testServer();
  
  // Load status
  await refreshStatus();
  await loadRecentActivity();
  
  // Event listeners
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('poll-now-btn').addEventListener('click', pollNow);
  document.getElementById('test-server-btn').addEventListener('click', testServer);
  document.getElementById('polling-toggle').addEventListener('change', togglePolling);
  
  // Periodic refresh
  setInterval(refreshStatus, 5000);
  setInterval(loadRecentActivity, 10000);
});
