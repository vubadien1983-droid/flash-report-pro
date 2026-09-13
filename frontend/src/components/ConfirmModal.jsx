import React from 'react';
import { AlertTriangle, X, Check } from 'lucide-react';

/**
 * A yes/no prompt for the actions that change the plan's shape — adding a
 * row, deleting a row, deleting a whole equipment.
 *
 * It exists because those three controls sit inside a 500-row table where the
 * next equipment's buttons are a few pixels away: a mis-aimed click used to
 * silently add or remove work from a live plan, and there was nothing on
 * screen afterwards to say which equipment it happened to. The message always
 * NAMES the equipment, so the answer to "did I click the right one?" is in
 * the question.
 *
 * Deliberately not `window.confirm`: a native dialog blocks the whole page,
 * cannot say which equipment in a readable way, and is dismissed by the same
 * reflex that caused the mis-click.
 */
export default function ConfirmModal({
  isOpen,
  title = 'Please confirm',
  message,
  confirmLabel = 'Yes, do it',
  cancelLabel = 'Cancel',
  tone = 'brand',          // 'brand' | 'danger'
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const confirmCls = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-brand-600 hover:bg-brand-700';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md ${
              tone === 'danger' ? 'bg-rose-600' : 'bg-brand-600'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">{message}</p>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 text-[13px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-bold text-white rounded-xl transition-colors ${confirmCls}`}
          >
            <Check className="w-4 h-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
