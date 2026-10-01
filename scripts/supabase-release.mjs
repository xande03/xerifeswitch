#!/usr/bin/env node
/**
 * Liberação automática do projeto Supabase a partir do acesso do usuário.
 *
 * Requer um Personal Access Token do Supabase (formato sbp_…), criado em:
 *   https://supabase.com/dashboard/account/tokens
 * (publishable/anon key NÃO tem permissão de gestão; tokens ghp_… são GitHub.)
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/supabase-release.mjs list
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/supabase-release.mjs pause [ref]
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/supabase-release.mjs restore [ref]
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx CONFIRMAR_APAGAR=sim node scripts/supabase-release.mjs delete [ref]
 *
 * - pause:   POST /v1/projects/{ref}/pause  (Free; dados preservados; sem egress)
 * - restore: POST /v1/projects/{ref}/restore
 * - delete:  DELETE /v1/projects/{ref}      (IRREVERSÍVEL — exige CONFIRMAR_APAGAR=sim)
 * - ref default: VITE_SUPABASE_PROJECT_ID do .env da raiz.
 *
 * Egress: com o heartbeat removido, o projeto só recebe acesso quando alguém
 * usa as features; pausado (ou 7 dias sem acesso no Free) → zero egress.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "https://api.supabase.com/v1";

function token() {
  const t = process.env.SUPABASE_ACCESS_TOKEN;
  if (!t || !t.startsWith("sbp_")) {
    console.error("ERRO: defina SUPABASE_ACCESS_TOKEN com um PAT do Supabase (sbp_…).");
    console.error("      (ghp_… é token do GitHub; sb_publishable_… é chave de cliente — nenhuma serve.)");
    console.error("      Criar em: https://supabase.com/dashboard/account/tokens");
    process.exit(2);
  }
  return t;
}

function defaultRef() {
  try {
    const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const m = env.match(/VITE_SUPABASE_PROJECT_ID="?([^"\n]+)"?/);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(body ? {} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

const [cmd, refArg] = process.argv.slice(2);
const ref = refArg || defaultRef();

if (!cmd || !["list", "pause", "restore", "delete"].includes(cmd)) {
  console.log("Uso: SUPABASE_ACCESS_TOKEN=sbp_… node scripts/supabase-release.mjs <list|pause|restore|delete> [ref]");
  process.exit(1);
}

if (cmd === "list") {
  const r = await call("GET", "/projects");
  if (!r.ok) { console.error("Falha:", r.status, JSON.stringify(r.data)); process.exit(1); }
  for (const p of r.data) {
    console.log(`${p.ref}  ${p.name}  [${p.status}]`);
  }
  process.exit(0);
}

if (!ref) {
  console.error("ERRO: informe o project ref (ou defina VITE_SUPABASE_PROJECT_ID no .env).");
  process.exit(2);
}

if (cmd === "pause") {
  const r = await call("POST", `/projects/${ref}/pause`);
  console.log(r.ok ? `✓ Projeto ${ref} PAUSADO (dados preservados; sem egress até restore).` : `Falha ${r.status}: ${JSON.stringify(r.data)}`);
  process.exit(r.ok ? 0 : 1);
}

if (cmd === "restore") {
  const r = await call("POST", `/projects/${ref}/restore`);
  console.log(r.ok ? `✓ Projeto ${ref} RESTAURADO.` : `Falha ${r.status}: ${JSON.stringify(r.data)}`);
  process.exit(r.ok ? 0 : 1);
}

if (cmd === "delete") {
  if (process.env.CONFIRMAR_APAGAR !== "sim") {
    console.error(`RECUSEI: delete é IRREVERSÍVEL. Repita com CONFIRMAR_APAGAR=sim para apagar ${ref}.`);
    process.exit(3);
  }
  const r = await call("DELETE", `/projects/${ref}`);
  console.log(r.ok || r.status === 200 || r.status === 204 ? `✓ Projeto ${ref} APAGADO.` : `Falha ${r.status}: ${JSON.stringify(r.data)}`);
  process.exit(r.ok ? 0 : 1);
}
