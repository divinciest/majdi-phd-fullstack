// Shared Authentication Module for CreteXtract Crawler Extension

const AUTH_KEYS = ['authToken', 'authUser'];

export async function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(AUTH_KEYS, resolve);
  });
}

export async function setAuth(token, user) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ authToken: token, authUser: user }, resolve);
  });
}

export async function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(AUTH_KEYS, resolve);
  });
}

export async function isAuthenticated() {
  const auth = await getAuth();
  return !!(auth.authToken && auth.authUser);
}

export async function getAuthToken() {
  const auth = await getAuth();
  return auth.authToken || null;
}

export async function getAuthHeaders() {
  const token = await getAuthToken();
  return token 
    ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function validateToken() {
  const auth = await getAuth();
  if (!auth.authToken) return false;
  
  try {
    const cfg = await getConfig();
    const resp = await fetch(`${cfg.serverBaseUrl}/me`, {
      headers: { 'Authorization': `Bearer ${auth.authToken}` }
    });
    return resp.ok;
  } catch (e) {
    console.log('[auth] Token validation failed:', e);
    return false;
  }
}

export async function login(serverUrl, email, password) {
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
    throw new Error('No token received');
  }
  
  const user = {
    id: data.id,
    email: data.email || email,
    createdAt: data.createdAt,
    isActive: data.isActive
  };
  
  await setAuth(data.token, user);
  return user;
}

export async function logout() {
  await clearAuth();
}

// Config helpers
const CONFIG_DEFAULTS = {
  serverBaseUrl: 'http://localhost:5007',
  pollingEnabled: true,
  pollIntervalSec: 30,
  autoCloseTab: true,
  redirectDetectionEnabled: true,
  redirectMinTextLength: 3000,
  redirectMaxWaitMs: 30000,
};

export async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CONFIG_DEFAULTS, resolve);
  });
}

export async function setConfig(patch) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(patch, resolve);
  });
}
