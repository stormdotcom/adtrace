// AdTrace Content Script
// Click-to-Explain overlay, cosmetic filtering, inspect mode, toast notifications

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
  let hiddenList = [];
  let cosmeticMatches = new WeakMap(); // element -> { selector, source }
  let observer = null;
  let customCosmeticRules = [];
  let inspectMode = false;
  let inspectOverlay = null;
  let explainOverlay = null;

  // ─── Cosmetic hide ───
  function applyCosmetic(selectors, source) {
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!hiddenList.includes(el)) {
            hiddenList.push(el);
            el.dataset.adtraceHidden = '1';
            cosmeticMatches.set(el, { selector: sel, source: source || 'builtin' });
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
    applyCosmetic(COSMETIC_SELECTORS, 'EasyList');
    if (customCosmeticRules.length > 0) {
      applyCosmetic(customCosmeticRules, 'Custom');
    }
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

  // ─── Click-to-Explain Overlay ───
  function createExplainOverlay(el, info) {
    removeExplainOverlay();

    const rect = el.getBoundingClientRect();
    const match = cosmeticMatches.get(el);

    explainOverlay = document.createElement('div');
    explainOverlay.setAttribute('data-adtrace-explain', '1');

    // Position below the element
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;

    // Ensure it doesn't go off-screen
    if (left + 340 > window.innerWidth) left = window.innerWidth - 350;
    if (left < 10) left = 10;
    if (top + 200 > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - 200;
    }

    explainOverlay.style.cssText = `
      position: absolute !important;
      top: ${top}px !important;
      left: ${left}px !important;
      width: 330px !important;
      background: #080d1a !important;
      border: 1px solid #00d4ff !important;
      border-radius: 6px !important;
      padding: 0 !important;
      z-index: 2147483647 !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 11px !important;
      color: #e2e8f0 !important;
      box-shadow: 0 8px 32px rgba(0,0,0,.6), 0 0 0 1px rgba(0,212,255,.2) !important;
      pointer-events: auto !important;
      line-height: 1.5 !important;
    `;

    // Highlight the element
    el.style.setProperty('outline', '2px solid #00d4ff', 'important');
    el.style.setProperty('outline-offset', '2px', 'important');

    let rulesHtml = '';

    if (match) {
      rulesHtml += `
        <div style="padding:10px 12px; border-bottom: 1px solid #1e2d4a;">
          <div style="font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:#64748b; margin-bottom:4px;">Cosmetic Rule Match</div>
          <div style="background:#0f192e; border-left:2px solid #00d4ff; padding:4px 8px; border-radius:2px; color:#00d4ff; word-break:break-all;">${escapeHtml(match.selector)}</div>
          <div style="margin-top:4px; font-size:10px; color:#64748b;">List: <span style="color:#f59e0b;">${match.source}</span></div>
        </div>`;
    }

    if (info && info.matches && info.matches.length > 0) {
      info.matches.forEach(m => {
        rulesHtml += `
          <div style="padding:10px 12px; border-bottom: 1px solid #1e2d4a;">
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:#64748b; margin-bottom:4px;">Network Rule Match</div>
            <div style="background:#0f192e; border-left:2px solid #00d4ff; padding:4px 8px; border-radius:2px; color:#00d4ff; word-break:break-all;">${escapeHtml(m.filter || 'Rule #' + m.ruleId)}</div>
            <div style="margin-top:4px; font-size:10px; color:#64748b;">
              List: <span style="color:#f59e0b;">${m.list || 'Unknown'}</span> |
              Intent: <span style="color:#a78bfa;">${m.intent || 'unknown'}</span>
            </div>
            ${m.falsePositive ? `<div style="margin-top:4px; padding:3px 6px; background:#f59e0b22; border:1px solid #f59e0b44; border-radius:3px; color:#f59e0b; font-size:10px;">Warning: Likely Breakage (${m.fpReason})</div>` : ''}
          </div>`;
      });
    }

    if (!match && (!info || !info.matches || info.matches.length === 0)) {
      rulesHtml = `
        <div style="padding:10px 12px; color:#64748b; text-align:center;">
          No blocking rules matched this element.
        </div>`;
    }

    // Action buttons
    const domain = getDomainFromElement(el);
    const actionsHtml = `
      <div style="padding:8px 12px; display:flex; gap:6px; border-top: 1px solid #1e2d4a;">
        <button data-action="allow-domain" data-domain="${domain}" style="flex:1; padding:5px; background:#2dce7d22; border:1px solid #2dce7d44; border-radius:3px; color:#2dce7d; font-family:inherit; font-size:10px; cursor:pointer; text-transform:uppercase; letter-spacing:.05em;">Allow Domain</button>
        <button data-action="block-domain" data-domain="${domain}" style="flex:1; padding:5px; background:#ff475722; border:1px solid #ff475744; border-radius:3px; color:#ff4757; font-family:inherit; font-size:10px; cursor:pointer; text-transform:uppercase; letter-spacing:.05em;">Block Domain</button>
        <button data-action="close" style="padding:5px 10px; background:transparent; border:1px solid #1e2d4a; border-radius:3px; color:#64748b; font-family:inherit; font-size:10px; cursor:pointer;">Close</button>
      </div>`;

    explainOverlay.innerHTML = `
      <div style="padding:8px 12px; background:#0d1528; border-bottom:1px solid #1e2d4a; border-radius:6px 6px 0 0; display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#00d4ff;">AdTrace Explain</span>
        <span style="font-size:9px; color:#64748b;">${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0,2).join('.') : ''}</span>
      </div>
      ${rulesHtml}
      ${actionsHtml}
    `;

    document.body.appendChild(explainOverlay);

    // Bind action buttons
    explainOverlay.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const action = btn.dataset.action;
        if (action === 'close') {
          removeExplainOverlay();
          el.style.removeProperty('outline');
          el.style.removeProperty('outline-offset');
        } else if (action === 'allow-domain') {
          chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain: btn.dataset.domain, mode: 'allow' });
          removeExplainOverlay();
          el.style.removeProperty('outline');
          el.style.removeProperty('outline-offset');
          showToast('Allowed ' + btn.dataset.domain);
        } else if (action === 'block-domain') {
          chrome.runtime.sendMessage({ type: 'SET_DOMAIN_OVERRIDE', domain: btn.dataset.domain, mode: 'block' });
          removeExplainOverlay();
          el.style.removeProperty('outline');
          el.style.removeProperty('outline-offset');
          showToast('Blocked ' + btn.dataset.domain);
        }
      });
    });
  }

  function removeExplainOverlay() {
    if (explainOverlay) {
      explainOverlay.remove();
      explainOverlay = null;
    }
  }

  function getDomainFromElement(el) {
    const src = el.src || el.href || el.dataset.src || '';
    if (src) {
      try { return new URL(src).hostname; } catch(e) {}
    }
    return location.hostname;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Inspect Mode (Click-to-Explain) ───
  function enterInspectMode() {
    if (inspectMode) return;
    inspectMode = true;

    showToast('Inspect mode: Click any element to see blocking info');

    // Create hover highlight overlay
    inspectOverlay = document.createElement('div');
    inspectOverlay.setAttribute('data-adtrace-inspect-overlay', '1');
    inspectOverlay.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
      border: 2px dashed #00d4ff !important;
      background: rgba(0,212,255,0.05) !important;
      transition: all .08s ease-out !important;
      display: none !important;
    `;
    document.body.appendChild(inspectOverlay);

    document.addEventListener('mousemove', inspectMouseMove, true);
    document.addEventListener('click', inspectClick, true);
    document.addEventListener('keydown', inspectKeyDown, true);
  }

  function exitInspectMode() {
    inspectMode = false;
    if (inspectOverlay) {
      inspectOverlay.remove();
      inspectOverlay = null;
    }
    document.removeEventListener('mousemove', inspectMouseMove, true);
    document.removeEventListener('click', inspectClick, true);
    document.removeEventListener('keydown', inspectKeyDown, true);
  }

  function inspectMouseMove(e) {
    if (!inspectMode || !inspectOverlay) return;
    const el = e.target;
    if (el.hasAttribute('data-adtrace-explain') || el.hasAttribute('data-adtrace-inspect-overlay') || el.closest('[data-adtrace-explain]')) return;

    const rect = el.getBoundingClientRect();
    inspectOverlay.style.cssText = `
      position: fixed !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
      border: 2px dashed #00d4ff !important;
      background: rgba(0,212,255,0.05) !important;
      transition: all .08s ease-out !important;
      display: block !important;
      top: ${rect.top}px !important;
      left: ${rect.left}px !important;
      width: ${rect.width}px !important;
      height: ${rect.height}px !important;
    `;
  }

  function inspectClick(e) {
    if (!inspectMode) return;
    const el = e.target;
    if (el.hasAttribute('data-adtrace-explain') || el.closest('[data-adtrace-explain]')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Get blocking info for this element
    const src = el.src || el.href || el.dataset.src || '';

    if (src) {
      // Ask background for matching blocked entries
      chrome.runtime.sendMessage({ type: 'GET_ELEMENT_INFO', url: src }, (response) => {
        createExplainOverlay(el, response);
      });
    } else {
      // Check if it's a cosmetically hidden element
      createExplainOverlay(el, null);
    }

    exitInspectMode();
  }

  function inspectKeyDown(e) {
    if (e.key === 'Escape') {
      exitInspectMode();
      showToast('Inspect mode cancelled');
    }
  }

  // ─── Toast Notification ───
  function showToast(msg) {
    let toast = document.querySelector('[data-adtrace-toast]');
    if (!toast) {
      toast = document.createElement('div');
      toast.setAttribute('data-adtrace-toast', '1');
      toast.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        background: #080d1a !important;
        border: 1px solid #00d4ff !important;
        color: #00d4ff !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 11px !important;
        padding: 8px 14px !important;
        border-radius: 4px !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        transition: opacity .3s !important;
        box-shadow: 0 4px 16px rgba(0,0,0,.5) !important;
        text-transform: uppercase !important;
        letter-spacing: .05em !important;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  // ─── Init ───
  function initState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      state.enabled = response.enabled !== false;
      state.devMode = !!response.devMode;

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
      const global = line.match(/^##(.+)$/);
      if (global) { customCosmeticRules.push(global[1]); return; }
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

  // ─── Messages from popup / devpanel / background ───
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
              applyCosmetic([m[1]], 'Custom');
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

      case 'ENTER_INSPECT_MODE':
        enterInspectMode();
        break;

      case 'SHOW_TOAST':
        showToast(msg.message);
        break;
    }
  });

  // ─── Click-to-Explain: auto-attach to hidden elements in dev mode ───
  document.addEventListener('click', (e) => {
    if (inspectMode) return;
    if (!state.devMode) return;

    const el = e.target.closest('[data-adtrace-hidden]');
    if (!el) return;
    if (el.hasAttribute('data-adtrace-explain') || el.closest('[data-adtrace-explain]')) return;

    e.preventDefault();
    e.stopPropagation();

    const src = el.src || el.href || el.dataset.src || '';
    if (src) {
      chrome.runtime.sendMessage({ type: 'GET_ELEMENT_INFO', url: src }, (response) => {
        createExplainOverlay(el, response);
      });
    } else {
      createExplainOverlay(el, null);
    }
  }, true);

  // Close explain overlay on outside click
  document.addEventListener('click', (e) => {
    if (explainOverlay && !explainOverlay.contains(e.target) && !e.target.hasAttribute('data-adtrace-hidden')) {
      removeExplainOverlay();
      // Remove any leftover outlines
      document.querySelectorAll('[data-adtrace-hidden]').forEach(el => {
        if (!state.devMode) {
          el.style.removeProperty('outline');
          el.style.removeProperty('outline-offset');
        }
      });
    }
  });

  // Boot
  initState();
  startObserver();
})();
