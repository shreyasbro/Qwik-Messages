import React, { useState } from 'react';
import { authService } from '../../services/authService';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="fixed inset-0 w-screen h-[100dvh] bg-slate-950 flex items-center justify-center p-4 select-none">
      {/* Auth Card */}
      <div className="w-full max-w-md bg-[#0B111E] border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between">
        
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 blur-sm"></div>

        <div>
          {/* Logo & Headings */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white tracking-tight">
              QWIK MESSAGES
            </h1>
            <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest mt-1">
              Next-Gen Enterprise chat v3.0
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/20 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs mb-6 text-center leading-relaxed">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-300 tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm transition-colors"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-300 tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-300 tracking-wider">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm transition-colors"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-3.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black text-sm uppercase rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-4 text-slate-500 text-[10px] font-black uppercase tracking-widest">or</span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white py-3.5 rounded-xl transition-colors font-bold text-sm"
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
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-xs font-semibold text-slate-300 hover:text-emerald-400 transition-colors"
          >
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

      </div>
    </div>
  );
}
