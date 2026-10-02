import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Descobre APIs cobalt em cobalt.directory (tabela HTML, atualizada ~10 min).
 * Best-effort: se o site bloquear, retorna []. A lista estática continua válida.
 */
async function discoverCobaltApis(skip: string[]): Promise<string[]> {
  try {
    const r = await fetch('https://cobalt.directory/', {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    });
    if (!r.ok) return [];
    const html = await r.text();
    const hosts = [...html.matchAll(/<td>\s*([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\s*<\/td>/gi)]
      .map((m) => `https://${m[1].toLowerCase()}`)
      .filter((u) => !skip.includes(u));
    return [...new Set(hosts)].slice(0, 8);
  } catch {
    return [];
  }
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

    // Instâncias estáticas (sem auth) + descoberta dinâmica via cobalt.directory.
    // A API oficial (api.cobalt.tools) exige JWT e demais listas públicas sumiram.
    const staticEndpoints = [
      'https://rue-cobalt.xenon.zone',
      'https://cobaltapi.cjs.nz',
      'https://api.cobalt.tools',
    ];
    const cobaltEndpoints = [
      ...staticEndpoints,
      ...(await discoverCobaltApis(staticEndpoints)),
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
            'User-Agent': UA,
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
