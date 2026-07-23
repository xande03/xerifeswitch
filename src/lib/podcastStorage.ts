// Podcast data persistence layer using localStorage

export interface PodcastShow {
  channelId: string;  // YouTube channel name as ID
  name: string;
  thumbnail: string;
  subscribedAt: number;
}

export interface PodcastEpisodeProgress {
  episodeId: string;  // yt-{videoId}
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  currentTime: number;
  completedAt?: number;  // timestamp when finished
  lastPlayedAt: number;
}

const SUBS_KEY = "xerife_podcast_subscriptions";
const PROGRESS_KEY = "xerife_podcast_progress";
const HISTORY_KEY = "xerife_podcast_history";
const SPEED_KEY = "xerife_podcast_speed";
const FAV_EPISODES_KEY = "xerife_podcast_fav_episodes";

// ── Favorite Episodes ──

export interface FavoriteEpisode {
  episodeId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  favoritedAt: number;
}

export function getFavoriteEpisodes(): FavoriteEpisode[] {
  try {
    const list: FavoriteEpisode[] = JSON.parse(localStorage.getItem(FAV_EPISODES_KEY) || "[]");
    return list.sort((a, b) => b.favoritedAt - a.favoritedAt);
  } catch { return []; }
}

export function isFavoriteEpisode(episodeId: string): boolean {
  return getFavoriteEpisodes().some(f => f.episodeId === episodeId);
}

export function toggleFavoriteEpisode(ep: Omit<FavoriteEpisode, "favoritedAt">): boolean {
  const list = getFavoriteEpisodes();
  const idx = list.findIndex(f => f.episodeId === ep.episodeId);
  let nowFav: boolean;
  if (idx >= 0) { list.splice(idx, 1); nowFav = false; }
  else { list.unshift({ ...ep, favoritedAt: Date.now() }); nowFav = true; }
  try { localStorage.setItem(FAV_EPISODES_KEY, JSON.stringify(list)); } catch {}
  try { window.dispatchEvent(new CustomEvent("xerife:podcast-favs-updated")); } catch {}
  return nowFav;
}

// ── Subscriptions ──

export function getSubscriptions(): PodcastShow[] {
  try {
    return JSON.parse(localStorage.getItem(SUBS_KEY) || "[]");
  } catch { return []; }
}

export function subscribe(show: Omit<PodcastShow, "subscribedAt">): void {
  const subs = getSubscriptions();
  if (subs.some(s => s.channelId === show.channelId)) return;
  subs.push({ ...show, subscribedAt: Date.now() });
  localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
}

export function unsubscribe(channelId: string): void {
  const subs = getSubscriptions().filter(s => s.channelId !== channelId);
  localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
}

export function isSubscribed(channelId: string): boolean {
  return getSubscriptions().some(s => s.channelId === channelId);
}

// ── Episode Progress ──

export function getEpisodeProgress(episodeId: string): PodcastEpisodeProgress | null {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return all[episodeId] || null;
  } catch { return null; }
}

export function saveEpisodeProgress(ep: PodcastEpisodeProgress): void {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    all[ep.episodeId] = ep;
    // Keep max 200 entries
    const keys = Object.keys(all);
    if (keys.length > 200) {
      const sorted = keys.sort((a, b) => (all[a].lastPlayedAt || 0) - (all[b].lastPlayedAt || 0));
      sorted.slice(0, keys.length - 200).forEach(k => delete all[k]);
    }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {}
}

export function getAllInProgressEpisodes(): PodcastEpisodeProgress[] {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return Object.values(all)
      .filter((ep: any) => !ep.completedAt && ep.currentTime > 30)
      .sort((a: any, b: any) => b.lastPlayedAt - a.lastPlayedAt) as PodcastEpisodeProgress[];
  } catch { return []; }
}

// ── Podcast History ──

export interface PodcastHistoryEntry {
  episodeId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  playedAt: number;
}

export function getPodcastHistory(): PodcastHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch { return []; }
}

export function addToPodcastHistory(entry: Omit<PodcastHistoryEntry, "playedAt">): void {
  try {
    let history = getPodcastHistory();
    // Remove duplicate
    history = history.filter(h => h.episodeId !== entry.episodeId);
    history.unshift({ ...entry, playedAt: Date.now() });
    // Keep 100 max
    if (history.length > 100) history = history.slice(0, 100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

// ── Playback Speed ──

export function getPlaybackSpeed(): number {
  try {
    return parseFloat(localStorage.getItem(SPEED_KEY) || "1") || 1;
  } catch { return 1; }
}

export function setPlaybackSpeed(speed: number): void {
  localStorage.setItem(SPEED_KEY, speed.toString());
}
