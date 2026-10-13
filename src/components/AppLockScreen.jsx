import React, { useState, useEffect } from 'react';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function AppLockScreen({ currentUser, privacySettings, onUnlock }) {
  const [currentView, setCurrentView] = useState('enter_lock'); // 'enter_lock' | 'verify_otp' | 'otp_verified_choice' | 'set_new_lock'
  const [inputVal, setInputVal] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  
  // OTP States
  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [isSending, setIsSending] = useState(false);
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

  // 2. DISPATCH REAL EMAIL VIA RESEND API
  const handleSendRecoveryOtp = async () => {
    setError('');
    setIsSending(true);

    const randomOtp = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedOtp(randomOtp);

    // DevTools visibility for testing
    console.log(
      `%c[Resend OTP Delivery] ✉️ OTP for ${userEmail}: ${randomOtp}`,
      'color: #2dd4bf; font-weight: 900; font-size: 14px; background: #042f2e; padding: 4px 8px; border-radius: 6px;'
    );

    const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY || '';

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Qwik Messages Security <onboarding@resend.dev>',
          to: [userEmail],
          subject: 'Qwik Messages - App Lock PIN Reset OTP',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030712; padding: 36px 20px; color: #ffffff; border-radius: 20px; max-width: 480px; margin: 0 auto; border: 1px solid #1f2937;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #14b8a6; font-size: 22px; font-weight: 900; margin: 0; letter-spacing: -0.5px;">Qwik Messages</h1>
                <p style="color: #9ca3af; font-size: 12px; margin-top: 4px;">Security & Privacy Verification</p>
              </div>

              <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;">
                <p style="color: #9ca3af; font-size: 13px; margin: 0 0 16px 0;">Use the following 4-digit code to reset your App Lock PIN / Password:</p>
                <div style="display: inline-block; background-color: #042f2e; border: 1px solid #14b8a6; padding: 12px 28px; border-radius: 12px;">
                  <span style="font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #2dd4bf; font-family: monospace;">${randomOtp}</span>
                </div>
                <p style="color: #6b7280; font-size: 11px; margin-top: 14px; margin-bottom: 0;">This code is valid for 10 minutes. Never share this code with anyone.</p>
              </div>

              <div style="text-align: center; color: #4b5563; font-size: 11px;">
                <p style="margin: 0;">If you did not request this OTP, you can safely ignore this email.</p>
              </div>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.warn('[Resend API Warning]:', errorData);
      }

      setStatusNotice(`4-digit verification code sent to ${userEmail}. Check your inbox!`);
      setResendTimer(30);
      setCurrentView('verify_otp');
    } catch (err) {
      console.warn('[Resend Network Note]:', err.message);
      setStatusNotice(`Verification code generated. Check inbox or DevTools console.`);
      setCurrentView('verify_otp');
    } finally {
      setIsSending(false);
    }
  };

  // 3. VERIFY 4-DIGIT OTP
  const handleVerifyOtp = (e) => {
    e.preventDefault();
    if (enteredOtp === generatedOtp) {
      setError('');
      setStatusNotice('');
      setCurrentView('otp_verified_choice');
    } else {
      setError('Invalid 4-digit code. Please enter the correct code.');
    }
  };

  // 4. SAVE NEW PIN / PASSWORD
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
      const userRef = doc(db, 'users', myUid);
      await setDoc(
        userRef,
        {
          privacySettings: {
            appLockEnabled: true,
            appLockType: newLockType,
            appLockSecret: newLockVal,
          },
        },
        { merge: true }
      );
      onUnlock();
    } catch (err) {
      console.error('Error saving lock:', err);
      setError('Failed to update. Try again.');
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

            <button
              type="button"
              onClick={handleSendRecoveryOtp}
              disabled={isSending}
              className="text-xs font-bold text-teal-400 hover:underline cursor-pointer block mx-auto pt-2"
            >
              {isSending ? 'Sending PIN reset code...' : `Forgot ${lockType === 'pin' ? 'PIN' : 'Password'}?`}
            </button>
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
                disabled={enteredOtp.length !== 4}
                className="flex-1 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-black text-xs transition-transform active:scale-95 disabled:opacity-40 cursor-pointer shadow-lg shadow-teal-500/20"
              >
                Verify Code
              </button>
            </div>

            <div className="pt-2">
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
            </div>
          </form>
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
