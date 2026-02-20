// AdTrace Background Service Worker
// Chrome MV3 — Rule Attribution, Script Intent, False Positive Detection, Context Menus

const ADTRACE_VERSION = '1.0.0';

// ─── In-memory stores ───
const blockLog = new Map();       // tabId -> [{...entry}]
const allowLog = new Map();       // tabId -> [{url, type, timestamp, domain, timing}]
const tabStats = new Map();       // tabId -> {blocked, trackers, ads, social, other, allowed, savings}
const domainOverrides = new Map();// domain -> 'allow' | 'block'
const sessionOverrides = new Map();// domain -> 'allow-once' (cleared on navigation)
const trackerGraph = new Map();   // tabId -> { nodes: Set, edges: [{from,to,type}] }
const tabTimings = new Map();     // tabId -> { navigationStart, requests: [] }

// ─── Rule Attribution: Map rule IDs to filter patterns + list source ───
const RULE_ATTRIBUTION = {
  // EasyList — Ad Networks
  1:  { filter: '||doubleclick.net^', list: 'EasyList', category: 'ad', desc: 'Google DoubleClick ad network', intent: 'ad-network' },
  2:  { filter: '||googlesyndication.com^', list: 'EasyList', category: 'ad', desc: 'Google AdSense / syndication', intent: 'ad-network' },
  3:  { filter: '||googleadservices.com^', list: 'EasyList', category: 'ad', desc: 'Google Ad Services', intent: 'ad-network' },
  6:  { filter: '||amazon-adsystem.com^', list: 'EasyList', category: 'ad', desc: 'Amazon Advertising', intent: 'ad-network' },
  9:  { filter: '||outbrain.com^', list: 'EasyList', category: 'ad', desc: 'Outbrain content recommendations', intent: 'ad-network' },
  10: { filter: '||taboola.com^', list: 'EasyList', category: 'ad', desc: 'Taboola content recommendations', intent: 'ad-network' },
  13: { filter: '||adnxs.com^', list: 'EasyList', category: 'ad', desc: 'AppNexus / Xandr programmatic', intent: 'ad-network' },
  14: { filter: '||criteo.com^', list: 'EasyList', category: 'ad', desc: 'Criteo retargeting', intent: 'ad-network' },
  19: { filter: '||moatads.com^', list: 'EasyList', category: 'ad', desc: 'Moat ad verification', intent: 'ad-network' },
  20: { filter: '||pubmatic.com^', list: 'EasyList', category: 'ad', desc: 'PubMatic programmatic SSP', intent: 'ad-network' },

  // EasyPrivacy — Trackers
  11: { filter: '||analytics.google.com/analytics/collect', list: 'EasyPrivacy', category: 'tracker', desc: 'Google Analytics beacon', intent: 'analytics' },
  12: { filter: '||hotjar.com^', list: 'EasyPrivacy', category: 'tracker', desc: 'Hotjar session recording', intent: 'session-replay' },
  15: { filter: '||segment.io^', list: 'EasyPrivacy', category: 'tracker', desc: 'Segment analytics pipeline', intent: 'analytics' },
  16: { filter: '||segment.com/analytics.js', list: 'EasyPrivacy', category: 'tracker', desc: 'Segment analytics.js', intent: 'analytics' },
  17: { filter: '||mixpanel.com^', list: 'EasyPrivacy', category: 'tracker', desc: 'Mixpanel product analytics', intent: 'analytics' },
  18: { filter: '||intercom.io^', list: 'EasyPrivacy', category: 'tracker', desc: 'Intercom chat/analytics', intent: 'analytics' },

  // Social — Tracking pixels
  4:  { filter: '||facebook.com/tr', list: 'Social', category: 'social', desc: 'Facebook Conversion Pixel', intent: 'ad-network' },
  5:  { filter: '||connect.facebook.net/**/fbevents.js', list: 'Social', category: 'social', desc: 'Facebook Events SDK', intent: 'ad-network' },
  7:  { filter: '||ads.twitter.com^', list: 'Social', category: 'social', desc: 'Twitter Ads', intent: 'ad-network' },
  8:  { filter: '||static.ads-twitter.com^', list: 'Social', category: 'social', desc: 'Twitter Ads Static', intent: 'ad-network' },
};

