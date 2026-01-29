// CreteXtract Crawler - Login Page

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

async function setAuth(token, user) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ authToken: token, authUser: user }, resolve);
  });
}

async function checkAlreadyLoggedIn() {
  const auth = await getAuth();
  if (auth.authToken && auth.authUser) {
    const cfg = await getConfig();
    try {
      const resp = await fetch(`${cfg.serverBaseUrl}/me`, {
        headers: { 'Authorization': `Bearer ${auth.authToken}` }
      });
      if (resp.ok) {
        window.location.href = 'dashboard.html';
        return true;
      }
    } catch (e) {
      console.log('[login] Token validation failed:', e);
    }
  }
  return false;
}

async function testServer() {
  const serverUrl = document.getElementById('server-url').value.trim();
  const statusEl = document.getElementById('server-status');
  const statusText = document.getElementById('server-status-text');
  
  if (!serverUrl) {
    statusEl.classList.add('hidden');
    return false;
  }
  
  statusEl.className = 'alert alert-warning';
  statusText.textContent = 'Checking server...';
  
  try {
    const resp = await fetch(`${serverUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (resp.ok) {
      statusEl.className = 'alert alert-success';
      statusText.textContent = '✓ Server connected';
      return true;
    } else {
      throw new Error(`HTTP ${resp.status}`);
    }
  } catch (e) {
    statusEl.className = 'alert alert-error';
    statusText.textContent = `✗ Cannot connect: ${e.message || 'Connection failed'}`;
    return false;
  }
}

async function handleLogin() {
  const serverUrl = document.getElementById('server-url').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const btnText = loginBtn.querySelector('.btn-text');
  const btnLoading = loginBtn.querySelector('.btn-loading');
  
  // Validation
  if (!serverUrl) {
    errorEl.textContent = 'Please enter server URL';
    errorEl.classList.remove('hidden');
    return;
  }
  
  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password';
    errorEl.classList.remove('hidden');
    return;
  }
  
  // Show loading state
  loginBtn.disabled = true;
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');
  errorEl.classList.add('hidden');
  
  try {
    // Save server URL first
    await setConfig({ serverBaseUrl: serverUrl });
    
    // Attempt login
    const resp = await fetch(`${serverUrl}/signin`, {
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
      throw new Error('No token received from server');
    }
    
    // Save auth
    const user = {
      id: data.id,
      email: data.email || email,
      createdAt: data.createdAt,
      isActive: data.isActive
    };
    
    await setAuth(data.token, user);
    
    // Redirect to dashboard
    window.location.href = 'dashboard.html';
    
  } catch (e) {
    errorEl.textContent = e.message || 'Login failed';
    errorEl.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Check if already logged in
  await checkAlreadyLoggedIn();
  
  // Load saved server URL
  const cfg = await getConfig();
  document.getElementById('server-url').value = cfg.serverBaseUrl || '';
  
  // Test server on load
  if (cfg.serverBaseUrl) {
    await testServer();
  }
  
  // Event listeners
  document.getElementById('server-url').addEventListener('blur', testServer);
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  document.getElementById('email').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('password').focus();
  });
});
