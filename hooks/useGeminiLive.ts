import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, Tool } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';
import { ConnectionState, LogMessage, GEMINI_API_KEY } from '../types';
import { executeOAQuery, OAQueryResult } from '../services/supabaseService';

// Define the OA Statistics Tool
const oaStatsTool: FunctionDeclaration = {
  name: 'get_oa_stats',
  description: 'Run a specific statistical query against the Owners Association database (vw_building_owner_pending_dues).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ['TOTAL_COLLECTABLES', 'MAX_BUILDING', 'MAX_OWNER', 'COUNT_BUILDINGS'],
        description: 'The specific statistic to retrieve from the database.',
      },
    },
    required: ['operation'],
  },
};

const TOOLS: Tool[] = [{ functionDeclarations: [oaStatsTool] }];
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

export const useGeminiLive = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [volume, setVolume] = useState<number>(0);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [lastQuery, setLastQuery] = useState<OAQueryResult | null>(null);

  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const addLog = (role: 'user' | 'model' | 'system', text: string) => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(7), role, text, timestamp: new Date() }].slice(-50));
  };

  const connect = useCallback(async () => {
    const apiKey = GEMINI_API_KEY;

    if (!apiKey) {
      addLog('system', 'Error: API_KEY not found. Please check configuration.');
      setConnectionState(ConnectionState.ERROR);
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);

      // Initialize Audio Contexts
      const InputContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const audioCtx = new InputContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const OutputContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const outputCtx = new OutputContextClass({ sampleRate: 24000 });
      outputContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });

      sessionPromiseRef.current = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are Nathasha, an Owners Association AI Assistant.
Your only source of truth is the Supabase view: vw_building_owner_pending_dues.
You must use the 'get_oa_stats' tool to answer questions.
Rules:
1. If asked "Total collectables", use operation='TOTAL_COLLECTABLES'.
2. If asked "Which building has maximum due", use operation='MAX_BUILDING'.
3. If asked "Which owner has maximum due", use operation='MAX_OWNER'.
4. If asked "How many buildings", use operation='COUNT_BUILDINGS'.
When the tool returns a result, summarize it clearly to the user. The SQL used is automatically shown on their screen, so you don't need to read the SQL code out loud.`,
          tools: TOOLS,
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            addLog('system', 'Nathasha Connected.');
            
            const source = audioCtx.createMediaStreamSource(stream);
            inputSourceRef.current = source;
            
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolume(Math.sqrt(sum / inputData.length));

              const pcmBlob = createPcmBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(audioCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              const functionResponses: any[] = [];
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'get_oa_stats') {
                  const op = (fc.args as any).operation;
                  addLog('system', `Running Analysis: ${op}`);
                  
                  const queryResult = await executeOAQuery(op);
                  setLastQuery(queryResult);
                  
                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { result: queryResult.result },
                  });
                }
              }
              if (functionResponses.length > 0) {
                 sessionPromiseRef.current?.then(session => {
                    session.sendToolResponse({ functionResponses });
                 });
              }
            }

            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputContextRef.current) {
              const ctx = outputContextRef.current;
              const buffer = await decodeAudioData(base64ToUint8Array(audioData), ctx);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
              source.start(startTime);
              nextStartTimeRef.current = startTime + buffer.duration;
            }
            
            if (message.serverContent?.interrupted) {
              addLog('system', 'Interrupted.');
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            setConnectionState(ConnectionState.DISCONNECTED);
            addLog('system', 'Session disconnected.');
          },
          onerror: (err) => {
            console.error(err);
            setConnectionState(ConnectionState.ERROR);
            addLog('system', 'Connection error.');
          }
        }
      });

    } catch (e: any) {
      console.error(e);
      setConnectionState(ConnectionState.ERROR);
      addLog('system', `Failed: ${e.message}`);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (sessionPromiseRef.current) {
      // Cleanup would go here
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    processorRef.current?.disconnect();
    inputSourceRef.current?.disconnect();
    audioContextRef.current?.close();
    outputContextRef.current?.close();
    setConnectionState(ConnectionState.DISCONNECTED);
    setVolume(0);
  }, []);

  return {
    connect,
    disconnect,
    connectionState,
    volume,
    logs,
    lastQuery
  };
};