// ─── Script Intent Classification: domain → intent ───
const INTENT_DB = {
  // Ad networks
  'ad-network': [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adnxs.com',
    'criteo.com', 'pubmatic.com', 'moatads.com', 'amazon-adsystem.com',
    'taboola.com', 'outbrain.com', 'ads.twitter.com', 'adsrvr.org',
    'rubiconproject.com', 'openx.net', 'indexww.com', 'casalemedia.com',
    'sharethrough.com', 'triplelift.com', 'media.net', 'bidswitch.net',
    'smartadserver.com', 'adblade.com', 'revcontent.com', 'mgid.com',
    'sovrn.com', 'conversantmedia.com', 'yieldmo.com',
  ],
  // Fingerprinting
  'fingerprinting': [
    'fingerprintjs.com', 'fpjs.io', 'ipify.org', 'iphub.info',
    'botd.io', 'deviceanywhere.com', 'threatmetrix.com',
  ],
  // Session replay
  'session-replay': [
    'hotjar.com', 'fullstory.com', 'logrocket.com', 'smartlook.com',
    'mouseflow.com', 'clarity.ms', 'inspectlet.com', 'crazyegg.com',
    'luckyorange.com', 'rrweb.io', 'sessioncam.com',
  ],
  // Analytics
  'analytics': [
    'analytics.google.com', 'google-analytics.com', 'googletagmanager.com',
    'segment.io', 'segment.com', 'mixpanel.com', 'amplitude.com',
    'heap.io', 'heapanalytics.com', 'plausible.io', 'matomo.org',
    'piwik.pro', 'kissmetrics.com', 'woopra.com', 'gauges.com',
    'chartbeat.com', 'parsely.com', 'newrelic.com', 'datadoghq.com',
    'sentry.io',
  ],
  // Crypto miners
  'crypto-miner': [
    'coinhive.com', 'coin-hive.com', 'authedmine.com', 'jsecoin.com',
    'crypto-loot.com', 'cryptoloot.pro', 'minero.cc', 'webminepool.com',
  ],
  // Payment SDKs (false positive risk)
  'payment-sdk': [
    'js.stripe.com', 'checkout.stripe.com', 'api.stripe.com',
    'paypal.com', 'paypalobjects.com', 'braintreegateway.com',
    'braintree-api.com', 'square.com', 'squareup.com',
    'adyen.com', 'recurly.com', 'chargebee.com', 'paddle.com',
    'razorpay.com', 'checkout.com', 'mollie.com',
  ],
  // CDN
  'cdn': [
    'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com',
    'ajax.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
    'stackpath.bootstrapcdn.com', 'maxcdn.bootstrapcdn.com',
    'cdn.bootcdn.net', 'lib.baomitu.com', 'fastly.net',
  ],
  // Social widgets
  'social': [
    'facebook.com', 'connect.facebook.net', 'platform.twitter.com',
    'platform.linkedin.com', 'apis.google.com', 'pinterest.com',
    'tiktok.com', 'snap.licdn.com',
  ],
};

// ─── False Positive Detection: domains that break pages when blocked ───
const FALSE_POSITIVE_DOMAINS = {
  'payment': [
    'js.stripe.com', 'checkout.stripe.com', 'api.stripe.com',
    'paypal.com', 'paypalobjects.com', 'braintreegateway.com',
    'square.com', 'squareup.com', 'adyen.com', 'recurly.com',
    'chargebee.com', 'paddle.com', 'razorpay.com',
  ],
  'auth': [
    'accounts.google.com', 'login.microsoftonline.com', 'auth0.com',
    'cognito-idp.', 'clerk.com', 'supabase.co', 'firebase.google.com',
    'appleid.apple.com', 'id.twitch.tv', 'oauth.', 'openid.',
  ],
  'fonts': [
    'fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net',
    'fast.fonts.net', 'cloud.typography.com', 'use.fontawesome.com',
    'kit.fontawesome.com',
  ],
  'app-analytics': [
    'sentry.io', 'o*.ingest.sentry.io', 'bugsnag.com', 'datadoghq.com',
    'newrelic.com', 'rollbar.com', 'logrocket.com',
  ],
  'essential-cdn': [
    'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com',
    'ajax.googleapis.com',
  ],
};

