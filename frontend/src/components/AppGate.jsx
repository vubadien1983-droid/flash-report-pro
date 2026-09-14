import React, { useState, useEffect } from 'react';
import AppLockScreen from './AppLockScreen';
import { isAppUnlocked, isPublicRoute, onAppLockChange } from '../services/appLock';

/**
 * Stands in front of the whole app.
 *
 * It wraps <App/> in main.jsx rather than living inside it, and that placement
 * is the point: while the app is locked, <App/> is never MOUNTED, so no report
 * is read out of IndexedDB, no Firestore listener is opened and no title, tag
 * or photo is painted. A gate rendered inside App would have had to let every
 * one of its effects run first.
 *
 * Public links are let straight through — see isPublicRoute() in
 * services/appLock.js for why, and for the single definition of which routes
 * those are.
 *
 * The route is re-read on `hashchange`, so leaving a shared link for the app
 * itself (clearing the hash) drops into the lock screen instead of walking
 * into the data.
 */
export default function AppGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => isAppUnlocked());
  const [publicRoute, setPublicRoute] = useState(() => isPublicRoute());

  useEffect(() => {
    // Lock/unlock can happen anywhere (the header's Lock button, the lock
    // screen itself), so the gate listens rather than polls.
    const off = onAppLockChange(setUnlocked);
    const onHash = () => {
      setPublicRoute(isPublicRoute());
      setUnlocked(isAppUnlocked());
    };
    window.addEventListener('hashchange', onHash);
    // A second tab that was unlocked does not unlock this one (sessionStorage
    // is per tab), but coming back to a tab is the moment to re-read the truth.
    window.addEventListener('focus', onHash);
    return () => {
      off();
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('focus', onHash);
    };
  }, []);

  if (publicRoute || unlocked) return children;

  return <AppLockScreen onUnlocked={() => setUnlocked(true)} />;
}
