# Flash Report Pro - Block B EPC#1

A high-performance, responsive application for creating, managing, and exporting professional **Flash Inspection Reports** on both **Laptops** and **Mobile Phones**.

---

## 🌟 Key Features

### 1. Dual Device Modes (Auto-Fit & Responsive)
- 💻 **Laptop / Desktop Mode**:
  - Resizable 2-panel layout with custom splitter.
  - 8-column spreadsheet table (`No | Tag | Description | Note | Photo 1 | Photo 2 | Photo 3 | Photo 4`).
  - Keyboard shortcuts (`Ctrl+S`, `Ctrl+N`, `Ctrl+V` clipboard paste).
- 📱 **Phone / Mobile Mode**:
  - Touch-friendly **Inspection Cards** with 2x2 Photo Grid.
  - Slide-out **Navigation Drawer** for managing reports.
  - Sticky bottom action bar for one-thumb access (`Save`, `Export Excel`, `Export PDF`).
- 🔄 **Quick Switcher**: Toggle between `[Auto | 💻 Laptop | 📱 Phone]` in the top header.

### 2. Camera & Photo Features on Mobile
- 📷 **Take Photo (Camera)**: Tap any photo slot to directly trigger your phone's rear camera for live site inspection photos.
- 🖼️ **Choose from Gallery**: Pick existing photos from your mobile device or laptop photo library.
- 📋 **Paste from Clipboard & Drag-and-Drop**: Supported on all platforms.
- 🔍 **Lightbox Zoom**: Tap any photo to inspect full-screen with original resolution.

### 3. Instant Multi-Format Export
- 📊 **Excel Export (.xlsx)**: Generates a perfectly formatted Excel sheet matching the official project template with photos scaled and embedded into columns E, F, G, H.
- 📄 **PDF Export (.pdf)**: Generates landscape A4 print-ready PDF with project headers and "Page X of Y" numbering.
- ⚡ **Direct Client-Side Export**: Both Excel and PDF can be exported **directly on your phone browser** without waiting for a server!

### 4. Zero-Cost Free Cloud Deployment (Vercel)
- Deployable to **Vercel** for 100% free with instant loading (< 0.5s) and zero cold starts.
- Works completely **Offline** via browser IndexedDB storage.
- When run locally on PC (`run_app.bat`), automatically connects to SQLite database and syncs with Google Drive.

---

## 🚀 How to Run Locally

1. Open folder: `g:\My Drive\Block B - EPC#1\Flash report\`
2. Double-click **`run_app.bat`**.
3. The app will open in your default browser at `http://localhost:8000`.

---

## 🌐 How to Deploy to Vercel (Free)

1. Push or import this folder to your GitHub / GitLab account.
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Select your repository.
4. Vercel will automatically detect the settings from `vercel.json`:
   - **Framework Preset**: Vite
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Output Directory**: `frontend/dist`
5. Click **"Deploy"**. Your live HTTPS link will be ready in under 1 minute!

---

## 📱 How to Install on Mobile Phone (PWA)

1. Open your deployed Vercel link on your phone (Safari on iOS or Chrome on Android).
2. Tap the **Share / Options** menu.
3. Select **"Add to Home Screen"** (*Thêm vào màn hình chính*).
4. The Flash Report app will now open as a standalone fullscreen app with offline support!


---

## Live App

https://flash-report.vercel.app

Cloud backend: Firebase Firestore (Spark plan). Photos are stored one per
document in a `photos` subcollection, so no Firebase Storage is required.
Share links resolve against the public-read `shared_reports` collection —
recipients open them without signing in, and the content refreshes on every
save.
