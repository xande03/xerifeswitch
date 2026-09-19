export interface PipedVideoSource {
  videoId: string;
  url: string;
  mimeType: string;
  quality: string;
  width?: number;
  height?: number;
  bitrate?: number;
  instance: string;
}

interface PipedStream {
  url?: string;
  mimeType?: string;
  quality?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  videoOnly?: boolean;
}

interface PipedStreamsResponse {
  videoStreams?: PipedStream[];
  hls?: string | null;
  livestream?: boolean;
}

const FALLBACK_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.leptons.xyz",
];

const REQUEST_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Piped timeout")), ms)),
  ]);
}

async function discoverInstances(): Promise<string[]> {
  try {
    const response = await withTimeout(fetch("https://piped.video/api/v1/instances", {
      headers: { Accept: "application/json" },
    }), REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(`instances ${response.status}`);
    const data = await response.json() as unknown;
    if (!Array.isArray(data)) return FALLBACK_INSTANCES;

    const discovered = data
      .map((entry: any) => typeof entry === "string" ? entry : entry?.api_url || entry?.apiUrl)
      .filter((url): url is string => typeof url === "string" && url.startsWith("http"))
      .map((url) => url.replace(/\/$/, ""));
    return [...new Set([...discovered, ...FALLBACK_INSTANCES])].slice(0, 8);
  } catch {
    return FALLBACK_INSTANCES;
  }
}

function selectMuxedStream(streams: PipedStream[]): PipedStream | null {
  const candidates = streams.filter((stream) =>
    Boolean(stream.url) &&
    stream.videoOnly !== true &&
    Boolean(stream.mimeType?.startsWith("video/")) &&
    /mp4|webm/i.test(stream.mimeType || ""),
  );
  if (!candidates.length) return null;

  // A muxed stream is required by a plain HTMLVideoElement. Prefer the highest
  // resolution that browsers can play without a separate DASH audio track.
  return [...candidates].sort((a, b) =>
    (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0),
  )[0];
}

export async function resolvePipedVideo(videoId: string): Promise<PipedVideoSource | null> {
  if (!videoId) return null;
  const instances = await discoverInstances();

  for (const instance of instances) {
    try {
      const response = await withTimeout(fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: "application/json" },
      }), REQUEST_TIMEOUT_MS);
      if (!response.ok) continue;
      const data = await response.json() as PipedStreamsResponse;
      if (data.livestream || data.hls) continue;
      const stream = selectMuxedStream(data.videoStreams || []);
      if (!stream?.url || !stream.mimeType) continue;
      return {
        videoId,
        url: stream.url,
        mimeType: stream.mimeType,
        quality: stream.quality || `${stream.height || "?"}p`,
        width: stream.width,
        height: stream.height,
        bitrate: stream.bitrate,
        instance,
      };
    } catch {
      // Try the next public instance. Failure is intentionally silent so the
      // caller can fall back to the YouTube player without interrupting playback.
    }
  }
  return null;
}

export function isNativeVideoSupported(): boolean {
  if (typeof document === "undefined") return false;
  const video = document.createElement("video");
  return Boolean(video.canPlayType("video/mp4") || video.canPlayType("video/webm"));
}
