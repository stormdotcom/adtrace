# AdTrace — Surgical Ad Blocker for Developers

> DevTools-level visibility into every blocked request. See exactly which rule fired, from which list, and why — with one-click overrides, tracker graph visualization, and full export reports. Built for web developers who need to understand the ad layer, not just block it.

## What is AdTrace?

AdTrace is a Chrome/Firefox extension that combines ad blocking with deep request-level tracing. Unlike traditional ad blockers that silently block requests in the background, AdTrace gives you full transparency into what's happening:

- **Every blocked request is attributed** — you see the exact filter rule that matched, which list it came from (EasyList, EasyPrivacy, Social, Custom), and the intent classification (ad-network, analytics, session-replay, fingerprinting, crypto-miner, payment-sdk, cdn, social).
- **False positive detection** — AdTrace automatically flags blocked requests that might break page functionality (payment SDKs like Stripe/PayPal, auth providers like Auth0/Clerk, essential CDNs, font services). These show up as warnings so you can whitelist them with one click.
- **No servers, no telemetry, no accounts** — everything runs 100% locally in your browser. Your browsing data never leaves your machine.

## Features

### Popup Panel
The popup gives you a quick overview of the current page's blocking activity without leaving the page.

- **Live stats** — blocked count, tracker count, ad count, social pixel count, and estimated time saved
- **Request log** — scrollable feed of every blocked request with URL, resource type, rule attribution, intent classification, and timestamp
- **Category filters** — filter the log by Ads, Trackers, Social, or Warnings (false positives)
- **Domain overrides** — one-click Allow/Block per domain; localhost and 127.0.0.1 are auto-whitelisted
- **Custom rules editor** — write network filter rules (AdBlock/uBlock syntax) and cosmetic CSS hide rules with instant apply
- **Block report** — aggregate view of all blocked domains with counts; export as JSON or CSV for client audits
- **Simulate User View** — toggle to see the page as a regular user would (with all ads visible)
- **Master toggle** — enable/disable all blocking with one switch

### DevTools Panel
Open Chrome DevTools and find the "AdTrace" panel for the full developer experience.

- **Request table** — sortable grid of every blocked request with columns for URL, Type, Rule, Intent, Category, and Time. Click any row for full detail.
- **Detail pane** — side panel showing the full URL, rule card (rule ID, filter pattern, list source, description), intent classification, false positive warnings, and action buttons (Allow Domain, Block Domain, Copy URL)
- **Timeline view** — real-time waterfall of all requests (blocked + allowed) with timing bars, status labels, and resource type. See the request flow as it happens.
- **Tracker Graph** — interactive canvas visualization of the data flow chain. The page domain sits at the center with edges connecting to every tracker/ad domain, colored by category. See how trackers chain together and where your data is going.
- **Mini timeline** — compact 60-second sparkline in the toolbar showing blocking activity over time
- **Filter bar** — filter by category (Ads, Trackers, Social, Other, Warnings) and search by URL, domain, or intent keyword
- **Dev Overlay** — toggle to show blocked ad elements directly on the page with cyan outlines and "ADTRACE BLOCKED" badges instead of hiding them
- **Simulate User** — see the page without any blocking applied

### Content Script (On-Page Features)

- **Cosmetic filtering** — automatically hides ad elements using CSS selectors matching common ad containers (Google Ads, DoubleClick iframes, Taboola, Outbrain, Carbon Ads, etc.) plus any custom cosmetic rules you define
- **Click-to-Explain** — in Dev Mode, click any blocked element on the page to see a floating overlay explaining exactly why it was blocked (cosmetic rule match, network rule match, list source, intent, false positive warning)
- **Inspect Mode** — activated from the popup or DevTools panel. Hover over any element to see a dashed highlight, then click to get the full blocking explanation. Press Escape to cancel.
- **MutationObserver** — watches for dynamically injected ad elements and hides them in real time
- **Toast notifications** — non-intrusive notifications for actions like "Allowed example.com" or "Inspect mode: Click any element"

### Context Menu Integration

Right-click on any page, link, image, or iframe to access AdTrace actions:

- **Allow Once (this session)** — temporarily allow a domain until navigation
- **Allow on This Domain** — persistently allow a domain
- **Allow Permanently** — add to the permanent whitelist
- **Add to Custom Blocklist** — block a domain with a custom dynamic rule
- **Inspect Element Blocking** — enter inspect mode to click-to-explain

### Rule System

AdTrace uses Chrome's `declarativeNetRequest` API (Manifest V3) with a built-in ruleset covering 36+ rules across three lists:

