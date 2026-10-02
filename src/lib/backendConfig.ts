import { getClientIp } from "./clientIp";

type QueryValue = string | number | boolean | null | undefined;

const FALLBACK_PROJECT_URL = "https://fiohpfxftzcadkwkvzuz.supabase.co";
const FALLBACK_PUBLISHABLE_KEY =
  "sb_publishable_Dz3D3FnrOxZVTA7sraZaLA_pSB_U3R3";

function getRawConfig() {
  const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "";

  return { projectUrl, publishableKey };
}

export function getBackendConfig() {
  const raw = getRawConfig();
  const hasRuntimeConfig = Boolean(raw.projectUrl && raw.publishableKey);

  return {
    projectUrl: hasRuntimeConfig ? raw.projectUrl : FALLBACK_PROJECT_URL,
    publishableKey: hasRuntimeConfig ? raw.publishableKey : FALLBACK_PUBLISHABLE_KEY,
    usingFallback: !hasRuntimeConfig,
  };
}

export function createFunctionUrl(
  functionName: string,
  query: Record<string, QueryValue> = {}
): string {
  const { projectUrl } = getBackendConfig();
  const url = new URL(`/functions/v1/${functionName}`, projectUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function createFunctionHeaders(): HeadersInit {
  const { publishableKey } = getBackendConfig();

  return {
    Authorization: `Bearer ${publishableKey}`,
    apikey: publishableKey,
  };
}

/**
 * Creates headers with client IP for per-user rate limiting.
 * Call this with await since IP fetch is async.
 */
export async function createFunctionHeadersWithIp(): Promise<HeadersInit> {
  const { publishableKey } = getBackendConfig();
  const clientIp = await getClientIp();

  return {
    Authorization: `Bearer ${publishableKey}`,
    apikey: publishableKey,
    "x-client-ip": clientIp,
  };
}