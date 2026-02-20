// AdTrace DevTools Panel JS
// Features: Rule Attribution, Timeline, Tracker Graph, Script Intent, False Positive Debugger

let allEntries = [];
let filteredEntries = [];
let selectedEntry = null;
let activeFilter = 'all';
let searchQuery = '';
let devOverlayOn = false;
let simModeOn = false;
let tabId = null;
let currentView = 'log';
let fpDismissed = false;

// ─── Init ───
function init() {
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
      document.getElementById('statusPage').textContent = 'Page: ' + domain;
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

    if (newCount !== oldCount || newCount === 0) {
      applyFilters();
      renderTable();
      updateMiniTimeline();

      // Update current view
      if (currentView === 'timeline') loadTimeline();
      if (currentView === 'graph') loadGraph();
    }

    if (res.log.length > 0) {
      const last = res.log[0];
      document.getElementById('statusLast').textContent = 'Last: ' + new Date(last.timestamp).toLocaleTimeString();
    }
  });
}

// ─── Stats ───
function updateStats(stats) {
  document.getElementById('tpBlocked').textContent = stats.blocked || 0;
  document.getElementById('tpTrackers').textContent = stats.trackers || stats.tracker || 0;
  document.getElementById('tpAds').textContent = stats.ads || stats.ad || 0;
  document.getElementById('tpSocial').textContent = stats.social || 0;

  const savingsMs = stats.estimatedSavingsMs || 0;
  document.getElementById('tpSavings').textContent = savingsMs >= 1000
    ? (savingsMs / 1000).toFixed(1) + 's'
    : savingsMs + 'ms';

  const fpCount = stats.falsePositives || 0;
  if (fpCount > 0) {
    document.getElementById('fpPill').style.display = '';
    document.getElementById('tpFP').textContent = fpCount;
    if (!fpDismissed) {
      document.getElementById('fpAlertBar').classList.add('show');
      document.getElementById('fpAlertCount').textContent = fpCount;
    }
  } else {
    document.getElementById('fpPill').style.display = 'none';
    document.getElementById('fpAlertBar').classList.remove('show');
  }
}

// ─── Filter + Search ───
function applyFilters() {
  filteredEntries = allEntries.filter(entry => {
    if (activeFilter === 'fp') return entry.falsePositive;
    if (activeFilter !== 'all' && entry.category !== activeFilter) return false;
    if (searchQuery) {
      const q = searchQuery;
      return (entry.url && entry.url.toLowerCase().includes(q)) ||
             (entry.domain && entry.domain.toLowerCase().includes(q)) ||
             (entry.intent && entry.intent.toLowerCase().includes(q)) ||
             (entry.filter && entry.filter.toLowerCase().includes(q)) ||
             (entry.list && entry.list.toLowerCase().includes(q));
    }
    return true;
  });
}

