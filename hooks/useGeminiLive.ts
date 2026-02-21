import { useEffect, useRef, useState, useCallback } from 'react';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  FunctionDeclaration,
  Type,
  Tool,
} from '@google/genai';
import {
  createPcmBlob,
  decodeAudioData,
  base64ToUint8Array,
} from '../utils/audioUtils';
import { ConnectionState, LogMessage, GEMINI_API_KEY } from '../types';
import { executeOAQuery, executeMaintenanceQuery, executeOwnerQuery, executeBuildingQuery, OAQueryResult } from '../services/supabaseService';

const oaStatsTool: FunctionDeclaration = {
  name: 'get_oa_stats',
  description:
    'Run a specific statistical query against the Owners Association database (vw_building_owner_pending_dues).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ['TOTAL_COLLECTABLES', 'MAX_BUILDING', 'MAX_OWNER', 'COUNT_BUILDINGS', 'BUILDING_OUTSTANDING'],
        description: 'The specific statistic to retrieve from the database.',
      },
      building_name: {
        type: Type.STRING,
        description:
          'Building name to match when operation is BUILDING_OUTSTANDING. Use the user-provided building name.',
      },
    },
    required: ['operation'],
  },
};

const maintenanceLogsTool: FunctionDeclaration = {
  name: 'get_maintenance_logs',
  description: 'Query the maintenance_logs table for counts, lists, summaries, or ticket details.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: [
          'SUMMARY',
          'COUNT',
          'LIST',
          'DETAIL',
          'OVERDUE',
          'AVG_RESOLUTION_DAYS',
          'TOP_CATEGORIES',
          'TOP_ENGINEERS',
        ],
        description: 'The maintenance log operation to run.',
      },
      status: {
        type: Type.STRING,
        enum: ['Open', 'In Progress', 'Completed', 'Cancelled'],
        description: 'Filter by status.',
      },
      priority: {
        type: Type.STRING,
        enum: ['Low', 'Medium', 'High', 'Critical'],
        description: 'Filter by priority.',
      },
      issue_category: {
        type: Type.STRING,
        description: 'Filter by issue category (partial match).',
      },
      reporter_type: {
        type: Type.STRING,
        enum: ['Owner', 'Tenant'],
        description: 'Filter by reporter type.',
      },
      engineer_name: {
        type: Type.STRING,
        description: 'Filter by assigned engineer name (partial match).',
      },
      bldg_number: {
        type: Type.STRING,
        description: 'Filter by building UUID (bldg_number).',
      },
      unit_id: {
        type: Type.STRING,
        description: 'Filter by unit UUID.',
      },
      log_id: {
        type: Type.STRING,
        description: 'Maintenance log UUID (id).',
      },
      ticket_number: {
        type: Type.STRING,
        description: 'Maintenance ticket number (maintenance_tecket_number).',
      },
      date_from: {
        type: Type.STRING,
        description: 'Start date (YYYY-MM-DD or ISO). Filters by created date unless operation uses committed/completed.',
      },
      date_to: {
        type: Type.STRING,
        description: 'End date (YYYY-MM-DD or ISO). Filters by created date unless operation uses committed/completed.',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Maximum rows to list (1-20). Default 5.',
      },
    },
    required: ['operation'],
  },
};

const ownersTool: FunctionDeclaration = {
  name: 'get_owner_details',
  description: 'Query the Owners List table for owner profiles, contacts, or pending dues.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ['SUMMARY', 'COUNT', 'LIST', 'DETAIL', 'OVERDUE', 'TOP_DUES'],
        description: 'The owner query operation to run.',
      },
      owner_name: {
        type: Type.STRING,
        description: 'Owner name (partial match).',
      },
      building_name: {
        type: Type.STRING,
        description: 'Building name (partial match).',
      },
      unit_number: {
        type: Type.STRING,
        description: 'Unit number.',
      },
      owner_id: {
        type: Type.STRING,
        description: 'Owner UUID.',
      },
      mobile_number: {
        type: Type.STRING,
        description: 'Mobile number.',
      },
      email_id: {
        type: Type.STRING,
        description: 'Email address.',
      },
      occupancy_status: {
        type: Type.STRING,
        enum: ['Owner Staying', 'Rented Out', 'Vacant'],
        description: 'Occupancy status filter.',
      },
      bldg_number: {
        type: Type.STRING,
        description: 'Building UUID (bldg_number).',
      },
      pending_dues_min: {
        type: Type.NUMBER,
        description: 'Minimum pending dues.',
      },
      pending_dues_max: {
        type: Type.NUMBER,
        description: 'Maximum pending dues.',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Maximum rows to list (1-20). Default 5.',
      },
    },
    required: ['operation'],
  },
};

