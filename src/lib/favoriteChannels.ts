/**
 * Canais favoritos do Xerife Videos.
 * Guardados em localStorage; alimentam o módulo "Favoritos" da Biblioteca e a
 * seção "Dos seus canais favoritos" na tela de início do Xerife Videos.
 */

export interface FavoriteChannel {
  channelId?: string;
  name: string;
  thumbnail?: string;
  channelUrl?: string;
  favoritedAt: number;
}

const KEY = "xerife_favorite_channels";
export const FAV_CHANNELS_EVENT = "xerife:fav-channels-updated";

const keyOf = (c: { channelId?: string; name: string }) =>
  (c.channelId || c.name || "").toLowerCase().trim();

export function getFavoriteChannels(): FavoriteChannel[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(list: FavoriteChannel[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(FAV_CHANNELS_EVENT));
  } catch {}
}

export function isFavoriteChannel(c: { channelId?: string; name: string }): boolean {
  const k = keyOf(c);
  return getFavoriteChannels().some((f) => keyOf(f) === k);
}

export function addFavoriteChannel(c: Omit<FavoriteChannel, "favoritedAt">): void {
  const list = getFavoriteChannels();
  const k = keyOf(c);
  if (list.some((f) => keyOf(f) === k)) return;
  list.unshift({ ...c, favoritedAt: Date.now() });
  persist(list.slice(0, 100));
}

export function removeFavoriteChannel(c: { channelId?: string; name: string }): void {
  const k = keyOf(c);
  persist(getFavoriteChannels().filter((f) => keyOf(f) !== k));
}

export function toggleFavoriteChannel(c: Omit<FavoriteChannel, "favoritedAt">): boolean {
  if (isFavoriteChannel(c)) {
    removeFavoriteChannel(c);
    return false;
  }
  addFavoriteChannel(c);
  return true;
}
