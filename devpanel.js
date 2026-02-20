// AdTrace DevTools Panel JS
// Runs inside the DevTools panel (devpanel.html)

const RULE_MAP = {
  1: { filter: '||doubleclick.net^', category: 'ad', desc: 'Google DoubleClick ad network' },
  2: { filter: '||googlesyndication.com^', category: 'ad', desc: 'Google AdSense / syndication' },
  3: { filter: '||googleadservices.com^', category: 'ad', desc: 'Google Ad Services' },
  4: { filter: '||facebook.com/tr', category: 'social', desc: 'Facebook Conversion Pixel' },
  5: { filter: '||connect.facebook.net/**/fbevents.js', category: 'social', desc: 'Facebook Events SDK' },
  6: { filter: '||amazon-adsystem.com^', category: 'ad', desc: 'Amazon Advertising' },
  7: { filter: '||ads.twitter.com^', category: 'social', desc: 'Twitter Ads' },
  8: { filter: '||static.ads-twitter.com^', category: 'social', desc: 'Twitter Ads Static' },
  9: { filter: '||outbrain.com^', category: 'ad', desc: 'Outbrain content recommendations' },
  10: { filter: '||taboola.com^', category: 'ad', desc: 'Taboola content recommendations' },
  11: { filter: '||analytics.google.com/analytics/collect', category: 'tracker', desc: 'Google Analytics beacon' },
  12: { filter: '||hotjar.com^', category: 'tracker', desc: 'Hotjar session recording' },
  13: { filter: '||adnxs.com^', category: 'ad', desc: 'AppNexus / Xandr programmatic' },
  14: { filter: '||criteo.com^', category: 'ad', desc: 'Criteo retargeting' },
  15: { filter: '||segment.io^', category: 'tracker', desc: 'Segment analytics pipeline' },
  16: { filter: '||segment.com/analytics.js', category: 'tracker', desc: 'Segment analytics.js' },
  17: { filter: '||mixpanel.com^', category: 'tracker', desc: 'Mixpanel product analytics' },
  18: { filter: '||intercom.io^', category: 'tracker', desc: 'Intercom chat/analytics' },
  19: { filter: '||moatads.com^', category: 'ad', desc: 'Moat ad verification' },
  20: { filter: '||pubmatic.com^', category: 'ad', desc: 'PubMatic programmatic SSP' },
};

let allEntries = [];
let filteredEntries = [];
let selectedEntry = null;
let activeFilter = 'all';
let searchQuery = '';
let devOverlayOn = false;
let simModeOn = false;
let tabId = null;
let timelineBuckets = Array(48).fill(0).map(() => ({ count: 0, cat: 'other' }));
let bucketPointer = 0;

// ─── Init ───
function init() {
  // Get inspected tab ID
  tabId = chrome.devtools.inspectedWindow.tabId;

  updateStatusPage();
  startPolling();
  bindUI();
  loadState();
}

function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
    if (!res) return;
    if (!res.enabled) {
      document.getElementById('statusDot').classList.add('paused');
      document.getElementById('statusText').textContent = 'Blocking paused';
    }
    devOverlayOn = res.devMode;
    updateDevOverlayBtn();
  });
}

function updateStatusPage() {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    try {
      const domain = new URL(tab.url).hostname;
      document.getElementById('statusPage').textContent = `Page: ${domain}`;
    } catch(e) {}
  });
}

// ─── Polling ───
let pollTimer = null;
function startPolling() {
  poll();
  pollTimer = setInterval(poll, 800);
}

function poll() {
  chrome.runtime.sendMessage({ type: 'GET_LOG', tabId }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    
    const newCount = res.log.length;
    const oldCount = allEntries.length;
    
    allEntries = res.log;
    updateStats(res.stats || {});
    
    // Only re-render if new entries arrived
    if (newCount !== oldCount || newCount === 0) {
      applyFilters();
      renderTable();
      updateTimeline();
    }
    
    if (res.log.length > 0) {
      const last = res.log[0];
      document.getElementById('statusLast').textContent = `Last: ${new Date(last.timestamp).toLocaleTimeString()}`;
    }
  });
}

// ─── Stats ───
function updateStats(stats) {
  document.getElementById('tpBlocked').textContent = stats.blocked || 0;
  document.getElementById('tpTrackers').textContent = stats.tracker || 0;
  document.getElementById('tpAds').textContent = stats.ad || 0;
  document.getElementById('tpSocial').textContent = stats.social || 0;
}

// ─── Filter + Search ───
function applyFilters() {
  filteredEntries = allEntries.filter(entry => {
    if (activeFilter !== 'all' && entry.category !== activeFilter) return false;
    if (searchQuery && !entry.url.toLowerCase().includes(searchQuery) && !entry.domain.toLowerCase().includes(searchQuery)) return false;
    return true;
  });
}

