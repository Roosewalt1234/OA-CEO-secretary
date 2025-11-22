import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, Tool } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';
import { ConnectionState, LogMessage, GEMINI_API_KEY } from '../types';
import { searchBusinessData } from '../services/supabaseService';

// Define the tool for the model
const searchToolDeclaration: FunctionDeclaration = {
  name: 'searchBusinessKnowledgeBase',
  description: 'Search the internal company database for business information, reports, metrics, or policies.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query to look up in the business database.',
      },
    },
    required: ['query'],
  },
};

const TOOLS: Tool[] = [{ functionDeclarations: [searchToolDeclaration] }];

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

export const useGeminiLive = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [volume, setVolume] = useState<number>(0);
  const [logs, setLogs] = useState<LogMessage[]>([]);

  // Refs for audio handling to avoid re-renders
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

      // Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });

      // Start Session
      sessionPromiseRef.current = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are the Executive Secretary to the CEO. You are professional, efficient, and knowledgeable. You have access to the company's internal Supabase database via the 'searchBusinessKnowledgeBase' tool. When asked a business question, ALWAYS use the tool to find the answer. Do not hallucinate facts. If the tool returns no data, state that you cannot find that information in the records. Keep your spoken responses concise (under 3 sentences unless asked for detail) as this is a voice conversation.",
          tools: TOOLS,
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            addLog('system', 'Voice session established.');
            
            // Setup Input Processing
            const source = audioCtx.createMediaStreamSource(stream);
            inputSourceRef.current = source;
            
            // Use ScriptProcessor for broad compatibility with 16kHz requirement
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Calculate volume for visualizer
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setVolume(rms); // Update UI volume

              const pcmBlob = createPcmBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(audioCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Tool Calls (Supabase Search)
            if (message.toolCall) {
              addLog('system', 'Model requested information lookup...');
              const functionResponses: any[] = [];
              
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'searchBusinessKnowledgeBase') {
                  const query = (fc.args as any).query;
                  addLog('system', `Querying Supabase: "${query}"`);
                  
                  const result = await searchBusinessData(query);
                  addLog('system', `Data retrieved. Sending to model.`);
                  
                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { result },
                  });
                }
              }

              if (functionResponses.length > 0) {
                 sessionPromiseRef.current?.then(session => {
                    session.sendToolResponse({ functionResponses });
                 });
              }
            }

            // Handle Audio Output
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputContextRef.current) {
              const ctx = outputContextRef.current;
              const buffer = await decodeAudioData(base64ToUint8Array(audioData), ctx);
              
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              
              const currentTime = ctx.currentTime;
              // Ensure smooth scheduling
              const startTime = Math.max(nextStartTimeRef.current, currentTime);
              source.start(startTime);
              nextStartTimeRef.current = startTime + buffer.duration;
            }
            
            // Handle Interruption
            if (message.serverContent?.interrupted) {
              addLog('system', 'User interrupted.');
              nextStartTimeRef.current = 0;
              // In a real app we would stop currently playing nodes here, 
              // but Web Audio scheduling management is complex for this scope.
              // Resetting time is the critical part for new audio.
            }
          },
          onclose: () => {
            setConnectionState(ConnectionState.DISCONNECTED);
            addLog('system', 'Session closed.');
          },
          onerror: (err) => {
            console.error(err);
            setConnectionState(ConnectionState.ERROR);
            addLog('system', 'Session error occurred.');
          }
        }
      });

    } catch (e: any) {
      console.error(e);
      setConnectionState(ConnectionState.ERROR);
      addLog('system', `Connection failed: ${e.message}`);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      // There isn't a direct disconnect on the session object in the provided snippet,
      // but we can close local resources.
      // Usually, closing the input stream ends the session effectively or we wait for server timeout.
      // However, proper cleanup:
    }
    
    // Stop local audio
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }
    setConnectionState(ConnectionState.DISCONNECTED);
    setVolume(0);
  }, []);

  return {
    connect,
    disconnect,
    connectionState,
    volume,
    logs
  };
};