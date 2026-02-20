# AdTrace — Dev-Mode Ad Blocker

> Surgical ad blocking with DevTools-level visibility. Built for web developers.

## Features

- **Block Log** — Live feed of every blocked request: URL, type, rule attribution, timestamp
- **Category Filtering** — Filter by Ads, Trackers, Social pixels, or all
- **Domain Overrides** — One-click allow/block per domain; localhost auto-whitelisted
- **Custom Rules** — Write network filter rules (AdBlock syntax) and cosmetic CSS rules with live apply
- **Dev Overlay** — Highlight blocked ad elements on the page with cyan outlines + badges
- **Simulate User View** — Toggle to see the page as a non-dev user would
- **Block Report** — Aggregate view of all blocked domains; export as JSON or CSV for client audits

## Install (Chrome)

1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked**
4. Select the `adtrace/` folder

## Install (Firefox)

1. Go to `about:debugging`
2. Click **This Firefox** → **Load Temporary Add-on**
3. Select `manifest.json` from the `adtrace/` folder

> For permanent Firefox install, submit to AMO or self-sign as .xpi

## Notes

- Full block logging requires Chrome (uses `onRuleMatchedDebug` which needs the extension loaded unpacked in Chrome, or Firefox Developer Edition / Nightly)
- Cosmetic rules are applied immediately via content script
- Network rules require page reload to take effect
- Custom rules are persisted in `chrome.storage.local`

## Firefox MV3 Compatibility

The codebase uses MV3 APIs supported by both Chrome and Firefox 113+:
- `declarativeNetRequest` for network blocking
- `chrome.storage.local` for persistence  
- `chrome.tabs` / `chrome.scripting` for tab interaction
- No Chrome-specific `chrome.webRequest` blocking API used

The only Chrome-only API used is `declarativeNetRequest.onRuleMatchedDebug` for debug logging — this degrades gracefully on Firefox stable (no log entries, but blocking still works).

## Tech Stack

- Manifest V3
- Vanilla JS (no build step required)
- declarativeNetRequest for blocking (no webRequest/blocking needed)
- Google Fonts (JetBrains Mono + Syne) for UI