// ─── Table Render ───
function renderTable() {
  const body = document.getElementById('tableBody');
  
  if (filteredEntries.length === 0) {
    if (allEntries.length === 0) {
      body.innerHTML = `<div class="detail-empty" style="height:200px">
        <div class="icon">⬡</div>
        <div>Waiting for blocked requests…<br>Navigate to a page with ads.</div>
      </div>`;
    } else {
      body.innerHTML = `<div class="detail-empty" style="height:100px">
        <div class="icon">⊘</div>
        <div>No results match current filters.</div>
      </div>`;
    }
    return;
  }

  const html = filteredEntries.map((entry, i) => {
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const rule = RULE_MAP[entry.ruleId] || {};
    
    // Split URL into domain + path for display
    let displayUrl = entry.url;
    let domainPart = entry.domain;
    let pathPart = '';
    try {
      const u = new URL(entry.url);
      domainPart = u.hostname;
      pathPart = u.pathname.substring(0, 40) + (u.pathname.length > 40 ? '…' : '');
    } catch(e) {}
    
    const isSelected = selectedEntry && selectedEntry.url === entry.url && selectedEntry.timestamp === entry.timestamp;
    
    return `<div class="row${isSelected ? ' selected' : ''}" data-idx="${i}">
      <div class="cat-dot"><div class="dot ${entry.category}"></div></div>
      <div class="url-col"><span class="domain-part">${domainPart}</span>${pathPart}</div>
      <div class="type-col">${entry.type || '—'}</div>
      <div class="rule-col">#${entry.ruleId || '?'}</div>
      <div class="cat-col ${entry.category}">${entry.category}</div>
      <div class="time-col">${timeStr}</div>
    </div>`;
  }).join('');

  body.innerHTML = html;

  body.querySelectorAll('.row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.idx);
      selectEntry(filteredEntries[idx]);
      body.querySelectorAll('.row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
    });
  });
}

// ─── Entry Detail ───
function selectEntry(entry) {
  selectedEntry = entry;
  const rule = RULE_MAP[entry.ruleId] || {};
  const detail = document.getElementById('detailBody');
  
  let urlHtml = '';
  try {
    const u = new URL(entry.url);
    urlHtml = `<span class="url-domain">${u.hostname}</span>${u.pathname}${u.search}`;
  } catch(e) {
    urlHtml = entry.url;
  }

  detail.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Blocked URL</div>
      <div class="url-full" title="Click to copy" onclick="navigator.clipboard.writeText('${entry.url.replace(/'/g, "\\'")}'); this.textContent='✓ Copied!'; setTimeout(()=>{ this.innerHTML='${urlHtml.replace(/'/g, "\\'")}'; }, 1500)">
        ${urlHtml}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Request Info</div>
      <div class="detail-row"><span class="dk">Domain</span><span class="dv cyan">${entry.domain}</span></div>
      <div class="detail-row"><span class="dk">Type</span><span class="dv">${entry.type || '—'}</span></div>
      <div class="detail-row"><span class="dk">Category</span><span class="dv ${entry.category === 'ad' ? 'red' : entry.category === 'tracker' ? 'amber' : entry.category === 'social' ? 'cyan' : ''}">${entry.category.toUpperCase()}</span></div>
      <div class="detail-row"><span class="dk">Timestamp</span><span class="dv">${new Date(entry.timestamp).toISOString()}</span></div>
      ${entry.frameUrl ? `<div class="detail-row"><span class="dk">Frame</span><span class="dv" style="font-size:9px">${entry.frameUrl.substring(0,40)}…</span></div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Matched Rule</div>
      <div class="rule-card">
        <div class="rule-id">Rule #${entry.ruleId}</div>
        <div class="rule-desc">${rule.desc || 'Custom or unknown rule'}</div>
        ${rule.filter ? `<div class="rule-filter">${rule.filter}</div>` : ''}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Actions</div>
      <div class="action-row">
        <button class="action-btn allow" onclick="allowDomain('${entry.domain}')">✓ Allow Domain</button>
        <button class="action-btn block" onclick="hardBlockDomain('${entry.domain}')">✕ Hard Block</button>
      </div>
      <div class="action-row">
        <button class="action-btn highlight" onclick="highlightElement('${entry.url.replace(/'/g, "\\'")}')">⊙ Highlight Element</button>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Raw Entry</div>
      <pre style="font-size:9px; color: var(--muted); background: var(--navy-3); padding: 6px 8px; border-radius: 3px; overflow-x: auto; border: 1px solid var(--border); line-height: 1.6; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(entry, null, 2)}</pre>
    </div>
  `;
}

