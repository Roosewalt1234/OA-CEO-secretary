import React from 'react';
import { ConnectionState } from '../types';

interface VisualizerProps {
  volume: number;
  state: ConnectionState;
}

export const Visualizer: React.FC<VisualizerProps> = ({ volume, state }) => {
  const isConnected = state === ConnectionState.CONNECTED;
  const isConnecting = state === ConnectionState.CONNECTING;
  const isError = state === ConnectionState.ERROR;

  // Scale calculation based on volume (RMS)
  // We use CSS transitions to smooth out the jumpy volume updates
  const scale = isConnected ? 1 + Math.min(volume * 4, 1.5) : 1;

  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      
      {/* 1. Outer Ripple (Echo) - Large
          Reacts heavily to volume.
      */}
      <div 
        className={`absolute inset-0 rounded-full border transition-all duration-500 ease-out ${
          isConnected ? 'border-emerald-500/20 opacity-100' : 'border-slate-700/0 opacity-0'
        }`}
        style={{ 
          transform: isConnected ? `scale(${scale * 1.4})` : 'scale(1)',
        }}
      />

      {/* 2. Middle Ring - Medium
          Reacts to volume, changes color based on state.
      */}
      <div 
        className={`absolute inset-8 rounded-full border transition-all duration-300 ease-out ${
          isConnected ? 'border-emerald-400/30 bg-emerald-900/5' : 
          isConnecting ? 'border-amber-500/30 bg-amber-900/5' : 
          isError ? 'border-red-500/30 bg-red-900/5' :
          'border-slate-800 bg-slate-900/0'
        }`}
        style={{ 
          transform: isConnected ? `scale(${scale * 1.15})` : 'scale(1)',
        }}
      />

      {/* 3. Connecting Spinner Ring
          Only visible during connection phase.
      */}
      {isConnecting && (
        <div className="absolute inset-12 rounded-full border-2 border-amber-400/50 border-t-transparent animate-spin"></div>
      )}

      {/* 4. Core Glow Backdrop 
          Provides the ambient light behind the button.
      */}
      <div 
        className={`absolute inset-16 rounded-full blur-2xl transition-all duration-500 ${
          isConnected ? 'bg-emerald-500/30' : 
          isConnecting ? 'bg-amber-500/20' : 
          isError ? 'bg-red-500/20' :
          'bg-slate-800/0'
        }`}
        style={{ transform: `scale(${scale})` }}
      />

      {/* 5. Main Central Button/Circle
          The anchor point of the visualizer.
      */}
      <div className={`
        relative z-10 w-32 h-32 rounded-full 
        flex items-center justify-center
        border-2 backdrop-blur-sm
        shadow-lg transition-all duration-500
        ${
          isConnected ? 'bg-slate-900/90 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 
          isConnecting ? 'bg-slate-900/90 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 
          isError ? 'bg-slate-900/90 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 
          'bg-slate-900 border-slate-700 shadow-none'
        }
      `}>
        <i className={`
          text-4xl transition-all duration-300
          ${
            isConnected ? 'fas fa-microphone text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 
            isConnecting ? 'fas fa-hourglass-half text-amber-400 animate-pulse' : 
            isError ? 'fas fa-exclamation-circle text-red-500' : 
            'fas fa-microphone-slash text-slate-600'
          }
        `} style={{ transform: isConnected ? `scale(${1 + volume * 0.2})` : 'scale(1)' }}></i>
      </div>
      
      {/* Optional Status Label for accessibility/clarity */}
      <div className={`absolute -bottom-6 text-[10px] font-mono tracking-[0.2em] uppercase transition-opacity duration-500 ${
        state === ConnectionState.DISCONNECTED ? 'opacity-0' : 'opacity-70 text-slate-400'
      }`}>
        {state}
      </div>

    </div>
  );
};