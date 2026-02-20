// AdTrace Popup JS

let currentTabId = null;
let currentDomain = null;
let allLog = [];
let currentFilter = 'all';
let devModeActive = false;
let simModeActive = false;

// --- Init ---
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;
  
  try {
    currentDomain = new URL(tab.url).hostname;
  } catch(e) {
    currentDomain = null;
  }

  // Get state
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response) {
      document.getElementById('masterToggle').checked = response.enabled;
      devModeActive = response.devMode;
      updateDevBtn();
    }
  });

  // Get log
  refreshLog();

  // Update domain panel
  updateDomainPanel();

  // Update report
  updateReport();

  // Set page in report
  if (currentDomain) {
    document.getElementById('reportPage').textContent = currentDomain;
    document.getElementById('currentDomainName').textContent = currentDomain;
  }

  // Poll for live updates
  setInterval(refreshLog, 1500);
}

function refreshLog() {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'GET_LOG', tabId: currentTabId }, (response) => {
    if (!response) return;
    allLog = response.log || [];
    updateStats(response.stats || {});
    renderLog();
    updateReport();
  });
}

// --- Stats ---
function updateStats(stats) {
  setStatNum('statBlocked', stats.blocked || 0);
  setStatNum('statTrackers', stats.tracker || 0);
  setStatNum('statAds', stats.ad || 0);
  setStatNum('statSocial', stats.social || 0);
}

function setStatNum(id, val) {
  const el = document.getElementById(id);
  const prev = parseInt(el.textContent) || 0;
  el.textContent = val;
  if (val > prev) {
    el.classList.remove('stat-updated');
    void el.offsetWidth;
    el.classList.add('stat-updated');
  }
}