// ─── Domain Actions ───
window.allowDomain = function(domain) {
  chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain, mode: 'allow' }, () => {
    flashStatus(`✓ ${domain} allowed`);
  });
};
window.hardBlockDomain = function(domain) {
  chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain, mode: 'block' }, () => {
    flashStatus(`✕ ${domain} hard blocked`);
  });
};
window.highlightElement = function(url) {
  chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_ELEMENT', url });
  flashStatus('⊙ Highlighting element on page…');
};

function flashStatus(msg) {
  const el = document.getElementById('statusLast');
  const prev = el.textContent;
  el.textContent = msg;
  el.style.color = 'var(--cyan)';
  setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 2500);
}

// ─── Timeline ───
function updateTimeline() {
  const bar = document.getElementById('timeline');
  
  // Count entries in 48 time buckets spanning last 60s
  const now = Date.now();
  const buckets = Array(48).fill(null).map(() => ({ count: 0, cat: 'other' }));
  const windowMs = 60000;
  
  allEntries.forEach(entry => {
    const age = now - entry.timestamp;
    if (age > windowMs) return;
    const bucket = Math.floor((1 - age / windowMs) * 47);
    buckets[bucket].count++;
    // Most severe category wins
    const rank = { ad: 3, social: 2, tracker: 1, other: 0 };
    if ((rank[entry.category] || 0) > (rank[buckets[bucket].cat] || 0)) {
      buckets[bucket].cat = entry.category;
    }
  });
  
  const max = Math.max(...buckets.map(b => b.count), 1);
  
  bar.innerHTML = '<span class="tl-label">60s →</span>';
  buckets.forEach(b => {
    const div = document.createElement('div');
    div.className = `tl-bar ${b.cat}`;
    div.style.height = `${Math.max(2, (b.count / max) * 24)}px`;
    div.title = `${b.count} blocked`;
    bar.appendChild(div);
  });
}

// ─── UI Bindings ───
function bindUI() {
  // Filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      activeFilter = chip.dataset.f;
      applyFilters();
      renderTable();
    });
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    applyFilters();
    renderTable();
  });

  // Clear
  document.getElementById('btnClear').addEventListener('click', () => {
    allEntries = [];
    filteredEntries = [];
    selectedEntry = null;
    document.getElementById('detailBody').innerHTML = `<div class="detail-empty"><div class="icon">←</div><div>Select a blocked request<br>to inspect it</div></div>`;
    renderTable();
    updateStats({});
    updateTimeline();
  });

  // Export JSON
  document.getElementById('btnExport').addEventListener('click', () => {
    chrome.tabs.get(tabId, (tab) => {
      const report = {
        generated: new Date().toISOString(),
        page: tab ? tab.url : 'unknown',
        totalBlocked: allEntries.length,
        entries: allEntries
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `adtrace-report-${Date.now()}.json`;
      a.click();
    });
  });

  // Dev Overlay
  document.getElementById('btnDevOverlay').addEventListener('click', () => {
    devOverlayOn = !devOverlayOn;
    updateDevOverlayBtn();
    chrome.runtime.sendMessage({ type: 'SET_DEV_MODE', enabled: devOverlayOn });
    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_DEV_MODE', enabled: devOverlayOn }).catch(() => {});
    flashStatus(devOverlayOn ? '⬡ Dev overlay ON' : '⬡ Dev overlay OFF');
  });

  // Simulate User
  document.getElementById('btnSimulate').addEventListener('click', () => {
    simModeOn = !simModeOn;
    document.getElementById('simBanner').classList.toggle('show', simModeOn);
    document.getElementById('btnSimulate').classList.toggle('active', simModeOn);
    chrome.tabs.sendMessage(tabId, { type: simModeOn ? 'SIMULATE_USER' : 'SIMULATE_DEV' }).catch(() => {});
    flashStatus(simModeOn ? '👁 Simulating user view' : '⬡ Dev view restored');
  });

  document.getElementById('simBannerClose').addEventListener('click', () => {
    simModeOn = false;
    document.getElementById('simBanner').classList.remove('show');
    document.getElementById('btnSimulate').classList.remove('active');
    chrome.tabs.sendMessage(tabId, { type: 'SIMULATE_DEV' }).catch(() => {});
  });

  // Navigate event — clear log
  chrome.devtools.network.onNavigated.addListener((url) => {
    allEntries = [];
    filteredEntries = [];
    selectedEntry = null;
    renderTable();
    updateStats({});
    updateTimeline();
    try {
      const domain = new URL(url).hostname;
      document.getElementById('statusPage').textContent = `Page: ${domain}`;
    } catch(e) {}
  });
}

function updateDevOverlayBtn() {
  const btn = document.getElementById('btnDevOverlay');
  btn.classList.toggle('active', devOverlayOn);
  btn.textContent = devOverlayOn ? 'Dev Overlay ✓' : 'Dev Overlay';
}

// Expose for panel show callback
window.adtraceRefresh = poll;

init();