const buildingsTool: FunctionDeclaration = {
  name: 'get_building_details',
  description: 'Query the Building names table for building contacts, location, or OA manager.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ['COUNT', 'LIST', 'DETAIL'],
        description: 'The building query operation to run.',
      },
      building_name: {
        type: Type.STRING,
        description: 'Building name (partial match).',
      },
      location: {
        type: Type.STRING,
        description: 'Location (partial match).',
      },
      mobile_number: {
        type: Type.STRING,
        description: 'Mobile number.',
      },
      landline_number: {
        type: Type.STRING,
        description: 'Landline number.',
      },
      email: {
        type: Type.STRING,
        description: 'Email address.',
      },
      oa_manager: {
        type: Type.STRING,
        description: 'OA manager name (partial match).',
      },
      bldg_number: {
        type: Type.STRING,
        description: 'Building UUID (Bldg_number).',
      },
      limit: {
        type: Type.NUMBER,
        description: 'Maximum rows to list (1-20). Default 5.',
      },
    },
    required: ['operation'],
  },
};

const TOOLS: Tool[] = [{ functionDeclarations: [oaStatsTool, maintenanceLogsTool, ownersTool, buildingsTool] }];
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const SYSTEM_INSTRUCTION =
  'You are Nathasha, an analytics AI assistant for an Owners Association (OA) management company. ' +
  'When users ask for OA financial statistics, call get_oa_stats with one valid operation. ' +
  'If the user asks for outstanding dues for a specific building, always call BUILDING_OUTSTANDING and pass building_name. ' +
  'When users ask about maintenance logs, tickets, statuses, counts, overdue items, or priorities, call get_maintenance_logs with the appropriate operation and filters. ' +
  'When users ask about owners, owner contact details, pending dues, or occupancy status, call get_owner_details with the appropriate operation and filters. ' +
  'When users ask about building contact details, locations, or OA managers, call get_building_details with the appropriate operation and filters. ' +
  'If a required identifier is missing (ticket number or log ID), ask the user to provide it. ' +
  'Do not guess values. If the tool response asks for confirmation or returns multiple close matches, ask the user to confirm the exact building name before finalizing. ' +
  'Respond in concise, executive-friendly voice.';

