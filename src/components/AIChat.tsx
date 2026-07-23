import { useState, useRef, useEffect } from "react";
import { X, Send, User, Loader2, Sparkles, Trash2, Play, Disc3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { searchYouTubeMusic } from "@/lib/youtubeSearch";
import { toast } from "sonner";
import type { Song } from "@/data/mockSongs";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  songs?: Song[];
  loadingSongs?: boolean;
}


interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onPlaySong?: (song: Song) => void;
}

interface Suggestion {
  title: string;
  artist: string;
  type?: "track" | "album";
}

function buildLocalFallbackSuggestions(query: string): Suggestion[] {
  const normalized = query.toLowerCase();
  if (normalized.includes("is this the real life") || normalized.includes("bohemian")) {
    return [{ title: "Bohemian Rhapsody", artist: "Queen", type: "track" }];
  }
  if (normalized.includes("coldplay")) {
    return [
      { title: "Viva La Vida", artist: "Coldplay", type: "track" },
      { title: "Yellow", artist: "Coldplay", type: "track" },
      { title: "The Scientist", artist: "Coldplay", type: "track" },
    ];
  }
  if (normalized.includes("rock")) {
    return [
      { title: "Sweet Child O' Mine", artist: "Guns N' Roses", type: "track" },
      { title: "Back In Black", artist: "AC/DC", type: "track" },
      { title: "Smells Like Teen Spirit", artist: "Nirvana", type: "track" },
    ];
  }
  if (normalized.includes("sertanejo") || normalized.includes("sofrência") || normalized.includes("sofrencia")) {
    return [
      { title: "Erro Gostoso", artist: "Simone Mendes", type: "track" },
      { title: "Leão", artist: "Marília Mendonça", type: "track" },
      { title: "Pátio do Posto", artist: "Zé Neto & Cristiano", type: "track" },
    ];
  }
  return [
    { title: query, artist: "música oficial", type: "track" },
    { title: `${query} letra`, artist: "música", type: "track" },
    { title: `${query} ao vivo`, artist: "música", type: "track" },
  ];
}

// Extract JSON block with suggestions from AI response
function parseSuggestions(content: string): { text: string; suggestions: Suggestion[] } {
  const jsonRegex = /```json\s*([\s\S]*?)```/;
  const match = content.match(jsonRegex);
  if (!match) return { text: content.trim(), suggestions: [] };
  let suggestions: Suggestion[] = [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed?.suggestions)) {
      suggestions = parsed.suggestions
        .filter((s: any) => s?.title && s?.artist)
        .slice(0, 6)
        .map((s: any) => ({
          title: String(s.title),
          artist: String(s.artist),
          type: s.type === "album" ? "album" : "track",
        }));
    }
  } catch {}
  const text = content.replace(jsonRegex, "").trim();
  return { text, suggestions };
}

async function resolveSuggestionsToSongs(suggestions: Suggestion[]): Promise<Song[]> {
  const results = await Promise.all(
    suggestions.map(async (s) => {
      try {
        const query = `${s.title} ${s.artist}`;
        const found = await searchYouTubeMusic(query, "all");
        return found[0] || null;
      } catch {
        return null;
      }
    })
  );
  const seen = new Set<string>();
  return results.filter((s): s is Song => {
    if (!s) return false;
    if (seen.has(s.youtubeId)) return false;
    seen.add(s.youtubeId);
    return true;
  });
}


