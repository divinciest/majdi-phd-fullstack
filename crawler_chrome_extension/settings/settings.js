// CreteXtract Crawler Settings Page

document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings first
  await loadSettings();
  
  // Test server connection and check auth
  await testServerConnection();
  await checkAuthStatus();
  
  // Setup event listeners
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('poll-now-btn').addEventListener('click', triggerPollNow);
  document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);
  document.getElementById('test-server-btn').addEventListener('click', testServerConnection);
  document.getElementById('test-connection-btn').addEventListener('click', testServerConnection);
  
  // Enter key handlers
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('server-url').addEventListener('change', testServerConnection);
  
  // Periodic status refresh
  setInterval(refreshStatus, 5000);
  refreshStatus();
});

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      serverBaseUrl: 'http://localhost:5007',
      pollingEnabled: true,
      pollIntervalSec: 30,
      autoCloseTab: false,
      redirectDetectionEnabled: true,
      redirectMinTextLength: 3000,
      redirectMaxWaitMs: 30000,
    }, resolve);
  });
}

async function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authUser'], resolve);
  });
}

async function setAuth(token, user) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ authToken: token, authUser: user }, resolve);
  });
}

async function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['authToken', 'authUser'], resolve);
  });
}

async function loadSettings() {
  const cfg = await getConfig();
  
  document.getElementById('server-url').value = cfg.serverBaseUrl || '';
  document.getElementById('polling-enabled').checked = cfg.pollingEnabled !== false;
  document.getElementById('poll-interval').value = cfg.pollIntervalSec || 30;
  document.getElementById('auto-close-tab').checked = cfg.autoCloseTab === true;
  document.getElementById('redirect-detection').checked = cfg.redirectDetectionEnabled !== false;
  document.getElementById('redirect-min-text').value = cfg.redirectMinTextLength || 3000;
  document.getElementById('redirect-max-wait').value = cfg.redirectMaxWaitMs || 30000;
}

async function saveSettings() {
  const settings = {
    serverBaseUrl: document.getElementById('server-url').value.trim().replace(/\/$/, ''),
    pollingEnabled: document.getElementById('polling-enabled').checked,
    pollIntervalSec: parseInt(document.getElementById('poll-interval').value, 10) || 30,
    autoCloseTab: document.getElementById('auto-close-tab').checked,
    redirectDetectionEnabled: document.getElementById('redirect-detection').checked,
    redirectMinTextLength: parseInt(document.getElementById('redirect-min-text').value, 10) || 3000,
    redirectMaxWaitMs: parseInt(document.getElementById('redirect-max-wait').value, 10) || 30000,
  };
  
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      showToast('Settings saved!', 'success');
      resolve();
    });
  });
}

async function testServerConnection() {
  const cfg = await getConfig();
  const serverUrl = document.getElementById('server-url').value.trim() || cfg.serverBaseUrl;
  const serverStatus = document.getElementById('server-status');
  const banner = document.getElementById('connection-banner');
  const bannerText = banner.querySelector('.banner-text');
  
  serverStatus.textContent = 'Testing...';
  serverStatus.className = 'status-badge status-unknown';
  
  try {
    const resp = await fetch(`${serverUrl}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (resp.ok) {
      serverStatus.textContent = 'Connected';
      serverStatus.className = 'status-badge status-online';
      banner.className = 'banner banner-success';
      bannerText.textContent = 'Connected to server';
      return true;
    } else {
      throw new Error(`HTTP ${resp.status}`);
    }
  } catch (e) {
    serverStatus.textContent = 'Offline';
    serverStatus.className = 'status-badge status-offline';
    banner.className = 'banner banner-warning';
    bannerText.textContent = `Cannot connect to server: ${e.message || 'Connection failed'}`;
    return false;
  }
}

async function checkAuthStatus() {
  const auth = await getAuth();
  const authBadge = document.getElementById('auth-badge');
  const loginForm = document.getElementById('login-form');
  const userInfo = document.getElementById('user-info');
  const userEmail = document.getElementById('user-email');
  const pollNowBtn = document.getElementById('poll-now-btn');
  
  if (auth.authToken && auth.authUser) {
    // Verify token is still valid
    const cfg = await getConfig();
    try {
      const resp = await fetch(`${cfg.serverBaseUrl}/me`, {
        headers: { 'Authorization': `Bearer ${auth.authToken}` }
      });
      
      if (resp.ok) {
        authBadge.textContent = 'Logged in';
        authBadge.className = 'status-badge status-online';
        userEmail.textContent = auth.authUser.email || 'Unknown';
        loginForm.style.display = 'none';
        userInfo.style.display = 'block';
        pollNowBtn.disabled = false;
        return true;
      }
    } catch (e) {
      console.log('Auth check failed:', e);
    }
    
    // Token invalid, clear it
    await clearAuth();
  }
  
  authBadge.textContent = 'Not logged in';
  authBadge.className = 'status-badge status-offline';
  loginForm.style.display = 'block';
  userInfo.style.display = 'none';
  pollNowBtn.disabled = true;
  return false;
}

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const btnText = loginBtn.querySelector('.btn-text');
  const btnLoading = loginBtn.querySelector('.btn-loading');
  
  if (!email || !password) {
    errorDiv.textContent = 'Please enter email and password';
    return;
  }
  
  loginBtn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnLoading) btnLoading.style.display = 'inline';
  errorDiv.style.display = 'none';
  
  try {
    const cfg = await getConfig();
    const resp = await fetch(`${cfg.serverBaseUrl}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `Login failed: ${resp.status}`);
    }
    
    const data = await resp.json();
    
    if (!data.token) {
      throw new Error('No token received');
    }
    
    // Backend returns user fields at top level, not nested
    const user = {
      id: data.id,
      email: data.email || email,
      createdAt: data.createdAt,
      isActive: data.isActive
    };
    
    await setAuth(data.token, user);
    
    // Clear password field
    document.getElementById('password').value = '';
    
    await checkAuthStatus();
    showToast('Login successful!', 'success');
    
  } catch (e) {
    errorDiv.textContent = e.message || 'Login failed';
    errorDiv.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    if (btnText) btnText.style.display = 'inline';
    if (btnLoading) btnLoading.style.display = 'none';
  }
}

