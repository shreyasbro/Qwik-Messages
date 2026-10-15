import React, { useState, useEffect } from 'react';
import { googleRecoveryService } from '../services/googleRecoveryService';

export default function SetLockModal({ 
  isOpen, 
  onClose, 
  onSave, 
  currentType = 'pin',
  requireOldSecret = false,
  targetSecret = '',
  currentUser = null,
  userProfile = null,
  onRecoveryLinked = null,
}) {
  const [lockType, setLockType] = useState(currentType); // 'pin' | 'password'
  const [step, setStep] = useState(requireOldSecret && targetSecret ? 'verify_old' : 'set_new'); // 'verify_old' | 'set_new'
  const [oldSecretVal, setOldSecretVal] = useState('');
  const [secretVal, setSecretVal] = useState('');
  const [confirmVal, setConfirmVal] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showOldSecret, setShowOldSecret] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recovery modal and Google auth states
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [mismatchedUser, setMismatchedUser] = useState(null);
  const [linkingSuccess, setLinkingSuccess] = useState('');

  // Sync initial step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(requireOldSecret && targetSecret ? 'verify_old' : 'set_new');
      setLockType(currentType);
      setOldSecretVal('');
      setSecretVal('');
      setConfirmVal('');
      setError('');
      setShowRecoveryModal(false);
      setRecoveryLoading(false);
      setRecoveryError('');
      setMismatchedUser(null);
      setLinkingSuccess('');
    }
  }, [isOpen, requireOldSecret, targetSecret, currentType]);

  if (!isOpen) return null;

  const handleVerifyOld = (e) => {
    e.preventDefault();
    setError('');

    if (!oldSecretVal) {
      setError(`Please enter your current ${currentType === 'pin' ? '4-digit PIN' : 'Password'}.`);
      return;
    }

    if (oldSecretVal === targetSecret) {
      setError('');
      setStep('set_new');
    } else {
      setError(`Incorrect current ${currentType === 'pin' ? '4-digit PIN' : 'Password'}. Try again.`);
      setOldSecretVal('');
    }
  };

  const handleGoogleRecovery = async () => {
    setRecoveryError('');
    setRecoveryLoading(true);
    setMismatchedUser(null);

    try {
      const verifiedGoogleUser = await googleRecoveryService.authenticateGoogleAccount();
      const primaryUid = currentUser?.uid || userProfile?.uid;
      const primaryEmail = currentUser?.email || userProfile?.email;

      const ownershipResult = await googleRecoveryService.verifyAccountOwnership(
        verifiedGoogleUser,
        primaryUid,
        primaryEmail
      );

      if (ownershipResult.matches) {
        // MATCH: User identity verified! Advance to set new PIN/password
        setShowRecoveryModal(false);
        setStep('set_new');
        setError('');
      } else {
        // MISMATCH: Show explicit prompt per user requirements
        setMismatchedUser(verifiedGoogleUser);
      }
    } catch (err) {
      setRecoveryError(err?.message || 'Google account verification failed. Please try again.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleLinkAsRecoveryAccount = async () => {
    if (!mismatchedUser) return;
    setRecoveryLoading(true);
    setRecoveryError('');

    try {
      const primaryUid = currentUser?.uid || userProfile?.uid;
      const result = await googleRecoveryService.linkRecoveryGoogleAccount(primaryUid, mismatchedUser);
      setLinkingSuccess(`Successfully linked ${result.recoveryEmail} as your App Lock recovery account!`);
      if (typeof onRecoveryLinked === 'function') {
        onRecoveryLinked(result.recoveryEmail);
      }
      setTimeout(() => {
        setShowRecoveryModal(false);
        setMismatchedUser(null);
        setLinkingSuccess('');
      }, 2000);
    } catch (err) {
      setRecoveryError(err?.message || 'Failed to link Google account as recovery. Please try again.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');

    if (lockType === 'pin') {
      if (secretVal.length !== 4 || !/^\d{4}$/.test(secretVal)) {
        setError('New PIN must be exactly 4 digits (0-9).');
        return;
      }
      if (secretVal !== confirmVal) {
        setError('New PINs do not match. Please re-enter.');
        return;
      }
    } else {
      if (secretVal.trim().length < 4) {
        setError('New password must be at least 4 characters long.');
        return;
      }
      if (secretVal !== confirmVal) {
        setError('New passwords do not match. Please re-enter.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSave(lockType, secretVal.trim());
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save lock. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
              <h3 className="text-sm font-black text-white">
                {step === 'verify_old' ? 'Verify Current Credential' : requireOldSecret ? 'Set New Security Lock' : 'Set Security Lock'}
              </h3>
              <p className="text-[10px] text-gray-400">
                {step === 'verify_old' ? `Enter your existing ${currentType === 'pin' ? '4-digit PIN' : 'password'} to continue` : 'Choose how to secure your app'}
              </p>
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

        {/* STEP 1: VERIFY CURRENT CREDENTIAL */}
        {step === 'verify_old' ? (
          <form onSubmit={handleVerifyOld} className="space-y-4">
            <div className="p-3 rounded-2xl bg-teal-950/20 border border-teal-500/30 text-[11px] text-teal-300">
              🔒 For your security, please confirm your current {currentType === 'pin' ? '4-digit PIN' : 'Password'} before setting a new one.
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-300 block mb-1">
                Current {currentType === 'pin' ? '4-Digit PIN' : 'Password'}:
              </label>
              <div className="relative">
                <input
                  type={showOldSecret || (currentType !== 'pin' && showOldSecret) ? 'text' : 'password'}
                  inputMode={currentType === 'pin' ? 'numeric' : 'text'}
                  maxLength={currentType === 'pin' ? 4 : 32}
                  value={oldSecretVal}
                  onChange={(e) => setOldSecretVal(currentType === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                  placeholder={currentType === 'pin' ? '••••' : 'Enter current password'}
                  className={`w-full py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white outline-none focus:border-teal-500 transition-colors ${
                    currentType === 'pin' ? 'text-center tracking-[0.8em] text-2xl font-black' : 'px-4 text-xs'
                  }`}
                  autoFocus
                />
                {currentType === 'password' && (
                  <button
                    type="button"
                    onClick={() => setShowOldSecret((p) => !p)}
                    className="absolute right-3 top-3 text-[10px] text-teal-400 font-bold hover:underline cursor-pointer"
                  >
                    {showOldSecret ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>

              {/* Forgot PIN / Password link */}
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(true)}
                  className="text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors cursor-pointer hover:underline flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Forgot PIN / Password?</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-[11px] font-bold text-red-400 text-center animate-shake">
                {error}
              </div>
            )}

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
                disabled={!oldSecretVal || (currentType === 'pin' && oldSecretVal.length !== 4)}
                className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 text-xs font-black hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Verify & Continue
              </button>
            </div>
          </form>
        ) : (
          <>
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
                      Enter New 4-Digit PIN:
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
                      Confirm New 4-Digit PIN:
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
          </>
        )}
      </div>

      {/* RECOVER APP LOCK MODAL */}
      {showRecoveryModal && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !recoveryLoading) setShowRecoveryModal(false);
          }}
          className="fixed inset-0 z-[700] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-950 border border-teal-500/40 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200"
          >
            {/* Recovery Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30">
                  <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Recover App Lock</h3>
                  <p className="text-[10px] text-gray-400">Verify your Google account to reset credentials</p>
                </div>
              </div>
              <button
                type="button"
                disabled={recoveryLoading}
                onClick={() => {
                  setShowRecoveryModal(false);
                  setMismatchedUser(null);
                  setRecoveryError('');
                }}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mismatch State View */}
            {mismatchedUser ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-200 space-y-2">
                  <h4 className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    This Google account doesn't match your Qwik-Messages account.
                  </h4>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    You signed in as <span className="font-bold text-white underline">{mismatchedUser.email}</span>. You can continue using your original account, or link this Google account as your recovery account for future App Lock recovery.
                  </p>
                </div>

                {linkingSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center">
                    ✓ {linkingSuccess}
                  </div>
                )}

                {recoveryError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-bold text-center">
                    {recoveryError}
                  </div>
                )}

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    disabled={recoveryLoading}
                    onClick={() => {
                      setShowRecoveryModal(false);
                      setMismatchedUser(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-700 text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Continue Changing PIN / Password</span>
                  </button>

                  <button
                    type="button"
                    disabled={recoveryLoading}
                    onClick={handleLinkAsRecoveryAccount}
                    className="w-full py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 text-xs font-black hover:scale-[1.01] active:scale-95 transition-all shadow-lg shadow-teal-500/20 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {recoveryLoading ? 'Linking...' : 'Use as Recovery Google Account'}
                  </button>
                </div>
              </div>
            ) : (
              /* Standard Initial Recovery View */
              <div className="space-y-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  You can verify your Google account to confirm ownership and safely reset your App Lock credential without knowing the old PIN or password.
                </p>

                {recoveryError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-bold text-center">
                    {recoveryError}
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2.5">
                  <button
                    type="button"
                    disabled={recoveryLoading}
                    onClick={handleGoogleRecovery}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 text-xs font-black transition-all flex items-center justify-center gap-2.5 shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>{recoveryLoading ? 'Verifying with Google...' : 'Continue with Google'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={recoveryLoading}
                    onClick={() => {
                      setShowRecoveryModal(false);
                      setRecoveryError('');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold border border-gray-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