// ─── Helpers ───
function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function classifyIntent(url) {
  const lower = url.toLowerCase();
  const hostname = getDomain(url);

  for (const [intent, domains] of Object.entries(INTENT_DB)) {
    for (const d of domains) {
      if (hostname === d || hostname.endsWith('.' + d) || lower.includes(d)) {
        return intent;
      }
    }
  }

  // Heuristic fallbacks based on URL patterns
  if (/\b(ads?|adserv|advert|banner|sponsor)\b/i.test(lower)) return 'ad-network';
  if (/\b(track|pixel|beacon|collect|telemetry)\b/i.test(lower)) return 'analytics';
  if (/\b(fingerprint|fp|device-id)\b/i.test(lower)) return 'fingerprinting';
  if (/\b(miner?|coinhive|cryptonight)\b/i.test(lower)) return 'crypto-miner';
  if (/\b(replay|session-rec|heatmap)\b/i.test(lower)) return 'session-replay';

  return 'unknown';
}

function categorize(url) {
  const intent = classifyIntent(url);
  if (['ad-network'].includes(intent)) return 'ad';
  if (['analytics', 'session-replay', 'fingerprinting'].includes(intent)) return 'tracker';
  if (['social'].includes(intent)) return 'social';
  return 'other';
}

function detectFalsePositive(url) {
  const hostname = getDomain(url);
  const lower = url.toLowerCase();

  for (const [reason, domains] of Object.entries(FALSE_POSITIVE_DOMAINS)) {
    for (const d of domains) {
      if (d.includes('*')) {
        // Wildcard match
        const pattern = d.replace(/\*/g, '.*');
        if (new RegExp(pattern).test(hostname)) {
          return { isFalsePositive: true, reason, domain: d };
        }
      } else if (hostname === d || hostname.endsWith('.' + d) || lower.includes(d)) {
        return { isFalsePositive: true, reason, domain: d };
      }
    }
  }
  return { isFalsePositive: false, reason: null, domain: null };
}

function getRuleAttribution(ruleId, rulesetId) {
  if (RULE_ATTRIBUTION[ruleId]) {
    return { ...RULE_ATTRIBUTION[ruleId], source: 'static' };
  }
  if (ruleId >= 10000) {
    return { filter: 'Dynamic override', list: 'Custom', category: 'custom', desc: 'User domain override', intent: 'custom', source: 'dynamic' };
  }
  if (ruleId >= 5000) {
    return { filter: 'Custom network rule', list: 'Custom', category: 'custom', desc: 'User-defined filter', intent: 'custom', source: 'custom' };
  }
  return { filter: 'Unknown', list: rulesetId || 'Unknown', category: 'other', desc: 'Rule not in attribution map', intent: 'unknown', source: 'unknown' };
}

// ─── Tracker Graph Builder ───
function updateTrackerGraph(tabId, pageUrl, trackerUrl) {
  if (!trackerGraph.has(tabId)) {
    trackerGraph.set(tabId, { pageDomain: getDomain(pageUrl), nodes: new Set(), edges: [] });
  }
  const graph = trackerGraph.get(tabId);
  const pageDomain = graph.pageDomain;
  const trackerDomain = getDomain(trackerUrl);

  graph.nodes.add(pageDomain);
  graph.nodes.add(trackerDomain);

  // Check if edge already exists
  const edgeKey = `${pageDomain}->${trackerDomain}`;
  if (!graph.edges.find(e => `${e.from}->${e.to}` === edgeKey)) {
    graph.edges.push({
      from: pageDomain,
      to: trackerDomain,
      type: classifyIntent(trackerUrl),
      category: categorize(trackerUrl),
    });
  }
}