// ─── Table Render ───
function renderTable() {
  const body = document.getElementById('tableBody');

  if (filteredEntries.length === 0) {
    body.innerHTML = allEntries.length === 0
      ? '<div class="detail-empty" style="height:200px"><div class="icon">&#x2B21;</div><div>Waiting for blocked requests...<br>Navigate to a page with ads.</div></div>'
      : '<div class="detail-empty" style="height:100px"><div class="icon">&#x2298;</div><div>No results match current filters.</div></div>';
    return;
  }

  const html = filteredEntries.map((entry, i) => {
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let domainPart = entry.domain;
    let pathPart = '';
    try {
      const u = new URL(entry.url);
      domainPart = u.hostname;
      pathPart = u.pathname.substring(0, 40) + (u.pathname.length > 40 ? '...' : '');
    } catch(e) {}

    const isSelected = selectedEntry && selectedEntry.url === entry.url && selectedEntry.timestamp === entry.timestamp;
    const intentClass = (entry.intent || 'unknown').replace(/\s+/g, '-');

    return '<div class="row' + (isSelected ? ' selected' : '') + (entry.falsePositive ? ' fp-warning' : '') + '" data-idx="' + i + '">' +
      '<div class="cat-dot"><div class="dot ' + entry.category + '"></div></div>' +
      '<div class="url-col"><span class="domain-part">' + escapeHtml(domainPart) + '</span>' + escapeHtml(pathPart) + '</div>' +
      '<div class="type-col">' + (entry.type || '&#x2014;') + '</div>' +
      '<div class="rule-col">#' + (entry.ruleId || '?') + (entry.falsePositive ? ' <span class="fp-badge">FP</span>' : '') + '</div>' +
      '<div class="intent-col"><span class="intent-tag ' + intentClass + '">' + (entry.intent || 'unknown') + '</span></div>' +
      '<div class="cat-col ' + entry.category + '">' + entry.category + '</div>' +
      '<div class="time-col">' + timeStr + '</div>' +
    '</div>';
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

// ─── Entry Detail with Rule Attribution ───
function selectEntry(entry) {
  selectedEntry = entry;
  const detail = document.getElementById('detailBody');

  let urlHtml = '';
  try {
    const u = new URL(entry.url);
    urlHtml = '<span class="url-domain">' + escapeHtml(u.hostname) + '</span>' + escapeHtml(u.pathname + u.search);
  } catch(e) {
    urlHtml = escapeHtml(entry.url);
  }

  const intentClass = (entry.intent || 'unknown').replace(/\s+/g, '-');

  let fpWarningHtml = '';
  if (entry.falsePositive) {
    fpWarningHtml = '<div class="detail-section">' +
      '<div style="padding:8px; background:' + 'var(--orange-d)' + '; border:1px solid var(--orange); border-radius:4px; color:var(--orange); font-size:11px; line-height:1.5;">' +
      '<strong>Warning: Likely Breakage</strong><br>' +
      'This request is classified as <strong>' + escapeHtml(entry.fpReason || 'critical') + '</strong> and blocking it may break page functionality.' +
      '<br>Consider allowing this domain.' +
      '</div></div>';
  }

  detail.innerHTML =
    fpWarningHtml +

    '<div class="detail-section">' +
      '<div class="detail-section-title">Blocked URL</div>' +
      '<div class="url-full" title="Click to copy" id="copyUrl">' + urlHtml + '</div>' +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-title">Request Info</div>' +
      '<div class="detail-row"><span class="dk">Domain</span><span class="dv cyan">' + escapeHtml(entry.domain) + '</span></div>' +
      '<div class="detail-row"><span class="dk">Type</span><span class="dv">' + (entry.type || '&#x2014;') + '</span></div>' +
      '<div class="detail-row"><span class="dk">Category</span><span class="dv ' + (entry.category === 'ad' ? 'red' : entry.category === 'tracker' ? 'amber' : 'cyan') + '">' + (entry.category || '').toUpperCase() + '</span></div>' +
      '<div class="detail-row"><span class="dk">Intent</span><span class="dv"><span class="intent-tag ' + intentClass + '">' + escapeHtml(entry.intent || 'unknown') + '</span></span></div>' +
      '<div class="detail-row"><span class="dk">Timestamp</span><span class="dv">' + new Date(entry.timestamp).toISOString() + '</span></div>' +
      (entry.frameUrl ? '<div class="detail-row"><span class="dk">Frame</span><span class="dv" style="font-size:9px">' + escapeHtml(entry.frameUrl.substring(0, 50)) + '...</span></div>' : '') +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-title">Rule Attribution</div>' +
      '<div class="rule-card">' +
        '<div class="rule-id">Rule #' + entry.ruleId + '</div>' +
        '<div class="rule-desc">' + escapeHtml(entry.ruleDesc || 'Unknown rule') + '</div>' +
        (entry.filter ? '<div class="rule-filter">' + escapeHtml(entry.filter) + '</div>' : '') +
        '<div class="rule-list-source">List: ' + escapeHtml(entry.list || 'Unknown') + ' | Source: ' + escapeHtml(entry.ruleSource || 'unknown') + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-title">Actions</div>' +
      '<div class="action-row">' +
        '<button class="action-btn allow" id="actAllow">Allow Domain</button>' +
        '<button class="action-btn block" id="actBlock">Hard Block</button>' +
      '</div>' +
      '<div class="action-row">' +
        '<button class="action-btn highlight" id="actHighlight">Highlight Element</button>' +
        '<button class="action-btn inspect" id="actInspect">Inspect on Page</button>' +
      '</div>' +
    '</div>' +

    '<div class="detail-section">' +
      '<div class="detail-section-title">Raw Entry</div>' +
      '<pre style="font-size:9px; color: var(--muted); background: var(--navy-3); padding: 6px 8px; border-radius: 3px; overflow-x: auto; border: 1px solid var(--border); line-height: 1.6; white-space: pre-wrap; word-break: break-all;">' + escapeHtml(JSON.stringify(entry, null, 2)) + '</pre>' +
    '</div>';

  // Bind actions
  document.getElementById('copyUrl').addEventListener('click', () => {
    navigator.clipboard.writeText(entry.url);
    flashStatus('Copied URL');
  });
  document.getElementById('actAllow').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain: entry.domain, mode: 'allow' });
    flashStatus('Allowed ' + entry.domain);
  });
  document.getElementById('actBlock').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain: entry.domain, mode: 'block' });
    flashStatus('Hard blocked ' + entry.domain);
  });
  document.getElementById('actHighlight').addEventListener('click', () => {
    chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_ELEMENT', url: entry.url });
    flashStatus('Highlighting element...');
  });
  document.getElementById('actInspect').addEventListener('click', () => {
    chrome.tabs.sendMessage(tabId, { type: 'ENTER_INSPECT_MODE' });
    flashStatus('Inspect mode activated');
  });
}

