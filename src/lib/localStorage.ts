// Demus Evolution - Client-Side Storage (localStorage)

const DEVICE_ID_KEY = "demus_device_id";
const VOTES_KEY = "demus_voted_songs";
const QUEUE_KEY = "demus_queue";
const CURRENT_SONG_KEY = "demus_current_song";
const VOLUME_KEY = "demus_volume";
const PREFS_KEY = "demus_preferences";
const MEDIA_TYPE_KEY = "demus_media_type";

export type MediaType = "music" | "video";

// --- Search history (used to personalize "Destaques") ---
const SEARCH_HISTORY_KEY = "demus_search_history";
const MAX_SEARCH_HISTORY = 10;
export interface SearchHistoryEntry { q: string; ts: number; }
export function recordSearchQuery(q: string): void {
  const query = (q || "").trim();
  if (query.length < 2) return;
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    const list: SearchHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(e => e.q.toLowerCase() !== query.toLowerCase());
    filtered.unshift({ q: query, ts: Date.now() });
    if (filtered.length > MAX_SEARCH_HISTORY) filtered.length = MAX_SEARCH_HISTORY;
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent("demus:search-history-updated"));
  } catch {}
}
export function getSearchHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
export function removeSearchQuery(q: string): void {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    const list: SearchHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(e => e.q.toLowerCase() !== q.toLowerCase());
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent("demus:search-history-updated"));
  } catch {}
}
export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    window.dispatchEvent(new CustomEvent("demus:search-history-updated"));
  } catch {}
}

// --- Video Explore search log (full 24h history, uncapped by count) ---
const VIDEO_SEARCH_LOG_KEY = "demus_video_search_log";
const VIDEO_SEARCH_LOG_MAX = 200;
export interface VideoSearchEntry { q: string; ts: number; }
export function recordVideoSearchQuery(q: string): void {
  const query = (q || "").trim();
  if (query.length < 2) return;
  try {
    const raw = localStorage.getItem(VIDEO_SEARCH_LOG_KEY);
    const list: VideoSearchEntry[] = raw ? JSON.parse(raw) : [];
    // Dedupe by query within the last 30 minutes so rapid re-searches don't spam
    const now = Date.now();
    const recentDup = list.find(e => e.q.toLowerCase() === query.toLowerCase() && now - e.ts < 30 * 60 * 1000);
    if (!recentDup) list.unshift({ q: query, ts: now });
    // Prune older than 7 days AND cap length
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    const pruned = list.filter(e => e.ts >= cutoff).slice(0, VIDEO_SEARCH_LOG_MAX);
    localStorage.setItem(VIDEO_SEARCH_LOG_KEY, JSON.stringify(pruned));
    window.dispatchEvent(new CustomEvent("demus:video-search-log-updated"));
  } catch {}
}
export function getVideoSearchLog(sinceMs?: number): VideoSearchEntry[] {
  try {
    const raw = localStorage.getItem(VIDEO_SEARCH_LOG_KEY);
    const list: VideoSearchEntry[] = raw ? JSON.parse(raw) : [];
    if (typeof sinceMs === "number") {
      const cutoff = Date.now() - sinceMs;
      return list.filter(e => e.ts >= cutoff);
    }
    return list;
  } catch { return []; }
}

export function saveMediaType(t: MediaType): void {
  try { localStorage.setItem(MEDIA_TYPE_KEY, t); } catch {}
}
export function getMediaType(): MediaType {
  try {
    const v = localStorage.getItem(MEDIA_TYPE_KEY);
    return v === "video" ? "video" : "music";
  } catch { return "music"; }
}

