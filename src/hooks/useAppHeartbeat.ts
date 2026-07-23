import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hvslfbcsokurljstmtip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2c2xmYmNzb2t1cmxqc3RtdGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NzI5MjcsImV4cCI6MjA2MTI0ODkyN30.NZhv8qRZqI3jYKZCJXVqCHpLfNg5UKxq0zH3L7-1KBs';

/**
 * Hook to keep the Supabase project active
 * Prevents project from being paused after 7 days of inactivity on Free plan
 * 
 * Updates the app_heartbeat table every 5 minutes
 * Only overwrites existing record (doesn't create new ones)
 */
export function useAppHeartbeat() {
  useEffect(() => {
    const updateHeartbeat = async () => {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Update the heartbeat record
        const { data, error } = await supabase
          .from('app_heartbeat')
          .upsert({
            app_name: 'xerife_music',
            last_updated: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: '1.0',
            status: 'active'
          }, {
            onConflict: 'app_name',
            ignoreDuplicates: false
          })
          .select();

        if (error) {
          console.warn('[Heartbeat] Error updating heartbeat:', error);
        } else {
          console.log('[Heartbeat] ✅ Updated at', new Date().toLocaleString());
        }
      } catch (err) {
        console.warn('[Heartbeat] Exception:', err);
      }
    };

    // Update immediately on mount
    updateHeartbeat();

    // Update every 5 minutes (300000ms)
    const interval = setInterval(updateHeartbeat, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);
}

/**
 * Hook to get the current heartbeat info
 * Returns the last updated timestamp and other info
 */
export function useHeartbeatInfo() {
  const [heartbeatInfo, setHeartbeatInfo] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchHeartbeat = async () => {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        const { data, error } = await supabase
          .from('app_heartbeat')
          .select('*')
          .eq('app_name', 'xerife_music')
          .single();

        if (error) {
          console.warn('[Heartbeat Info] Error fetching:', error);
        } else if (data) {
          setHeartbeatInfo(data);
        }
      } catch (err) {
        console.warn('[Heartbeat Info] Exception:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHeartbeat();

    // Refresh every 30 seconds
    const interval = setInterval(fetchHeartbeat, 30 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { heartbeatInfo, loading };
}

// Export React for useHeartbeatInfo
import * as React from 'react';