// --- Log rendering ---
function renderLog() {
  const list = document.getElementById('logList');
  const filtered = currentFilter === 'all' 
    ? allLog 
    : allLog.filter(e => e.category === currentFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⬡</div>
      <p>No blocked requests yet.<br>Navigate to a page to start tracing.</p>
    </div>`;
    return;
  }

  const html = filtered.map((entry, i) => {
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const shortUrl = entry.url.replace(/https?:\/\//, '').substring(0, 60) + (entry.url.length > 68 ? '…' : '');
    return `
    <div class="log-entry" data-url="${encodeURIComponent(entry.url)}" data-domain="${entry.domain}">
      <div class="entry-cat ${entry.category}"></div>
      <div class="entry-info">
        <div class="entry-url" title="${entry.url}">${shortUrl}</div>
        <div class="entry-meta">
          <span class="meta-tag type">${entry.type || 'req'}</span>
          <span class="meta-tag rule">Rule #${entry.ruleId || '?'}</span>
          <span class="meta-tag time">${timeStr}</span>
        </div>
      </div>
      <div class="entry-actions">
        <button class="entry-action-btn allow" title="Allow this domain" data-domain="${entry.domain}" data-action="allow">✓</button>
        <button class="entry-action-btn block" title="Block this domain" data-domain="${entry.domain}" data-action="block">✕</button>
      </div>
    </div>`;
  }).join('');

  list.innerHTML = html;

  // Bind entry action buttons
  list.querySelectorAll('.entry-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const domain = btn.dataset.domain;
      const action = btn.dataset.action;
      chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain, mode: action });
      showToast(action === 'allow' ? `✓ Allowing ${domain}` : `✕ Blocking ${domain}`);
    });
  });
}

// --- Filter chips ---
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.cat;
    renderLog();
  });
});

document.getElementById('clearLog').addEventListener('click', () => {
  allLog = [];
  renderLog();
  updateStats({});
});

// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
    
    if (tab.dataset.panel === 'domains') updateDomainPanel();
    if (tab.dataset.panel === 'report') updateReport();
  });
});

// --- Master toggle ---
document.getElementById('masterToggle').addEventListener('change', (e) => {
  chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION', enabled: e.target.checked });
  showToast(e.target.checked ? '✓ AdTrace enabled' : '⬡ AdTrace paused');
});

// --- Dev mode ---
function updateDevBtn() {
  const btn = document.getElementById('devModeBtn');
  if (devModeActive) {
    btn.classList.add('active');
    btn.title = 'Dev Mode ON — ads highlighted with overlay';
  } else {
    btn.classList.remove('active');
    btn.title = 'Enable Dev Mode';
  }
}

document.getElementById('devModeBtn').addEventListener('click', () => {
  devModeActive = !devModeActive;
  updateDevBtn();
  chrome.runtime.sendMessage({ type: 'SET_DEV_MODE', enabled: devModeActive });
  chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_DEV_MODE', enabled: devModeActive }).catch(() => {});
  showToast(devModeActive ? '⬡ Dev overlay enabled' : '⬡ Dev overlay disabled');
});

// --- Domain panel ---
function updateDomainPanel() {
  chrome.runtime.sendMessage({ type: 'GET_OVERRIDES' }, (response) => {
    const overrides = response?.overrides || {};
    renderOverridesList(overrides);

    if (currentDomain) {
      const mode = overrides[currentDomain];
      const dot = document.getElementById('domainStatusDot');
      const sub = document.getElementById('currentDomainSub');
      const allowBtn = document.getElementById('allowDomainBtn');
      const blockBtn = document.getElementById('blockDomainBtn');

      dot.className = 'domain-status-dot';
      allowBtn.className = 'domain-btn allow-btn';
      blockBtn.className = 'domain-btn block-btn';

      if (mode === 'allow') {
        dot.classList.add('allowed');
        allowBtn.classList.add('active-allow');
        sub.textContent = 'Allowed — ads not blocked';
      } else if (mode === 'block') {
        dot.classList.add('blocked');
        blockBtn.classList.add('active-block');
        sub.textContent = 'Force blocked';
      } else {
        sub.textContent = 'Default rules apply';
      }
    }
  });
}

function renderOverridesList(overrides) {
  const el = document.getElementById('overridesList');
  const localDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
  
  const entries = Object.entries(overrides);
  
  // Add auto-local entries
  localDomains.forEach(d => {
    if (!overrides[d]) entries.push([d, 'allow', true]);
  });

  if (entries.length === 0) {
    el.innerHTML = '<div class="no-overrides">No custom overrides.</div>';
    return;
  }

  el.innerHTML = entries.map(([domain, mode, isAuto]) => `
    <div class="override-item">
      <span class="override-domain">${domain}${isAuto ? '<span class="local-label">local</span>' : ''}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="override-mode ${mode}">${mode}</span>
        ${!isAuto ? `<button class="remove-override" data-domain="${domain}">✕</button>` : ''}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.remove-override').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain: btn.dataset.domain, mode: 'reset' }, () => {
        updateDomainPanel();
      });
    });
  });
}

document.getElementById('allowDomainBtn').addEventListener('click', () => {
  if (!currentDomain) return;
  chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain: currentDomain, mode: 'allow' }, () => {
    updateDomainPanel();
    showToast(`✓ ${currentDomain} allowed`);
  });
});

document.getElementById('blockDomainBtn').addEventListener('click', () => {
  if (!currentDomain) return;
  chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain: currentDomain, mode: 'block' }, () => {
    updateDomainPanel();
    showToast(`✕ ${currentDomain} blocked`);
  });
});

// --- Rules panel ---
document.getElementById('saveRuleBtn').addEventListener('click', () => {
  const input = document.getElementById('networkRuleInput').value.trim();
  if (!input) return;
  
  chrome.storage.local.get(['customNetworkRules'], (data) => {
    const existing = data.customNetworkRules || '';
    const updated = existing + '\n' + input;
    chrome.storage.local.set({ customNetworkRules: updated }, () => {
      showRuleStatus('✓ Rule saved — will apply on next page load');
      document.getElementById('networkRuleInput').value = '';
    });
  });
});

