/**
 * Cloud storage of the OPS weekly MoMs (v3.32.0):
 * shared_reports/{shareId}/moms/{momId}, one document per ISO week.
 * Live (onSnapshot) so two people with the master password see the same list.
 */
import {
  isFirebaseConfigured, sharedMomsCollection, sharedMomDoc,
  onSnapshot, setDoc, deleteDoc,
} from './firebase';
import { withTimeout } from './imageCompression';
import { sortMoms } from './opsMom';

const WRITE_TIMEOUT_MS = 30_000;

/** Firestore refuses `undefined` anywhere in a document. */
function clean(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/** @returns {() => void} unsubscribe */
export function subscribeMoms(shareId, onData, onError) {
  if (!isFirebaseConfigured || !shareId) {
    setTimeout(() => onError?.(new Error('Cloud is not configured for this build.')), 0);
    return () => {};
  }
  return onSnapshot(
    sharedMomsCollection(shareId),
    (snap) => onData(sortMoms(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
    (err) => { console.warn('MoM listener error:', err.message); onError?.(err); },
  );
}

export async function saveMom(shareId, mom) {
  if (!isFirebaseConfigured) throw new Error('Cloud is not configured.');
  await withTimeout(setDoc(sharedMomDoc(shareId, mom.id), clean(mom)), WRITE_TIMEOUT_MS, 'Saving the MoM');
}

export async function deleteMom(shareId, momId) {
  if (!isFirebaseConfigured) throw new Error('Cloud is not configured.');
  await withTimeout(deleteDoc(sharedMomDoc(shareId, momId)), WRITE_TIMEOUT_MS, 'Deleting the MoM');
}
