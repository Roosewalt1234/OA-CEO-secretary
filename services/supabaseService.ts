import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../types';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http'));

if (!isSupabaseConfigured) {
  console.warn("Supabase configuration missing:", { url: !!SUPABASE_URL, key: !!SUPABASE_KEY });
}

const supabase = isSupabaseConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

export interface OAQueryResult {
  sql: string;
  result: string;
  timestamp: Date;
}

// Mock data to use if Supabase is not connected or table is missing
const MOCK_DATA = [
  { Building_name: 'Skyline Tower', Owners_name: 'John Smith', Pending_dues: 15000.50 },
  { Building_name: 'Skyline Tower', Owners_name: 'Alice Wong', Pending_dues: 4200.00 },
  { Building_name: 'Ocean Heights', Owners_name: 'Sarah Jones', Pending_dues: 28500.00 },
  { Building_name: 'Ocean Heights', Owners_name: 'Bob Miller', Pending_dues: 0 },
  { Building_name: 'Palm Residency', Owners_name: 'Ahmed Ali', Pending_dues: 45000.75 },
  { Building_name: 'Palm Residency', Owners_name: 'Fatima Noor', Pending_dues: 1200.00 },
  { Building_name: 'Marina View', Owners_name: 'Tech Corp Ltd', Pending_dues: 125000.00 },
];

export const executeOAQuery = async (operation: string): Promise<OAQueryResult> => {
  let sql = '';
  let resultText = '';
  let rawData: any[] | null = null;

  try {
    // 1. TOTAL COLLECTABLES
    if (operation === 'TOTAL_COLLECTABLES') {
      sql = "SELECT SUM(Pending_dues) AS total_collectables FROM vw_building_owner_pending_dues;";
      
      if (supabase) {
        const { data, error } = await supabase.from('vw_building_owner_pending_dues').select('Pending_dues');
        if (!error && data) rawData = data;
      }
      
      if (!rawData) rawData = MOCK_DATA;

      const total = rawData.reduce((sum, row) => sum + (Number(row.Pending_dues) || 0), 0);
      resultText = `AED ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    // 2. MAX BUILDING DUE
    else if (operation === 'MAX_BUILDING') {
      sql = `SELECT Building_name, SUM(Pending_dues) AS total_due 
FROM vw_building_owner_pending_dues 
GROUP BY Building_name 
ORDER BY total_due DESC LIMIT 1;`;

      if (supabase) {
        const { data, error } = await supabase.from('vw_building_owner_pending_dues').select('Building_name, Pending_dues');
        if (!error && data) rawData = data;
      }
      
      if (!rawData) rawData = MOCK_DATA;

      const groups: Record<string, number> = {};
      rawData.forEach(row => {
        const name = row.Building_name || 'Unknown';
        groups[name] = (groups[name] || 0) + (Number(row.Pending_dues) || 0);
      });

      const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        resultText = `${sorted[0][0]} (AED ${sorted[0][1].toLocaleString(undefined, { minimumFractionDigits: 2 })})`;
      } else {
        resultText = "No building data found.";
      }
    }

    // 3. MAX OWNER DUE
    else if (operation === 'MAX_OWNER') {
      sql = `SELECT Owners_name, SUM(Pending_dues) AS total_due 
FROM vw_building_owner_pending_dues 
GROUP BY Owners_name 
ORDER BY total_due DESC LIMIT 1;`;

      if (supabase) {
        const { data, error } = await supabase.from('vw_building_owner_pending_dues').select('Owners_name, Pending_dues');
        if (!error && data) rawData = data;
      }

      if (!rawData) rawData = MOCK_DATA;

      const groups: Record<string, number> = {};
      rawData.forEach(row => {
        const name = row.Owners_name || 'Unknown';
        groups[name] = (groups[name] || 0) + (Number(row.Pending_dues) || 0);
      });

      const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        resultText = `${sorted[0][0]} (AED ${sorted[0][1].toLocaleString(undefined, { minimumFractionDigits: 2 })})`;
      } else {
        resultText = "No owner data found.";
      }
    }

    // 4. COUNT BUILDINGS
    else if (operation === 'COUNT_BUILDINGS') {
      sql = "SELECT COUNT(DISTINCT Building_name) AS total_buildings FROM vw_building_owner_pending_dues;";

      if (supabase) {
        const { data, error } = await supabase.from('vw_building_owner_pending_dues').select('Building_name');
        if (!error && data) rawData = data;
      }

      if (!rawData) rawData = MOCK_DATA;

      const uniqueBuildings = new Set(rawData.map(r => r.Building_name));
      resultText = `${uniqueBuildings.size}`;
    }
    else {
      sql = "-- Unknown Query --";
      resultText = "Error: Unknown operation requested.";
    }

    return {
      sql,
      result: resultText,
      timestamp: new Date()
    };

  } catch (err: any) {
    console.error("OA Query Error:", err);
    return {
      sql: sql || "SELECT * FROM vw_building_owner_pending_dues -- Error",
      result: `System Error: ${err.message}`,
      timestamp: new Date()
    };
  }
};