import { describe, it, expect, beforeEach } from "vitest";
import {
  recordListenSeconds,
  clearListeningStats,
  getStatsSummary,
  getTopTracks,
  getTopArtists,
  getUniqueTrackCount,
  formatListenTime,
  dayKey,
  type TrackRef,
} from "@/lib/listeningStats";

const DAY = 86_400_000;
const NOW = new Date("2026-09-16T15:00:00").getTime();

const track = (id: string, over: Partial<TrackRef> = {}): TrackRef => ({
  id,
  title: `Track ${id}`,
  artist: `Artist ${id}`,
  cover: `https://img/${id}.jpg`,
  duration: 200,
  type: "music",
  ...over,
});

describe("listeningStats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("dayKey formata YYYY-MM-DD no fuso local", () => {
    expect(dayKey(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayKey(NOW)).toBe(dayKey(NOW + 1000)); // mesmo dia
  });

  it("ignora registros inválidos (0s, negativos, >600s, sem id)", () => {
    recordListenSeconds(track("a"), 0, NOW);
    recordListenSeconds(track("a"), -5, NOW);
    recordListenSeconds(track("a"), 9999, NOW);
    recordListenSeconds({ ...track(""), id: "" }, 10, NOW);
    expect(getStatsSummary("all").totalSec).toBe(0);
  });

  it("acumula segundos por faixa e artista no dia", () => {
    recordListenSeconds(track("a"), 30, NOW);
    recordListenSeconds(track("a"), 45, NOW);
    recordListenSeconds(track("b", { artist: "Artist a" }), 20, NOW);

    const s = getStatsSummary("all");
    expect(s.totalSec).toBe(95);
    expect(s.uniqueTracks).toBe(2);
    expect(s.uniqueArtists).toBe(1); // as duas faixas são do "Artist a"

    const tops = getTopTracks("all");
    expect(tops[0].id).toBe("a");
    expect(tops[0].sec).toBe(75);
    expect(tops[1].id).toBe("b");
    expect(tops[1].sec).toBe(20);

    const artists = getTopArtists("all");
    expect(artists[0].artist).toBe("Artist a");
    expect(artists[0].sec).toBe(95); // 75 da faixa a + 20 da faixa b
  });

  it("respeita ranges: today / 7d / 30d / all", () => {
    recordListenSeconds(track("hoje"), 100, NOW);
    recordListenSeconds(track("5dias"), 50, NOW - 5 * DAY);
    recordListenSeconds(track("20dias"), 25, NOW - 20 * DAY);
    recordListenSeconds(track("90dias"), 10, NOW - 90 * DAY);

    expect(getStatsSummary("today").totalSec).toBe(100);
    expect(getStatsSummary("7d").totalSec).toBe(150);
    expect(getStatsSummary("30d").totalSec).toBe(175);
    expect(getStatsSummary("all").totalSec).toBe(185);
  });

  it("filtra por tipo de mídia", () => {
    recordListenSeconds(track("m1"), 60, NOW);
    recordListenSeconds(track("v1", { type: "video" }), 120, NOW);
    recordListenSeconds(track("p1", { type: "podcast" }), 240, NOW);

    expect(getStatsSummary("all", "music").totalSec).toBe(60);
    expect(getStatsSummary("all", "video").totalSec).toBe(120);
    expect(getStatsSummary("all", "podcast").totalSec).toBe(240);

    expect(getTopTracks("all", "music").map((t) => t.id)).toEqual(["m1"]);
    expect(getUniqueTrackCount("all", "podcast")).toBe(1);
  });

  it("limita o ranking e ordena por segundos desc", () => {
    for (let i = 1; i <= 15; i++) {
      recordListenSeconds(track(`t${i}`), i * 10, NOW);
    }
    const top5 = getTopTracks("all", undefined, 5);
    expect(top5).toHaveLength(5);
    expect(top5[0].id).toBe("t15");
    expect(top5.map((t) => t.sec)).toEqual([150, 140, 130, 120, 110]);
  });

  it("atualiza metadados (capa) em registros posteriores", () => {
    recordListenSeconds(track("x", { cover: "" }), 10, NOW);
    recordListenSeconds(track("x", { cover: "https://img/nova.jpg" }), 10, NOW);
    const [t] = getTopTracks("all");
    expect(t.cover).toBe("https://img/nova.jpg");
    expect(t.sec).toBe(20);
  });

  it("clearListeningStats zera tudo", () => {
    recordListenSeconds(track("a"), 30, NOW);
    clearListeningStats();
    expect(getStatsSummary("all").totalSec).toBe(0);
    expect(getTopTracks("all")).toHaveLength(0);
  });

  it("formatListenTime formata s/min/h", () => {
    expect(formatListenTime(45)).toBe("45 s");
    expect(formatListenTime(615)).toBe("10 min");
    expect(formatListenTime(3900)).toBe("1 h 5 min");
    expect(formatListenTime(7200)).toBe("2 h");
  });
});