// ─── Listen for blocked requests (Chrome MV3) ───
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const { request, rule } = info;
    const tabId = request.tabId;
    if (tabId < 0) return;

    const attribution = getRuleAttribution(rule.ruleId, rule.rulesetId);
    const intent = attribution.intent || classifyIntent(request.url);
    const fp = detectFalsePositive(request.url);
    const cat = attribution.category !== 'custom' ? categorize(request.url) : 'other';

    const entry = {
      url: request.url,
      domain: getDomain(request.url),
      type: request.type,
      category: cat,
      intent: intent,
      ruleId: rule.ruleId,
      rulesetId: rule.rulesetId,
      filter: attribution.filter,
      list: attribution.list,
      ruleDesc: attribution.desc,
      ruleSource: attribution.source,
      timestamp: Date.now(),
      frameUrl: request.documentUrl || '',
      status: 'BLOCKED',
      falsePositive: fp.isFalsePositive,
      fpReason: fp.reason,
    };

    if (!blockLog.has(tabId)) blockLog.set(tabId, []);
    const log = blockLog.get(tabId);
    log.unshift(entry);
    if (log.length > 500) log.pop();

    // Update stats
    if (!tabStats.has(tabId)) tabStats.set(tabId, { blocked: 0, trackers: 0, ads: 0, social: 0, other: 0, allowed: 0, falsePositives: 0, estimatedSavingsMs: 0 });
    const stats = tabStats.get(tabId);
    stats.blocked++;
    stats[cat] = (stats[cat] || 0) + 1;
    if (fp.isFalsePositive) stats.falsePositives++;

    // Estimate savings: ~80ms per blocked script, ~20ms per image, ~5ms per other
    const savingsMap = { script: 80, image: 20, sub_frame: 100, xmlhttprequest: 30 };
    stats.estimatedSavingsMs += savingsMap[request.type] || 5;

    // Update tracker graph
    if (request.documentUrl) {
      updateTrackerGraph(tabId, request.documentUrl, request.url);
    }

    // Notify popup/devpanel if open
    chrome.runtime.sendMessage({ type: 'NEW_BLOCK', tabId, entry, stats }).catch(() => {});
  });
}

// ─── Track allowed requests via webRequest (for timeline) ───
if (chrome.webRequest) {
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const tabId = details.tabId;

      if (!allowLog.has(tabId)) allowLog.set(tabId, []);
      const log = allowLog.get(tabId);

      const intent = classifyIntent(details.url);
      const cat = categorize(details.url);

      log.push({
        url: details.url,
        domain: getDomain(details.url),
        type: details.type,
        category: cat,
        intent: intent,
        timestamp: details.timeStamp || Date.now(),
        status: 'ALLOWED',
        statusCode: details.statusCode,
        fromCache: details.fromCache || false,
      });

      // Keep last 500
      if (log.length > 500) log.shift();

      // Update allowed count
      if (!tabStats.has(tabId)) tabStats.set(tabId, { blocked: 0, trackers: 0, ads: 0, social: 0, other: 0, allowed: 0, falsePositives: 0, estimatedSavingsMs: 0 });
      tabStats.get(tabId).allowed = log.length;
    },
    { urls: ['<all_urls>'] }
  );
}

// ─── Tab navigation — clear logs ───
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    blockLog.set(details.tabId, []);
    allowLog.set(details.tabId, []);
    tabStats.set(details.tabId, { blocked: 0, trackers: 0, ads: 0, social: 0, other: 0, allowed: 0, falsePositives: 0, estimatedSavingsMs: 0 });
    trackerGraph.delete(details.tabId);
    sessionOverrides.clear();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  blockLog.delete(tabId);
  allowLog.delete(tabId);
  tabStats.delete(tabId);
  trackerGraph.delete(tabId);
});

// ─── Context Menu: One-Click Rule Override ───
chrome.runtime.onInstalled.addListener(async () => {
  // Create context menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'adtrace-parent',
      title: 'AdTrace',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'adtrace-allow-once',
      parentId: 'adtrace-parent',
      title: 'Allow Once (this session)',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'adtrace-allow-domain',
      parentId: 'adtrace-parent',
      title: 'Allow on This Domain',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'adtrace-allow-permanent',
      parentId: 'adtrace-parent',
      title: 'Allow Permanently',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'adtrace-sep',
      parentId: 'adtrace-parent',
      type: 'separator',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'adtrace-block',
      parentId: 'adtrace-parent',
      title: 'Add to Custom Blocklist',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'adtrace-sep2',
      parentId: 'adtrace-parent',
      type: 'separator',
      contexts: ['page', 'link', 'image', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: 'adtrace-inspect',
      parentId: 'adtrace-parent',
      title: 'Inspect Element Blocking',
      contexts: ['page', 'image', 'video', 'audio', 'frame'],
    });
  });

  // Auto-whitelist localhost
  const devDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
  devDomains.forEach(d => domainOverrides.set(d, 'allow'));
  await applyDomainOverrides();

  chrome.storage.local.set({
    enabled: true,
    devMode: false,
    autoWhitelistLocal: true,
    installedAt: Date.now()
  });
});

