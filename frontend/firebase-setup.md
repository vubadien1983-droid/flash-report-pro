# Firebase Setup Guide — Flash Report Pro

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `flash-report-pro`)
3. Disable Google Analytics (optional, not needed)
4. Click **Create project**

## Step 2: Register Web App

1. In project overview, click the **Web** icon (`</>`)
2. App nickname: `Flash Report Pro`
3. Skip Firebase Hosting for now
4. Click **Register app**
5. Copy the config values into your `.env` file:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

## Step 3: Enable Firestore Database

1. Go to **Build → Firestore Database**
2. Click **Create database**
3. Choose location closest to you (e.g. `asia-southeast1` for Vietnam)
4. Start in **test mode** (open access for 30 days — we'll add auth rules in improvement #8)
5. Click **Enable**

### Firestore Security Rules (Test Mode)

These rules allow open read/write. Replace with auth-based rules in improvement #8.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reports/{reportId} {
      allow read, write: if true;
    }
  }
}
```

## Step 4: Enable Firebase Storage

1. Go to **Build → Storage**
2. Click **Get started**
3. Start in **test mode**
4. Choose the same location as Firestore
5. Click **Done**

### Storage Security Rules (Test Mode)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /report-photos/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### Storage CORS Configuration

To allow browser uploads, set CORS on your Storage bucket.
Install `gsutil` (comes with Google Cloud SDK), then run:

```bash
# Create cors.json
cat > cors.json << 'EOF'
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
EOF

# Apply to your bucket
gsutil cors set cors.json gs://your-project.firebasestorage.app
```

## Step 5: Install & Run

```bash
cd frontend
npm install
npm run dev
```

## Free Tier Limits (Spark Plan)

| Resource | Free Limit |
|----------|-----------|
| Firestore reads | 50,000/day |
| Firestore writes | 20,000/day |
| Firestore storage | 1 GB |
| Cloud Storage | 5 GB |
| Storage downloads | 1 GB/day |
| Storage uploads | 5 GB/day |

For a single-user inspection app, these limits are more than sufficient.

## Data Structure

Reports are stored as Firestore documents in the `reports` collection:

```
reports/
  {reportId}/
    title: string
    system_tag: string
    location: string
    inspection_date: string
    discipline: string
    items: array<Item>
    version: number
    updated_at: string (ISO 8601)
    created_at: string (ISO 8601)
```

Photos are stored in Firebase Storage under:

```
report-photos/
  {reportId}/
    {itemId}_s{slotIndex}_{timestamp}.jpg
```
