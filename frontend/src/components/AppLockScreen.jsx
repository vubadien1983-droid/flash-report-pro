import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, AlertCircle, Timer } from 'lucide-react';
import { unlockApp, cooldownRemaining, failedAttempts } from '../services/appLock';

/**
 * The screen that stands in front of the app.
 *
 * Deliberately plain and deliberately uninformative: one field, one button, no
 * hint at the password, and the same message whatever the reason for refusal.
 * It is NOT the small PasswordModal used for the Mini Plan edit lock — there is
 * nothing behind this one to look at, so a dialog floating over an empty page
 * would only suggest there is something to dismiss.
 *
 * After a few wrong tries the field cools down (the arithmetic lives in
 * services/appLock.js, so the penalty survives a reload). The countdown is
 * shown rather than hidden: somebody who knows the password should be able to
 * tell "wait" apart from "broken".
 */
export default function AppLockScreen({ onUnlocked }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(() => cooldownRemaining());
  const inputRef = useRef(null);

  // Focus after the first paint, or the phone keyboard does not open.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Tick the cooldown down. Only runs while there is one — an idle interval on
  // a lock screen that may sit open all night is worth not having.
  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setInterval(() => {
      const left = cooldownRemaining();
      setWait(left);
      if (left <= 0) {
        setError('');
        inputRef.current?.focus();
      }
    }, 500);
    return () => clearInterval(id);
  }, [wait]);

  const submit = (e) => {
    e.preventDefault();
    const res = unlockApp(value);
    if (res.ok) {
      setValue('');
      setError('');
      onUnlocked?.();
      return;
    }
    setValue('');
    setWait(res.wait);
    setError(res.wait > 0 ? '' : 'Incorrect password.');
    if (res.wait <= 0) inputRef.current?.focus();
  };

  const seconds = Math.ceil(wait / 1000);
  const locked = wait > 0;
  const fails = failedAttempts();

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4 bg-slate-900 font-sans">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-6"
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-white shadow-lg mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-base font-bold text-slate-900">Flash Report Pro</h1>
          <p className="text-[11px] font-semibold text-brand-600 tracking-wide">
            Block B &mdash; EPC#1
          </p>
          <p className="mt-2 text-xs text-slate-500 leading-snug">
            This app is password protected.
            <br />
            <span className="text-slate-400">Nhập mật khẩu để mở ứng dụng.</span>
          </p>
        </div>

        <label htmlFor="app-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Password
        </label>
        <input
          id="app-password"
          ref={inputRef}
          type="password"
          value={value}
          disabled={locked}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          placeholder="••••••••••"
          className="w-full text-sm text-slate-900 disabled:text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all disabled:bg-slate-100"
        />

        {error && (
          <p className="mt-2 text-[11px] font-semibold text-rose-600 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
            {fails > 1 && <span className="font-medium text-rose-400">({fails} attempts)</span>}
          </p>
        )}

        {locked && (
          <p className="mt-2 text-[11px] font-semibold text-amber-600 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" />
            Too many attempts. Try again in {seconds}s.
          </p>
        )}

        <button
          type="submit"
          disabled={locked}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 rounded-xl shadow-sm shadow-brand-600/30 transition-all"
        >
          <ShieldCheck className="w-4 h-4" />
          Open app
        </button>

        <p className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 leading-snug text-center">
          Shared report links and attachment links keep working without this
          password.
        </p>
      </form>
    </div>
  );
}
