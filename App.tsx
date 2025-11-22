import React from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ConnectionState } from './types';
import { Visualizer } from './components/Visualizer';
import { Logs } from './components/Logs';
import { isSupabaseConfigured } from './services/supabaseService';

const App: React.FC = () => {
  const { connect, disconnect, connectionState, volume, logs } = useGeminiLive();

  const handleToggle = () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      disconnect();
    } else {
      connect();
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTING: return 'Connecting to Neural Core...';
      case ConnectionState.CONNECTED: return 'Listening...';
      case ConnectionState.ERROR: return 'Connection Error';
      default: return 'Tap to activate Secretary';
    }
  };

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-6 pb-12 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-md flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-900/50 border border-blue-500/30">
            S
          </div>
          <div>
            <h1 className="text-slate-100 font-bold text-lg tracking-tight leading-tight">Secretary.ai</h1>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">CEO Access</span>
              <div className={`px-2 py-[2px] rounded-full text-[9px] font-semibold border flex items-center gap-1 ${
                isSupabaseConfigured 
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' 
                  : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
              }`}>
                <i className={`fas fa-database text-[8px] ${isSupabaseConfigured ? 'text-blue-400' : 'text-yellow-400'}`}></i>
                {isSupabaseConfigured ? 'LINKED' : 'DEMO MODE'}
              </div>
            </div>
          </div>
        </div>
        
        {/* Session Status Dot */}
        <div className="flex flex-col items-end gap-1">
            <div className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${isConnected ? 'bg-green-500 shadow-[0_0_12px_#22c55e]' : 'bg-slate-700'}`} />
        </div>
      </header>

      {/* Main Visualizer Area */}
      <main className="flex-1 w-full max-w-md flex flex-col items-center justify-center z-10 gap-8">
        
        <Visualizer volume={volume} isActive={isConnected} />

        <div className="text-center space-y-2">
          <h2 className={`text-2xl font-light transition-colors duration-300 ${isConnected ? 'text-blue-100' : 'text-slate-400'}`}>
            {getStatusText()}
          </h2>
          
          {isConnected && (
             <p className="text-blue-400/60 text-xs font-mono tracking-wide animate-pulse">
               {isSupabaseConfigured ? '● SECURE DATA CHANNEL ACTIVE' : '⚠ USING SYNTHETIC DATA'}
             </p>
          )}
        </div>

      </main>

      {/* Controls & Logs */}
      <div className="w-full max-w-md flex flex-col items-center gap-6 z-10">
        
        <button
          onClick={handleToggle}
          disabled={isConnecting}
          className={`
            w-full py-4 rounded-2xl font-semibold text-lg tracking-wide shadow-xl transition-all duration-200 transform active:scale-[0.98]
            flex items-center justify-center gap-3
            ${isConnected 
              ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20' 
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-900/40 border border-blue-400/20'
            }
            ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isConnecting ? (
             <i className="fas fa-circle-notch fa-spin"></i>
          ) : isConnected ? (
             <><i className="fas fa-phone-slash"></i> End Session</>
          ) : (
             <><i className="fas fa-microphone"></i> Start Briefing</>
          )}
        </button>

        <Logs logs={logs} />
        
        <div className="text-center space-y-1">
            <p className="text-slate-600 text-[10px]">
                Powered by Gemini 2.5 Flash Native Audio
            </p>
            {!isSupabaseConfigured && (
              <p className="text-yellow-700/50 text-[9px] uppercase tracking-wider">
                Credentials missing • Running in simulation mode
              </p>
            )}
        </div>
      </div>

    </div>
  );
};

export default App;