document.getElementById('saveCosmeticBtn').addEventListener('click', () => {
  const input = document.getElementById('cosmeticRuleInput').value.trim();
  if (!input) return;
  
  chrome.storage.local.get(['customCosmeticRules'], (data) => {
    const existing = data.customCosmeticRules || '';
    const updated = existing + '\n' + input;
    chrome.storage.local.set({ customCosmeticRules: updated }, () => {
      // Apply immediately via content script
      chrome.tabs.sendMessage(currentTabId, { type: 'APPLY_COSMETIC', rules: input }).catch(() => {});
      showRuleStatus('✓ Cosmetic rule applied');
      document.getElementById('cosmeticRuleInput').value = '';
    });
  });
});

document.getElementById('previewRuleBtn').addEventListener('click', () => {
  showRuleStatus('⬡ Preview mode coming soon — rule will simulate matching in log');
});

function showRuleStatus(msg) {
  const el = document.getElementById('ruleStatus');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// --- Report panel ---
function updateReport() {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'EXPORT_REPORT', tabId: currentTabId }, (response) => {
    if (!response) return;
    const { log, stats } = response;
    
    document.getElementById('reportTotal').textContent = stats.blocked || 0;
    document.getElementById('reportAds').textContent = stats.ad || 0;
    document.getElementById('reportTrackers').textContent = stats.tracker || 0;
    document.getElementById('reportSocial').textContent = stats.social || 0;

    // Aggregate by domain
    const domainCount = {};
    (log || []).forEach(entry => {
      domainCount[entry.domain] = (domainCount[entry.domain] || 0) + 1;
    });

    const sorted = Object.entries(domainCount).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length === 0) {
      document.getElementById('reportDomains').innerHTML = 
        '<div class="rdomain-item" style="color: var(--text-muted); font-family: var(--font-mono); font-size: 10px;">No blocked requests recorded</div>';
    } else {
      const max = sorted[0][1];
      document.getElementById('reportDomains').innerHTML = sorted.slice(0, 15).map(([domain, count]) => {
        const pct = count / max;
        const cls = pct > 0.5 ? 'high' : pct > 0.2 ? 'med' : 'low';
        return `<div class="rdomain-item">
          <span class="rdomain-name">${domain}</span>
          <span class="rdomain-count ${cls}">${count}</span>
        </div>`;
      }).join('');
    }
  });
}

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_REPORT', tabId: currentTabId }, (response) => {
    if (!response) return;
    const report = {
      generated: new Date().toISOString(),
      page: currentDomain,
      stats: response.stats,
      requests: response.log
    };
    downloadFile('adtrace-report.json', JSON.stringify(report, null, 2), 'application/json');
  });
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_REPORT', tabId: currentTabId }, (response) => {
    if (!response) return;
    const rows = [['URL', 'Domain', 'Type', 'Category', 'Rule ID', 'Timestamp']];
    (response.log || []).forEach(e => {
      rows.push([e.url, e.domain, e.type, e.category, e.ruleId, new Date(e.timestamp).toISOString()]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('adtrace-report.csv', csv, 'text/csv');
  });
});

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  chrome.downloads ? chrome.downloads.download({ url, filename }) : window.open(url);
}

// --- Simulate user view ---
document.getElementById('simulateBtn').addEventListener('click', () => {
  simModeActive = !simModeActive;
  document.getElementById('simBar').classList.toggle('hidden', !simModeActive);
  chrome.tabs.sendMessage(currentTabId, { 
    type: simModeActive ? 'SIMULATE_USER' : 'SIMULATE_DEV' 
  }).catch(() => {});
  showToast(simModeActive ? '👁 Simulating user view' : '⬡ Restored dev view');
});

document.getElementById('simClose').addEventListener('click', () => {
  simModeActive = false;
  document.getElementById('simBar').classList.add('hidden');
  chrome.tabs.sendMessage(currentTabId, { type: 'SIMULATE_DEV' }).catch(() => {});
});

// --- Options ---
document.getElementById('optionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// --- Toast ---
let toastTimeout;
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
      background: var(--navy-3); border: 1px solid var(--cyan); color: var(--cyan);
      font-family: var(--font-mono); font-size: 10px; padding: 5px 12px;
      border-radius: 4px; z-index: 9999; pointer-events: none;
      transition: opacity .2s; text-transform: uppercase; letter-spacing: .06em;
      white-space: nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// Bootstrap
init();
