import React from 'react';

interface VisualizerProps {
  volume: number;
  isActive: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ volume, isActive }) => {
  // Normalize volume for visual scaling (0 to 1 mostly)
  const scale = isActive ? 1 + Math.min(volume * 5, 2) : 1;
  
  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      {/* Outer Glow Ring */}
      <div 
        className={`absolute inset-0 rounded-full border-2 border-blue-500/30 transition-all duration-75 ease-linear`}
        style={{ transform: `scale(${scale * 1.1})`, opacity: isActive ? 0.6 : 0.1 }}
      />
      
      {/* Middle Pulse Ring */}
      <div 
        className={`absolute inset-4 rounded-full bg-blue-500/20 blur-xl transition-all duration-75 ease-linear`}
         style={{ transform: `scale(${scale})`, opacity: isActive ? 0.8 : 0 }}
      />

      {/* Core Circle */}
      <div className={`
        relative z-10 w-32 h-32 rounded-full 
        bg-gradient-to-br from-slate-800 to-slate-950 
        shadow-[0_0_40px_rgba(59,130,246,0.5)] 
        flex items-center justify-center
        border border-slate-700
      `}>
        {isActive ? (
          <i className="fas fa-microphone text-4xl text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"></i>
        ) : (
          <i className="fas fa-microphone-slash text-4xl text-slate-600"></i>
        )}
      </div>
    </div>
  );
};