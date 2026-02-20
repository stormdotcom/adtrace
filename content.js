// AdTrace Content Script
// Cosmetic filtering, dev overlay, simulate-user mode, custom rules

(function() {
  'use strict';

  const COSMETIC_SELECTORS = [
    '[id*="google_ads"]', '[id*="doubleclick"]', '[class*="ad-banner"]',
    '[class*="advertisement"]', '[class*="ad-container"]', '[class*="ad-wrapper"]',
    '[data-ad-slot]', '[data-ad-client]', '[data-ad-unit]',
    'ins.adsbygoogle', '#carbonads', '.carbon-ads',
    '[id^="div-gpt-ad"]', '[id^="dfp-ad"]', '[id^="ad-slot-"]',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="amazon-adsystem"]', 'iframe[src*="adnxs.com"]',
    '[class*="taboola"]', '[class*="outbrain"]',
    '[id*="taboola"]', '[id*="outbrain"]',
    '.OUTBRAIN', '#taboola-below-article-thumbnails',
    '[class*="sponsored-content"]', '[class*="promoted-post"]',
    '[data-native-ad]', '[data-sponsored]',
    'amp-ad', 'amp-embed[type="taboola"]',
  ];

  let state = { enabled: true, devMode: false, simMode: false };
  let hiddenElements = new WeakSet();
  let hiddenList = []; // for iteration (WeakSet not iterable)
  let observer = null;
  let customCosmeticRules = [];

  // ─── Cosmetic hide ───
  function applyCosmetic(selectors) {
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!hiddenList.includes(el)) {
            hiddenList.push(el);
            el.dataset.adtraceHidden = '1';
          }
          if (!state.simMode && state.enabled) {
            el.style.setProperty('display', 'none', 'important');
            if (state.devMode) applyDevOverlayToElement(el);
          }
        });
      } catch(e) { /* invalid selector */ }
    });
  }

  function applyDevOverlayToElement(el) {
    el.style.removeProperty('display');
    el.style.setProperty('outline', '2px solid #00d4ff', 'important');
    el.style.setProperty('outline-offset', '-2px', 'important');
    el.style.setProperty('min-height', '20px', 'important');
    el.style.setProperty('min-width', '20px', 'important');
    el.style.setProperty('position', 'relative', 'important');

    if (!el.querySelector('[data-adtrace-badge]')) {
      const badge = document.createElement('span');
      badge.setAttribute('data-adtrace-badge', '1');
      badge.style.cssText = [
        'position:absolute!important', 'top:2px!important', 'left:2px!important',
        'background:#00d4ff!important', 'color:#070c18!important',
        'font:700 9px/1 "JetBrains Mono",monospace!important',
        'padding:2px 5px!important', 'z-index:2147483647!important',
        'pointer-events:none!important', 'border-radius:2px!important',
        'letter-spacing:.05em!important', 'text-transform:uppercase!important',
        'white-space:nowrap!important',
      ].join(';');
      badge.textContent = 'ADTRACE BLOCKED';
      try { el.appendChild(badge); } catch(e) {}
    }
  }

  function removeDevOverlay(el) {
    el.style.removeProperty('outline');
    el.style.removeProperty('outline-offset');
    el.style.removeProperty('min-height');
    el.style.removeProperty('min-width');
    const badge = el.querySelector('[data-adtrace-badge]');
    if (badge) badge.remove();
  }

  function hideAll() {
    const allSelectors = [...COSMETIC_SELECTORS, ...customCosmeticRules];
    applyCosmetic(allSelectors);
  }

  function showAll() {
    hiddenList.forEach(el => {
      el.style.removeProperty('display');
      removeDevOverlay(el);
    });
  }

  function applyDevMode(on) {
    hiddenList.forEach(el => {
      if (on) {
        applyDevOverlayToElement(el);
      } else {
        removeDevOverlay(el);
        if (state.enabled && !state.simMode) {
          el.style.setProperty('display', 'none', 'important');
        }
      }
    });
  }

  // ─── Init ───
  function initState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      state.enabled = response.enabled !== false;
      state.devMode = !!response.devMode;

      // Load custom cosmetic rules from storage
      chrome.storage.local.get(['customCosmeticRules'], (data) => {
        if (data.customCosmeticRules) {
          parseCosmeticRules(data.customCosmeticRules);
        }
        if (state.enabled) hideAll();
        if (state.devMode) applyDevMode(true);
      });
    });
  }

  function parseCosmeticRules(rulesText) {
    customCosmeticRules = [];
    rulesText.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('!') || line.startsWith('#')) return;
      // Global: ##.selector
      const global = line.match(/^##(.+)$/);
      if (global) { customCosmeticRules.push(global[1]); return; }
      // Domain-specific: example.com##.selector
      const domain = line.match(/^[^#]+##(.+)$/);
      if (domain) {
        try {
          const pageDomain = location.hostname;
          const ruleDomain = line.split('##')[0];
          if (pageDomain === ruleDomain || pageDomain.endsWith('.' + ruleDomain)) {
            customCosmeticRules.push(domain[1]);
          }
        } catch(e) {}
      }
    });
  }

  // ─── MutationObserver for dynamic ads ───
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (state.enabled && !state.simMode) {
        hideAll();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ─── Messages from popup / devpanel ───
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {

      case 'TOGGLE_DEV_MODE':
        state.devMode = !!msg.enabled;
        applyDevMode(state.devMode);
        break;

      case 'SIMULATE_USER':
        state.simMode = true;
        showAll();
        break;

      case 'SIMULATE_DEV':
        state.simMode = false;
        if (state.enabled) hideAll();
        if (state.devMode) applyDevMode(true);
        break;

      case 'RERUN_COSMETIC':
        hideAll();
        break;

      case 'APPLY_COSMETIC':
        if (msg.rules) {
          const lines = msg.rules.split('\n').map(l => l.trim()).filter(Boolean);
          lines.forEach(line => {
            const m = line.match(/^##(.+)$/) || line.match(/^[^#]+##(.+)$/);
            if (m) {
              customCosmeticRules.push(m[1]);
              applyCosmetic([m[1]]);
            }
          });
        }
        break;

      case 'HIGHLIGHT_ELEMENT':
        if (msg.url) {
          let found = false;
          const urlHostname = (() => { try { return new URL(msg.url).hostname; } catch(e) { return ''; } })();
          document.querySelectorAll('script[src], img[src], iframe[src], link[href]').forEach(el => {
            const src = el.src || el.href || '';
            if (src && (src.includes(urlHostname) || src === msg.url)) {
              found = true;
              el.style.setProperty('outline', '3px solid #f59e0b', 'important');
              el.style.setProperty('outline-offset', '2px', 'important');
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                el.style.removeProperty('outline');
                el.style.removeProperty('outline-offset');
              }, 3000);
            }
          });
          // Also check hidden elements
          hiddenList.forEach(el => {
            const src = el.src || el.href || el.dataset.src || '';
            if (src && src.includes(urlHostname)) {
              found = true;
              el.style.setProperty('outline', '3px solid #f59e0b', 'important');
              el.style.removeProperty('display');
              setTimeout(() => {
                el.style.setProperty('display', 'none', 'important');
                el.style.removeProperty('outline');
              }, 3000);
            }
          });
          sendResponse({ found });
        }
        break;
    }
  });

  // Boot
  initState();
  startObserver();
})();