// Generate a unique device ID (persists across sessions)
function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  const screen = `${window.screen.width}x${window.screen.height}`;
  return `dev_${timestamp}_${random}_${btoa(screen).substring(0, 6)}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// Voted songs (prevents double voting)
export function getVotedSongs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(VOTES_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addVotedSong(songId: string): void {
  const voted = getVotedSongs();
  if (!voted.includes(songId)) {
    voted.push(songId);
    localStorage.setItem(VOTES_KEY, JSON.stringify(voted));
  }
}

export function hasVotedForSong(songId: string): boolean {
  return getVotedSongs().includes(songId);
}

export function removeVotedSong(songId: string): void {
  const voted = getVotedSongs().filter(id => id !== songId);
  localStorage.setItem(VOTES_KEY, JSON.stringify(voted));
}

// Full metadata for favorites
const FAVORITES_METADATA_KEY = "demus_favorites_metadata";

export function getFavoritesMetadata(): any[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_METADATA_KEY) || "[]");
  } catch {
    return [];
  }
}

function emitFavoritesUpdated() {
  try { window.dispatchEvent(new CustomEvent("demus:favorites-updated")); } catch {}
}

export function saveFavoriteMetadata(song: any): void {
  const favorites = getFavoritesMetadata();
  // Normalize `type` so the Library counters/filters classify it correctly.
  // Music entries backed by YouTube start with "yt-" but are still music when
  // an explicit type is provided by the caller.
  const normalized = {
    ...song,
    type: song?.type ?? (String(song?.id).startsWith("yt-") ? "video" : "music"),
    favoritedAt: song?.favoritedAt ?? Date.now(),
  };
  const idx = favorites.findIndex(f => f.id === song.id);
  if (idx >= 0) {
    favorites[idx] = { ...favorites[idx], ...normalized };
  } else {
    favorites.push(normalized);
  }
  localStorage.setItem(FAVORITES_METADATA_KEY, JSON.stringify(favorites));
  emitFavoritesUpdated();
}

export function removeFavoriteMetadata(songId: string): void {
  const favorites = getFavoritesMetadata().filter(f => f.id !== songId);
  localStorage.setItem(FAVORITES_METADATA_KEY, JSON.stringify(favorites));
  emitFavoritesUpdated();
}

// Queue state (vote counts)
export function saveQueueState(votes: Record<string, number>): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(votes));
}

export function getQueueState(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "{}");
  } catch {
    return {};
  }
}

// Current song
export function saveCurrentSong(songId: string): void {
  localStorage.setItem(CURRENT_SONG_KEY, songId);
}

export function getCurrentSongId(): string | null {
  return localStorage.getItem(CURRENT_SONG_KEY);
}

// Volume
export function saveVolume(vol: number): void {
  const normalized = Number.isFinite(vol) ? Math.max(0, Math.min(100, Math.round(vol))) : 80;
  localStorage.setItem(VOLUME_KEY, String(normalized));
}

export function getVolume(): number {
  const v = localStorage.getItem(VOLUME_KEY);
  if (!v) return 80;
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

// Recently played history
const HISTORY_KEY = "demus_history";
const MAX_HISTORY = 100;
const HISTORY_DEDUP_MS = 3000; // ignore rapid re-adds of the same track within this window

export interface HistoryEntry {
  songId: string;
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  playedAt: number;
  type?: "music" | "video" | "podcast";
}

/**
 * Infer the media type of a legacy history entry that was persisted before we
 * started tagging entries. Heuristics:
 *  - `yt-<id>` songId prefix → video (Xerife Videos search results)
 *  - `pod-<id>` songId prefix → podcast
 *  - otherwise → music (default)
 */
function inferHistoryType(h: HistoryEntry): "music" | "video" | "podcast" {
  if (h.type) return h.type;
  const id = h.songId || "";
  if (id.startsWith("pod-") || id.startsWith("podcast-")) return "podcast";
  if (id.startsWith("yt-") || id.startsWith("video-")) return "video";
  return "music";
}

/** Normalize a legacy entry: fill missing fields, coerce types, drop garbage. */
function normalizeHistoryEntry(h: any): HistoryEntry | null {
  if (!h || typeof h !== "object") return null;
  const songId = typeof h.songId === "string" ? h.songId : "";
  if (!songId) return null;
  const youtubeId = typeof h.youtubeId === "string" && h.youtubeId
    ? h.youtubeId
    : songId.replace(/^(yt-|video-|pod-|podcast-)/, "");
  const entry: HistoryEntry = {
    songId,
    youtubeId,
    title: (h.title || "").toString().trim() || "Sem título",
    artist: (h.artist || "").toString().trim() || "Desconhecido",
    album: (h.album || "").toString().trim(),
    cover: (h.cover || "").toString(),
    duration: Number.isFinite(h.duration) ? Number(h.duration) : 0,
    playedAt: Number.isFinite(h.playedAt) ? Number(h.playedAt) : Date.now(),
    type: h.type,
  };
  entry.type = inferHistoryType(entry);
  if (!entry.album) {
    entry.album = entry.type === "video" ? "Vídeo"
      : entry.type === "podcast" ? "Podcast"
      : entry.artist;
  }
  return entry;
}

export function getHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const normalized: HistoryEntry[] = [];
    const seen = new Set<string>();
    let mutated = false;
    for (const item of raw) {
      const norm = normalizeHistoryEntry(item);
      if (!norm) { mutated = true; continue; }
      if (seen.has(norm.songId)) { mutated = true; continue; }
      seen.add(norm.songId);
      if (!item || item.type !== norm.type || item.album !== norm.album
          || item.youtubeId !== norm.youtubeId || item.title !== norm.title
          || item.artist !== norm.artist) {
        mutated = true;
      }
      normalized.push(norm);
    }
    normalized.sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
    const capped = normalized.slice(0, MAX_HISTORY);
    if (mutated || capped.length !== raw.length) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(capped)); } catch {}
    }
    return capped;
  } catch {
    return [];
  }
}


export function addToHistory(entry: Omit<HistoryEntry, "playedAt">): void {
  const now = Date.now();
  const history = getHistory();
  const existing = history.find((h) => h.songId === entry.songId);
  // Rapid-fire guard: if the same track was logged very recently (e.g. pause/end
  // firing right after play), skip writing to avoid duplicate churn.
  if (existing && now - (existing.playedAt || 0) < HISTORY_DEDUP_MS) return;

  const filtered = history.filter((h) => h.songId !== entry.songId);
  filtered.unshift({ ...entry, playedAt: now });
  if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  try { window.dispatchEvent(new CustomEvent("demus:history-updated")); } catch {}
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
  try { window.dispatchEvent(new CustomEvent("demus:history-updated")); } catch {}
}

// Resume playback: persist last-played track + position so reloads can pick up.
const LAST_PLAYBACK_KEY = "demus_last_playback";
export interface LastPlayback {
  song: any;
  currentTime: number;
  updatedAt: number;
}
export function saveLastPlayback(song: any, currentTime: number): void {
  if (!song?.id) return;
  try {
    const payload: LastPlayback = { song, currentTime: Math.max(0, currentTime || 0), updatedAt: Date.now() };
    localStorage.setItem(LAST_PLAYBACK_KEY, JSON.stringify(payload));
  } catch {}
}
export function getLastPlayback(): LastPlayback | null {
  try {
    const raw = localStorage.getItem(LAST_PLAYBACK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastPlayback;
  } catch { return null; }
}
export function clearLastPlayback(): void {
  try { localStorage.removeItem(LAST_PLAYBACK_KEY); } catch {}
}

// User preferences
export interface UserPrefs {
  displayName: string;
  isHost: boolean;
  theme: string;
}

export function savePrefs(prefs: UserPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function getPrefs(): UserPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as UserPrefs;
  } catch {
    return { displayName: "Convidado", isHost: false, theme: "dark" };
  }
}

// Playlists
export interface Playlist {
  id: string;
  name: string;
  songs: any[];
  createdAt: number;
}

const PLAYLISTS_KEY = "demus_playlists";

export function getPlaylists(): Playlist[] {
  try {
    return JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function emitPlaylistsUpdated() {
  try { window.dispatchEvent(new CustomEvent("demus:playlists-updated")); } catch {}
}

export function savePlaylist(playlist: Playlist): void {
  const playlists = getPlaylists();
  const index = playlists.findIndex(p => p.id === playlist.id);
  if (index >= 0) {
    playlists[index] = playlist;
  } else {
    playlists.push(playlist);
  }
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  emitPlaylistsUpdated();
}

export function deletePlaylist(id: string): void {
  const playlists = getPlaylists().filter(p => p.id !== id);
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  emitPlaylistsUpdated();
}

export function addSongToPlaylist(playlistId: string, song: any): void {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  if (playlist) {
    if (!playlist.songs.some(s => s.id === song.id)) {
      playlist.songs.push(song);
      savePlaylist(playlist);
    }
  }
}

export function removeSongFromPlaylist(playlistId: string, songId: string): void {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  if (playlist) {
    playlist.songs = playlist.songs.filter((s: any) => s.id !== songId);
    savePlaylist(playlist);
  }
}

export function renamePlaylist(playlistId: string, name: string): void {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  if (playlist) {
    playlist.name = name;
    savePlaylist(playlist);
  }
}

export function reorderPlaylistSongs(playlistId: string, fromIndex: number, toIndex: number): void {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) return;
  if (fromIndex < 0 || fromIndex >= playlist.songs.length) return;
  if (toIndex < 0 || toIndex >= playlist.songs.length) return;
  const [moved] = playlist.songs.splice(fromIndex, 1);
  playlist.songs.splice(toIndex, 0, moved);
  savePlaylist(playlist);
}
