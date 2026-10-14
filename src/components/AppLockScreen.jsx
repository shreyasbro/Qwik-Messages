import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { reauthenticateWithPopup, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db, googleProvider } from '../firebaseConfig';

export default function AppLockScreen({ currentUser, privacySettings, onUnlock }) {
  const [currentView, setCurrentView] = useState('enter_lock'); // 'enter_lock' | 'verify_otp' | 'reauth_options' | 'otp_verified_choice' | 'set_new_lock'
  const [inputVal, setInputVal] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  
  // OTP & Reset States
  const [resetToken, setResetToken] = useState(null);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // New Lock States
  const [newLockType, setNewLockType] = useState('pin');
  const [newLockVal, setNewLockVal] = useState('');
  const [confirmLockVal, setConfirmLockVal] = useState('');
  const [loading, setLoading] = useState(false);

  const myUid = currentUser?.uid;
  const userEmail = currentUser?.email || 'your email';
  const targetSecret = privacySettings?.appLockSecret || '1234';
  const lockType = privacySettings?.appLockType || 'pin';

  // Resend Timer Countdown
  useEffect(() => {
    let interval = null;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // 1. UNLOCK VERIFICATION
  const handleUnlockSubmit = (e) => {
    e.preventDefault();
    if (inputVal === targetSecret) {
      setError('');
      onUnlock();
    } else {
      setError(`Incorrect ${lockType.toUpperCase()}. Try again.`);
      setInputVal('');
    }
  };

  // Helper to safely parse responses and handle 404/HTML errors gracefully
  const safeParseResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    let parsedData = null;
    if (contentType.includes('application/json')) {
      try {
        parsedData = await response.json();
      } catch {
        parsedData = null;
      }
    } else {
      const text = await response.text();
      if (text) {
        try {
          parsedData = JSON.parse(text);
        } catch {
          parsedData = { error: text.slice(0, 120) };
        }
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Recovery server endpoint unavailable (404). Please ensure the backend server is running.');
      }
      throw new Error(parsedData?.error || `Server request failed with status ${response.status}`);
    }

    return parsedData || {};
  };

  // 2. DISPATCH RECOVERY OTP VIA SECURE SERVER (Zero client exposure, Resend completely removed)
  const handleSendRecoveryOtp = async () => {
    setError('');
    setIsSending(true);

    try {
      const response = await fetch('/api/app-lock/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: myUid,
          email: userEmail,
        }),
      });

      const data = await safeParseResponse(response);

      setStatusNotice(data.message || `Verification code sent to ${userEmail}. Check your inbox!`);
      setResendTimer(30);
      setCurrentView('verify_otp');
    } catch (err) {
      console.warn('[AppLock Recovery notice]:', err.message);
      setError(err.message || 'Unable to send recovery code. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // 3. VERIFY 4-DIGIT OTP ON SERVER (Cryptographically verified, rate-limited, single-use token)
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    try {
      const response = await fetch('/api/app-lock/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: myUid,
          code: enteredOtp,
        }),
      });

      const data = await safeParseResponse(response);

      if (!data.resetToken) {
        throw new Error('Verification did not return an authorization token.');
      }

      setResetToken(data.resetToken);
      setError('');
      setStatusNotice('');
      setCurrentView('otp_verified_choice');
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // 3B. ALTERNATIVE RECOVERY: FIREBASE REAUTHENTICATION (Google / Supported Provider)
  const handleFirebaseReauth = async () => {
    setError('');
    setIsReauthenticating(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No active user session found. Please sign in again.');
      }

      let reauthResult;
      try {
        // Try native reauthentication popup first
        reauthResult = await reauthenticateWithPopup(user, googleProvider);
      } catch (popupErr) {
        // If user wasn't originally a Google user or reauthenticateWithPopup failed, attempt signInWithPopup
        if (popupErr.code === 'auth/popup-closed-by-user') {
          throw new Error('Google sign-in popup was closed before completing verification.');
        }
        reauthResult = await signInWithPopup(auth, googleProvider);
      }

      const verifiedUser = reauthResult.user;

      // Verify that the signed-in account matches the currently locked account
      if (verifiedUser.uid !== myUid) {
        throw new Error(`Account mismatch: signed in as ${verifiedUser.email || verifiedUser.uid}, but this device is locked for ${userEmail}.`);
      }

      // Obtain a fresh Firebase ID token with recent auth_time
      const idToken = await verifiedUser.getIdToken(true);

      // Verify authorization on the trusted backend
      const response = await fetch('/api/app-lock/verify-firebase-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken,
          expectedUid: myUid,
          expectedEmail: userEmail,
        }),
      });

      const data = await safeParseResponse(response);

      if (!data.resetToken) {
        throw new Error('Backend authorization did not return a valid reset token.');
      }

      setResetToken(data.resetToken);
      setError('');
      setStatusNotice('Identity verified with Google Authentication!');
      setCurrentView('otp_verified_choice');
    } catch (err) {
      console.warn('[Firebase Auth Recovery]:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Authentication was cancelled. Please try again.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error during Google sign-in. Please check your connection.');
      } else {
        setError(err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      setIsReauthenticating(false);
    }
  };

  // 4. SAVE NEW PIN / PASSWORD (Authenticated via Single-Use Token)
  const handleSaveNewLock = async (e) => {
    e.preventDefault();
    if (!newLockVal) {
      setError('Please enter a valid PIN or Password.');
      return;
    }
    if (newLockType === 'pin' && (newLockVal.length !== 4 || !/^\d{4}$/.test(newLockVal))) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    if (newLockVal !== confirmLockVal) {
      setError('Values do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      // 1. Update via Server Token if available
      if (resetToken) {
        const response = await fetch('/api/app-lock/reset-lock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: myUid,
            resetToken,
            newLockType,
            newLockVal,
          }),
        });

        await safeParseResponse(response);
      }

      // 2. Sync to Firestore client document as fallback & real-time snapshot consistency
      const userRef = doc(db, 'users', myUid);
      await setDoc(
        userRef,
        {
          privacySettings: {
            appLockEnabled: true,
            appLockType: newLockType,
            appLockSecret: newLockVal,
            appPin: newLockVal,
          },
        },
        { merge: true }
      );

      // 3. Sync to localStorage cache so app stays unlocked and next startup reads updated PIN
      try {
        const cached = {
          ...(privacySettings || {}),
          appLockEnabled: true,
          appLockType: newLockType,
          appLockSecret: newLockVal,
          appPin: newLockVal,
        };
        localStorage.setItem(`privacy_${myUid}`, JSON.stringify(cached));
      } catch (cacheErr) {
        console.warn('[AppLock] Cache sync notice:', cacheErr);
      }

      onUnlock();
    } catch (err) {
      console.error('Error saving lock:', err);
      setError(err.message || 'Failed to update. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950/95 backdrop-blur-2xl flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center">
        
        {/* Shield Icon */}
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30 mb-5 shadow-lg shadow-teal-500/10">
          <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: ENTER PIN / PASSWORD                                  */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'enter_lock' && (
          <form onSubmit={handleUnlockSubmit} className="w-full space-y-5">
            <div>
              <h2 className="text-xl font-black text-white">Qwik Messages Locked</h2>
              <p className="text-xs text-gray-400 mt-1">
                Enter your {lockType === 'pin' ? '4-digit PIN' : 'Password'} to unlock
              </p>
            </div>

            <div className="relative max-w-[240px] mx-auto">
              <input
                type={showPassword ? 'text' : 'password'}
                maxLength={lockType === 'pin' ? 4 : 32}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={lockType === 'pin' ? '••••' : 'Enter Password'}
                className={`w-full text-center py-3 bg-gray-950 border border-gray-800 rounded-2xl text-white outline-none focus:border-teal-500 transition-all shadow-inner ${
                  lockType === 'pin' ? 'text-2xl font-black tracking-[0.8em]' : 'text-sm font-semibold tracking-normal px-4'
                }`}
                autoFocus
              />
              {lockType === 'password' && (
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-white text-xs cursor-pointer"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              )}
            </div>

            {error && <p className="text-xs font-bold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={!inputVal}
              className="w-full py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-black text-xs transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-teal-500/20 cursor-pointer"
            >
              Unlock Workspace
            </button>

            <div className="flex flex-col items-center gap-1.5 pt-2">
              <button
                type="button"
                onClick={handleSendRecoveryOtp}
                disabled={isSending}
                className="text-xs font-bold text-teal-400 hover:underline cursor-pointer"
              >
                {isSending ? 'Sending PIN reset code...' : `Forgot ${lockType === 'pin' ? 'PIN' : 'Password'}?`}
              </button>

              <button
                type="button"
                onClick={() => { setError(''); setCurrentView('reauth_options'); }}
                className="text-[11px] font-semibold text-gray-400 hover:text-teal-300 transition-colors cursor-pointer"
              >
                Can't access your email?
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: ENTER 4-DIGIT APP LOCK OTP                            */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'verify_otp' && (
          <form onSubmit={handleVerifyOtp} className="w-full space-y-4">
            <div>
              <h2 className="text-lg font-black text-white">App Lock Verification</h2>
              <p className="text-xs text-gray-400 mt-1">Enter the 4-digit PIN reset code sent to:</p>
              <p className="text-xs font-bold text-teal-400 mt-1.5 bg-teal-950/40 py-1.5 px-3 rounded-xl border border-teal-500/20 truncate">
                {userEmail}
              </p>
            </div>

            {statusNotice && (
              <div className="p-2.5 rounded-xl bg-teal-950/40 border border-teal-500/30 text-[11px] text-teal-300 font-medium">
                {statusNotice}
              </div>
            )}

            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={enteredOtp}
              onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-44 mx-auto text-center tracking-[0.6em] text-2xl font-black py-3 bg-gray-950 border border-gray-800 rounded-2xl text-white outline-none focus:border-teal-500 shadow-inner"
              autoFocus
            />

            {error && <p className="text-xs font-bold text-red-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setError(''); setCurrentView('enter_lock'); }}
                className="flex-1 py-3 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={enteredOtp.length !== 4 || isVerifying}
                className="flex-1 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-black text-xs transition-transform active:scale-95 disabled:opacity-40 cursor-pointer shadow-lg shadow-teal-500/20"
              >
                {isVerifying ? 'Verifying...' : 'Verify Code'}
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 pt-2">
              {resendTimer > 0 ? (
                <span className="text-[11px] text-gray-500">Resend PIN code in {resendTimer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendRecoveryOtp}
                  disabled={isSending}
                  className="text-xs font-bold text-teal-400 hover:underline cursor-pointer"
                >
                  {isSending ? 'Resending...' : 'Resend PIN Reset Code'}
                </button>
              )}

              <button
                type="button"
                onClick={() => { setError(''); setCurrentView('reauth_options'); }}
                className="text-[11px] font-semibold text-gray-400 hover:text-teal-300 transition-colors cursor-pointer"
              >
                Can't access your email?
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2B: ALTERNATIVE RECOVERY (CAN'T ACCESS EMAIL)            */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'reauth_options' && (
          <div className="w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div>
              <h2 className="text-lg font-black text-white">Alternative Recovery</h2>
              <p className="text-xs text-gray-400 mt-1">
                Verify your identity directly through Firebase Authentication to set a new PIN.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-950/80 border border-gray-800 text-left space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-gray-400">Account:</span>
                <span className="text-xs font-semibold text-teal-300 truncate">{userEmail}</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Sign in with the verified Google account linked to this workspace. A fresh authentication token will authorize you to reset your App Lock PIN.
              </p>
            </div>

            {error && <p className="text-xs font-bold text-red-400">{error}</p>}

            <button
              type="button"
              onClick={handleFirebaseReauth}
              disabled={isReauthenticating}
              className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-xs flex items-center justify-center gap-2.5 transition-transform active:scale-95 shadow-lg disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{isReauthenticating ? 'Authenticating with Google...' : 'Verify with Google'}</span>
            </button>

            <div className="pt-2 border-t border-gray-800/80 text-left space-y-1.5">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Other Recovery Options:</span>
              <p className="text-[11px] text-gray-400">
                • If you use Email & Password, request the 4-digit code and check your spam/junk folders.
              </p>
              <p className="text-[11px] text-gray-400">
                • If you have completely lost access to your login credentials, contact support at <span className="text-teal-400 font-mono">qwik.messages.official@gmail.com</span> for manual account verification.
              </p>
            </div>

            <button
              type="button"
              onClick={() => { setError(''); setCurrentView('enter_lock'); }}
              className="w-full py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-400 text-xs font-bold transition-colors cursor-pointer border border-gray-800"
            >
              Back to Lock Screen
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 3: OTP VERIFIED - CHOICE POPUP                          */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'otp_verified_choice' && (
          <div className="w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <svg className="w-6 h-6 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <div>
              <h2 className="text-base font-black text-white">Identity Verified!</h2>
              <p className="text-xs text-gray-400 mt-1">
                Would you like to reset your App Lock PIN / Password or continue directly into the app?
              </p>
            </div>

            <div className="space-y-2 pt-3">
              <button
                type="button"
                onClick={() => setCurrentView('set_new_lock')}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 text-gray-950 font-black text-xs hover:scale-[1.01] active:scale-95 transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
              >
                Reset PIN / Password
              </button>

              <button
                type="button"
                onClick={() => onUnlock()}
                className="w-full py-3 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs transition-colors cursor-pointer border border-gray-700"
              >
                Continue into App
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 4: SET NEW PIN OR PASSWORD                               */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'set_new_lock' && (
          <form onSubmit={handleSaveNewLock} className="w-full space-y-4">
            <div>
              <h2 className="text-base font-black text-white">Set New Lock</h2>
              <p className="text-xs text-gray-400 mt-0.5">Choose your security method and credentials</p>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-gray-950 p-1.5 rounded-2xl border border-gray-800">
              <button
                type="button"
                onClick={() => { setNewLockType('pin'); setNewLockVal(''); setConfirmLockVal(''); }}
                className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  newLockType === 'pin' ? 'bg-teal-500 text-gray-950 shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                4-Digit PIN
              </button>
              <button
                type="button"
                onClick={() => { setNewLockType('password'); setNewLockVal(''); setConfirmLockVal(''); }}
                className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  newLockType === 'password' ? 'bg-teal-500 text-gray-950 shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                Text Password
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="password"
                maxLength={newLockType === 'pin' ? 4 : 32}
                value={newLockVal}
                onChange={(e) => setNewLockVal(e.target.value)}
                placeholder={newLockType === 'pin' ? 'Enter 4-digit PIN' : 'Enter new Password'}
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs text-white outline-none focus:border-teal-500"
              />
              <input
                type="password"
                maxLength={newLockType === 'pin' ? 4 : 32}
                value={confirmLockVal}
                onChange={(e) => setConfirmLockVal(e.target.value)}
                placeholder={newLockType === 'pin' ? 'Confirm 4-digit PIN' : 'Confirm Password'}
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs text-white outline-none focus:border-teal-500"
              />
            </div>

            {error && <p className="text-xs font-bold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !newLockVal || !confirmLockVal}
              className="w-full py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-black text-xs transition-transform active:scale-95 disabled:opacity-40 cursor-pointer shadow-lg shadow-teal-500/20"
            >
              {loading ? 'Saving...' : 'Save & Unlock'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
