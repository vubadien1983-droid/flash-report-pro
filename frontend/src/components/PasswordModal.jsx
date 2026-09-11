import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, ShieldCheck, AlertCircle } from 'lucide-react';

/**
 * Password prompt for the Mini Plan edit lock.
 *
 * Deliberately plain: one field, one button, and a message that says what
 * unlocking allows. It does not hint at the password, and it does not
 * distinguish "wrong password" from anything else.
 */
export default function PasswordModal({
  isOpen,
  title = 'Enter project password',
  message = 'Editing and sharing this plan are password protected.',
  onSubmit,      // (password) => boolean — true when accepted
  onClose,
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setError('');
      // Focus after the dialog paints, or the phone keyboard does not open.
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = (e) => {
    e.preventDefault();
    const ok = onSubmit ? onSubmit(value) : false;
    if (!ok) {
      setError('Incorrect password.');
      setValue('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm animate-fade-in">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200"
      >
        <div className="flex items-start justify-between mb-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white shadow-md">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500 leading-snug">{message}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
        <input
          ref={inputRef}
          type="password"
          value={value}
          autoComplete="current-password"
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          placeholder="••••••••••••"
          className="w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
        />

        {error && (
          <p className="mt-2 text-[11px] font-semibold text-rose-600 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm shadow-brand-600/30 transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