// ─── Context Menu Handler ───
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.srcUrl || info.pageUrl;
  const domain = getDomain(url);
  const pageDomain = getDomain(info.pageUrl);

  switch (info.menuItemId) {
    case 'adtrace-allow-once':
      sessionOverrides.set(domain, 'allow');
      // Add temporary dynamic allow rule
      await addTemporaryAllowRule(domain);
      notifyTab(tab.id, `Allowed ${domain} for this session`);
      break;

    case 'adtrace-allow-domain':
      domainOverrides.set(domain, 'allow');
      await applyDomainOverrides();
      persistOverrides();
      notifyTab(tab.id, `Allowed ${domain} on this domain`);
      break;

    case 'adtrace-allow-permanent':
      domainOverrides.set(domain, 'allow');
      await applyDomainOverrides();
      persistOverrides();
      // Also save to whitelist
      chrome.storage.local.get(['whitelistDomains'], (data) => {
        const existing = data.whitelistDomains || '';
        if (!existing.includes(domain)) {
          chrome.storage.local.set({ whitelistDomains: existing + '\n' + domain });
        }
      });
      notifyTab(tab.id, `Permanently allowed ${domain}`);
      break;

    case 'adtrace-block':
      domainOverrides.set(domain, 'block');
      await applyDomainOverrides();
      persistOverrides();
      notifyTab(tab.id, `Added ${domain} to blocklist`);
      break;

    case 'adtrace-inspect':
      chrome.tabs.sendMessage(tab.id, { type: 'ENTER_INSPECT_MODE' }).catch(() => {});
      break;
  }
});

async function addTemporaryAllowRule(domain) {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const maxId = existingRules.reduce((max, r) => Math.max(max, r.id), 20000);
  const newId = maxId + 1;

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id: newId,
      priority: 200,
      action: { type: 'allow' },
      condition: {
        requestDomains: [domain],
        resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'font', 'media', 'object', 'other', 'stylesheet', 'websocket', 'main_frame']
      }
    }]
  });
}

function notifyTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, { type: 'SHOW_TOAST', message }).catch(() => {});
}

