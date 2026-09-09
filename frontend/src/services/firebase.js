/**
 * Firebase Client — Single source of truth for Firebase connection.
 *
 * Configure via environment variables (all start with VITE_FIREBASE_):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * When all are set, cloud operations go through Firebase.
 * When missing, the app falls back to the legacy restful-api.dev backend.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, getDoc, getDocs,
  setDoc, deleteDoc, writeBatch, query, orderBy, limit,
  serverTimestamp, onSnapshot
} from 'firebase/firestore';
import {
  getStorage, ref, uploadBytes, getDownloadURL,
  deleteObject, listAll
} from 'firebase/storage';

// ─── Config from env ─────────────────────────────────────────────

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.storageBucket
);

// ─── Initialize ──────────────────────────────────────────────────

let app = null;
let db = null;
let storage = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { db, storage };
export default app;

// ─── Firestore Helpers ───────────────────────────────────────────

const REPORTS_COLLECTION = 'reports';
const PHOTOS_SUBCOLLECTION = 'photos';
const SHARED_COLLECTION = 'shared_reports';

export function reportsCollection() {
  return collection(db, REPORTS_COLLECTION);
}

export function reportDoc(id) {
  return doc(db, REPORTS_COLLECTION, id);
}

/**
 * Photos live in a SUBCOLLECTION so each image gets its own 1MB document
 * budget. This is what makes photo storage work on the free Spark plan
 * without Firebase Storage (which requires Blaze).
 *
 *   reports/{reportId}/photos/{photoKey}  →  { url: <base64>, ... }
 */
export function reportPhotosCollection(reportId) {
  return collection(db, REPORTS_COLLECTION, reportId, PHOTOS_SUBCOLLECTION);
}

export function reportPhotoDoc(reportId, photoKey) {
  return doc(db, REPORTS_COLLECTION, reportId, PHOTOS_SUBCOLLECTION, photoKey);
}

/** Deterministic key for a photo slot so re-saves overwrite in place. */
export function photoKey(itemId, slotIndex) {
  const safeItem = String(itemId || 'item').replace(/[^A-Za-z0-9_-]/g, '_');
  return `${safeItem}__s${slotIndex}`;
}

// ─── Shared (public-read) reports ────────────────────────────────

export function sharedCollection() {
  return collection(db, SHARED_COLLECTION);
}

export function sharedDoc(shareId) {
  return doc(db, SHARED_COLLECTION, shareId);
}

export function sharedPhotosCollection(shareId) {
  return collection(db, SHARED_COLLECTION, shareId, PHOTOS_SUBCOLLECTION);
}

export function sharedPhotoDoc(shareId, key) {
  return doc(db, SHARED_COLLECTION, shareId, PHOTOS_SUBCOLLECTION, key);
}

// Re-export Firestore functions for api.js to use
export {
  getDoc, getDocs, setDoc, deleteDoc, writeBatch,
  query, orderBy, limit, serverTimestamp, onSnapshot,
  ref, uploadBytes, getDownloadURL, deleteObject, listAll
};

// ─── Photo Storage Helpers ────────────────────────────────────────

const PHOTO_PATH_PREFIX = 'report-photos';

/**
 * Upload a photo blob to Firebase Storage.
 * @param {Blob} blob - Image blob
 * @param {string} reportId - Parent report ID
 * @param {string} itemId - Parent item ID
 * @param {number} slotIndex - Photo slot index
 * @returns {Promise<string|null>} Download URL or null on failure
 */
export async function uploadPhotoToStorage(blob, reportId, itemId, slotIndex = 0) {
  if (!isFirebaseConfigured || !storage) return null;

  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${PHOTO_PATH_PREFIX}/${reportId}/${itemId}_s${slotIndex}_${Date.now()}.${ext}`;

  try {
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: blob.type,
      cacheControl: 'public, max-age=31536000',
    });
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (e) {
    console.warn('Firebase photo upload error:', e.message);
    return null;
  }
}

/**
 * Delete all photos for a report from Firebase Storage.
 */
export async function deleteReportPhotos(reportId) {
  if (!isFirebaseConfigured || !storage) return;

  try {
    const folderRef = ref(storage, `${PHOTO_PATH_PREFIX}/${reportId}`);
    const result = await listAll(folderRef);
    const deletePromises = result.items.map((itemRef) => deleteObject(itemRef));
    await Promise.all(deletePromises);
  } catch (e) {
    // Folder may not exist — that's fine
    console.warn('Firebase photo cleanup:', e.message);
  }
}

/**
 * Delete a single photo from Firebase Storage by its download URL.
 */
export async function deletePhotoFromStorage(downloadUrl) {
  if (!isFirebaseConfigured || !storage || !downloadUrl) return;

  try {
    // Firebase download URLs contain the path encoded
    // Extract the path between /o/ and ?
    const match = downloadUrl.match(/\/o\/(.+?)\?/);
    if (!match) return;
    const path = decodeURIComponent(match[1]);
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (e) {
    console.warn('Firebase photo delete error:', e.message);
  }
}

/**
 * Convert a base64 data URL to a Blob.
 */
export function base64ToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const raw = atob(parts[1]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}
