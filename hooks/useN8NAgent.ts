import { useState, useCallback } from 'react';
import { ConnectionState, LogMessage } from '../types';
import { OAQueryResult } from '../services/supabaseService';

const N8N_WEBHOOK_URL = 'https://primary-production-60c2c.up.railway.app/webhook-test/oa-ceo-secretary';

export const useN8NAgent = () => {
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [lastQuery, setLastQuery] = useState<OAQueryResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const addLog = (role: 'user' | 'model' | 'system', text: string) => {
        setLogs(prev =>
            [...prev, { id: Math.random().toString(36).substring(7), role, text, timestamp: new Date() }].slice(-50)
        );
    };

    const sendQuery = useCallback(async (query: string) => {
        if (!query.trim()) {
            addLog('system', 'Please provide a query.');
            return;
        }

        setIsProcessing(true);
        addLog('user', query);
        addLog('system', 'Processing your request...');

        try {
            console.log('[N8N] Sending query to webhook:', query);

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('[N8N] Response received:', result);

            // Extract the answer from n8n response
            const answer = result.answer || result.response || result.message || 'No response received';
            const sql = result.sql || '';

            addLog('model', answer);

            // Store last query result
            setLastQuery({
                sql: sql,
                result: answer,
                timestamp: new Date()
            });

            console.log('[N8N] ✓ Query processed successfully');

        } catch (error: any) {
            console.error('[N8N] Error:', error);

            let errorMessage = error.message;
            if (error.message === 'Failed to fetch') {
                errorMessage = 'Network Error: Possible CORS issue or server unreachable.';
            } else if (error.message.includes('500')) {
                errorMessage = 'N8N Workflow Failed (500). Check n8n "Executions" tab for details.';
            }

            addLog('system', `Error: ${errorMessage}`);
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const connect = useCallback(async () => {
        setConnectionState(ConnectionState.CONNECTED);
        addLog('system', 'Connected to N8N AI Agent');
    }, []);

    const disconnect = useCallback(async () => {
        setConnectionState(ConnectionState.DISCONNECTED);
        addLog('system', 'Disconnected from N8N AI Agent');
    }, []);

    return {
        connect,
        disconnect,
        sendQuery,
        connectionState,
        logs,
        lastQuery,
        isProcessing
    };
};
