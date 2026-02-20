// AdTrace Background Service Worker
// Chrome MV3 + Firefox MV3 compatible

const ADTRACE_VERSION = '1.0.0';

// In-memory store for blocked request logs per tab
const blockLog = new Map(); // tabId -> [{url, type, rule, timestamp, domain}]
const tabStats = new Map(); // tabId -> {blocked: N, trackers: N, ads: N}
const domainOverrides = new Map(); // domain -> 'allow' | 'block'

// Categorize blocked requests
function categorize(url) {
  const trackers = ['analytics', 'hotjar', 'mixpanel', 'segment', 'amplitude', 'heap', 'fullstory', 'logrocket', 'intercom', 'optimizely'];
  const ads = ['adsystem', 'adservice', 'syndication', 'doubleclick', 'adnxs', 'criteo', 'taboola', 'outbrain', 'pubmatic', 'moat'];
  const social = ['facebook', 'twitter', 'linkedin', 'pinterest', 'tiktok'];
  
  const lower = url.toLowerCase();
  if (trackers.some(t => lower.includes(t))) return 'tracker';
  if (ads.some(a => lower.includes(a))) return 'ad';
  if (social.some(s => lower.includes(s))) return 'social';
  return 'other';
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch { return url; }
}

// Listen for rule-matched events (Chrome MV3)
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const { request, rule } = info;
    const tabId = request.tabId;
    if (tabId < 0) return;

    const entry = {
      url: request.url,
      domain: getDomain(request.url),
      type: request.type,
      category: categorize(request.url),
      ruleId: rule.ruleId,
      rulesetId: rule.rulesetId,
      timestamp: Date.now(),
      frameUrl: request.documentUrl || '',
    };

    if (!blockLog.has(tabId)) blockLog.set(tabId, []);
    const log = blockLog.get(tabId);
    log.unshift(entry);
    if (log.length > 500) log.pop();

    // Update stats
    if (!tabStats.has(tabId)) tabStats.set(tabId, { blocked: 0, trackers: 0, ads: 0, social: 0, other: 0 });
    const stats = tabStats.get(tabId);
    stats.blocked++;
    stats[entry.category] = (stats[entry.category] || 0) + 1;

    // Notify popup if open
    chrome.runtime.sendMessage({ type: 'NEW_BLOCK', tabId, entry, stats }).catch(() => {});
  });
}

// Tab navigation — clear logs on new page load
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    blockLog.set(details.tabId, []);
    tabStats.set(details.tabId, { blocked: 0, trackers: 0, ads: 0, social: 0, other: 0 });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  blockLog.delete(tabId);
  tabStats.delete(tabId);
});

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_LOG') {
    const tabId = msg.tabId;
    sendResponse({
      log: blockLog.get(tabId) || [],
      stats: tabStats.get(tabId) || { blocked: 0, trackers: 0, ads: 0, social: 0, other: 0 }
    });
    return true;
  }

  if (msg.type === 'GET_OVERRIDES') {
    const overrides = {};
    domainOverrides.forEach((v, k) => { overrides[k] = v; });
    sendResponse({ overrides });
    return true;
  }

  if (msg.type === 'SET_DOMAIN_OVERRIDE') {
    const { domain, mode } = msg;
    if (mode === 'reset') {
      domainOverrides.delete(domain);
    } else {
      domainOverrides.set(domain, mode);
    }
    applyDomainOverrides();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'EXPORT_REPORT') {
    const tabId = msg.tabId;
    const log = blockLog.get(tabId) || [];
    const stats = tabStats.get(tabId) || {};
    sendResponse({ log, stats });
    return true;
  }

  if (msg.type === 'TOGGLE_EXTENSION') {
    chrome.storage.local.set({ enabled: msg.enabled });
    updateExtensionState(msg.enabled);
    sendResponse({ ok: true });
    return true;
  }
  
  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['enabled', 'devMode'], (data) => {
      sendResponse({ 
        enabled: data.enabled !== false, 
        devMode: data.devMode === true 
      });
    });
    return true;
  }

  if (msg.type === 'SET_DEV_MODE') {
    chrome.storage.local.set({ devMode: msg.enabled });
    sendResponse({ ok: true });
    return true;
  }
});

async function applyDomainOverrides() {
  // Build dynamic rules for domain allow/block overrides
  // Remove existing override rules first (IDs 10000+)
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const toRemove = existingRules.filter(r => r.id >= 10000).map(r => r.id);
  
  const toAdd = [];
  let ruleId = 10000;
  
  domainOverrides.forEach((mode, domain) => {
    if (mode === 'allow') {
      toAdd.push({
        id: ruleId++,
        priority: 100, // Higher than block rules
        action: { type: 'allow' },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'beacon', 'font', 'media', 'object', 'other', 'stylesheet', 'websocket', 'main_frame']
        }
      });
    } else if (mode === 'block') {
      toAdd.push({
        id: ruleId++,
        priority: 100,
        action: { type: 'block' },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'beacon', 'font', 'media', 'object', 'other', 'stylesheet', 'websocket']
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

// Auto-whitelist localhost/staging on install
chrome.runtime.onInstalled.addListener(async () => {
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

// ─── Persistence across service worker restarts ───

// Restore domain overrides on startup
chrome.storage.local.get(['domainOverrides', 'enabled'], async (data) => {
  if (data.domainOverrides) {
    Object.entries(data.domainOverrides).forEach(([k, v]) => domainOverrides.set(k, v));
  }
  // Always ensure localhost is allowed
  ['localhost', '127.0.0.1', '0.0.0.0'].forEach(d => {
    if (!domainOverrides.has(d)) domainOverrides.set(d, 'allow');
  });
  await applyDomainOverrides();
  if (data.enabled === false) await updateExtensionState(false);
});

// Persist overrides after each change
const _origApply = applyDomainOverrides;
// Intercept via a second listener that runs after the main one
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_DOMAIN_OVERRIDE') {
    setTimeout(() => {
      chrome.storage.local.set({ domainOverrides: Object.fromEntries(domainOverrides) });
    }, 150);
  }
});
