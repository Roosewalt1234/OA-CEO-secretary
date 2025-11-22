import React from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ConnectionState } from './types';
import { Visualizer } from './components/Visualizer';
import { Logs } from './components/Logs';
import { isSupabaseConfigured } from './services/supabaseService';

const App: React.FC = () => {
  const { connect, disconnect, connectionState, volume, logs, lastQuery } = useGeminiLive();

  const handleToggle = () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      disconnect();
    } else {
      connect();
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTING: return 'Connecting to OA Database...';
      case ConnectionState.CONNECTED: return 'Nathasha Listening...';
      case ConnectionState.ERROR: return 'Connection Error';
      default: return 'Tap to Access OA Records';
    }
  };

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-6 pb-12 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-teal-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-md flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-900/50 border border-emerald-500/30">
            N
          </div>
          <div>
            <h1 className="text-slate-100 font-bold text-lg tracking-tight leading-tight">Nathasha</h1>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Finance Dept</span>
              <div className={`px-2 py-[2px] rounded-full text-[9px] font-semibold border flex items-center gap-1 ${
                isSupabaseConfigured 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
                  : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
              }`}>
                <i className={`fas fa-database text-[8px] ${isSupabaseConfigured ? 'text-emerald-400' : 'text-yellow-400'}`}></i>
                {isSupabaseConfigured ? 'LIVE DATA' : 'SIMULATION'}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-1">
            <div className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${isConnected ? 'bg-green-500 shadow-[0_0_12px_#22c55e]' : 'bg-slate-700'}`} />
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 w-full max-w-md flex flex-col items-center justify-center z-10 gap-6 my-4">
        
        <Visualizer volume={volume} state={connectionState} />

        <div className="text-center space-y-2">
          <h2 className={`text-xl font-light transition-colors duration-300 ${isConnected ? 'text-emerald-100' : 'text-slate-400'}`}>
            {getStatusText()}
          </h2>
        </div>

        {/* SQL Monitor Card */}
        {lastQuery && (
          <div className="w-full bg-slate-900/80 border border-slate-700 rounded-lg overflow-hidden shadow-xl backdrop-blur-md animate-[pulse-slow_4s_ease-in-out_infinite] hover:animate-none transition-all">
            <div className="bg-slate-800/80 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <i className="fas fa-terminal text-emerald-400 text-xs"></i>
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">Live Query Monitor</span>
              </div>
              <span className="text-[9px] text-slate-500">{lastQuery.timestamp.toLocaleTimeString()}</span>
            </div>
            <div className="p-3 space-y-3 font-mono text-xs">
              <div>
                <div className="text-[9px] text-slate-500 mb-1 uppercase tracking-wider">Executed SQL</div>
                <div className="text-emerald-300 bg-slate-950 p-2 rounded border border-emerald-900/30 shadow-inner break-all">
                  {lastQuery.sql}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-slate-500 mb-1 uppercase tracking-wider">Result</div>
                <div className="text-white font-bold bg-slate-800/50 p-2 rounded border border-slate-700 inline-block">
                  {lastQuery.result}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Controls */}
      <div className="w-full max-w-md flex flex-col items-center gap-4 z-10">
        
        <button
          onClick={handleToggle}
          disabled={isConnecting}
          className={`
            w-full py-4 rounded-2xl font-semibold text-lg tracking-wide shadow-xl transition-all duration-200 transform active:scale-[0.98]
            flex items-center justify-center gap-3
            ${isConnected 
              ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20' 
              : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/40 border border-emerald-400/20'
            }
            ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isConnecting ? (
             <i className="fas fa-circle-notch fa-spin"></i>
          ) : isConnected ? (
             <><i className="fas fa-microphone-slash"></i> Stop Listening</>
          ) : (
             <><i className="fas fa-microphone"></i> Access Database</>
          )}
        </button>

        <Logs logs={logs} />
      </div>

    </div>
  );
};

export default App;