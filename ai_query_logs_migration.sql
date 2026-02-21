-- Create table to log AI queries and responses for training
CREATE TABLE IF NOT EXISTS ai_query_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_query TEXT NOT NULL,
  operation_type VARCHAR(100) NOT NULL,
  sql_executed TEXT,
  ai_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_created_at ON ai_query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_operation ON ai_query_logs(operation_type);

-- Add comment
COMMENT ON TABLE ai_query_logs IS 'Logs all AI agent queries and responses for training and analysis';
