-- Create app_heartbeat table to keep project active
-- This table prevents the Supabase project from being paused after 7 days of inactivity

CREATE TABLE IF NOT EXISTS app_heartbeat (
  id BIGSERIAL PRIMARY KEY,
  app_name TEXT NOT NULL DEFAULT 'xerife_music',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version TEXT,
  status TEXT DEFAULT 'active',
  user_count INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 0,
  
  -- Constraint to keep only one record per app
  CONSTRAINT one_record_per_app UNIQUE (app_name)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_app_heartbeat_app_name ON app_heartbeat(app_name);
CREATE INDEX IF NOT EXISTS idx_app_heartbeat_updated_at ON app_heartbeat(updated_at DESC);

-- Enable RLS (Row Level Security) - allow public reads, authenticated writes
ALTER TABLE app_heartbeat ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous reads
CREATE POLICY "Allow anonymous read" ON app_heartbeat
  FOR SELECT USING (true);

-- Policy: Allow authenticated users to update
CREATE POLICY "Allow authenticated update" ON app_heartbeat
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Insert initial record
INSERT INTO app_heartbeat (app_name, last_updated, updated_at, version, status)
VALUES ('xerife_music', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '1.0', 'active')
ON CONFLICT (app_name) DO UPDATE SET
  updated_at = CURRENT_TIMESTAMP,
  last_updated = CURRENT_TIMESTAMP;

-- Create a function to update the heartbeat
CREATE OR REPLACE FUNCTION update_app_heartbeat()
RETURNS void AS $$
BEGIN
  UPDATE app_heartbeat
  SET 
    last_updated = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP,
    status = 'active'
  WHERE app_name = 'xerife_music';
  
  -- If no record exists, insert one
  IF NOT FOUND THEN
    INSERT INTO app_heartbeat (app_name, last_updated, updated_at, version, status)
    VALUES ('xerife_music', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '1.0', 'active');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON app_heartbeat TO anon, authenticated;
GRANT UPDATE ON app_heartbeat TO authenticated;
