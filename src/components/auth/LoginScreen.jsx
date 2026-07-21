import React, { useState } from 'react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { authService } from '../../services/authService';
import ForgotPasswordModal from './ForgotPasswordModal';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isMagicLinkMode, setIsMagicLinkMode] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    const actionCodeSettings = {
      url: window.location.origin,
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setMagicLinkSent(true);
    } catch (err) {
      console.error('🚨 Magic Link Error:', err);
      setError(err.message || 'Failed to send magic link. Please check your network or try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        if (!displayName.trim()) {
          throw new Error('Please enter a display name');
        }
        await authService.signUpWithEmail(email, password, displayName);
      } else {
        await authService.signInWithEmail(email, password);
      }
    } catch (err) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google Sign In failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#030712] flex flex-col md:flex-row font-sans overflow-hidden select-none box-border relative">

      {/* 🚀 LEFT SIDE: SLEEK COLLAPSIBLE INFO PANEL (Fixed 360px Width) */}
      {isInfoOpen && (
        <div className="hidden md:flex w-[360px] shrink-0 bg-slate-950/60 border-r border-slate-800/80 backdrop-blur-3xl p-8 flex-col h-screen overflow-y-auto custom-scrollbar relative z-20 transition-all duration-300 shadow-2xl">
          
          {/* Top Bar with Brand Header and Close Button */}
          <div className="flex items-start justify-between mb-8 pb-4 border-b border-slate-800/60">
            <div>
              <h1 className="text-xl font-black text-white tracking-tighter uppercase">QWIK MESSAGES</h1>
              <div className="h-0.5 w-8 bg-teal-500 mt-1 rounded-full"></div>
            </div>
            
            {/* CLOSE BUTTON ('✕') - Collapses Panel */}
            <button 
              type="button" 
              onClick={() => setIsInfoOpen(false)}
              title="Close Feature Panel"
              className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* SCROLLABLE FEATURES LIST */}
          <div className="space-y-6 pb-8 flex-1">
            
            {/* Feature 1: Magic Link */}
            <div className="group">
              <h3 className="text-teal-400 font-bold text-sm mb-1 flex items-center gap-2">
                <span>✨</span> Magic Link Access
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Say goodbye to forgotten passwords. Receive a secure, one-time encrypted link to sign in instantly without typing credentials.
              </p>
            </div>

            {/* Feature 2: Password Security */}
            <div>
              <h3 className="text-teal-400 font-bold text-sm mb-1 flex items-center gap-2">
                <span>🔐</span> Secure Password Login
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Traditional authentication hardened with enterprise-grade encryption and industry-leading security protocols.
              </p>
            </div>

            {/* Feature 3: Google Integration */}
            <div>
              <h3 className="text-teal-400 font-bold text-sm mb-1 flex items-center gap-2">
                <span>G</span> Google One-Tap
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Frictionless onboarding with Google OAuth. Sync your profile photo, display name, and identity in a single click.
              </p>
            </div>

            {/* Feature 4: Forgot Password Recovery */}
            <div>
              <h3 className="text-teal-400 font-bold text-sm mb-1 flex items-center gap-2">
                <span>🔄</span> Forgot Password
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Lost access? Our automated recovery system lets you reset credentials securely in under 30 seconds via verified email dispatch.
              </p>
            </div>

            {/* Feature 5: Rapid Registration */}
            <div>
              <h3 className="text-teal-400 font-bold text-sm mb-1 flex items-center gap-2">
                <span>🚀</span> Instant Registration
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                New to Qwik Messages? Sign up today and experience lightning-fast real-time messaging with a zero-latency global backend.
              </p>
            </div>

          </div>

          {/* Panel Footer */}
          <div className="pt-4 border-t border-slate-800/60 mt-auto">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
              © 2026 QWIK MESSAGES OFFICIAL
            </p>
          </div>
        </div>
      )}

      {/* 💡 FLOATING REOPEN TRIGGER WITH "INFO" BADGE & CURVED DOTTED ARROW CALLOUT */}
      {!isInfoOpen && (
        <div className="hidden md:flex fixed top-6 left-6 z-30 flex-col items-start animate-fade-in select-none">
          
          {/* 1. Reopen Action Button - Locked to "Info" */}
          <button 
            type="button"
            onClick={() => setIsInfoOpen(true)}
            title="Show Info Panel"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-slate-700/80 backdrop-blur-2xl text-teal-400 hover:text-white text-xs font-bold uppercase tracking-wider shadow-2xl hover:border-teal-500 transition-all cursor-pointer z-10"
          >
            <span className="text-sm">💡</span>
            <span>Info</span>
          </button>

          {/* 2. Precision Callout Block: Custom Bezier Arc + "Click to know" Text */}
          <div className="flex items-center gap-2 mt-1 ml-4 pointer-events-none">
            
            {/* Dynamic Bezier Curved Dotted Arrow pointing cleanly up-left towards the Info button */}
            <svg 
              className="w-8 h-8 text-teal-400 stroke-current fill-none overflow-visible -translate-y-1" 
              viewBox="0 0 24 24" 
              strokeWidth="2" 
              strokeDasharray="3 3"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18 C 14 18, 8 16, 6 6" />
              <polyline strokeLinecap="round" strokeLinejoin="round" points="2 10 6 6 10 8" />
            </svg>

            {/* Sleek Onboarding Tooltip Label */}
            <span className="text-[11px] font-medium tracking-wide text-slate-300 bg-slate-950/95 px-3 py-1.5 rounded-lg border border-slate-800/90 backdrop-blur-md shadow-xl whitespace-nowrap">
              Click to know
            </span>
          </div>

        </div>
      )}

      {/* 🎯 RIGHT SIDE: THE LOGIN CANVAS (Automatically expands and centers!) */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-y-auto transition-all duration-300 w-full min-h-screen">
        {/* Dynamic Blurred Background Ambient Liquid Orbs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-teal-500/10 rounded-full filter blur-[100px] pointer-events-none animate-pulse duration-[6000ms] opacity-80" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none animate-pulse duration-[8000ms]" />
        <div className="absolute bottom-1/4 left-0 w-64 h-64 bg-slate-800/10 rounded-full filter blur-[100px] pointer-events-none opacity-40" />

        {/* MAIN CARD CONTAINER: Deep Liquid Glassmorphism */}
        <div className="w-full max-w-[440px] h-auto bg-[#0b111e]/60 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl shadow-black/40 relative z-10 box-border flex flex-col items-center animate-scale-in my-auto">
          
          {/* Brand Header */}
          <div className="text-center mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <h2 className="text-2xl font-black text-white tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-white to-slate-400">
              QWIK MESSAGES
            </h2>
            <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mt-1">
              Next-Gen Enterprise Chat
            </p>
          </div>

        {/* 1. LIQUID SWITCHABLE TAB CONTROLLER */}
        {!isRegistering && (
          <div className="w-full p-1 bg-slate-950/60 rounded-xl flex items-center relative border border-slate-800/40 mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            
            {/* Active Liquid Backdrop Indicator - Smooth Horizontal Sliding Track */}
            <div 
              className="absolute top-1 bottom-1 left-1 rounded-lg bg-slate-800 border border-slate-700/50 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-md"
              style={{
                width: 'calc(50% - 4px)',
                transform: !isMagicLinkMode ? 'translateX(0)' : 'translateX(100%)'
              }}
            />

            <button 
              type="button"
              onClick={() => { setIsMagicLinkMode(false); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-20 text-center transition-colors duration-200 cursor-pointer ${!isMagicLinkMode ? 'text-teal-400' : 'text-slate-400 hover:text-white'}`}
            >
              Password Login
            </button>
            
            <button 
              type="button"
              onClick={() => { setIsMagicLinkMode(true); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider relative z-20 text-center transition-colors duration-200 cursor-pointer ${isMagicLinkMode ? 'text-teal-400' : 'text-slate-400 hover:text-white'}`}
            >
              ✨ Magic Link
            </button>
          </div>
        )}

        {/* Error Notification Alert */}
        {error && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium animate-fade-in-up">
            {error}
          </div>
        )}

        {/* 2. DYNAMIC CONTENT FORMS WITH MICRO-ANIMATIONS */}
        <div className="w-full min-h-[220px] flex flex-col justify-start">
          
          {isMagicLinkMode && !isRegistering ? (
            magicLinkSent ? (
              <div className="flex flex-col items-center text-center p-6 bg-slate-900/90 border border-emerald-500/30 rounded-3xl animate-scale-up">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-2xl mb-4 text-emerald-400 animate-pulse">
                  ✉️
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Check Your Inbox!</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  We sent a passwordless magic link to <span className="text-teal-400 font-semibold">{email}</span>. Click the link in your email to sign in instantly!
                </p>
                <p className="text-[11px] font-semibold text-amber-400/90 tracking-wide text-center leading-normal mb-6 w-full max-w-[90%] mx-auto">
                  Note: Please check your spam or promotions folder if you don't see the email in your main inbox after a few seconds.
                </p>
                <button 
                  type="button" 
                  onClick={() => setMagicLinkSent(false)} 
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Use a different email or sign in with password
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendMagicLink} className="w-full flex flex-col animate-fade-in-up" style={{ animationDelay: '150ms' }}>
                <div className="mb-4 group flex flex-col">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 transition-colors group-focus-within:text-teal-400">
                    Email Address
                  </label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-4 py-3.5 bg-slate-950/40 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 focus:bg-slate-950/80 transition-all duration-200 shadow-inner placeholder-slate-600 box-border"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-teal-500/10 hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Sending Link...' : '✨ Send Magic Sign-In Link'}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleSubmit} className="w-full flex flex-col animate-fade-in-up" style={{ animationDelay: '150ms' }}>
              {isRegistering && (
                <div className="mb-4 group flex flex-col">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 transition-colors group-focus-within:text-teal-400">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-3.5 bg-slate-950/40 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 focus:bg-slate-950/80 transition-all duration-200 shadow-inner placeholder-slate-600 box-border"
                  />
                </div>
              )}

              <div className="mb-4 group flex flex-col">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 transition-colors group-focus-within:text-teal-400">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-950/40 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 focus:bg-slate-950/80 transition-all duration-200 shadow-inner placeholder-slate-600 box-border"
                />
              </div>

              <div className="mb-2 group flex flex-col">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 transition-colors group-focus-within:text-teal-400">
                  Password
                </label>
                <div className="relative w-full">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 pr-12 py-3.5 bg-slate-950/40 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-teal-500 focus:bg-slate-950/80 transition-all duration-200 shadow-inner placeholder-slate-600 box-border"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide Password" : "Show Password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400 p-1 rounded-lg transition-colors focus:outline-none cursor-pointer"
                  >
                    {showPassword ? (
                      /* 👁️ EYE OPEN SVG (Password Visible) */
                      <svg className="w-5 h-5 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      /* 👁️🗨️ EYE CLOSED/SLASHED SVG (Password Concealed - Dots) */
                      <svg className="w-5 h-5 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link Trigger */}
              {!isRegistering && (
                <div className="flex justify-end mb-6">
                  <button 
                    type="button" 
                    onClick={() => setIsForgotOpen(true)} 
                    className="text-[11px] text-teal-500 hover:text-teal-400 hover:underline transition font-semibold cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              {/* Submission Control Core */}
              <button 
                type="submit" 
                disabled={loading}
                className="w-full mt-2 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-teal-500/10 hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : isRegistering ? 'Create Account' : 'Sign In'}
              </button>
            </form>
          )}

          <div className="relative flex py-6 items-center">
            <div className="flex-grow border-t border-slate-800/60"></div>
            <span className="flex-shrink mx-4 text-slate-500 text-[10px] font-black uppercase tracking-widest">or</span>
            <div className="flex-grow border-t border-slate-800/60"></div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-slate-950/50 hover:bg-slate-900 border border-slate-800/80 text-white py-3.5 rounded-xl transition-all duration-200 font-bold text-sm cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
          >
            {/* Google Icon */}
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.478 0-6.3-2.823-6.3-6.3 0-3.477 2.822-6.3 6.3-6.3 1.636 0 3.107.625 4.225 1.644l3.14-3.14C19.162 2.2 15.932 1 12.24 1 5.922 1 1 5.922 1 12.24s4.922 11.24 11.24 11.24c5.89 0 10.93-4.25 10.93-11.24 0-.668-.077-1.3-.217-1.955H12.24z"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer Toggle */}
        <div className="text-center mt-8">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setIsMagicLinkMode(false);
            }}
            className="text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

      </div>

      {/* RENDER FORGOT PASSWORD MODAL */}
      <ForgotPasswordModal 
        isOpen={isForgotOpen} 
        onClose={() => setIsForgotOpen(false)} 
        initialEmail={email}
      />
      </div>
    </div>
  );
}
