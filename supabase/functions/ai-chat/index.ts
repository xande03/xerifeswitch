import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é Xerife AI, um buscador musical inteligente do Xerife Switch.

Sua missão: quando o usuário descrever uma música (por letra, tema, sentimento, ritmo, artista, banda, álbum ou qualquer característica), você IDENTIFICA as músicas ou álbuns que melhor correspondem e sugere possibilidades reais de áudio.

REGRAS IMPORTANTES:
1. Responda SEMPRE em português, curto e direto (máx 2 frases explicando o que você entendeu).
2. Depois da sua resposta em texto, adicione um bloco JSON no formato:
\`\`\`json
{"suggestions":[{"title":"Nome exato da música","artist":"Nome do artista/banda","type":"track"}]}
\`\`\`
   - Use type "track" para faixas ou "album" para álbuns completos.
   - Inclua de 3 a 6 sugestões reais e conhecidas, ordenadas da mais provável para a menos provável.
   - Se não tiver certeza, sugira faixas parecidas em gênero/artista.
3. Se o usuário NÃO estiver pedindo música (só quer conversar), responda naturalmente SEM o bloco JSON.
4. Use emojis com moderação. Seja amigável e conciso.

Exemplo:
Usuário: "aquela música que fala 'is this the real life, is this just fantasy'"
Você: "Essa é um clássico! 🎸"
\`\`\`json
{"suggestions":[{"title":"Bohemian Rhapsody","artist":"Queen","type":"track"}]}
\`\`\``;

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function getLastUserText(messages: Array<{ role?: string; content?: string }> = []) {
  return [...messages]
    .reverse()
    .find((message) => message?.role === "user" && typeof message.content === "string")
    ?.content?.trim() || "";
}

function fallbackAiResponse(messages: Array<{ role?: string; content?: string }> = []) {
  const userText = getLastUserText(messages);
  const query = userText || "músicas populares";
  const normalized = query.toLowerCase();
  const matchedSuggestions = [
    {
      match: ["is this the real life", "fantasy", "bohemian"],
      suggestions: [{ title: "Bohemian Rhapsody", artist: "Queen", type: "track" }],
    },
    {
      match: ["coldplay"],
      suggestions: [
        { title: "Viva La Vida", artist: "Coldplay", type: "track" },
        { title: "Yellow", artist: "Coldplay", type: "track" },
        { title: "The Scientist", artist: "Coldplay", type: "track" },
      ],
    },
    {
      match: ["queen"],
      suggestions: [
        { title: "Bohemian Rhapsody", artist: "Queen", type: "track" },
        { title: "Don't Stop Me Now", artist: "Queen", type: "track" },
        { title: "Somebody To Love", artist: "Queen", type: "track" },
      ],
    },
    {
      match: ["sertanejo", "sofrência", "sofrencia"],
      suggestions: [
        { title: "Erro Gostoso", artist: "Simone Mendes", type: "track" },
        { title: "Leão", artist: "Marília Mendonça", type: "track" },
        { title: "Pátio do Posto", artist: "Zé Neto & Cristiano", type: "track" },
      ],
    },
    {
      match: ["rock"],
      suggestions: [
        { title: "Sweet Child O' Mine", artist: "Guns N' Roses", type: "track" },
        { title: "Back In Black", artist: "AC/DC", type: "track" },
        { title: "Smells Like Teen Spirit", artist: "Nirvana", type: "track" },
      ],
    },
    {
      match: ["funk"],
      suggestions: [
        { title: "Baile de Favela", artist: "MC João", type: "track" },
        { title: "Bum Bum Tam Tam", artist: "MC Fioti", type: "track" },
        { title: "Plaqtudum", artist: "Recayd Mob", type: "track" },
      ],
    },
  ].find((item) => item.match.some((term) => normalized.includes(term)))?.suggestions;

  const suggestions = matchedSuggestions || [
    { title: query, artist: "música oficial", type: "track" },
    { title: `${query} letra`, artist: "música", type: "track" },
    { title: `${query} ao vivo`, artist: "música", type: "track" },
  ];

  return {
    choices: [
      {
        message: {
          content: `Encontrei possibilidades para sua busca.\n\n\`\`\`json\n${JSON.stringify({ suggestions })}\n\`\`\``,
        },
      },
    ],
    fallback: true,
  };
}

// v1.0.3 - intelligent music search
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }


  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("LOVABLE_API_KEY missing; serving ai-chat fallback suggestions.");
      return new Response(JSON.stringify(fallbackAiResponse(messages)), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.slice(-10),
        ],
        temperature: 0.8,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições. Tente novamente em alguns segundos." }),
          { status: 429, headers: jsonHeaders }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados." }),
          { status: 402, headers: jsonHeaders }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify(fallbackAiResponse(messages)), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: jsonHeaders,
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
