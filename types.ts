export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface BusinessDoc {
  id: number;
  title: string;
  content: string;
  created_at?: string;
}

export interface LogMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}

// Helper to get env vars safely in Vite environment with fallback
const getEnvVar = (key: string, viteKey: string, fallback: string) => {
  // Check import.meta.env first (Vite standard)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const val = (import.meta as any).env[viteKey];
    if (val) return val;
  }
  // Check process.env (legacy/backend/compatibility)
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[key];
    if (val) return val;
  }
  return fallback;
};

// Supabase environment variable types
// We map the standard names to the VITE_ names provided
export const SUPABASE_URL = getEnvVar(
  'SUPABASE_URL', 
  'VITE_SUPABASE_URL', 
  'https://cfsrykiwrzavteacczzn.supabase.co'
);

export const SUPABASE_KEY = getEnvVar(
  'SUPABASE_KEY', 
  'VITE_SUPABASE_PUBLISHABLE_KEY', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmc3J5a2l3cnphdnRlYWNjenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5OTMyNzcsImV4cCI6MjA3NDU2OTI3N30.YaRbdKsKI9GqHnmpL3eoTsyapabCJGN9TsWUXySBD2Q'
);

export const GEMINI_API_KEY = getEnvVar(
  'API_KEY', 
  'VITE_GEMINI_API_KEY', 
  'AIzaSyDM_HiCH6Pd3gfyTiDAG-WOAK9476SFRVs'
);