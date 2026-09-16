import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseRelatedFromNext } from "../../supabase/functions/_shared/innertubeRelated";

describe("probe /next ao vivo (payload capturado 2026-09-16)", () => {
  it("parseRelatedFromNext extrai relacionadas do payload fresco", () => {
    const raw = readFileSync("/tmp/yt-next.json", "utf8");
    const payload = JSON.parse(raw);
    const related = parseRelatedFromNext(payload, 15);
    console.log("RELACIONADAS:", related.length);
    console.log(JSON.stringify(related[0] ?? null, null, 1));
    expect(related.length).toBeGreaterThan(0);
  });
});
