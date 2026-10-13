import React, { useState } from 'react';

export default function SetLockModal({ isOpen, onClose, onSave, currentType = 'pin' }) {
  const [lockType, setLockType] = useState(currentType); // 'pin' | 'password'
  const [secretVal, setSecretVal] = useState('');
  const [confirmVal, setConfirmVal] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (lockType === 'pin') {
      if (secretVal.length !== 4 || !/^\d{4}$/.test(secretVal)) {
        setError('PIN must be exactly 4 digits (0-9).');
        return;
      }
      if (secretVal !== confirmVal) {
        setError('PINs do not match. Please re-enter.');
        return;
      }
    } else {
      if (secretVal.trim().length < 4) {
        setError('Password must be at least 4 characters long.');
        return;
      }
      if (secretVal !== confirmVal) {
        setError('Passwords do not match. Please re-enter.');
        return;
      }
    }

    setIsSubmitting(true);
    onSave(lockType, secretVal.trim());
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[600] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Set Security Lock</h3>
              <p className="text-[10px] text-gray-400">Choose how to secure your app</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Lock Type Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-900/80 rounded-2xl border border-gray-800">
          <button
            type="button"
            onClick={() => {
              setLockType('pin');
              setSecretVal('');
              setConfirmVal('');
              setError('');
            }}
            className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              lockType === 'pin'
                ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            4-Digit PIN
          </button>

          <button
            type="button"
            onClick={() => {
              setLockType('password');
              setSecretVal('');
              setConfirmVal('');
              setError('');
            }}
            className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              lockType === 'password'
                ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Text Password
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {lockType === 'pin' ? (
            /* PIN INPUTS */
            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-gray-300 block mb-1">
                  Enter 4-Digit PIN:
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={secretVal}
                  onChange={(e) => setSecretVal(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full text-center tracking-[0.8em] text-2xl font-black py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white outline-none focus:border-teal-500 transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300 block mb-1">
                  Confirm 4-Digit PIN:
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmVal}
                  onChange={(e) => setConfirmVal(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full text-center tracking-[0.8em] text-2xl font-black py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white outline-none focus:border-teal-500 transition-colors"
                />
              </div>
            </div>
          ) : (
            /* PASSWORD INPUTS */
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-300">
                    New Password:
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSecret((p) => !p)}
                    className="text-[10px] text-teal-400 font-bold hover:underline cursor-pointer"
                  >
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={secretVal}
                  onChange={(e) => setSecretVal(e.target.value)}
                  placeholder="Enter secure password"
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white outline-none focus:border-teal-500 transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300 block mb-1">
                  Confirm Password:
                </label>
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={confirmVal}
                  onChange={(e) => setConfirmVal(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white outline-none focus:border-teal-500 transition-colors"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-[11px] font-bold text-red-400 text-center animate-shake">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold border border-gray-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !secretVal || !confirmVal}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-gray-950 text-xs font-black hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : 'Save & Enable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