| List | Coverage |
|------|----------|
| **EasyList** | Google DoubleClick, AdSense, AdServices, Amazon Ads, Outbrain, Taboola, AppNexus, Criteo, Moat, PubMatic, Rubicon, OpenX, Index Exchange, Casale Media, Yieldmo, Sovrn |
| **EasyPrivacy** | Google Analytics, Hotjar, Segment, Mixpanel, Intercom, Amplitude, FullStory, LogRocket, Microsoft Clarity, New Relic, Datadog |
| **Social** | Facebook Pixel, Facebook Events SDK, Twitter Ads, LinkedIn Insights, TikTok Pixel, Pinterest Tag |

Custom rules support:
- **Network rules** — AdBlock/uBlock syntax (`||domain.com^`, `||url.com/path$type`)
- **Cosmetic rules** — CSS selector hiding (`##.ad-banner`, `example.com##.promoted-post`)
- Rules are persisted in `chrome.storage.local` and survive browser restarts

### Intent Classification Engine

Every request (blocked or allowed) is classified by intent using a domain database + URL pattern heuristics:

| Intent | Examples |
|--------|----------|
| `ad-network` | doubleclick.net, googlesyndication.com, criteo.com, taboola.com |
| `analytics` | analytics.google.com, segment.io, mixpanel.com, amplitude.com |
| `session-replay` | hotjar.com, fullstory.com, logrocket.com, clarity.ms |
| `fingerprinting` | fingerprintjs.com, fpjs.io, threatmetrix.com |
| `crypto-miner` | coinhive.com, crypto-loot.com, jsecoin.com |
| `payment-sdk` | js.stripe.com, paypal.com, braintreegateway.com |
| `cdn` | cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com |
| `social` | connect.facebook.net, platform.twitter.com, platform.linkedin.com |

### False Positive Detection

AdTrace maintains a database of domains that commonly break pages when blocked:

- **Payment providers** — Stripe, PayPal, Braintree, Square, Adyen, Recurly, Razorpay
- **Auth providers** — Google Accounts, Microsoft Login, Auth0, Clerk, Supabase, Firebase Auth
- **Font services** — Google Fonts, Adobe Typekit, Font Awesome
- **App monitoring** — Sentry, Bugsnag, Datadog, New Relic, Rollbar
- **Essential CDNs** — Cloudflare CDNJS, jsDelivr, unpkg, Google Ajax APIs

When a blocked request matches a false positive domain, AdTrace shows a warning bar in the popup and DevTools panel with the count of potentially page-breaking blocks.

### Export & Reporting

- **JSON export** — full structured report with all blocked requests, stats, rule attributions, and tracker graph data
- **CSV export** — tabular format for spreadsheet analysis
- Reports include: page URL, total blocked count, per-category breakdown, estimated time saved, and per-domain block counts

## Install

### Chrome

1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked**
4. Select the `adtrace/` folder

### Firefox

1. Go to `about:debugging`
2. Click **This Firefox** > **Load Temporary Add-on**
3. Select `manifest.json` from the `adtrace/` folder

> For permanent Firefox install, submit to AMO or self-sign as `.xpi`

## Tech Stack

- **Manifest V3** — uses the modern Chrome extension platform
- **Vanilla JS** — no build step, no dependencies, no node_modules
- **declarativeNetRequest** — efficient native blocking without `webRequest/blocking`
- **Google Sans + Roboto Mono** — clean Google-style typography
- **Material Icons Outlined** — consistent iconography across popup and site
- **Zero external dependencies** — the entire extension is self-contained

## Browser Compatibility

| Feature | Chrome | Firefox 113+ |
|---------|--------|-------------|
| Ad blocking (declarativeNetRequest) | Full | Full |
| Block logging (onRuleMatchedDebug) | Full | Developer Edition / Nightly only |
| Cosmetic filtering | Full | Full |
| Context menus | Full | Full |
| DevTools panel | Full | Full |
| Custom dynamic rules | Full | Full |

The only Chrome-specific API is `declarativeNetRequest.onRuleMatchedDebug` for debug logging — this degrades gracefully on Firefox stable (blocking still works, but the request log won't populate).

## Privacy

AdTrace collects **zero data**. No telemetry, no analytics, no tracking pixels, no server communication. All blocking logic, rule matching, intent classification, and report generation happen locally in your browser. Custom rules and domain overrides are stored in `chrome.storage.local` and never leave your machine.

See the full [Privacy Policy](site/privacy.html).

## License

Open source. See repository for license details.
