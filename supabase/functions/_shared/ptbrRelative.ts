/**
 * Data relativa em pt-BR ("há 3 dias", "há 1 ano") a partir de um timestamp (ms).
 *
 * Existe porque os comentários via Invidious chegam com `publishedText` no
 * LOCALE DA INSTÂNCIA (observado: árabe no inv.nadeko.net), enquanto o campo
 * `published` (epoch, segundos) é determinístico. O YouTube usa texto relativo
 * no card de comentário — aqui reproduzimos o mesmo estilo em português.
 */
export function formatRelativePtBR(epochMs: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - epochMs);
  const secs = Math.round(diff / 1000);
  if (secs < 45) return "agora mesmo";
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins === 1 ? "há 1 minuto" : `há ${mins} minutos`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "há 1 hora" : `há ${hours} horas`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "há 1 dia" : `há ${days} dias`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks === 1 ? "há 1 semana" : `há ${weeks} semanas`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? "há 1 mês" : `há ${months} meses`;
  const years = Math.round(days / 365);
  return years <= 1 ? "há 1 ano" : `há ${years} anos`;
}

/**
 * Traduz uma lista de textos para pt-BR usando o MyMemory (endpoint público,
 * amigável a datacenter — o `gtx` do Google devolve "Sorry" para bots).
 * Textos já em pt passam intactos pelo `Autodetect`. Falhas mantêm o original.
 *
 * Retorna, por índice: { text, original, lang } — `lang` = idioma detectado.
 */
export async function translateTextsPtBR(
  texts: string[],
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<{ text: string; original: string; lang: string | null }[]> {
  const concurrency = opts.concurrency ?? 4;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const out: { text: string; original: string; lang: string | null }[] =
    texts.map((t) => ({ text: t, original: t, lang: null }));

  const translateOne = async (i: number) => {
    const original = texts[i]?.trim();
    if (!original) return;
    // Economia óbvia: textos sem letras (só números/emoji/pontuação) não vão à API.
    if (!/\p{L}/u.test(original)) return;
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        original.slice(0, 480),
      )}&langpair=${encodeURIComponent("Autodetect|pt-BR")}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return;
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      const lang = data?.responseData?.detectedLanguage ?? null;
      if (typeof translated === "string" && translated.trim()) {
        out[i] = { text: translated.trim(), original, lang };
      }
    } catch {
      /* mantém original */
    }
  };

  // Pool de concorrência simples (evita disparar 40+ requests em rajada)
  const queue = texts.map((_, i) => i);
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const i = queue.shift();
      if (i === undefined) break;
      await translateOne(i);
    }
  });
  await Promise.all(workers);
  return out;
}
