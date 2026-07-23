/**
 * Fetches and caches the client's public IP address.
 * Used to send per-user IP to edge functions for rate limiting.
 */

let cachedIp: string | null = null;
let fetchPromise: Promise<string> | null = null;

export async function getClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;

  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch("https://api.ipify.org?format=json", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        cachedIp = data.ip || "unknown";
        return cachedIp!;
      }
    } catch {
      // Silently fail — IP will be resolved server-side via x-forwarded-for
    }

    cachedIp = "unknown";
    return cachedIp;
  })();

  return fetchPromise;
}