export const useGeminiLive = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED
  );
  const [volume, setVolume] = useState<number>(0);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [lastQuery, setLastQuery] = useState<OAQueryResult | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sessionRef = useRef<any | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isConnectedRef = useRef<boolean>(false);
  const isConnectingRef = useRef<boolean>(false);

  const addLog = (role: 'user' | 'model' | 'system', text: string) => {
    setLogs(prev =>
      [...prev, { id: Math.random().toString(36).substring(7), role, text, timestamp: new Date() }].slice(-50)
    );
  };

  const connect = useCallback(async () => {
    const apiKey = GEMINI_API_KEY;

    if (!apiKey) {
      addLog('system', 'Error: GEMINI_API_KEY not found.');
      setConnectionState(ConnectionState.ERROR);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      addLog('system', 'Error: Microphone is not supported in this browser.');
      setConnectionState(ConnectionState.ERROR);
      return;
    }

    if (isConnectingRef.current || isConnectedRef.current || sessionPromiseRef.current) {
      addLog('system', 'Already connected or connecting. Ignoring extra connect().');
      return;
    }

    try {
      isConnectingRef.current = true;
      setConnectionState(ConnectionState.CONNECTING);

      const InputContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new InputContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const OutputContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      const outputCtx = new OutputContextClass({ sampleRate: 24000 });
      outputContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: TOOLS,
        },
        callbacks: {
          onopen: async () => {
            isConnectedRef.current = true;
            setConnectionState(ConnectionState.CONNECTED);
            addLog('system', 'Nathasha Connected.');

            const source = audioCtx.createMediaStreamSource(stream);
            inputSourceRef.current = source;

            try {
              await audioCtx.audioWorklet.addModule('/audio-processor.js');
              const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');
              workletNodeRef.current = workletNode;

              workletNode.port.onmessage = event => {
                const { type, data, volume: vol } = event.data;

                if (type === 'volume') {
                  setVolume(vol);
                  return;
                }

                if (type === 'audio') {
                  setVolume(vol);

                  const session = sessionRef.current;
                  if (!session || !isConnectedRef.current) {
                    return;
                  }

                  try {
                    const pcmBlob = createPcmBlob(data);
                    session.sendRealtimeInput({ media: pcmBlob });
                  } catch (err) {
                    console.warn('sendRealtimeInput failed:', err);
                  }
                }
              };

              source.connect(workletNode);
              workletNode.connect(audioCtx.destination);
            } catch (err) {
              console.error('Failed to initialize audio worklet:', err);
              addLog('system', 'Audio processing error. Disconnecting...');
              isConnectedRef.current = false;
              if (sessionRef.current) {
                try {
                  sessionRef.current.disconnect();
                } catch (disconnectErr) {
                  console.warn('Error disconnecting after worklet failure:', disconnectErr);
                }
              }
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              const functionResponses: any[] = [];

              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'get_oa_stats') {
                  const op = (fc.args as any)?.operation as string | undefined;
                  const buildingName = (fc.args as any)?.building_name as string | undefined;

                  if (!op) {
                    functionResponses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { error: 'Missing operation argument.' },
                    });
                    continue;
                  }

                  addLog('system', `Running analysis: ${op}`);

                  const queryResult = await executeOAQuery(op, '', {
                    buildingName,
                  });
                  setLastQuery(queryResult);
                  addLog('model', queryResult.result);

                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { result: queryResult.result },
                  });
                }

                if (fc.name === 'get_maintenance_logs') {
                  const args = (fc.args as any) || {};
                  const op = args?.operation as string | undefined;

                  if (!op) {
                    functionResponses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { error: 'Missing operation argument.' },
                    });
                    continue;
                  }

                  addLog('system', `Running maintenance query: ${op}`);

                  const queryResult = await executeMaintenanceQuery(op, '', {
                    status: args?.status,
                    priority: args?.priority,
                    issueCategory: args?.issue_category,
                    reporterType: args?.reporter_type,
                    engineerName: args?.engineer_name,
                    bldgNumber: args?.bldg_number,
                    unitId: args?.unit_id,
                    logId: args?.log_id,
                    ticketNumber: args?.ticket_number,
                    dateFrom: args?.date_from,
                    dateTo: args?.date_to,
                    limit: args?.limit,
                  });
                  setLastQuery(queryResult);
                  addLog('model', queryResult.result);

                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { result: queryResult.result },
                  });
                }

                if (fc.name === 'get_owner_details') {
                  const args = (fc.args as any) || {};
                  const op = args?.operation as string | undefined;

                  if (!op) {
                    functionResponses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { error: 'Missing operation argument.' },
                    });
                    continue;
                  }

                  addLog('system', `Running owner query: ${op}`);

                  const queryResult = await executeOwnerQuery(op, '', {
                    ownerName: args?.owner_name,
                    buildingName: args?.building_name,
                    unitNumber: args?.unit_number,
                    ownerId: args?.owner_id,
                    mobileNumber: args?.mobile_number,
                    emailId: args?.email_id,
                    occupancyStatus: args?.occupancy_status,
                    bldgNumber: args?.bldg_number,
                    pendingDuesMin: args?.pending_dues_min,
                    pendingDuesMax: args?.pending_dues_max,
                    limit: args?.limit,
                  });
                  setLastQuery(queryResult);
                  addLog('model', queryResult.result);

                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { result: queryResult.result },
                  });
                }

                if (fc.name === 'get_building_details') {
                  const args = (fc.args as any) || {};
                  const op = args?.operation as string | undefined;

                  if (!op) {
                    functionResponses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { error: 'Missing operation argument.' },
                    });
                    continue;
                  }

                  addLog('system', `Running building query: ${op}`);

                  const queryResult = await executeBuildingQuery(op, '', {
                    buildingName: args?.building_name,
                    location: args?.location,
                    mobileNumber: args?.mobile_number,
                    landlineNumber: args?.landline_number,
                    email: args?.email,
                    oaManager: args?.oa_manager,
                    bldgNumber: args?.bldg_number,
                    limit: args?.limit,
                  });
                  setLastQuery(queryResult);
                  addLog('model', queryResult.result);

                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { result: queryResult.result },
                  });
                }
              }

              const session = sessionRef.current;
              if (functionResponses.length > 0 && session && isConnectedRef.current) {
                try {
                  session.sendToolResponse({ functionResponses });
                } catch (err) {
                  console.warn('sendToolResponse failed:', err);
                }
              }
            }

            const audioData =
              message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputContextRef.current) {
              const ctx = outputContextRef.current;
              try {
                const buffer = await decodeAudioData(
                  base64ToUint8Array(audioData),
                  ctx
                );
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);

                const startTime = Math.max(
                  nextStartTimeRef.current,
                  ctx.currentTime
                );
                source.start(startTime);
                nextStartTimeRef.current = startTime + buffer.duration;
              } catch (err) {
                console.error('Playback error:', err);
              }
            }

            const parts = message.serverContent?.modelTurn?.parts;
            if (parts && Array.isArray(parts)) {
              for (const part of parts) {
                const text = (part as any)?.text;
                if (typeof text === 'string' && text.trim()) {
                  addLog('model', text.trim());
                }
              }
            }

            if (message.serverContent?.interrupted) {
              addLog('system', 'Interrupted.');
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            isConnectedRef.current = false;
            sessionRef.current = null;
            sessionPromiseRef.current = null;
            setConnectionState(ConnectionState.DISCONNECTED);
            addLog('system', 'Session disconnected.');
          },
          onerror: err => {
            console.error('[Gemini Live] onerror:', err);
            setConnectionState(ConnectionState.ERROR);
            addLog('system', 'Connection error.');
          },
        },
      });

      sessionPromiseRef.current = sessionPromise;

      sessionPromise
        .then(session => {
          sessionRef.current = session;
        })
        .catch(err => {
          console.error('Session init failed:', err);
          setConnectionState(ConnectionState.ERROR);
          addLog('system', 'Session initialization error.');
        })
        .finally(() => {
          isConnectingRef.current = false;
        });
    } catch (e: any) {
      console.error(e);
      isConnectingRef.current = false;
      setConnectionState(ConnectionState.ERROR);
      addLog('system', `Failed: ${e.message}`);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!isConnectingRef.current && !isConnectedRef.current && !sessionPromiseRef.current) {
      return;
    }

    isConnectedRef.current = false;

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch {
      }
      workletNodeRef.current = null;
    }

    if (inputSourceRef.current) {
      try {
        inputSourceRef.current.disconnect();
      } catch {
      }
      inputSourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    const session = sessionRef.current;
    if (session) {
      try {
        if (typeof session.close === 'function') {
          await session.close();
        } else if (typeof session.disconnect === 'function') {
          await session.disconnect();
        }
      } catch (err) {
        console.warn('Error while closing session (safe to ignore if already closed):', err);
      }
    }

    sessionRef.current = null;
    sessionPromiseRef.current = null;

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
      }
      audioContextRef.current = null;
    }

    if (outputContextRef.current) {
      try {
        await outputContextRef.current.close();
      } catch {
      }
      outputContextRef.current = null;
    }

    nextStartTimeRef.current = 0;
    setVolume(0);
    setConnectionState(ConnectionState.DISCONNECTED);
    addLog('system', 'Disconnected by user.');
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    connectionState,
    volume,
    logs,
    lastQuery,
  };
};
