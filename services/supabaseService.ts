import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, BusinessDoc } from '../types';

// Export config status for UI
// Check if keys are present and not just default placeholders if possible, 
// though here we assume non-empty string is config.
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith('http'));

if (!isSupabaseConfigured) {
  console.warn("Supabase configuration missing:", { url: !!SUPABASE_URL, key: !!SUPABASE_KEY });
} else {
  console.log("Supabase configured with URL:", SUPABASE_URL);
}

// Initialize Supabase client
// Note: We use a loose check here to allow the app to render even if env vars are missing,
// effectively mocking the behavior if not configured.
const supabase = isSupabaseConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

export const searchBusinessData = async (query: string): Promise<string> => {
  if (!supabase) {
    console.warn("Supabase credentials not found. Returning mock data.");
    return `[System Warning: Supabase not connected. Using mock data.] 
    Mock Search Result for "${query}":
    - Q3 Revenue: $1.2M (Up 15% YoY)
    - Current CEO: Jane Doe
    - Next All-Hands Meeting: Friday, 10:00 AM PST.
    - Strategic Goals: Expansion into APAC region and launching Product X.`;
  }

  try {
    console.log(`Executing Supabase Search for: ${query}`);
    
    // Attempt 1: Try a full-text search on a 'documents' table if it exists
    // Note: Requires a table named 'documents' with 'title' and 'content' columns
    const { data, error } = await supabase
      .from('documents')
      .select('title, content')
      .textSearch('content', query, {
        type: 'websearch',
        config: 'english'
      })
      .limit(3);

    if (error) {
       console.warn("Full text search failed, trying simple ilike fallback. Error:", error.message);
       
       // Fallback: Simple ILIKE search
       const { data: fallbackData, error: fallbackError } = await supabase
        .from('documents')
        .select('title, content')
        .ilike('content', `%${query}%`)
        .limit(3);
      
       if (fallbackError) {
         console.error("Fallback search also failed:", fallbackError.message);
         return `Database Error: ${fallbackError.message}. Please ensure a table named 'documents' exists with 'title' and 'content' columns.`;
       }

       if (!fallbackData || fallbackData.length === 0) {
         return "No relevant business documents found in the database matching that query.";
       }
       
       return JSON.stringify(fallbackData);
    }

    if (!data || data.length === 0) {
      return "No documents found matching that query.";
    }

    return JSON.stringify(data.map((d: any) => `Title: ${d.title}\nContent: ${d.content}`).join('\n---\n'));

  } catch (err: any) {
    console.error("Supabase search error:", err);
    return `Error retrieving data: ${err.message}`;
  }
};