async function handleLogout() {
  await clearAuth();
  await checkAuthStatus();
  showToast('Logged out', 'info');
}

async function triggerPollNow() {
  const btn = document.getElementById('poll-now-btn');
  btn.disabled = true;
  btn.textContent = 'Polling...';
  
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'POLL_NOW' }, resolve);
    });
    
    if (response && response.ok) {
      showToast('Poll completed!', 'success');
    } else {
      showToast(response?.error || 'Poll failed', 'error');
    }
  } catch (e) {
    showToast('Poll failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Poll Now';
    await refreshStatus();
  }
}

async function clearLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['extensionLogs', 'activityLog', 'crawlHistory'], () => {
      showToast('Logs cleared', 'info');
      resolve();
    });
  });
}

async function refreshStatus() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['lastPollTime', 'lastPollResult', 'activeJobs', 'crawlStats'], resolve);
    });
    
    // Last poll time
    if (data.lastPollTime) {
      const d = new Date(data.lastPollTime);
      document.getElementById('last-poll-time').textContent = d.toLocaleTimeString();
    }
    
    // Jobs pending
    const pendingCount = data.lastPollResult?.jobsCount || 0;
    document.getElementById('jobs-pending').textContent = pendingCount;
    
    // Active jobs
    const activeCount = data.activeJobs ? Object.keys(data.activeJobs).length : 0;
    document.getElementById('jobs-active').textContent = activeCount;
    
    // Done jobs (from stats)
    const doneCount = data.crawlStats?.done || 0;
    document.getElementById('jobs-done').textContent = doneCount;
    
    // Last result
    const lastResult = document.getElementById('last-result');
    if (data.lastPollResult?.error) {
      lastResult.textContent = 'Error';
      lastResult.style.color = 'var(--error)';
    } else if (data.lastPollResult?.jobsCount > 0) {
      lastResult.textContent = `${data.lastPollResult.jobsCount} jobs`;
      lastResult.style.color = 'var(--success)';
    } else {
      lastResult.textContent = 'No jobs';
      lastResult.style.color = 'var(--text-secondary)';
    }
    
    // Crawler status badge
    const crawlerStatus = document.getElementById('crawler-status');
    if (activeCount > 0) {
      crawlerStatus.textContent = 'Active';
      crawlerStatus.className = 'status-badge status-active';
    } else if (pendingCount > 0) {
      crawlerStatus.textContent = 'Pending';
      crawlerStatus.className = 'status-badge status-unknown';
    } else {
      crawlerStatus.textContent = 'Idle';
      crawlerStatus.className = 'status-badge status-idle';
    }
    
  } catch (e) {
    console.log('Status refresh error:', e);
  }
}

function showToast(message, type = 'info') {
  // Simple toast notification
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
