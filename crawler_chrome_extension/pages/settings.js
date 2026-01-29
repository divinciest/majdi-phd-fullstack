// CreteXtract Crawler - Settings Page

const CONFIG_DEFAULTS = {
  serverBaseUrl: 'http://localhost:5007',
  pollingEnabled: true,
  pollIntervalSec: 30,
  autoCloseTab: true,
  redirectDetectionEnabled: true,
  redirectMinTextLength: 3000,
  redirectMaxWaitMs: 30000,
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
    console.log('[settings] Auth check failed:', e);
  }
  
  return auth;
}

async function loadSettings() {
  const cfg = await getConfig();
  
  document.getElementById('server-url').value = cfg.serverBaseUrl || '';
  document.getElementById('polling-enabled').checked = cfg.pollingEnabled !== false;
  document.getElementById('poll-interval').value = cfg.pollIntervalSec || 30;
  document.getElementById('auto-close-tab').checked = cfg.autoCloseTab !== false;
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
  
  await setConfig(settings);
  
  // Show success message
  const statusEl = document.getElementById('save-status');
  statusEl.classList.remove('hidden');
  setTimeout(() => statusEl.classList.add('hidden'), 3000);
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
  
  // Load settings
  await loadSettings();
  
  // Event listeners
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('save-btn').addEventListener('click', saveSettings);
});
