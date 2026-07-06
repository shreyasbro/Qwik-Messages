import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an active runtime crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 w-screen h-[100dvh] bg-slate-950 flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-md bg-[#0B111E] border-2 border-rose-500/40 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-500"></div>
            
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl text-rose-500">⚠️</span>
            </div>

            <h1 className="text-xl font-black text-white tracking-tight">
              Application Render Crash
            </h1>
            
            <p className="text-xs text-slate-300 font-medium leading-relaxed mt-3">
              A runtime interface execution error was caught by the global crash shield. Rest assured, your message logs are safe.
            </p>

            <div className="mt-6 p-3 bg-slate-900 border border-slate-800 rounded-xl text-left max-h-[120px] overflow-y-auto custom-scrollbar">
              <code className="text-[10px] font-mono text-rose-400 break-all leading-normal">
                {this.state.error?.toString() || 'Unknown React render issue'}
              </code>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full mt-6 py-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Reboot Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
