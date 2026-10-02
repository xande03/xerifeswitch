/**
 * In-memory rate limiter for Deno edge functions.
 * Limits requests per IP within a sliding window.
 * Since edge function instances can be recycled, this is best-effort
 * but still effective for burst protection.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60s
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * Extract client IP from request headers (works on Supabase Edge Functions).
 */
export function getClientIp(req: Request): string {
  // Prioriza headers definidos pelo proxy/ingress (não spoofáveis pelo cliente).
  // O header "x-client-ip" auto-declarado NÃO é mais confiável: clientes sem
  // ipify enviavam "unknown" e compartilhavam um único bucket de rate limit.
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf && cf.trim()) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // IP mais à direita = adicionado pelo proxy mais próximo; ignora ranges privados
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|f[cd][0-9a-f]{2}:)/i.test(parts[i])) {
        return parts[i];
      }
    }
    return parts[parts.length - 1] || "unknown";
  }
  return "unknown";
}

export interface RateLimitOptions {
  /** Max requests per window (default: 30) */
  maxRequests?: number;
  /** Window size in ms (default: 60_000 = 1 minute) */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check if a request from the given IP is allowed.
 */
export function checkRateLimit(
  ip: string,
  opts: RateLimitOptions = {}
): RateLimitResult {
  cleanup();

  const maxRequests = opts.maxRequests ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();

  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Build a 429 response with proper headers.
 */
export function rateLimitResponse(
  retryAfterMs: number,
  corsHeaders: Record<string, string>
): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please wait before trying again.",
      retryAfterSeconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  );
}
