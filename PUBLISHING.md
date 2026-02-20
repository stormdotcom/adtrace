# Publishing AdTrace to the Web Stores

AdTrace is built with Manifest V3 and is compatible with both Chrome and Firefox (113+).

## 1. Prepare the Package

Create a `.zip` file of the `adtrace` directory. Ensure it contains:

- `manifest.json`
- All `.js`, `.html`, and `.css` files
- `icons/` folder with all PNG assets
- `rules/` folder with `adtrace_rules.json`

> [!IMPORTANT]
> Do NOT include `.git`, `.claude`, `site/`, or `.py` files in the final store package.

## 2. Chrome Web Store Publishing

1.  **Developer Console**: Go to [Chrome Web Store Dev Console](https://chrome.google.com/webstore/devconsole).
2.  **Registration**: Pay the one-time $5 developer fee if you haven't already.
3.  **New Item**: Click "New Item" and upload your `adtrace.zip`.
4.  **Store Listing**:
    - **Description**: Use the content from `uploadcontent.txt`.
    - **Category**: Developer Tools.
    - **Language**: English.
5.  **Privacy Tab**:
    - **Permission Justification**: See the table in `uploadcontent.txt`.
    - **Privacy Policy**: Link to your hosted privacy policy (e.g., `https://yourdomain.com/adtrace/privacy.html`).
6.  **Review**: Submit for review. This typically takes 1–3 business days.

## 3. Firefox (AMO) Publishing

1.  **Developer Hub**: Go to [AMO Developer Hub](https://addons.mozilla.org/developers/).
2.  **Submit Add-on**: Click "Submit a New Add-on".
3.  **Upload**: Upload the same `adtrace.zip`.
4.  **Compatibility**: Firefox handles MV3 `declarativeNetRequest` as-is.
5.  **Review**: Mozilla review is often faster but can be more strict about code quality.

## 4. Marketing Assets

You will need the following graphics for the best listing visibility:

- **Small Promo Tile**: 440 × 280 (Required)
- **Large Promo Tile**: 920 × 680
- **Marquee**: 1400 × 560
- **Screenshots**: At least 4 at 1280 × 800 or 640 × 400.

---

_AdTrace is a surgical tool. Ensure your screenshots highlight the DevTools integration as that is the core differentiator._
