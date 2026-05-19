# Mobile deployment guide

The app supports three mobile options:

| Option | Best for | App store? |
|--------|----------|------------|
| **PWA** (install from browser) | Fastest, same hosted URL | No |
| **Capacitor** (native shell) | App Store / Play Store | Yes |
| **Mobile browser** | Testing | No |

## 1. Deploy the backend first

Mobile clients need a **public HTTPS URL** that serves both the UI and `/api/*` routes (e.g. Render, Railway, Fly.io).

Example: `https://ai-travel-assistant.onrender.com`

Set environment variables on the host:

- `ANTHROPIC_API_KEY`
- `SERPAPI_KEY`
- `PORT` (often provided by the platform)

## 2. PWA — Add to Home Screen

1. Deploy the full project (Express serves `public/` + API).
2. Open the site on your phone in **Chrome** (Android) or **Safari** (iOS).
3. Use **Install app** / **Add to Home Screen**.

The UI includes a manifest and service worker for offline shell caching (API calls still need network).

### iOS Safari

Share → **Add to Home Screen**

### Android Chrome

Menu → **Install app** (or use the in-app banner)

## 3. Capacitor — Native iOS / Android app

### Prerequisites

- Node 18+
- **Android:** Android Studio
- **iOS:** Xcode (macOS only)

### Setup (one time)

```bash
npm install
npx cap add android   # optional
npx cap add ios       # optional, macOS only
```

### Point the app at your API

**Option A — Recommended:** Load the live site in the WebView (simplest)

Edit `capacitor.config.json`:

```json
{
  "server": {
    "url": "https://YOUR-DEPLOYED-URL.com",
    "cleartext": true
  }
}
```

Then:

```bash
npx cap sync
npx cap open android
# or
npx cap open ios
```

**Option B:** Bundle `public/` and set API base in HTML

In `public/index.html`:

```html
<meta name="api-base" content="https://YOUR-DEPLOYED-URL.com" />
```

```bash
npx cap sync
npx cap open android
```

### Build for stores

- **Android:** Android Studio → Build → Generate signed bundle/APK  
- **iOS:** Xcode → Archive → Distribute to App Store Connect  

Update `appId` in `capacitor.config.json` before publishing.

## 4. Test mobile UI locally

```bash
npm start
```

On your phone (same Wi‑Fi), open `http://<your-computer-ip>:3000`  
Use Chrome DevTools remote debugging to inspect layout.

## Mobile UI features

- Full-height chat layout (`100dvh`) with safe areas for notched phones
- Sticky message composer above the home indicator
- 44px touch targets
- Horizontally scrollable agent badges
- Collapsible status panel (⋯ button) on small screens
- 16px input font (prevents iOS zoom on focus)
