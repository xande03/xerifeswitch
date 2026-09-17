/**
 * adProfiles — manifesto editorial de artes/identidade dos anúncios internos.
 * Origem leve: tiles geradas como SVG inline (gradientes do próprio tema), sem
 * binários no repositório. O engine de ads as combina com o catálogo remoto.
 */

/** Pool de tiles por campanha (geradas em runtime — gradientes + rótulos) */
export const AD_GENDER_POOL_SIZE = 7;

const tile = (from: string, to: string, glyph: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
      </linearGradient></defs>
      <rect width="320" height="180" rx="18" fill="url(#g)"/>
      <circle cx="260" cy="40" r="70" fill="#ffffff14"/>
      <circle cx="60" cy="150" r="90" fill="#0000001f"/>
      <text x="24" y="100" font-family="system-ui,sans-serif" font-size="44">${glyph}</text>
    </svg>`);

export const AD_SPRITES: string[] = [
  tile("#16a34a", "#065f46", "🎧"),   // Music
  tile("#dc2626", "#7f1d1d", "🎬"),   // Vídeos
  tile("#7c3aed", "#4c1d95", "🎙️"),  // Podcasts
  tile("#d97706", "#92400e", "💰"),   // MyWallet
  tile("#0891b2", "#155e75", "✨"),   // Artistas
  tile("#db2777", "#831843", "💜"),
  tile("#4f46e5", "#312e81", "🛡️"),
];

export const AD_BANNERS = { app: AD_SPRITES[0], mywallet: AD_SPRITES[3], artist: AD_SPRITES[4] };
export const AD_ARTWORK = AD_SPRITES;