// ─── Timeline View (Ad-Aware HAR Viewer) ───
function loadTimeline() {
  chrome.runtime.sendMessage({ type: 'GET_TIMELINE', tabId }, (res) => {
    if (!res || !res.timeline) return;
    renderTimeline(res.timeline);
  });
}

function renderTimeline(timeline) {
  const container = document.getElementById('timelineView');
  if (timeline.length === 0) {
    container.innerHTML = '<div class="detail-empty" style="height:200px"><div class="icon">&#x2B21;</div><div>No request data yet.<br>Navigate to a page to see the timeline.</div></div>';
    return;
  }

  const earliest = timeline[0].timestamp;
  const latest = timeline[timeline.length - 1].timestamp;
  const span = Math.max(latest - earliest, 1);

  // Calculate savings
  const blocked = timeline.filter(r => r.status === 'BLOCKED');
  const savingsMap = { script: 80, image: 20, sub_frame: 100, xmlhttprequest: 30 };
  const totalSavings = blocked.reduce((sum, r) => sum + (savingsMap[r.type] || 5), 0);

  let html = '<div class="tl-header">' +
    '<span class="tl-header-label">Request Timeline (' + timeline.length + ' requests)</span>' +
    '<span class="tl-savings">Blocking saved ~' + (totalSavings >= 1000 ? (totalSavings / 1000).toFixed(1) + 's' : totalSavings + 'ms') + ' of load time</span>' +
  '</div>';

  timeline.forEach(req => {
    const offset = ((req.timestamp - earliest) / span) * 100;
    const status = req.status || 'ALLOWED';
    const statusClass = status.toLowerCase();
    const barClass = status === 'BLOCKED' ? req.category : 'allowed';
    const intent = req.intent || '';
    const intentClass = intent.replace(/\s+/g, '-');

    html += '<div class="tl-row">' +
      '<span class="tl-status ' + statusClass + '">' + status + '</span>' +
      '<span class="tl-domain" title="' + escapeHtml(req.url) + '">' + escapeHtml(req.domain) + '</span>' +
      '<div class="tl-bar-wrap"><div class="tl-bar-fill ' + barClass + '" style="width:' + Math.max(2, 100 - offset) + '%; margin-left:' + offset + '%;"></div></div>' +
      (intent ? '<span class="intent-tag ' + intentClass + '" style="width:70px; text-align:center; flex-shrink:0;">' + intent + '</span>' : '<span style="width:70px; flex-shrink:0;"></span>') +
      '<span class="tl-timing">' + new Date(req.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '</span>' +
    '</div>';
  });

  container.innerHTML = html;
}

// ─── Tracker Graph Visualization ───
function loadGraph() {
  chrome.runtime.sendMessage({ type: 'GET_TRACKER_GRAPH', tabId }, (res) => {
    if (!res) return;
    renderGraph(res);
  });
}

function renderGraph(graphData) {
  const canvas = document.getElementById('graphCanvas');
  const container = document.getElementById('graphView');
  const ctx = canvas.getContext('2d');

  // Size canvas to container
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const { pageDomain, nodes, edges } = graphData;

  if (!nodes || nodes.length === 0) {
    ctx.fillStyle = '#4a6080';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No tracker data yet. Navigate to a page with ads.', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Layout: radial graph with page domain at center
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(canvas.width, canvas.height) * 0.35;

  // Node positions
  const positions = {};
  const trackerNodes = nodes.filter(n => n !== pageDomain);
  positions[pageDomain] = { x: centerX, y: centerY };

  trackerNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / trackerNodes.length - Math.PI / 2;
    positions[node] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  // Colors by intent
  const intentColors = {
    'ad-network': '#ff4757',
    'analytics': '#f59e0b',
    'session-replay': '#f472b6',
    'fingerprinting': '#ef4444',
    'crypto-miner': '#dc2626',
    'payment-sdk': '#2dce7d',
    'cdn': '#06b6d4',
    'social': '#a78bfa',
    'unknown': '#4a6080',
    'custom': '#00d4ff',
  };

  // Draw edges
  edges.forEach(edge => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = (intentColors[edge.type] || '#1e2d4a') + '66';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrow head
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const arrowLen = 8;
    const ax = to.x - 18 * Math.cos(angle);
    const ay = to.y - 18 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
    ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = intentColors[edge.type] || '#4a6080';
    ctx.fill();
  });

  // Draw nodes
  Object.entries(positions).forEach(([domain, pos]) => {
    const isCenter = domain === pageDomain;
    const edge = edges.find(e => e.to === domain);
    const color = isCenter ? '#00d4ff' : (edge ? intentColors[edge.type] || '#4a6080' : '#4a6080');

    // Node circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, isCenter ? 16 : 10, 0, 2 * Math.PI);
    ctx.fillStyle = isCenter ? '#0b1221' : '#0f192e';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glow
    if (isCenter) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 16, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Label
    ctx.fillStyle = color;
    ctx.font = (isCenter ? '11px' : '9px') + ' "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    // Truncate long domain names
    let label = domain.length > 20 ? domain.substring(0, 18) + '..' : domain;
    const labelY = pos.y + (isCenter ? 28 : 20);
    ctx.fillText(label, pos.x, labelY);

    // Intent label for tracker nodes
    if (!isCenter && edge) {
      ctx.fillStyle = color + '99';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(edge.type || '', pos.x, labelY + 12);
    }
  });

  // Legend
  ctx.fillStyle = '#4a6080';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  let legendY = 20;
  ctx.fillText('TRACKER GRAPH', 12, legendY);
  legendY += 18;

  Object.entries(intentColors).forEach(([intent, color]) => {
    if (edges.find(e => e.type === intent)) {
      ctx.fillStyle = color;
      ctx.fillRect(12, legendY - 6, 8, 8);
      ctx.fillStyle = '#7a90b0';
      ctx.fillText(intent, 26, legendY);
      legendY += 14;
    }
  });
}

// ─── Mini Timeline ───
function updateMiniTimeline() {
  const bar = document.getElementById('miniTimeline');
  const now = Date.now();
  const buckets = Array(48).fill(null).map(() => ({ count: 0, cat: 'other' }));
  const windowMs = 60000;

  allEntries.forEach(entry => {
    const age = now - entry.timestamp;
    if (age > windowMs) return;
    const bucket = Math.floor((1 - age / windowMs) * 47);
    if (bucket < 0 || bucket > 47) return;
    buckets[bucket].count++;
    const rank = { ad: 3, social: 2, tracker: 1, other: 0 };
    if ((rank[entry.category] || 0) > (rank[buckets[bucket].cat] || 0)) {
      buckets[bucket].cat = entry.category;
    }
  });

  const max = Math.max(...buckets.map(b => b.count), 1);
  bar.innerHTML = '<span class="tl-label">60s</span>';
  buckets.forEach(b => {
    const div = document.createElement('div');
    div.className = 'tl-mini-bar ' + b.cat;
    div.style.height = Math.max(2, (b.count / max) * 24) + 'px';
    div.title = b.count + ' blocked';
    bar.appendChild(div);
  });
}

// ─── UI Bindings ───
function bindUI() {
  // View tabs
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;
      document.getElementById('view-' + currentView).classList.add('active');

      if (currentView === 'timeline') loadTimeline();
      if (currentView === 'graph') loadGraph();
    });
  });

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
    document.getElementById('detailBody').innerHTML = '<div class="detail-empty"><div class="icon">&larr;</div><div>Select a blocked request<br>to inspect it</div></div>';
    renderTable();
    updateStats({});
    updateMiniTimeline();
  });

  // Export JSON
  document.getElementById('btnExport').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_REPORT', tabId }, (response) => {
      if (!response) return;
      chrome.tabs.get(tabId, (tab) => {
        const report = {
          generated: new Date().toISOString(),
          page: tab ? tab.url : 'unknown',
          totalBlocked: allEntries.length,
          stats: response.stats,
          entries: allEntries,
          trackerGraph: response.graph,
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'adtrace-report-' + Date.now() + '.json';
        a.click();
      });
    });
  });

  // Inspect Element
  document.getElementById('btnInspect').addEventListener('click', () => {
    chrome.tabs.sendMessage(tabId, { type: 'ENTER_INSPECT_MODE' }).catch(() => {});
    flashStatus('Inspect mode: click any element on the page');
  });

  // Dev Overlay
  document.getElementById('btnDevOverlay').addEventListener('click', () => {
    devOverlayOn = !devOverlayOn;
    updateDevOverlayBtn();
    chrome.runtime.sendMessage({ type: 'SET_DEV_MODE', enabled: devOverlayOn });
    chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_DEV_MODE', enabled: devOverlayOn }).catch(() => {});
    flashStatus(devOverlayOn ? 'Dev overlay ON' : 'Dev overlay OFF');
  });

  // Simulate User
  document.getElementById('btnSimulate').addEventListener('click', () => {
    simModeOn = !simModeOn;
    document.getElementById('simBanner').classList.toggle('show', simModeOn);
    document.getElementById('btnSimulate').classList.toggle('active', simModeOn);
    chrome.tabs.sendMessage(tabId, { type: simModeOn ? 'SIMULATE_USER' : 'SIMULATE_DEV' }).catch(() => {});
    flashStatus(simModeOn ? 'Simulating user view' : 'Dev view restored');
  });

  document.getElementById('simBannerClose').addEventListener('click', () => {
    simModeOn = false;
    document.getElementById('simBanner').classList.remove('show');
    document.getElementById('btnSimulate').classList.remove('active');
    chrome.tabs.sendMessage(tabId, { type: 'SIMULATE_DEV' }).catch(() => {});
  });

  // FP dismiss
  document.getElementById('fpDismiss').addEventListener('click', () => {
    fpDismissed = true;
    document.getElementById('fpAlertBar').classList.remove('show');
  });

  // Navigate event
  chrome.devtools.network.onNavigated.addListener((url) => {
    allEntries = [];
    filteredEntries = [];
    selectedEntry = null;
    fpDismissed = false;
    renderTable();
    updateStats({});
    updateMiniTimeline();
    try {
      const domain = new URL(url).hostname;
      document.getElementById('statusPage').textContent = 'Page: ' + domain;
    } catch(e) {}
  });

  // Graph resize
  window.addEventListener('resize', () => {
    if (currentView === 'graph') loadGraph();
  });
}

function updateDevOverlayBtn() {
  const btn = document.getElementById('btnDevOverlay');
  btn.classList.toggle('active', devOverlayOn);
  btn.textContent = devOverlayOn ? 'Dev Overlay ON' : 'Dev Overlay';
}

function flashStatus(msg) {
  const el = document.getElementById('statusLast');
  const prev = el.textContent;
  el.textContent = msg;
  el.style.color = 'var(--cyan)';
  setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Expose for panel show callback
window.adtraceRefresh = poll;

init();
