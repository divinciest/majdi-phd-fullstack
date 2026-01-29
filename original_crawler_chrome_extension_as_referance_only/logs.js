// GatherGrid Extension Log Viewer
let isPaused = false;
let autoScroll = true;
let refreshInterval = null;
let lastLogCount = 0;

const logContainer = document.getElementById('logContainer');
const statsEl = document.getElementById('stats');
const pauseBtn = document.getElementById('pauseBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const autoScrollIndicator = document.getElementById('autoScrollIndicator');

// Filter checkboxes
const filters = {
  source: {
    background: document.getElementById('filterBackground'),
    foreground: document.getElementById('filterForeground')
  },
  level: {
    error: document.getElementById('filterError'),
    warn: document.getElementById('filterWarn'),
    success: document.getElementById('filterSuccess'),
    poll: document.getElementById('filterPoll'),
    job: document.getElementById('filterJob'),
    domain: document.getElementById('filterDomain'),
    info: document.getElementById('filterInfo')
  }
};

function getActiveFilters() {
  return {
    sources: Object.entries(filters.source)
      .filter(([_, el]) => el.checked)
      .map(([name]) => name),
    levels: Object.entries(filters.level)
      .filter(([_, el]) => el.checked)
      .map(([name]) => name.toUpperCase())
  };
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  } catch (e) {
    return timestamp;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderLogEntry(entry) {
  const level = (entry.level || 'INFO').toLowerCase();
  const source = entry.source || 'background';
  const time = formatTime(entry.timestamp);
  const message = escapeHtml(entry.message || '');
  const url = entry.url || '';
  const details = entry.details || null;
  
  let detailsHtml = '';
  if (details && typeof details === 'object') {
    const detailsStr = JSON.stringify(details, null, 2);
    if (detailsStr !== '{}') {
      detailsHtml = `<div class="log-details">${escapeHtml(detailsStr)}</div>`;
    }
  }
  
  let urlHtml = '';
  if (url) {
    urlHtml = `<div class="log-url">📄 ${escapeHtml(url)}</div>`;
  }
  
  return `
    <div class="log-entry ${level}" data-source="${source}" data-level="${level.toUpperCase()}">
      <span class="log-time">${time}</span>
      <span class="log-source ${source}">${source.toUpperCase()}</span>
      <span class="log-level ${level}">[${level.toUpperCase()}]</span>
      <span class="log-message">${message}</span>
      ${urlHtml}
      ${detailsHtml}
    </div>
  `;
}

function applyFilters() {
  const activeFilters = getActiveFilters();
  const entries = logContainer.querySelectorAll('.log-entry');
  
  entries.forEach(entry => {
    const source = entry.dataset.source;
    const level = entry.dataset.level;
    
    const sourceMatch = activeFilters.sources.includes(source);
    const levelMatch = activeFilters.levels.includes(level);
    
    entry.style.display = (sourceMatch && levelMatch) ? 'block' : 'none';
  });
  
  updateStats();
}

function updateStats() {
  const entries = logContainer.querySelectorAll('.log-entry');
  const visible = Array.from(entries).filter(e => e.style.display !== 'none').length;
  const total = entries.length;
  
  if (total === 0) {
    statsEl.textContent = '0 entries';
  } else {
    statsEl.textContent = `${visible} of ${total} entries`;
  }
}

async function refreshLogs() {
  if (isPaused) return;
  
  try {
    const result = await new Promise(resolve => 
      chrome.storage.local.get(['extensionLogs'], resolve)
    );
    
    const logs = result.extensionLogs || [];
    
    // Only update if logs have changed
    if (logs.length === lastLogCount) return;
    lastLogCount = logs.length;
    
    if (logs.length === 0) {
      logContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div>No logs yet. Extension activity will appear here.</div>
        </div>
      `;
      statsEl.textContent = '0 entries';
      return;
    }
    
    // Remember scroll position
    const wasAtBottom = logContainer.scrollHeight - logContainer.scrollTop <= logContainer.clientHeight + 100;
    
    // Render all logs
    logContainer.innerHTML = logs.map(renderLogEntry).join('');
    
    // Apply current filters
    applyFilters();
    
    // Auto-scroll if enabled and was at bottom
    if (autoScroll && wasAtBottom) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    
  } catch (error) {
    console.error('[log-viewer] refresh error:', error);
  }
}

function togglePause() {
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
  pauseBtn.style.background = isPaused ? '#c72e2e' : '#2d2d30';
  
  if (!isPaused) {
    refreshLogs(); // Refresh immediately on resume
  }
}

async function clearLogs() {
  if (!confirm('Clear all extension logs? This cannot be undone.')) return;
  
  try {
    await new Promise(resolve => 
      chrome.storage.local.set({ extensionLogs: [] }, resolve)
    );
    lastLogCount = 0;
    logContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>Logs cleared. New activity will appear here.</div>
      </div>
    `;
    statsEl.textContent = '0 entries';
  } catch (error) {
    alert('Failed to clear logs: ' + error.message);
  }
}

async function exportLogs() {
  try {
    const result = await new Promise(resolve => 
      chrome.storage.local.get(['extensionLogs'], resolve)
    );
    
    const logs = result.extensionLogs || [];
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gathergrid-extension-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Failed to export logs: ' + error.message);
  }
}

function toggleAutoScroll() {
  autoScroll = !autoScroll;
  autoScrollIndicator.textContent = autoScroll 
    ? '⬇ Auto-scroll ON (click to disable)' 
    : '⬆ Auto-scroll OFF (click to enable)';
  autoScrollIndicator.style.background = autoScroll ? '#569cd6' : '#858585';
}

// Detect if user scrolls up (disable auto-scroll)
logContainer.addEventListener('scroll', () => {
  const isAtBottom = logContainer.scrollHeight - logContainer.scrollTop <= logContainer.clientHeight + 100;
  
  if (!isAtBottom && autoScroll) {
    // User scrolled up, disable auto-scroll
    autoScroll = false;
    autoScrollIndicator.classList.add('visible');
    autoScrollIndicator.textContent = '⬆ Auto-scroll OFF (click to enable)';
    autoScrollIndicator.style.background = '#858585';
  } else if (isAtBottom && !autoScroll) {
    // User scrolled back to bottom, re-enable auto-scroll
    autoScroll = true;
    autoScrollIndicator.classList.remove('visible');
  }
});

// Event listeners
pauseBtn.addEventListener('click', togglePause);
clearBtn.addEventListener('click', clearLogs);
exportBtn.addEventListener('click', exportLogs);
autoScrollIndicator.addEventListener('click', toggleAutoScroll);

// Filter change listeners
Object.values(filters.source).forEach(el => {
  el.addEventListener('change', applyFilters);
});
Object.values(filters.level).forEach(el => {
  el.addEventListener('change', applyFilters);
});

// Initial load
refreshLogs();

// Auto-refresh every 500ms
refreshInterval = setInterval(refreshLogs, 500);

// Cleanup on page unload
window.addEventListener('unload', () => {
  if (refreshInterval) clearInterval(refreshInterval);
});
