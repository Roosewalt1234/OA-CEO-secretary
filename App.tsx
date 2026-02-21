import React from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ConnectionState } from './types';
import { Logs } from './components/Logs';
import { Visualizer } from './components/Visualizer';
import { isSupabaseConfigured } from './services/supabaseService';

const App: React.FC = () => {
  const { connect, disconnect, connectionState, volume, logs, lastQuery } = useGeminiLive();

  const handleToggle = () => {
    if (connectionState === ConnectionState.CONNECTED) {
      disconnect();
    } else {
      connect();
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTING: return 'Connecting to Gemini Live...';
      case ConnectionState.CONNECTED: return 'Gemini Voice Agent is listening';
      case ConnectionState.ERROR: return 'Connection error. Check API key and microphone permissions.';
      default: return 'Tap to connect and start speaking';
    }
  };

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-between p-6 pb-12 relative overflow-hidden">

      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-teal-600/10 rounded-full blur-[100px] pointer-events-none" />

      <header className="w-full max-w-md flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-900/50 border border-emerald-500/30">
            N
          </div>
          <div>
            <h1 className="text-slate-100 font-bold text-lg tracking-tight leading-tight">Nathasha AI</h1>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Gemini Live Voice</span>
              <div className={`px-2 py-[2px] rounded-full text-[9px] font-semibold border flex items-center gap-1 ${isSupabaseConfigured
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
          <span className="text-xs text-slate-400 font-medium">{new Date().toLocaleTimeString()}</span>
          <span className={`text-[10px] px-2 py-[2px] rounded-full font-semibold border ${isConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-slate-700/30 border-slate-600/30 text-slate-400'
            }`}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </header>

      <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center gap-6 z-10">
        <button
          onClick={handleToggle}
          disabled={isConnecting}
          className="focus:outline-none disabled:opacity-70"
          aria-label={isConnected ? 'Disconnect voice agent' : 'Connect voice agent'}
        >
          <Visualizer volume={volume} state={connectionState} />
        </button>

        <p className="text-slate-300 text-sm font-medium">{getStatusText()}</p>
        <p className="text-slate-500 text-xs text-center max-w-sm">
          {isConnected
            ? 'Speak naturally. Nathasha will respond with voice and can query OA stats from Supabase when needed.'
            : 'Press to connect, allow microphone access, then ask your question out loud.'}
        </p>

        {lastQuery && (
          <div className="w-full bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Last Query Result</h3>
            <div className="space-y-2">
              {lastQuery.sql && (
                <div className="text-xs text-slate-500 font-mono bg-slate-900/50 p-2 rounded">
                  {lastQuery.sql}
                </div>
              )}
              <p className="text-emerald-300 font-medium">{lastQuery.result}</p>
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-md z-10">
        <Logs logs={logs} />
      </div>
    </div>
  );
};

export default App;