const AIChat = ({ isOpen, onClose, onPlaySong }: AIChatProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Olá! Sou o Xerife AI 🎵\n\nMe conte sobre a música que você procura: pode ser um trecho da letra, o tema, o sentimento, o artista, a banda ou até o álbum. Eu encontro as possibilidades e você toca com um clique!"

    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<{role: string; content: string}[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const newHistory = [...conversationHistory, { role: "user", content: userText }];
    const assistantId = (Date.now() + 1).toString();

    const showSuggestions = async (text: string, suggestions: Suggestion[], rawContent = text) => {
      setConversationHistory([...newHistory, { role: "assistant", content: rawContent }]);

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: text || "Aqui estão possibilidades que combinam com sua busca:",
          loadingSongs: suggestions.length > 0,
        },
      ]);

      if (suggestions.length > 0) {
        const songs = await resolveSuggestionsToSongs(suggestions);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  loadingSongs: false,
                  songs: songs.length > 0 ? songs : undefined,
                  content:
                    songs.length > 0
                      ? m.content
                      : (m.content + "\n\nNão consegui encontrar áudios agora. Tente descrever de outra forma!").trim(),
                }
              : m
          )
        );
      }
    };

    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { messages: newHistory.slice(-10) },
      });

      if (error) {
        console.error("AI Chat edge function error:", error);
        throw new Error(error.message || "Edge function error");
      }

      if (data?.error) {
        toast.error(data.error);
        throw new Error(data.error);
      }

      const raw = data?.choices?.[0]?.message?.content || "Não consegui entender. Pode descrever de outra forma?";
      const { text, suggestions } = parseSuggestions(raw);
      await showSuggestions(text, suggestions, raw);
    } catch (err) {
      console.error("AI Chat error:", err);
      await showSuggestions(
        "O Xerife AI está em modo de busca rápida agora. Encontrei estas possibilidades para você ouvir:",
        buildLocalFallbackSuggestions(userText)
      );
    } finally {
      setIsLoading(false);
    }
  };


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Conversa limpa! 🧹\n\nMe descreva a música que você quer ouvir (letra, tema, artista...) e eu encontro para você!"
    }]);
    setConversationHistory([]);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full h-[85vh] sm:h-[75vh] sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Xerife AI</h2>
                  <p className="text-[10px] text-muted-foreground">Powered by Lovable AI</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearChat}
                  className="w-8 h-8 rounded-full bg-secondary hover:bg-accent flex items-center justify-center transition-colors"
                  title="Limpar conversa"
                >
                  <Trash2 size={14} className="text-muted-foreground" />
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-secondary hover:bg-accent flex items-center justify-center transition-colors"
                >
                  <X size={16} className="text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-card to-card/50">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={16} className="text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] space-y-2`}>
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary/80 text-foreground rounded-bl-md backdrop-blur-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.loadingSongs && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Buscando áudios...</span>
                      </div>
                    )}
                    {msg.songs && msg.songs.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col gap-2 mt-2"
                      >
                        {msg.songs.map((song) => (
                          <div
                            key={song.id}
                            className="flex items-center gap-3 p-2 pr-3 bg-background/70 hover:bg-background rounded-xl border border-border/60 transition-colors"
                          >
                            {song.cover ? (
                              <img
                                src={song.cover}
                                alt={song.title}
                                loading="lazy"
                                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                                <Disc3 size={20} className="text-primary" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {song.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {song.artist}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                onPlaySong?.(song);
                                onClose();
                              }}
                              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-xs font-semibold transition-all active:scale-95 flex-shrink-0"
                              aria-label={`Ouvir ${song.title}`}
                            >
                              <Play size={14} fill="currentColor" />
                              Ouvir
                            </button>
                          </div>
                        ))}
                      </motion.div>
                    )}

                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-primary" />
                    </div>
                  )}
                </motion.div>
              ))}
              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2.5 justify-start"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Sparkles size={16} className="text-primary" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-secondary/80 backdrop-blur-sm">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {!input && messages.length > 1 && (
              <div className="px-4 py-2 border-t border-border/50 bg-card/50">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {["is this the real life", "música triste anos 90", "hits do Coldplay", "álbum do Legião Urbana"].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="flex-shrink-0 px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 border-t border-border bg-card/95 backdrop-blur-md">
              <div className="flex items-center gap-3 bg-secondary/50 hover:bg-secondary rounded-full px-4 py-2 transition-colors">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Descreva a música (letra, tema, artista...)"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="text-primary-foreground animate-spin" />
                  ) : (
                    <Send size={16} className="text-primary-foreground" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground mt-2">
                Xerife AI pode cometer erros. Considere verificar informações importantes.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIChat;
