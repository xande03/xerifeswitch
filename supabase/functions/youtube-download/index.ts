import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Rate limit: 10 downloads per minute per IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 10, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const { videoId, format } = await req.json()
    
    if (!videoId) {
      throw new Error('Video ID is required')
    }

    const isAudio = format === 'mp3'
    
    // Use cobalt.tools public API (v10+)
    const cobaltEndpoints = [
      'https://api.cobalt.tools',
      'https://cobalt-api.kwiatekmiki.com',
    ];

    let data: any = null;
    let lastError = '';

    for (const endpoint of cobaltEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            downloadMode: isAudio ? "audio" : "auto",
            audioFormat: "mp3",
            youtubeVideoCodec: "h264",
            videoQuality: "720",
          })
        });
        clearTimeout(timeout);

        data = await response.json();
        if (data.status !== 'error' && data.url) break;
        lastError = data?.error?.code || data?.text || 'Unknown cobalt error';
        data = null;
      } catch (e: any) {
        lastError = e.message || 'Cobalt instance unreachable';
        continue;
      }
    }

    if (!data || !data.url) {
      return new Response(
        JSON.stringify({ error: lastError || 'Failed to get download URL from all cobalt instances' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ url: data.url }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
