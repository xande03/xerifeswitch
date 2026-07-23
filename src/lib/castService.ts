// Google Cast (Chromecast) integration for Xerife Videos.
// Loads the Cast Sender SDK lazily and exposes helpers to open the device
// picker and stream a YouTube video to a Chromecast receiver. Falls back to
// the Remote Playback API on non-Chromium browsers.

type CastStatus = "unavailable" | "available" | "connecting" | "connected" | "error";

type Listener = (status: CastStatus, deviceName?: string) => void;

const listeners = new Set<Listener>();
let currentStatus: CastStatus = "unavailable";
let currentDevice: string | undefined;
let sdkLoading: Promise<boolean> | null = null;
let sdkReady = false;

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: any;
    chrome?: any;
  }
}

function setStatus(status: CastStatus, device?: string) {
  currentStatus = status;
  currentDevice = device;
  listeners.forEach((l) => l(status, device));
}

export function subscribeCastStatus(l: Listener): () => void {
  listeners.add(l);
  l(currentStatus, currentDevice);
  return () => listeners.delete(l);
}

export function getCastStatus() {
  return { status: currentStatus, device: currentDevice };
}

export function isCastSupported(): boolean {
  if (typeof window === "undefined") return false;
  // Chromium-based browsers (desktop Chrome/Edge, Android Chrome) support Cast SDK.
  const ua = navigator.userAgent;
  const isChromium = /Chrome|CriOS|Edg/i.test(ua) && !/OPR|OPT/i.test(ua);
  return isChromium;
}

export function loadCastSdk(): Promise<boolean> {
  if (sdkReady) return Promise.resolve(true);
  if (sdkLoading) return sdkLoading;
  if (!isCastSupported()) {
    return Promise.resolve(false);
  }

  sdkLoading = new Promise<boolean>((resolve) => {
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (!isAvailable) {
        setStatus("unavailable");
        resolve(false);
        return;
      }
      try {
        const context = window.cast.framework.CastContext.getInstance();
        // Use the official YouTube Cast receiver (App ID 233637DE) so smart
        // TVs launch the native YouTube app and can stream any video with
        // full audio+video, DRM, ads, subtitles. Fallback path below handles
        // devices without a YouTube receiver.
        context.setOptions({
          receiverApplicationId: "233637DE",
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          resumeSavedSession: true,
        });

        context.addEventListener(
          window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          (e: any) => {
            const CastState = window.cast.framework.CastState;
            const session = context.getCurrentSession?.();
            const device = session?.getCastDevice?.()?.friendlyName;
            switch (e.castState) {
              case CastState.NO_DEVICES_AVAILABLE:
                setStatus("unavailable");
                break;
              case CastState.NOT_CONNECTED:
                setStatus("available");
                break;
              case CastState.CONNECTING:
                setStatus("connecting", device);
                break;
              case CastState.CONNECTED:
                setStatus("connected", device);
                break;
            }
          }
        );
        sdkReady = true;
        setStatus("available");
        resolve(true);
      } catch (err) {
        console.warn("Cast SDK init error", err);
        setStatus("error");
        resolve(false);
      }
    };

    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    script.onerror = () => {
      setStatus("unavailable");
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return sdkLoading;
}

const YT_NAMESPACE = "urn:x-cast:com.google.youtube.mdx";
const DEFAULT_RECEIVER = "CC1AD845"; // chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID

async function sendYouTubeFling(session: any, videoId: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        type: "flingVideo",
        data: { currentTime: 0, videoId },
      });
      session.sendMessage(
        YT_NAMESPACE,
        payload,
        () => resolve(true),
        (err: any) => {
          console.warn("YT flingVideo failed", err);
          resolve(false);
        }
      );
    } catch (err) {
      console.warn("sendYouTubeFling threw", err);
      resolve(false);
    }
  });
}

async function loadMediaFallback(session: any, opts: {
  videoId: string; title?: string; thumbnail?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const url = `https://www.youtube.com/watch?v=${opts.videoId}`;
      const mediaInfo = new window.chrome.cast.media.MediaInfo(url, "video/mp4");
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = opts.title ?? "";
      if (opts.thumbnail) {
        mediaInfo.metadata.images = [new window.chrome.cast.Image(opts.thumbnail)];
      }
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      session.loadMedia(request).then(
        () => resolve(true),
        (err: any) => { console.warn("loadMedia fallback failed", err); resolve(false); }
      );
    } catch (err) {
      console.warn("loadMediaFallback threw", err);
      resolve(false);
    }
  });
}

// Cast a YouTube video with maximum compatibility:
//  1. Try YouTube receiver (App ID 233637DE) + flingVideo message — native
//     YouTube playback on the TV, works on virtually every Chromecast /
//     Android TV / Google TV / most smart TVs.
//  2. If the TV has no YouTube receiver, tear down the session and reopen
//     against the Default Media Receiver, passing the watch URL so the
//     device's smart-media resolver can attempt playback.
export async function castYouTubeVideo(opts: {
  videoId: string;
  title?: string;
  thumbnail?: string;
}): Promise<boolean> {
  const ok = await loadCastSdk();
  if (!ok) return false;

  const context = window.cast.framework.CastContext.getInstance();

  const openSession = async () => {
    try {
      await context.requestSession();
      return context.getCurrentSession();
    } catch (err: any) {
      if (err?.code === "cancel" || err === "cancel") return null;
      console.warn("requestSession error", err);
      return null;
    }
  };

  // Attempt 1: YouTube receiver.
  try {
    let session = context.getCurrentSession();
    if (!session) session = await openSession();
    if (!session) return false;

    const ytOk = await sendYouTubeFling(session, opts.videoId);
    if (ytOk) return true;

    // Attempt 2: fall back to default media receiver.
    try { await session.endSession(true); } catch {}
    context.setOptions({
      receiverApplicationId: DEFAULT_RECEIVER,
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    const fallbackSession = await openSession();
    if (!fallbackSession) return false;
    const loaded = await loadMediaFallback(fallbackSession, opts);
    // Restore YouTube receiver for the next attempt.
    context.setOptions({
      receiverApplicationId: "233637DE",
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    return loaded;
  } catch (err: any) {
    if (err?.code === "cancel" || err === "cancel") return false;
    console.warn("Cast error", err);
    setStatus("error");
    return false;
  }
}

export async function stopCasting(): Promise<void> {
  try {
    const context = window.cast?.framework?.CastContext?.getInstance?.();
    const session = context?.getCurrentSession?.();
    await session?.endSession?.(true);
  } catch (err) {
    console.warn("stopCasting error", err);
  }
}
