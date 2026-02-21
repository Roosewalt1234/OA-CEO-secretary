import React, { useEffect, useRef } from 'react';
import { LogMessage } from '../types';

interface LogsProps {
  logs: LogMessage[];
}

export const Logs: React.FC<LogsProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full max-w-md mt-8 bg-slate-900/50 rounded-xl border border-slate-800 backdrop-blur-sm overflow-hidden flex flex-col h-48">
      <div className="px-4 py-2 bg-slate-800/50 text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between items-center">
        <span>Chat History</span>
        <span className="bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full text-[10px]">{logs.length} events</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
        {logs.length === 0 ? (
          <p className="text-slate-500 text-xs">No messages yet.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 rounded uppercase font-bold
                  ${log.role === 'system' ? 'bg-slate-700 text-slate-300' : ''}
                  ${log.role === 'user' ? 'bg-green-900 text-green-300' : ''}
                  ${log.role === 'model' ? 'bg-blue-900 text-blue-300' : ''}
                `}>
                  {log.role}
                </span>
                <span className="text-[10px] text-slate-600">
                  {log.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <p className="text-slate-300 pl-1 leading-relaxed opacity-90 text-xs">
                {log.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