// ─── Message handler ───
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_LOG': {
      const tabId = msg.tabId;
      sendResponse({
        log: blockLog.get(tabId) || [],
        stats: tabStats.get(tabId) || { blocked: 0, trackers: 0, ads: 0, social: 0, other: 0, allowed: 0, falsePositives: 0, estimatedSavingsMs: 0 }
      });
      return true;
    }

    case 'GET_TIMELINE': {
      const tabId = msg.tabId;
      const blocked = (blockLog.get(tabId) || []).map(e => ({ ...e, status: 'BLOCKED' }));
      const allowed = (allowLog.get(tabId) || []).map(e => ({ ...e, status: 'ALLOWED' }));
      const all = [...blocked, ...allowed].sort((a, b) => a.timestamp - b.timestamp);
      sendResponse({ timeline: all });
      return true;
    }

    case 'GET_TRACKER_GRAPH': {
      const tabId = msg.tabId;
      const graph = trackerGraph.get(tabId);
      if (graph) {
        sendResponse({
          pageDomain: graph.pageDomain,
          nodes: [...graph.nodes],
          edges: graph.edges,
        });
      } else {
        sendResponse({ pageDomain: '', nodes: [], edges: [] });
      }
      return true;
    }

    case 'GET_RULE_DETAIL': {
      const ruleId = msg.ruleId;
      const attr = getRuleAttribution(ruleId, msg.rulesetId);
      sendResponse({ attribution: attr });
      return true;
    }

    case 'GET_OVERRIDES': {
      const overrides = {};
      domainOverrides.forEach((v, k) => { overrides[k] = v; });
      sendResponse({ overrides });
      return true;
    }

    case 'SET_DOMAIN_OVERRIDE': {
      const { domain, mode } = msg;
      if (mode === 'reset') {
        domainOverrides.delete(domain);
      } else {
        domainOverrides.set(domain, mode);
      }
      applyDomainOverrides().then(() => {
        persistOverrides();
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'EXPORT_REPORT': {
      const tabId = msg.tabId;
      const log = blockLog.get(tabId) || [];
      const stats = tabStats.get(tabId) || {};
      const graph = trackerGraph.get(tabId);
      sendResponse({ log, stats, graph: graph ? { pageDomain: graph.pageDomain, nodes: [...graph.nodes], edges: graph.edges } : null });
      return true;
    }

    case 'TOGGLE_EXTENSION': {
      chrome.storage.local.set({ enabled: msg.enabled });
      updateExtensionState(msg.enabled);
      sendResponse({ ok: true });
      return true;
    }

    case 'GET_STATE': {
      chrome.storage.local.get(['enabled', 'devMode'], (data) => {
        sendResponse({
          enabled: data.enabled !== false,
          devMode: data.devMode === true
        });
      });
      return true;
    }

    case 'SET_DEV_MODE': {
      chrome.storage.local.set({ devMode: msg.enabled });
      sendResponse({ ok: true });
      return true;
    }

    case 'GET_ELEMENT_INFO': {
      // Content script asks for info about a blocked URL that hit an element
      const tabId = msg.tabId || (sender.tab && sender.tab.id);
      const log = blockLog.get(tabId) || [];
      const url = msg.url;
      const hostname = getDomain(url);
      // Find matching blocked entries for this element
      const matches = log.filter(e => {
        const eDomain = getDomain(e.url);
        return e.url === url || eDomain === hostname || url.includes(eDomain);
      });
      sendResponse({ matches });
      return true;
    }

    case 'CLASSIFY_SCRIPTS': {
      // Classify a list of script URLs from the content script
      const results = (msg.urls || []).map(url => ({
        url,
        domain: getDomain(url),
        intent: classifyIntent(url),
        category: categorize(url),
        fp: detectFalsePositive(url),
      }));
      sendResponse({ results });
      return true;
    }
  }
});

// ─── Domain override application ───
async function applyDomainOverrides() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const toRemove = existingRules.filter(r => r.id >= 10000 && r.id < 20000).map(r => r.id);

  const toAdd = [];
  let ruleId = 10000;

  domainOverrides.forEach((mode, domain) => {
    if (mode === 'allow') {
      toAdd.push({
        id: ruleId++,
        priority: 100,
        action: { type: 'allow' },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'font', 'media', 'object', 'other', 'stylesheet', 'websocket', 'main_frame']
        }
      });
    } else if (mode === 'block') {
      toAdd.push({
        id: ruleId++,
        priority: 100,
        action: { type: 'block' },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'font', 'media', 'object', 'other', 'stylesheet', 'websocket']
        }
      });
    }
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: toRemove,
    addRules: toAdd
  });
}

async function updateExtensionState(enabled) {
  if (enabled) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: ['adtrace_rules'],
      disableRulesetIds: []
    });
  } else {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [],
      disableRulesetIds: ['adtrace_rules']
    });
  }
}

function persistOverrides() {
  chrome.storage.local.set({ domainOverrides: Object.fromEntries(domainOverrides) });
}

// ─── Persistence across service worker restarts ───
chrome.storage.local.get(['domainOverrides', 'enabled'], async (data) => {
  if (data.domainOverrides) {
    Object.entries(data.domainOverrides).forEach(([k, v]) => domainOverrides.set(k, v));
  }
  ['localhost', '127.0.0.1', '0.0.0.0'].forEach(d => {
    if (!domainOverrides.has(d)) domainOverrides.set(d, 'allow');
  });
  await applyDomainOverrides();
  if (data.enabled === false) await updateExtensionState(false);
});
