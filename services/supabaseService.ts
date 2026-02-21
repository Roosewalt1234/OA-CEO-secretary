import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../types';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http'));

console.log('[SUPABASE] Configuration check:', {
  url: SUPABASE_URL ? 'SET' : 'NOT SET',
  key: SUPABASE_KEY ? 'SET' : 'NOT SET',
  configured: isSupabaseConfigured
});

if (!isSupabaseConfigured) {
  console.warn("[SUPABASE] Configuration missing");
}

const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

export interface OAQueryResult {
  sql: string;
  result: string;
  timestamp: Date;
}

export interface OAQueryOptions {
  buildingName?: string;
}

export interface MaintenanceQueryOptions {
  status?: string;
  priority?: string;
  issueCategory?: string;
  reporterType?: string;
  engineerName?: string;
  bldgNumber?: string;
  unitId?: string;
  logId?: string;
  ticketNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface OwnerQueryOptions {
  ownerName?: string;
  buildingName?: string;
  unitNumber?: string;
  ownerId?: string;
  mobileNumber?: string;
  emailId?: string;
  occupancyStatus?: string;
  bldgNumber?: string;
  pendingDuesMin?: number;
  pendingDuesMax?: number;
  limit?: number;
}

export interface BuildingQueryOptions {
  buildingName?: string;
  location?: string;
  mobileNumber?: string;
  landlineNumber?: string;
  email?: string;
  oaManager?: string;
  bldgNumber?: string;
  limit?: number;
}

// Log AI interactions to Supabase for training
export async function logAIInteraction(
  query: string,
  operation: string,
  sql: string,
  result: string
): Promise<void> {
  if (!supabase) {
    console.warn('[SUPABASE] Cannot log interaction - supabase not configured');
    return;
  }

  try {
    const { error } = await supabase
      .from('ai_query_logs')
      .insert({
        user_query: query,
        operation_type: operation,
        sql_executed: sql,
        ai_response: result,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('[SUPABASE] Error logging AI interaction:', error.message);
    } else {
      console.log('[SUPABASE] ✓ AI interaction logged for training');
    }
  } catch (err) {
    console.error('[SUPABASE] Failed to log AI interaction:', err);
  }
}

// Helper function to fetch ALL rows using pagination
async function fetchAllRows(tableName: string, columns: string): Promise<any[]> {
  if (!supabase) return [];

  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('[SUPABASE] Error on page', page + 1, ':', error.message);
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      console.log('[SUPABASE] Page', page + 1, ':', data.length, 'rows (total:', allData.length, ')');

      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

async function fetchRowsByBuildingName(buildingName: string): Promise<any[]> {
  if (!supabase) return [];

  const pattern = `%${buildingName}%`;
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vw_building_owner_pending_dues')
      .select('building, amount_due')
      .ilike('building', pattern)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('[SUPABASE] Building lookup error on page', page + 1, ':', error.message);
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

async function fetchRowsByExactBuildingName(buildingName: string): Promise<any[]> {
  if (!supabase) return [];

  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vw_building_owner_pending_dues')
      .select('building, amount_due')
      .ilike('building', buildingName)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('[SUPABASE] Exact building lookup error on page', page + 1, ':', error.message);
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

async function fetchDistinctBuildingNames(): Promise<string[]> {
  if (!supabase) return [];

  const rows = await fetchAllRows('vw_building_owner_pending_dues', 'building');
  const names = new Set<string>();

  rows.forEach(row => {
    const name = (row?.building || '').toString().trim();
    if (name) {
      names.add(name);
    }
  });

  return Array.from(names);
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function tokenize(value: string): string[] {
  return normalizeLookup(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function jaccardSimilarity(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let intersection = 0;
  a.forEach(token => {
    if (b.has(token)) intersection++;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizedEditSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : 1 - distance / maxLen;
}

function tokenFuzzyCoverage(inputTokens: string[], candidateTokens: string[]): number {
  if (inputTokens.length === 0 || candidateTokens.length === 0) return 0;
  let total = 0;

  inputTokens.forEach(inputToken => {
    let best = 0;
    candidateTokens.forEach(candidateToken => {
      const score = normalizedEditSimilarity(inputToken, candidateToken);
      if (score > best) best = score;
    });
    total += best;
  });

  return total / inputTokens.length;
}

function similarityScore(input: string, candidate: string): number {
  const normalizedInput = normalizeLookup(input);
  const normalizedCandidate = normalizeLookup(candidate);

  if (!normalizedInput || !normalizedCandidate) return 0;
  if (normalizedInput === normalizedCandidate) return 1;

  const inputTokens = tokenize(input);
  const candidateTokens = tokenize(candidate);
  const tokenScore = jaccardSimilarity(inputTokens, candidateTokens);
  const fuzzyTokenScore = tokenFuzzyCoverage(inputTokens, candidateTokens);

  const editScore = normalizedEditSimilarity(normalizedInput, normalizedCandidate);

  const containsBonus =
    normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate)
      ? 0.08
      : 0;

  return Math.min(1, tokenScore * 0.2 + fuzzyTokenScore * 0.5 + editScore * 0.3 + containsBonus);
}

function sumOutstanding(rows: any[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.amount_due) || 0), 0);
}

const MAINTENANCE_STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled'];
const MAINTENANCE_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const MAINTENANCE_REPORTER_TYPES = ['Owner', 'Tenant'];
const OWNER_OCCUPANCY_STATUSES = ['Owner Staying', 'Rented Out', 'Vacant'];

function normalizeEnum(input: string | undefined, allowed: string[]): string | undefined {
  if (!input) return undefined;
  const match = allowed.find(option => option.toLowerCase() === input.trim().toLowerCase());
  return match;
}

function normalizeLike(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNumber(value: any): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function formatCurrency(value: number): string {
  return `AED ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildMaintenanceWhere(
  options: MaintenanceQueryOptions,
  dateField: 'created_at' | 'committed_date' | 'completed_date' | 'closed_at' = 'created_at'
): string {
  const clauses: string[] = [];

  if (options.status) {
    clauses.push(`status = '${escapeSqlLiteral(options.status)}'`);
  }
  if (options.priority) {
    clauses.push(`priority = '${escapeSqlLiteral(options.priority)}'`);
  }
  if (options.issueCategory) {
    clauses.push(`issue_category ILIKE '%${escapeSqlLiteral(options.issueCategory)}%'`);
  }
  if (options.reporterType) {
    clauses.push(`reporter_type = '${escapeSqlLiteral(options.reporterType)}'`);
  }
  if (options.engineerName) {
    clauses.push(`engineer_name ILIKE '%${escapeSqlLiteral(options.engineerName)}%'`);
  }
  if (options.bldgNumber) {
    clauses.push(`bldg_number = '${escapeSqlLiteral(options.bldgNumber)}'`);
  }
  if (options.unitId) {
    clauses.push(`unit_id = '${escapeSqlLiteral(options.unitId)}'`);
  }
  if (options.logId) {
    clauses.push(`id = '${escapeSqlLiteral(options.logId)}'`);
  }
  if (options.ticketNumber) {
    clauses.push(`maintenance_tecket_number = '${escapeSqlLiteral(options.ticketNumber)}'`);
  }
  if (options.dateFrom) {
    clauses.push(`${dateField} >= '${escapeSqlLiteral(options.dateFrom)}'`);
  }
  if (options.dateTo) {
    clauses.push(`${dateField} <= '${escapeSqlLiteral(options.dateTo)}'`);
  }

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function describeMaintenanceFilters(options: MaintenanceQueryOptions, dateFieldLabel: string = 'created date'): string {
  const parts: string[] = [];

  if (options.status) parts.push(`status ${options.status}`);
  if (options.priority) parts.push(`priority ${options.priority}`);
  if (options.issueCategory) parts.push(`category contains "${options.issueCategory}"`);
  if (options.reporterType) parts.push(`reporter type ${options.reporterType}`);
  if (options.engineerName) parts.push(`engineer "${options.engineerName}"`);
  if (options.bldgNumber) parts.push(`building ${options.bldgNumber}`);
  if (options.unitId) parts.push(`unit ${options.unitId}`);
  if (options.logId) parts.push(`log ID ${options.logId}`);
  if (options.ticketNumber) parts.push(`ticket ${options.ticketNumber}`);
  if (options.dateFrom || options.dateTo) {
    const from = options.dateFrom ? options.dateFrom : 'any';
    const to = options.dateTo ? options.dateTo : 'any';
    parts.push(`${dateFieldLabel} ${from} to ${to}`);
  }

  return parts.length ? ` (${parts.join(', ')})` : '';
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (!limit || Number.isNaN(limit)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(limit)));
}

async function fetchMaintenanceRows(
  columns: string,
  options: MaintenanceQueryOptions,
  orderBy: { column: string; ascending: boolean } | null = null,
  limit?: number,
  dateField: 'created_at' | 'committed_date' | 'completed_date' | 'closed_at' = 'created_at'
): Promise<any[]> {
  if (!supabase) return [];

  let query = supabase.from('maintenance_logs').select(columns);

  if (options.status) query = query.eq('status', options.status);
  if (options.priority) query = query.eq('priority', options.priority);
  if (options.issueCategory) query = query.ilike('issue_category', `%${options.issueCategory}%`);
  if (options.reporterType) query = query.eq('reporter_type', options.reporterType);
  if (options.engineerName) query = query.ilike('engineer_name', `%${options.engineerName}%`);
  if (options.bldgNumber) query = query.eq('bldg_number', options.bldgNumber);
  if (options.unitId) query = query.eq('unit_id', options.unitId);
  if (options.logId) query = query.eq('id', options.logId);
  if (options.ticketNumber) query = query.eq('maintenance_tecket_number', options.ticketNumber);
  if (options.dateFrom) query = query.gte(dateField, options.dateFrom);
  if (options.dateTo) query = query.lte(dateField, options.dateTo);

  if (orderBy) {
    query = query.order(orderBy.column, { ascending: orderBy.ascending });
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[SUPABASE] Maintenance query error:', error.message);
    throw new Error(error.message);
  }

  return data || [];
}

async function countMaintenanceRows(
  options: MaintenanceQueryOptions,
  dateField: 'created_at' | 'committed_date' | 'completed_date' | 'closed_at' = 'created_at'
): Promise<number> {
  if (!supabase) return 0;

  let query = supabase.from('maintenance_logs').select('id', { count: 'exact', head: true });

  if (options.status) query = query.eq('status', options.status);
  if (options.priority) query = query.eq('priority', options.priority);
  if (options.issueCategory) query = query.ilike('issue_category', `%${options.issueCategory}%`);
  if (options.reporterType) query = query.eq('reporter_type', options.reporterType);
  if (options.engineerName) query = query.ilike('engineer_name', `%${options.engineerName}%`);
  if (options.bldgNumber) query = query.eq('bldg_number', options.bldgNumber);
  if (options.unitId) query = query.eq('unit_id', options.unitId);
  if (options.logId) query = query.eq('id', options.logId);
  if (options.ticketNumber) query = query.eq('maintenance_tecket_number', options.ticketNumber);
  if (options.dateFrom) query = query.gte(dateField, options.dateFrom);
  if (options.dateTo) query = query.lte(dateField, options.dateTo);

  const { count, error } = await query;
  if (error) {
    console.error('[SUPABASE] Maintenance count error:', error.message);
    throw new Error(error.message);
  }

  return count || 0;
}

async function fetchOwnerRows(
  columns: string,
  options: OwnerQueryOptions,
  orderBy: { column: string; ascending: boolean } | null = null,
  limit?: number
): Promise<any[]> {
  if (!supabase) return [];

  let query = supabase.from('Owners List').select(columns);

  if (options.ownerName) query = query.ilike('Owners_Name', `%${options.ownerName}%`);
  if (options.buildingName) query = query.ilike('Building_name', `%${options.buildingName}%`);
  if (options.unitNumber) query = query.eq('Unit_number', options.unitNumber);
  if (options.ownerId) query = query.eq('owner_id', options.ownerId);
  if (options.mobileNumber) query = query.eq('Mobile_number', options.mobileNumber);
  if (options.emailId) query = query.eq('Email_ID', options.emailId);
  if (options.occupancyStatus) query = query.eq('occupancy_status', options.occupancyStatus);
  if (options.bldgNumber) query = query.eq('bldg_number', options.bldgNumber);
  if (options.pendingDuesMin !== undefined) query = query.gte('pending_dues', options.pendingDuesMin);
  if (options.pendingDuesMax !== undefined) query = query.lte('pending_dues', options.pendingDuesMax);

  if (orderBy) {
    query = query.order(orderBy.column, { ascending: orderBy.ascending });
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[SUPABASE] Owner query error:', error.message);
    throw new Error(error.message);
  }

  return data || [];
}

async function countOwnerRows(options: OwnerQueryOptions): Promise<number> {
  if (!supabase) return 0;

  let query = supabase.from('Owners List').select('owner_id', { count: 'exact', head: true });

  if (options.ownerName) query = query.ilike('Owners_Name', `%${options.ownerName}%`);
  if (options.buildingName) query = query.ilike('Building_name', `%${options.buildingName}%`);
  if (options.unitNumber) query = query.eq('Unit_number', options.unitNumber);
  if (options.ownerId) query = query.eq('owner_id', options.ownerId);
  if (options.mobileNumber) query = query.eq('Mobile_number', options.mobileNumber);
  if (options.emailId) query = query.eq('Email_ID', options.emailId);
  if (options.occupancyStatus) query = query.eq('occupancy_status', options.occupancyStatus);
  if (options.bldgNumber) query = query.eq('bldg_number', options.bldgNumber);
  if (options.pendingDuesMin !== undefined) query = query.gte('pending_dues', options.pendingDuesMin);
  if (options.pendingDuesMax !== undefined) query = query.lte('pending_dues', options.pendingDuesMax);

  const { count, error } = await query;
  if (error) {
    console.error('[SUPABASE] Owner count error:', error.message);
    throw new Error(error.message);
  }

  return count || 0;
}

function buildOwnerWhere(options: OwnerQueryOptions): string {
  const clauses: string[] = [];

  if (options.ownerName) clauses.push(`"Owners_Name" ILIKE '%${escapeSqlLiteral(options.ownerName)}%'`);
  if (options.buildingName) clauses.push(`"Building_name" ILIKE '%${escapeSqlLiteral(options.buildingName)}%'`);
  if (options.unitNumber) clauses.push(`"Unit_number" = '${escapeSqlLiteral(options.unitNumber)}'`);
  if (options.ownerId) clauses.push(`owner_id = '${escapeSqlLiteral(options.ownerId)}'`);
  if (options.mobileNumber) clauses.push(`"Mobile_number" = '${escapeSqlLiteral(options.mobileNumber)}'`);
  if (options.emailId) clauses.push(`"Email_ID" = '${escapeSqlLiteral(options.emailId)}'`);
  if (options.occupancyStatus) clauses.push(`occupancy_status = '${escapeSqlLiteral(options.occupancyStatus)}'`);
  if (options.bldgNumber) clauses.push(`bldg_number = '${escapeSqlLiteral(options.bldgNumber)}'`);
  const min = normalizeNumber(options.pendingDuesMin);
  const max = normalizeNumber(options.pendingDuesMax);
  if (min !== undefined) clauses.push(`pending_dues >= ${min}`);
  if (max !== undefined) clauses.push(`pending_dues <= ${max}`);

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function describeOwnerFilters(options: OwnerQueryOptions): string {
  const parts: string[] = [];

  if (options.ownerName) parts.push(`name contains "${options.ownerName}"`);
  if (options.buildingName) parts.push(`building "${options.buildingName}"`);
  if (options.unitNumber) parts.push(`unit ${options.unitNumber}`);
  if (options.ownerId) parts.push(`owner ID ${options.ownerId}`);
  if (options.mobileNumber) parts.push(`mobile ${options.mobileNumber}`);
  if (options.emailId) parts.push(`email ${options.emailId}`);
  if (options.occupancyStatus) parts.push(`occupancy ${options.occupancyStatus}`);
  if (options.bldgNumber) parts.push(`building ID ${options.bldgNumber}`);
  if (options.pendingDuesMin !== undefined || options.pendingDuesMax !== undefined) {
    const min = options.pendingDuesMin !== undefined ? options.pendingDuesMin : 'any';
    const max = options.pendingDuesMax !== undefined ? options.pendingDuesMax : 'any';
    parts.push(`pending dues ${min} to ${max}`);
  }

  return parts.length ? ` (${parts.join(', ')})` : '';
}

async function fetchBuildingRows(
  columns: string,
  options: BuildingQueryOptions,
  orderBy: { column: string; ascending: boolean } | null = null,
  limit?: number
): Promise<any[]> {
  if (!supabase) return [];

  let query = supabase.from('Building names').select(columns);

  if (options.buildingName) query = query.ilike('Building_name', `%${options.buildingName}%`);
  if (options.location) query = query.ilike('Location', `%${options.location}%`);
  if (options.mobileNumber) query = query.eq('Mobile_number', options.mobileNumber);
  if (options.landlineNumber) query = query.eq('Landline_number', options.landlineNumber);
  if (options.email) query = query.eq('Email', options.email);
  if (options.oaManager) query = query.ilike('OA_Manager', `%${options.oaManager}%`);
  if (options.bldgNumber) query = query.eq('Bldg_number', options.bldgNumber);

  if (orderBy) {
    query = query.order(orderBy.column, { ascending: orderBy.ascending });
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[SUPABASE] Building query error:', error.message);
    throw new Error(error.message);
  }

  return data || [];
}

async function countBuildingRows(options: BuildingQueryOptions): Promise<number> {
  if (!supabase) return 0;

  let query = supabase.from('Building names').select('Bldg_number', { count: 'exact', head: true });

  if (options.buildingName) query = query.ilike('Building_name', `%${options.buildingName}%`);
  if (options.location) query = query.ilike('Location', `%${options.location}%`);
  if (options.mobileNumber) query = query.eq('Mobile_number', options.mobileNumber);
  if (options.landlineNumber) query = query.eq('Landline_number', options.landlineNumber);
  if (options.email) query = query.eq('Email', options.email);
  if (options.oaManager) query = query.ilike('OA_Manager', `%${options.oaManager}%`);
  if (options.bldgNumber) query = query.eq('Bldg_number', options.bldgNumber);

  const { count, error } = await query;
  if (error) {
    console.error('[SUPABASE] Building count error:', error.message);
    throw new Error(error.message);
  }

  return count || 0;
}

function buildBuildingWhere(options: BuildingQueryOptions): string {
  const clauses: string[] = [];

  if (options.buildingName) clauses.push(`"Building_name" ILIKE '%${escapeSqlLiteral(options.buildingName)}%'`);
  if (options.location) clauses.push(`"Location" ILIKE '%${escapeSqlLiteral(options.location)}%'`);
  if (options.mobileNumber) clauses.push(`"Mobile_number" = '${escapeSqlLiteral(options.mobileNumber)}'`);
  if (options.landlineNumber) clauses.push(`"Landline_number" = '${escapeSqlLiteral(options.landlineNumber)}'`);
  if (options.email) clauses.push(`"Email" = '${escapeSqlLiteral(options.email)}'`);
  if (options.oaManager) clauses.push(`"OA_Manager" ILIKE '%${escapeSqlLiteral(options.oaManager)}%'`);
  if (options.bldgNumber) clauses.push(`"Bldg_number" = '${escapeSqlLiteral(options.bldgNumber)}'`);

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function describeBuildingFilters(options: BuildingQueryOptions): string {
  const parts: string[] = [];

  if (options.buildingName) parts.push(`name contains "${options.buildingName}"`);
  if (options.location) parts.push(`location contains "${options.location}"`);
  if (options.mobileNumber) parts.push(`mobile ${options.mobileNumber}`);
  if (options.landlineNumber) parts.push(`landline ${options.landlineNumber}`);
  if (options.email) parts.push(`email ${options.email}`);
  if (options.oaManager) parts.push(`OA manager "${options.oaManager}"`);
  if (options.bldgNumber) parts.push(`building ID ${options.bldgNumber}`);

  return parts.length ? ` (${parts.join(', ')})` : '';
}

export const executeOAQuery = async (
  operation: string,
  userQuery: string = '',
  options: OAQueryOptions = {}
): Promise<OAQueryResult> => {
  let sql = '';
  let resultText = '';
  let rawData: any[] | null = null;

  try {
    // 1. TOTAL COLLECTABLES
    if (operation === 'TOTAL_COLLECTABLES') {
      sql = "SELECT SUM(amount_due) AS total_collectables FROM vw_building_owner_pending_dues;";

      console.log('[SUPABASE] Fetching ALL rows for TOTAL_COLLECTABLES...');
      rawData = await fetchAllRows('vw_building_owner_pending_dues', 'amount_due');

      if (!rawData || rawData.length === 0) {
        resultText = 'No data found in vw_building_owner_pending_dues';
      } else {
        const total = rawData.reduce((sum, row) => sum + (Number(row.amount_due) || 0), 0);
        console.log('[SUPABASE] ✓ Calculated total from', rawData.length, 'rows: AED', total);
        resultText = `AED ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }

    // 2. MAX BUILDING DUE
    else if (operation === 'MAX_BUILDING') {
      sql = `SELECT building, SUM(amount_due) AS total_due 
FROM vw_building_owner_pending_dues 
GROUP BY building 
ORDER BY total_due DESC LIMIT 1;`;

      console.log('[SUPABASE] Fetching ALL rows for MAX_BUILDING...');
      rawData = await fetchAllRows('vw_building_owner_pending_dues', 'building, amount_due');

      if (!rawData || rawData.length === 0) {
        resultText = 'No data found in vw_building_owner_pending_dues';
      } else {
        const groups: Record<string, number> = {};
        rawData.forEach(row => {
          const name = row.building || 'Unknown';
          groups[name] = (groups[name] || 0) + (Number(row.amount_due) || 0);
        });

        const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          console.log('[SUPABASE] ✓ Max building:', sorted[0][0], 'with AED', sorted[0][1]);
          resultText = `${sorted[0][0]} (AED ${sorted[0][1].toLocaleString(undefined, { minimumFractionDigits: 2 })})`;
        } else {
          resultText = "No building data found.";
        }
      }
    }

    // 3. MAX OWNER DUE
    else if (operation === 'MAX_OWNER') {
      sql = `SELECT owner_name, SUM(amount_due) AS total_due 
FROM vw_building_owner_pending_dues 
GROUP BY owner_name 
ORDER BY total_due DESC LIMIT 1;`;

      console.log('[SUPABASE] Fetching ALL rows for MAX_OWNER...');
      rawData = await fetchAllRows('vw_building_owner_pending_dues', 'owner_name, amount_due');

      if (!rawData || rawData.length === 0) {
        resultText = 'No data found in vw_building_owner_pending_dues';
      } else {
        const groups: Record<string, number> = {};
        rawData.forEach(row => {
          const name = row.owner_name || 'Unknown';
          groups[name] = (groups[name] || 0) + (Number(row.amount_due) || 0);
        });

        const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          console.log('[SUPABASE] ✓ Max owner:', sorted[0][0], 'with AED', sorted[0][1]);
          resultText = `${sorted[0][0]} (AED ${sorted[0][1].toLocaleString(undefined, { minimumFractionDigits: 2 })})`;
        } else {
          resultText = "No owner data found.";
        }
      }
    }

    // 4. COUNT BUILDINGS
    else if (operation === 'COUNT_BUILDINGS') {
      sql = "SELECT COUNT(DISTINCT building) AS total_buildings FROM vw_building_owner_pending_dues;";

      console.log('[SUPABASE] Fetching ALL rows for COUNT_BUILDINGS...');
      rawData = await fetchAllRows('vw_building_owner_pending_dues', 'building');

      if (!rawData || rawData.length === 0) {
        resultText = 'No data found in vw_building_owner_pending_dues';
      } else {
        const uniqueBuildings = new Set(rawData.map(r => r.building));
        console.log('[SUPABASE] ✓ Unique buildings count:', uniqueBuildings.size, 'from', rawData.length, 'total rows');
        resultText = `${uniqueBuildings.size}`;
      }
    }
    // 5. OUTSTANDING FOR A SPECIFIC BUILDING
    else if (operation === 'BUILDING_OUTSTANDING') {
      const requestedBuilding = (options.buildingName || '').trim();

      if (!requestedBuilding) {
        sql = '-- Missing building name --';
        resultText = 'Please provide a building name to check outstanding dues.';
      } else {
        const escaped = escapeSqlLiteral(requestedBuilding);
        sql = `SELECT building, SUM(amount_due) AS total_due
FROM vw_building_owner_pending_dues
WHERE building ILIKE '%${escaped}%'
GROUP BY building
ORDER BY total_due DESC;`;

        rawData = await fetchRowsByBuildingName(requestedBuilding);

        if (!rawData || rawData.length === 0) {
          const allBuildingNames = await fetchDistinctBuildingNames();

          if (allBuildingNames.length === 0) {
            resultText = `No building matched "${requestedBuilding}".`;
          } else {
            const ranked = allBuildingNames
              .map(name => ({
                name,
                score: similarityScore(requestedBuilding, name),
              }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 5);

            const best = ranked[0];
            if (!best || best.score < 0.32) {
              resultText = `No building matched "${requestedBuilding}". Please repeat the building name.`;
            } else {
              const secondScore = ranked[1]?.score ?? 0;
              const isConfident = best.score >= 0.72 && best.score - secondScore >= 0.06;
              const matchedRows = await fetchRowsByExactBuildingName(best.name);
              const bestTotal = sumOutstanding(matchedRows);

              const escapedBest = escapeSqlLiteral(best.name);
              sql = `-- Fuzzy matched "${escaped}" to "${escapedBest}"\nSELECT building, SUM(amount_due) AS total_due
FROM vw_building_owner_pending_dues
WHERE building ILIKE '${escapedBest}'
GROUP BY building
ORDER BY total_due DESC;`;

              if (isConfident) {
                resultText = `I matched "${requestedBuilding}" to "${best.name}". Outstanding is AED ${bestTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
              } else {
                const candidatePreview = await Promise.all(
                  ranked.slice(0, 3).map(async candidate => {
                    const rows = await fetchRowsByExactBuildingName(candidate.name);
                    const total = sumOutstanding(rows);
                    return `${candidate.name} (AED ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
                  })
                );

                resultText =
                  `Closest match is "${best.name}" with AED ${bestTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ` +
                  `Please confirm if this is the building you meant. Other close matches: ${candidatePreview.join('; ')}.`;
              }
            }
          }
        } else {
          const totalsByBuilding: Record<string, number> = {};
          rawData.forEach(row => {
            const name = row.building || 'Unknown';
            totalsByBuilding[name] = (totalsByBuilding[name] || 0) + (Number(row.amount_due) || 0);
          });

          const sorted = Object.entries(totalsByBuilding).sort((a, b) => b[1] - a[1]);
          const normalizedRequested = normalizeLookup(requestedBuilding);
          const exact = sorted.find(([name]) => normalizeLookup(name) === normalizedRequested);

          if (exact) {
            resultText = `${exact[0]}: AED ${exact[1].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          } else if (sorted.length === 1) {
            resultText = `${sorted[0][0]}: AED ${sorted[0][1].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          } else {
            const topMatches = sorted
              .slice(0, 5)
              .map(([name, total]) => `${name} (AED ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`)
              .join('; ');
            resultText = `Multiple buildings matched "${requestedBuilding}". Top matches: ${topMatches}`;
          }
        }
      }
    }
    else {
      sql = "-- Unknown Query --";
      resultText = "Error: Unknown operation requested.";
    }

    // Log the interaction for training
    if (userQuery) {
      await logAIInteraction(userQuery, operation, sql, resultText);
    }

    return {
      sql,
      result: resultText,
      timestamp: new Date()
    };

  } catch (err: any) {
    console.error("[SUPABASE] Query Error:", err);
    const errorResult = {
      sql: sql || "SELECT * FROM vw_building_owner_pending_dues -- Error",
      result: `System Error: ${err.message}`,
      timestamp: new Date()
    };

    // Log error interactions too
    if (userQuery) {
      await logAIInteraction(userQuery, operation, errorResult.sql, errorResult.result);
    }

    return errorResult;
  }
};

export const executeMaintenanceQuery = async (
  operation: string,
  userQuery: string = '',
  options: MaintenanceQueryOptions = {}
): Promise<OAQueryResult> => {
  let sql = '';
  let resultText = '';

  const normalizedStatus = normalizeEnum(options.status, MAINTENANCE_STATUSES);
  const normalizedPriority = normalizeEnum(options.priority, MAINTENANCE_PRIORITIES);
  const normalizedReporter = normalizeEnum(options.reporterType, MAINTENANCE_REPORTER_TYPES);

  const issueCategory = normalizeLike(options.issueCategory);
  const engineerName = normalizeLike(options.engineerName);
  const ticketNumber = normalizeLike(options.ticketNumber);
  const bldgNumber = normalizeLike(options.bldgNumber);
  const unitId = normalizeLike(options.unitId);
  const logId = normalizeLike(options.logId);

  const safeOptions: MaintenanceQueryOptions = {
    ...options,
    status: normalizedStatus,
    priority: normalizedPriority,
    reporterType: normalizedReporter,
    issueCategory,
    engineerName,
    ticketNumber,
    bldgNumber,
    unitId,
    logId,
  };

  try {
    if (operation === 'SUMMARY') {
      sql = `SELECT status, priority FROM maintenance_logs ${buildMaintenanceWhere(safeOptions)};`;

      const rows = await fetchMaintenanceRows('status, priority', safeOptions);

      if (!rows.length) {
        resultText = `No maintenance logs found${describeMaintenanceFilters(safeOptions)}.`;
      } else {
        const statusCounts: Record<string, number> = {};
        const priorityCounts: Record<string, number> = {};

        rows.forEach(row => {
          const status = row.status || 'Unknown';
          const priority = row.priority || 'Unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
        });

        const total = rows.length;
        const open = (statusCounts['Open'] || 0) + (statusCounts['In Progress'] || 0);
        const statusSummary = MAINTENANCE_STATUSES.map(status => `${status}: ${statusCounts[status] || 0}`).join(', ');
        const prioritySummary = MAINTENANCE_PRIORITIES.map(priority => `${priority}: ${priorityCounts[priority] || 0}`).join(', ');

        resultText = `Total logs: ${total}. Open or in progress: ${open}. Status breakdown: ${statusSummary}. Priority breakdown: ${prioritySummary}.`;
      }
    }
    else if (operation === 'COUNT') {
      sql = `SELECT COUNT(*) FROM maintenance_logs ${buildMaintenanceWhere(safeOptions)};`;
      const count = await countMaintenanceRows(safeOptions);
      resultText = `Count: ${count}${describeMaintenanceFilters(safeOptions)}.`;
    }
    else if (operation === 'LIST') {
      const limit = clampLimit(safeOptions.limit, 5);
      sql = `SELECT maintenance_tecket_number, status, priority, issue_category, engineer_name, created_at
FROM maintenance_logs
${buildMaintenanceWhere(safeOptions)}
ORDER BY created_at DESC
LIMIT ${limit};`;

      const rows = await fetchMaintenanceRows(
        'id, maintenance_tecket_number, status, priority, issue_category, engineer_name, reporter_name, created_at',
        safeOptions,
        { column: 'created_at', ascending: false },
        limit
      );

      if (!rows.length) {
        resultText = `No maintenance logs found${describeMaintenanceFilters(safeOptions)}.`;
      } else {
        const lines = rows.map((row, idx) => {
          const ticket = row.maintenance_tecket_number ? `Ticket ${row.maintenance_tecket_number}` : `ID ${row.id}`;
          const status = row.status || 'Unknown';
          const priority = row.priority || 'Medium';
          const category = row.issue_category || 'Uncategorized';
          const created = formatDate(row.created_at) || 'N/A';
          const engineer = row.engineer_name ? ` | Eng: ${row.engineer_name}` : '';
          return `${idx + 1}. ${ticket} | ${status} | ${priority} | ${category} | created ${created}${engineer}`;
        });
        resultText = `Latest maintenance logs${describeMaintenanceFilters(safeOptions)}:\n${lines.join('\n')}`;
      }
    }
    else if (operation === 'DETAIL') {
      if (!ticketNumber && !logId) {
        sql = '-- Missing ticket number or ID --';
        resultText = 'Please provide a ticket number or maintenance log ID to fetch details.';
      } else {
        const limit = 1;
        sql = `SELECT * FROM maintenance_logs ${buildMaintenanceWhere(safeOptions)} LIMIT 1;`;

        const rows = await fetchMaintenanceRows(
          'id, maintenance_tecket_number, status, priority, issue_category, issue_description, reporter_type, reporter_name, reporter_phone, engineer_name, engineer_phone, assigned_at, committed_date, completed_date, closed_at, resolution_notes, created_at',
          safeOptions,
          { column: 'created_at', ascending: false },
          limit
        );

        if (!rows.length) {
          resultText = `No maintenance log found${describeMaintenanceFilters(safeOptions)}.`;
        } else {
          const row = rows[0];
          const ticket = row.maintenance_tecket_number ? `Ticket ${row.maintenance_tecket_number}` : `ID ${row.id}`;
          const pieces: string[] = [];
          pieces.push(`${ticket} is ${row.status || 'Unknown'} (${row.priority || 'Medium'}).`);
          if (row.issue_category) pieces.push(`Category: ${row.issue_category}.`);
          if (row.issue_description) pieces.push(`Description: ${row.issue_description}.`);
          if (row.reporter_name) {
            const reporterType = row.reporter_type ? ` (${row.reporter_type})` : '';
            pieces.push(`Reported by ${row.reporter_name}${reporterType}.`);
          }
          if (row.reporter_phone) pieces.push(`Reporter phone: ${row.reporter_phone}.`);
          if (row.engineer_name) pieces.push(`Engineer: ${row.engineer_name}.`);
          if (row.engineer_phone) pieces.push(`Engineer phone: ${row.engineer_phone}.`);
          if (row.assigned_at) pieces.push(`Assigned: ${formatDate(row.assigned_at)}.`);
          if (row.committed_date) pieces.push(`Committed: ${formatDate(row.committed_date)}.`);
          if (row.completed_date) pieces.push(`Completed: ${formatDate(row.completed_date)}.`);
          if (row.closed_at) pieces.push(`Closed: ${formatDate(row.closed_at)}.`);
          if (row.resolution_notes) pieces.push(`Resolution: ${row.resolution_notes}.`);
          if (row.created_at) pieces.push(`Created: ${formatDate(row.created_at)}.`);
          resultText = pieces.join(' ');
        }
      }
    }
    else if (operation === 'OVERDUE') {
      const limit = clampLimit(safeOptions.limit, 5);
      const overdueOptions: MaintenanceQueryOptions = {
        ...safeOptions,
        status: undefined,
      };
      const overdueBase = buildMaintenanceWhere(overdueOptions, 'committed_date');
      const overdueClause = "committed_date < NOW() AND status IN ('Open', 'In Progress')";
      const whereClause = overdueBase ? `${overdueBase} AND ${overdueClause}` : `WHERE ${overdueClause}`;

      sql = `SELECT maintenance_tecket_number, status, priority, issue_category, committed_date
FROM maintenance_logs
${whereClause}
ORDER BY committed_date ASC
LIMIT ${limit};`;

      if (!supabase) {
        resultText = 'Supabase is not configured.';
      } else {
        let countQuery = supabase
          .from('maintenance_logs')
          .select('id', { count: 'exact', head: true })
          .lt('committed_date', new Date().toISOString())
          .in('status', ['Open', 'In Progress']);

        if (overdueOptions.priority) countQuery = countQuery.eq('priority', overdueOptions.priority);
        if (overdueOptions.issueCategory) countQuery = countQuery.ilike('issue_category', `%${overdueOptions.issueCategory}%`);
        if (overdueOptions.reporterType) countQuery = countQuery.eq('reporter_type', overdueOptions.reporterType);
        if (overdueOptions.engineerName) countQuery = countQuery.ilike('engineer_name', `%${overdueOptions.engineerName}%`);
        if (overdueOptions.bldgNumber) countQuery = countQuery.eq('bldg_number', overdueOptions.bldgNumber);
        if (overdueOptions.unitId) countQuery = countQuery.eq('unit_id', overdueOptions.unitId);
        if (overdueOptions.logId) countQuery = countQuery.eq('id', overdueOptions.logId);
        if (overdueOptions.ticketNumber) countQuery = countQuery.eq('maintenance_tecket_number', overdueOptions.ticketNumber);
        if (overdueOptions.dateFrom) countQuery = countQuery.gte('committed_date', overdueOptions.dateFrom);
        if (overdueOptions.dateTo) countQuery = countQuery.lte('committed_date', overdueOptions.dateTo);

        const { count, error } = await countQuery;
        if (error) {
          throw new Error(error.message);
        }

        let listQuery = supabase
          .from('maintenance_logs')
          .select('id, maintenance_tecket_number, status, priority, issue_category, committed_date')
          .lt('committed_date', new Date().toISOString())
          .in('status', ['Open', 'In Progress']);

        if (overdueOptions.priority) listQuery = listQuery.eq('priority', overdueOptions.priority);
        if (overdueOptions.issueCategory) listQuery = listQuery.ilike('issue_category', `%${overdueOptions.issueCategory}%`);
        if (overdueOptions.reporterType) listQuery = listQuery.eq('reporter_type', overdueOptions.reporterType);
        if (overdueOptions.engineerName) listQuery = listQuery.ilike('engineer_name', `%${overdueOptions.engineerName}%`);
        if (overdueOptions.bldgNumber) listQuery = listQuery.eq('bldg_number', overdueOptions.bldgNumber);
        if (overdueOptions.unitId) listQuery = listQuery.eq('unit_id', overdueOptions.unitId);
        if (overdueOptions.logId) listQuery = listQuery.eq('id', overdueOptions.logId);
        if (overdueOptions.ticketNumber) listQuery = listQuery.eq('maintenance_tecket_number', overdueOptions.ticketNumber);
        if (overdueOptions.dateFrom) listQuery = listQuery.gte('committed_date', overdueOptions.dateFrom);
        if (overdueOptions.dateTo) listQuery = listQuery.lte('committed_date', overdueOptions.dateTo);

        listQuery = listQuery.order('committed_date', { ascending: true }).limit(limit);

        const { data, error: listError } = await listQuery;
        if (listError) {
          throw new Error(listError.message);
        }

        const header = `Overdue maintenance logs: ${count || 0}.`;
        if (!data || !data.length) {
          resultText = `${header} None to list${describeMaintenanceFilters(overdueOptions, 'committed date')}.`;
        } else {
          const lines = data.map((row, idx) => {
            const ticket = row.maintenance_tecket_number ? `Ticket ${row.maintenance_tecket_number}` : `ID ${row.id}`;
            const committed = formatDate(row.committed_date) || 'N/A';
            const status = row.status || 'Unknown';
            const priority = row.priority || 'Medium';
            const category = row.issue_category || 'Uncategorized';
            return `${idx + 1}. ${ticket} | ${status} | ${priority} | ${category} | committed ${committed}`;
          });
          resultText = `${header}\n${lines.join('\n')}`;
        }
      }
    }
    else if (operation === 'AVG_RESOLUTION_DAYS') {
      sql = `SELECT age_in_days, created_at, assigned_at, closed_at, completed_date
FROM maintenance_logs
WHERE status = 'Completed'
${buildMaintenanceWhere({ ...safeOptions, status: 'Completed' }, 'completed_date')};`;

      const rows = await fetchMaintenanceRows(
        'age_in_days, created_at, assigned_at, closed_at, completed_date',
        { ...safeOptions, status: 'Completed' },
        null,
        undefined,
        'completed_date'
      );

      if (!rows.length) {
        resultText = `No completed maintenance logs found${describeMaintenanceFilters(safeOptions, 'completed date')}.`;
      } else {
        let totalDays = 0;
        let counted = 0;

        rows.forEach(row => {
          if (row.age_in_days !== null && row.age_in_days !== undefined) {
            const days = Number(row.age_in_days);
            if (!Number.isNaN(days)) {
              totalDays += days;
              counted += 1;
              return;
            }
          }

          const start = row.assigned_at || row.created_at;
          const end = row.closed_at || row.completed_date;
          if (start && end) {
            const startDate = new Date(start);
            const endDate = new Date(end);
            if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
              const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
              totalDays += diffDays;
              counted += 1;
            }
          }
        });

        if (!counted) {
          resultText = `Completed logs exist, but resolution time data is missing${describeMaintenanceFilters(safeOptions, 'completed date')}.`;
        } else {
          const avg = totalDays / counted;
          resultText = `Average resolution time: ${avg.toFixed(2)} days across ${counted} completed tickets${describeMaintenanceFilters(safeOptions, 'completed date')}.`;
        }
      }
    }
    else if (operation === 'TOP_CATEGORIES') {
      sql = `SELECT issue_category FROM maintenance_logs ${buildMaintenanceWhere(safeOptions)};`;
      const rows = await fetchMaintenanceRows('issue_category', safeOptions);

      if (!rows.length) {
        resultText = `No maintenance logs found${describeMaintenanceFilters(safeOptions)}.`;
      } else {
        const counts: Record<string, number> = {};
        rows.forEach(row => {
          const category = (row.issue_category || 'Uncategorized').toString().trim() || 'Uncategorized';
          counts[category] = (counts[category] || 0) + 1;
        });

        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const summary = ranked.map(([category, count]) => `${category}: ${count}`).join(', ');
        resultText = `Top issue categories${describeMaintenanceFilters(safeOptions)}: ${summary}.`;
      }
    }
    else if (operation === 'TOP_ENGINEERS') {
      sql = `SELECT engineer_name FROM maintenance_logs ${buildMaintenanceWhere(safeOptions)};`;
      const rows = await fetchMaintenanceRows('engineer_name', safeOptions);

      if (!rows.length) {
        resultText = `No maintenance logs found${describeMaintenanceFilters(safeOptions)}.`;
      } else {
        const counts: Record<string, number> = {};
        rows.forEach(row => {
          const engineer = (row.engineer_name || 'Unassigned').toString().trim() || 'Unassigned';
          counts[engineer] = (counts[engineer] || 0) + 1;
        });

        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const summary = ranked.map(([engineer, count]) => `${engineer}: ${count}`).join(', ');
        resultText = `Top engineers by ticket volume${describeMaintenanceFilters(safeOptions)}: ${summary}.`;
      }
    }
    else {
      sql = '-- Unknown Query --';
      resultText = 'Error: Unknown maintenance operation requested.';
    }

    if (userQuery) {
      await logAIInteraction(userQuery, operation, sql, resultText);
    }

    return {
      sql,
      result: resultText,
      timestamp: new Date(),
    };
  } catch (err: any) {
    console.error('[SUPABASE] Maintenance Query Error:', err);
    const errorResult = {
      sql: sql || 'SELECT * FROM maintenance_logs -- Error',
      result: `System Error: ${err.message}`,
      timestamp: new Date(),
    };

    if (userQuery) {
      await logAIInteraction(userQuery, operation, errorResult.sql, errorResult.result);
    }

    return errorResult;
  }
};

export const executeOwnerQuery = async (
  operation: string,
  userQuery: string = '',
  options: OwnerQueryOptions = {}
): Promise<OAQueryResult> => {
  let sql = '';
  let resultText = '';

  const normalizedOccupancy = normalizeEnum(options.occupancyStatus, OWNER_OCCUPANCY_STATUSES);

  const ownerName = normalizeLike(options.ownerName);
  const buildingName = normalizeLike(options.buildingName);
  const unitNumber = normalizeLike(options.unitNumber);
  const ownerId = normalizeLike(options.ownerId);
  const mobileNumber = normalizeLike(options.mobileNumber);
  const emailId = normalizeLike(options.emailId);
  const bldgNumber = normalizeLike(options.bldgNumber);
  const pendingDuesMin = normalizeNumber(options.pendingDuesMin);
  const pendingDuesMax = normalizeNumber(options.pendingDuesMax);

  const safeOptions: OwnerQueryOptions = {
    ...options,
    ownerName,
    buildingName,
    unitNumber,
    ownerId,
    mobileNumber,
    emailId,
    bldgNumber,
    occupancyStatus: normalizedOccupancy,
    pendingDuesMin,
    pendingDuesMax,
  };

  try {
    if (operation === 'SUMMARY') {
      sql = `SELECT occupancy_status, pending_dues FROM "Owners List" ${buildOwnerWhere(safeOptions)};`;
      const rows = await fetchOwnerRows('occupancy_status, pending_dues', safeOptions);

      if (!rows.length) {
        resultText = `No owners found${describeOwnerFilters(safeOptions)}.`;
      } else {
        const occupancyCounts: Record<string, number> = {};
        let totalDues = 0;

        rows.forEach(row => {
          const status = row.occupancy_status || 'Unknown';
          occupancyCounts[status] = (occupancyCounts[status] || 0) + 1;
          totalDues += Number(row.pending_dues) || 0;
        });

        const totalOwners = rows.length;
        const occupancySummary = OWNER_OCCUPANCY_STATUSES
          .map(status => `${status}: ${occupancyCounts[status] || 0}`)
          .join(', ');

        resultText = `Total owners: ${totalOwners}. Occupancy breakdown: ${occupancySummary}. Total pending dues: ${formatCurrency(totalDues)}.`;
      }
    }
    else if (operation === 'COUNT') {
      sql = `SELECT COUNT(*) FROM "Owners List" ${buildOwnerWhere(safeOptions)};`;
      const count = await countOwnerRows(safeOptions);
      resultText = `Count: ${count}${describeOwnerFilters(safeOptions)}.`;
    }
    else if (operation === 'LIST') {
      const limit = clampLimit(safeOptions.limit, 5);
      sql = `SELECT "Owners_Name", "Building_name", "Unit_number", "Mobile_number", pending_dues, occupancy_status, owner_id
FROM "Owners List"
${buildOwnerWhere(safeOptions)}
ORDER BY created_at DESC
LIMIT ${limit};`;

      const rows = await fetchOwnerRows(
        'owner_id, Owners_Name, Building_name, Unit_number, Mobile_number, pending_dues, occupancy_status, created_at',
        safeOptions,
        { column: 'created_at', ascending: false },
        limit
      );

      if (!rows.length) {
        resultText = `No owners found${describeOwnerFilters(safeOptions)}.`;
      } else {
        const lines = rows.map((row, idx) => {
          const name = row.Owners_Name || 'Unknown';
          const building = row.Building_name ? ` | ${row.Building_name}` : '';
          const unit = row.Unit_number ? ` | Unit ${row.Unit_number}` : '';
          const mobile = row.Mobile_number ? ` | ${row.Mobile_number}` : '';
          const occupancy = row.occupancy_status ? ` | ${row.occupancy_status}` : '';
          const duesValue = row.pending_dues;
          const dues = duesValue !== null && duesValue !== undefined
            ? ` | Dues ${formatCurrency(Number(duesValue))}`
            : '';
          return `${idx + 1}. ${name}${building}${unit}${mobile}${occupancy}${dues}`;
        });
        resultText = `Owner list${describeOwnerFilters(safeOptions)}:\n${lines.join('\n')}`;
      }
    }
    else if (operation === 'DETAIL') {
      if (!ownerId && !mobileNumber && !emailId && !ownerName) {
        sql = '-- Missing owner identifier --';
        resultText = 'Please provide an owner name, owner ID, mobile number, or email.';
      } else {
        sql = `SELECT * FROM "Owners List" ${buildOwnerWhere(safeOptions)};`;

        const rows = await fetchOwnerRows(
          'owner_id, Owners_Name, Gender, Nationality, Building_name, Unit_number, Parking_number, Mobile_number, Landline_number, Whatsapp_number, Prefered_Language, Unit_Type, Email_ID, occupancy_status, pending_dues, created_at, updated_at',
          safeOptions,
          { column: 'created_at', ascending: false },
          5
        );

        if (!rows.length) {
          resultText = `No owners found${describeOwnerFilters(safeOptions)}.`;
        } else if (rows.length > 1 && !ownerId && !mobileNumber && !emailId) {
          const preview = rows
            .slice(0, 5)
            .map(row => {
              const name = row.Owners_Name || 'Unknown';
              const building = row.Building_name ? ` | ${row.Building_name}` : '';
              const unit = row.Unit_number ? ` | Unit ${row.Unit_number}` : '';
              const id = row.owner_id ? ` | ID ${row.owner_id}` : '';
              return `${name}${building}${unit}${id}`;
            })
            .join('; ');
          resultText = `Multiple owners matched. Please provide the owner ID, mobile number, or unit number. Matches: ${preview}.`;
        } else {
          const row = rows[0];
          const pieces: string[] = [];
          pieces.push(`${row.Owners_Name || 'Owner'} details.`);
          if (row.Building_name) pieces.push(`Building: ${row.Building_name}.`);
          if (row.Unit_number) pieces.push(`Unit: ${row.Unit_number}.`);
          if (row.Parking_number) pieces.push(`Parking: ${row.Parking_number}.`);
          if (row.occupancy_status) pieces.push(`Occupancy: ${row.occupancy_status}.`);
          if (row.pending_dues !== null && row.pending_dues !== undefined) {
            pieces.push(`Pending dues: ${formatCurrency(Number(row.pending_dues))}.`);
          }
          if (row.Mobile_number) pieces.push(`Mobile: ${row.Mobile_number}.`);
          if (row.Whatsapp_number) pieces.push(`WhatsApp: ${row.Whatsapp_number}.`);
          if (row.Landline_number) pieces.push(`Landline: ${row.Landline_number}.`);
          if (row.Email_ID) pieces.push(`Email: ${row.Email_ID}.`);
          if (row.Prefered_Language) pieces.push(`Preferred language: ${row.Prefered_Language}.`);
          if (row.Unit_Type) pieces.push(`Unit type: ${row.Unit_Type}.`);
          if (row.Nationality) pieces.push(`Nationality: ${row.Nationality}.`);
          if (row.Gender) pieces.push(`Gender: ${row.Gender}.`);
          resultText = pieces.join(' ');
        }
      }
    }
    else if (operation === 'OVERDUE') {
      const limit = clampLimit(safeOptions.limit, 5);
      const overdueMin = safeOptions.pendingDuesMin !== undefined ? safeOptions.pendingDuesMin : 0.01;
      const overdueOptions: OwnerQueryOptions = {
        ...safeOptions,
        pendingDuesMin: overdueMin,
      };

      sql = `SELECT "Owners_Name", "Building_name", "Unit_number", pending_dues
FROM "Owners List"
${buildOwnerWhere(overdueOptions)}
ORDER BY pending_dues DESC
LIMIT ${limit};`;

      const count = await countOwnerRows(overdueOptions);
      const rows = await fetchOwnerRows(
        'Owners_Name, Building_name, Unit_number, pending_dues, occupancy_status',
        overdueOptions,
        { column: 'pending_dues', ascending: false },
        limit
      );

      if (!rows.length) {
        resultText = `No owners with pending dues found${describeOwnerFilters(overdueOptions)}.`;
      } else {
        const lines = rows.map((row, idx) => {
          const name = row.Owners_Name || 'Unknown';
          const building = row.Building_name ? ` | ${row.Building_name}` : '';
          const unit = row.Unit_number ? ` | Unit ${row.Unit_number}` : '';
          const duesValue = row.pending_dues;
          const dues = duesValue !== null && duesValue !== undefined
            ? ` | ${formatCurrency(Number(duesValue))}`
            : '';
          return `${idx + 1}. ${name}${building}${unit}${dues}`;
        });
        resultText = `Owners with pending dues: ${count}${describeOwnerFilters(overdueOptions)}.\n${lines.join('\n')}`;
      }
    }
    else if (operation === 'TOP_DUES') {
      const limit = clampLimit(safeOptions.limit, 5);
      sql = `SELECT "Owners_Name", "Building_name", "Unit_number", pending_dues
FROM "Owners List"
${buildOwnerWhere(safeOptions)}
ORDER BY pending_dues DESC
LIMIT ${limit};`;

      const rows = await fetchOwnerRows(
        'Owners_Name, Building_name, Unit_number, pending_dues',
        safeOptions,
        { column: 'pending_dues', ascending: false },
        limit
      );

      if (!rows.length) {
        resultText = `No owners found${describeOwnerFilters(safeOptions)}.`;
      } else {
        const lines = rows.map((row, idx) => {
          const name = row.Owners_Name || 'Unknown';
          const building = row.Building_name ? ` | ${row.Building_name}` : '';
          const unit = row.Unit_number ? ` | Unit ${row.Unit_number}` : '';
          const duesValue = row.pending_dues;
          const dues = duesValue !== null && duesValue !== undefined
            ? ` | ${formatCurrency(Number(duesValue))}`
            : '';
          return `${idx + 1}. ${name}${building}${unit}${dues}`;
        });
        resultText = `Top owners by pending dues${describeOwnerFilters(safeOptions)}:\n${lines.join('\n')}`;
      }
    }
    else {
      sql = '-- Unknown Query --';
      resultText = 'Error: Unknown owner operation requested.';
    }

    if (userQuery) {
      await logAIInteraction(userQuery, operation, sql, resultText);
    }

    return {
      sql,
      result: resultText,
      timestamp: new Date(),
    };
  } catch (err: any) {
    console.error('[SUPABASE] Owner Query Error:', err);
    const errorResult = {
      sql: sql || 'SELECT * FROM "Owners List" -- Error',
      result: `System Error: ${err.message}`,
      timestamp: new Date(),
    };

    if (userQuery) {
      await logAIInteraction(userQuery, operation, errorResult.sql, errorResult.result);
    }

    return errorResult;
  }
};

export const executeBuildingQuery = async (
  operation: string,
  userQuery: string = '',
  options: BuildingQueryOptions = {}
): Promise<OAQueryResult> => {
  let sql = '';
  let resultText = '';

  const buildingName = normalizeLike(options.buildingName);
  const location = normalizeLike(options.location);
  const mobileNumber = normalizeLike(options.mobileNumber);
  const landlineNumber = normalizeLike(options.landlineNumber);
  const email = normalizeLike(options.email);
  const oaManager = normalizeLike(options.oaManager);
  const bldgNumber = normalizeLike(options.bldgNumber);

  const safeOptions: BuildingQueryOptions = {
    ...options,
    buildingName,
    location,
    mobileNumber,
    landlineNumber,
    email,
    oaManager,
    bldgNumber,
  };

  try {
    if (operation === 'COUNT') {
      sql = `SELECT COUNT(*) FROM "Building names" ${buildBuildingWhere(safeOptions)};`;
      const count = await countBuildingRows(safeOptions);
      resultText = `Count: ${count}${describeBuildingFilters(safeOptions)}.`;
    }
    else if (operation === 'LIST') {
      const limit = clampLimit(safeOptions.limit, 5);
      sql = `SELECT "Building_name", "Location", "Mobile_number", "Email", "OA_Manager", "Bldg_number"
FROM "Building names"
${buildBuildingWhere(safeOptions)}
ORDER BY created_at DESC
LIMIT ${limit};`;

      const rows = await fetchBuildingRows(
        'Building_name, Location, Mobile_number, Email, OA_Manager, Bldg_number, created_at',
        safeOptions,
        { column: 'created_at', ascending: false },
        limit
      );

      if (!rows.length) {
        resultText = `No buildings found${describeBuildingFilters(safeOptions)}.`;
      } else {
        const lines = rows.map((row, idx) => {
          const name = row.Building_name || 'Unknown';
          const locationText = row.Location ? ` | ${row.Location}` : '';
          const mobile = row.Mobile_number ? ` | ${row.Mobile_number}` : '';
          const emailText = row.Email ? ` | ${row.Email}` : '';
          const manager = row.OA_Manager ? ` | Manager ${row.OA_Manager}` : '';
          const id = row.Bldg_number ? ` | ID ${row.Bldg_number}` : '';
          return `${idx + 1}. ${name}${locationText}${mobile}${emailText}${manager}${id}`;
        });
        resultText = `Building list${describeBuildingFilters(safeOptions)}:\n${lines.join('\n')}`;
      }
    }
    else if (operation === 'DETAIL') {
      if (!buildingName && !bldgNumber && !email && !mobileNumber) {
        sql = '-- Missing building identifier --';
        resultText = 'Please provide a building name, building ID, email, or mobile number.';
      } else {
        sql = `SELECT * FROM "Building names" ${buildBuildingWhere(safeOptions)};`;

        const rows = await fetchBuildingRows(
          'Building_name, Location, Mobile_number, Landline_number, Email, OA_Manager, Bldg_number, created_at, updated_at',
          safeOptions,
          { column: 'created_at', ascending: false },
          5
        );

        if (!rows.length) {
          resultText = `No buildings found${describeBuildingFilters(safeOptions)}.`;
        } else if (rows.length > 1 && !bldgNumber) {
          const preview = rows
            .slice(0, 5)
            .map(row => {
              const name = row.Building_name || 'Unknown';
              const locationText = row.Location ? ` | ${row.Location}` : '';
              const id = row.Bldg_number ? ` | ID ${row.Bldg_number}` : '';
              return `${name}${locationText}${id}`;
            })
            .join('; ');
          resultText = `Multiple buildings matched. Please provide the building ID. Matches: ${preview}.`;
        } else {
          const row = rows[0];
          const pieces: string[] = [];
          pieces.push(`${row.Building_name || 'Building'} details.`);
          if (row.Location) pieces.push(`Location: ${row.Location}.`);
          if (row.OA_Manager) pieces.push(`OA Manager: ${row.OA_Manager}.`);
          if (row.Mobile_number) pieces.push(`Mobile: ${row.Mobile_number}.`);
          if (row.Landline_number) pieces.push(`Landline: ${row.Landline_number}.`);
          if (row.Email) pieces.push(`Email: ${row.Email}.`);
          if (row.Bldg_number) pieces.push(`Building ID: ${row.Bldg_number}.`);
          resultText = pieces.join(' ');
        }
      }
    }
    else {
      sql = '-- Unknown Query --';
      resultText = 'Error: Unknown building operation requested.';
    }

    if (userQuery) {
      await logAIInteraction(userQuery, operation, sql, resultText);
    }

    return {
      sql,
      result: resultText,
      timestamp: new Date(),
    };
  } catch (err: any) {
    console.error('[SUPABASE] Building Query Error:', err);
    const errorResult = {
      sql: sql || 'SELECT * FROM "Building names" -- Error',
      result: `System Error: ${err.message}`,
      timestamp: new Date(),
    };

    if (userQuery) {
      await logAIInteraction(userQuery, operation, errorResult.sql, errorResult.result);
    }

    return errorResult;
  }
};
