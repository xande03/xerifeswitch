import { Song } from "@/data/mockSongs";
import { searchYouTubeGeneral, VideoResult } from "@/lib/youtubeGeneralSearch";

const QUEUE_KEY = "demus_smart_video_queue";
const MAX_QUEUE = 30;

interface SmartVideoQueue {
  videos: Song[];
  seedChannel: string;
  seedVideoId: string;
  seedKeywords: string;
}

function getQueue(): SmartVideoQueue | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveQueue(queue: SmartVideoQueue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

const STOP_WORDS = new Set([
  "a","o","os","as","de","da","do","das","dos","e","é","em","um","uma","para","por","com","sem","no","na","nos","nas",
  "que","como","the","of","and","to","in","for","on","at","this","that","official","oficial","video","vídeo","clipe",
  "hd","4k","live","ao","vivo","feat","ft","completo","full","novo","new","2023","2024","2025","2026",
]);

/** Extract 2-3 meaningful keywords from a video title for relatedness. */
function extractKeywords(title: string): string {
  const clean = (title || "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return clean.slice(0, 3).join(" ");
}

function buildRelatedQueries(video: Song): string[] {
  const channel = (video.artist || "").replace(/\s*-\s*Topic$/i, "").trim();
  const keywords = extractKeywords(video.title);
  const qs: string[] = [];
  if (channel && keywords) qs.push(`${channel} ${keywords}`);
  if (channel) qs.push(channel);
  if (keywords) qs.push(keywords);
  return qs;
}

function toSong(v: VideoResult): Song {
  return {
    id: `yt-${v.videoId}`,
    youtubeId: v.videoId,
    title: v.title,
    artist: v.channel,
    album: v.title,
    cover: v.thumbnail,
    duration: v.lengthSeconds || 0,
    votes: 0,
    isDownloaded: false,
    type: "video" as const,
  };
}

/** Fetch related videos for the given seed video and cache them. */
export async function fetchRelatedVideoQueue(currentVideo: Song): Promise<Song[]> {
  const cached = getQueue();
  if (
    cached &&
    cached.seedChannel === currentVideo.artist &&
    cached.seedVideoId === currentVideo.youtubeId &&
    cached.videos.length > 0
  ) {
    return cached.videos;
  }

  const queries = buildRelatedQueries(currentVideo);
  for (const query of queries) {
    try {
      const results = await searchYouTubeGeneral(query, { limit: MAX_QUEUE });
      if (results.length > 0) {
        const filtered = results
          .filter((v) => v.videoId && v.videoId !== currentVideo.youtubeId && !v.isLive)
          .map(toSong)
          .slice(0, MAX_QUEUE);
        if (filtered.length > 0) {
          const queue: SmartVideoQueue = {
            videos: filtered,
            seedChannel: currentVideo.artist,
            seedVideoId: currentVideo.youtubeId,
            seedKeywords: extractKeywords(currentVideo.title),
          };
          saveQueue(queue);
          return filtered;
        }
      }
    } catch {
      continue;
    }
  }
  return [];
}

/** Pop next video from the smart queue (removes it). */
export function popNextVideoFromQueue(): Song | null {
  const cached = getQueue();
  if (!cached || cached.videos.length === 0) return null;
  const [next, ...rest] = cached.videos;
  saveQueue({ ...cached, videos: rest });
  return next;
}

export function hasSmartVideoQueue(): boolean {
  const cached = getQueue();
  return !!cached && cached.videos.length > 0;
}

export function clearSmartVideoQueue() {
  try { localStorage.removeItem(QUEUE_KEY); } catch {}
}

/** Explicitly set the smart video queue from a provided list (e.g. from a playlist). */
export function setSmartVideoQueue(videos: Song[]) {
  saveQueue({
    videos,
    seedChannel: "manual",
    seedVideoId: "manual",
    seedKeywords: "manual"
  });
}
