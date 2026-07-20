import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebaseConfig';

const ForgotPasswordModal = ({ isOpen, onClose, initialEmail = '' }) => {
  const [email, setEmail] = useState(initialEmail);
  const [step, setStep] = useState(1); // 1: Input, 2: Success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSendResetEmail = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Trigger Firebase Native Secure Password Reset Protocol
      await sendPasswordResetEmail(auth, email);
      setStep(2); // Move to success confirmation step
    } catch (err) {
      console.error('🚨 Reset Email Error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email address.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email format.');
      } else {
        setError('Failed to send reset email. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetModal = () => {
    setStep(1);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[999999] p-4 animate-fade-in select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* STEP 1: EMAIL INPUT FORM */}
        {step === 1 && (
          <form onSubmit={handleSendResetEmail} className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-white tracking-wide">Reset Password</h3>
              <button type="button" onClick={handleResetModal} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Enter your registered email address. We will send you a secure, encrypted link to reset your password immediately.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-400 text-xs text-center font-medium">
                {error}
              </div>
            )}

            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <input 
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-teal-500 transition mb-4 placeholder-slate-500"
            />

            {/* ✅ CRITICAL UX ADDITION: PRE-SEND SPAM WARNING TEXT */}
            <p className="text-[11px] text-amber-400/90 font-medium tracking-wide mb-4 px-1 leading-normal text-left">
              💡 Note: Please check your spam or promotions folder if you don't see the reset email in your main inbox after sending.
            </p>

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={handleResetModal}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs uppercase tracking-wider hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-teal-500/20 hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: SUCCESS CONFIRMATION */}
        {step === 2 && (
          <div className="flex flex-col items-center text-center py-4 animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400 text-2xl">
              ✉️
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Check Your Inbox</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              We have sent a password reset link to <span className="text-teal-400 font-semibold">{email}</span>. Click the link in your email to set a new password.
            </p>
            <p className="text-[11px] text-slate-500 mb-6 italic">
              Note: If you don't see the email within a few minutes, please check your spam or junk folder.
            </p>
            <button 
              type="button"
              onClick={handleResetModal}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-teal-500/20 hover:brightness-110 transition"
            >
              Back to Sign In
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default ForgotPasswordModal;
