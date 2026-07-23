import { useState } from "react";
import { ArrowLeft, Play, X, Loader2, Radio, Shuffle } from "lucide-react";
import { searchYouTubeMusic } from "@/lib/youtubeSearch";
import { Song } from "@/data/mockSongs";
import SongCard from "./SongCard";
import album1 from "@/assets/album-1.jpg";
import album2 from "@/assets/album-2.jpg";
import album3 from "@/assets/album-3.jpg";
import album4 from "@/assets/album-4.jpg";

const MOOD_OPTIONS = [
  { id: "popular", label: "Popular", emoji: "🔥" },
  { id: "chill", label: "Chill", emoji: "🧊" },
  { id: "upbeat", label: "Upbeat", emoji: "⚡" },
  { id: "pump-up", label: "Pump-up", emoji: "💪" },
  { id: "focus", label: "Focus", emoji: "🎯" },
  { id: "downbeat", label: "Downbeat", emoji: "🌙" },
];

const VARIETY_OPTIONS = ["Baixa", "Média", "Alta"] as const;
const SELECTION_OPTIONS = [
  { id: "familiar", label: "Familiar", icon: "🎵" },
  { id: "blend", label: "Blend", icon: "🎶" },
  { id: "discover", label: "Descobrir", icon: "🔮" },
] as const;

const SUGGESTED_ARTISTS = [
  "Queen", "Adele", "Ed Sheeran", "Nirvana", "Luis Fonsi",
  "Katy Perry", "The Weeknd", "Drake", "Taylor Swift", "Bad Bunny",
  "Billie Eilish", "Doja Cat", "BTS", "Shakira", "Coldplay",
];

interface RadioScreenProps {
  onBack: () => void;
  onPlaySong: (song: Song) => void;
  onPlayAll: (songs: Song[]) => void;
}

const RadioScreen = ({ onBack, onPlaySong, onPlayAll }: RadioScreenProps) => {
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [customArtist, setCustomArtist] = useState("");
  const [selectedMoods, setSelectedMoods] = useState<string[]>(["popular"]);
  const [variety, setVariety] = useState<typeof VARIETY_OPTIONS[number]>("Média");
  const [selection, setSelection] = useState<typeof SELECTION_OPTIONS[number]["id"]>("blend");
  const [generatedPlaylist, setGeneratedPlaylist] = useState<Song[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState<"config" | "results">("config");

  const toggleArtist = (artist: string) => {
    setSelectedArtists(prev =>
      prev.includes(artist) ? prev.filter(a => a !== artist) : [...prev, artist]
    );
  };

  const addCustomArtist = () => {
    const name = customArtist.trim();
    if (name && !selectedArtists.includes(name)) {
      setSelectedArtists(prev => [...prev, name]);
      setCustomArtist("");
    }
  };

  const generatePlaylist = async () => {
    setIsGenerating(true);
    const allSongs: Song[] = [];

    // Build search queries from selected artists + moods
    const queries: string[] = [];
    const moods = selectedMoods.join(" ");

    if (selectedArtists.length > 0) {
      for (const artist of selectedArtists.slice(0, 5)) {
        queries.push(`${artist} ${moods} music`);
      }
    } else {
      queries.push(`${moods} music mix`);
      queries.push(`top ${moods} songs`);
    }

    // Search in parallel
    const results = await Promise.all(queries.map(q => searchYouTubeMusic(q, "songs")));
    results.forEach(r => allSongs.push(...r));

    // Deduplicate by youtubeId
    const unique = new Map<string, Song>();
    allSongs.forEach(s => { if (!unique.has(s.youtubeId)) unique.set(s.youtubeId, s); });

    let playlist = Array.from(unique.values());

    // Apply variety (shuffle more or less)
    if (variety === "Alta") {
      playlist = playlist.sort(() => Math.random() - 0.5);
    } else if (variety === "Baixa") {
      // Keep order (most relevant first)
    } else {
      // Medium - partial shuffle
      playlist = playlist.sort(() => Math.random() - 0.3);
    }

    setGeneratedPlaylist(playlist.slice(0, 25));
    setIsGenerating(false);
    setStep("results");
  };

  if (step === "results") {
    return (
      <div className="flex flex-col h-full animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0">
          <button onClick={() => setStep("config")} className="p-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-display font-bold text-foreground truncate">
              {selectedArtists.length > 0 ? selectedArtists.join(", ") : selectedMoods.join(", ")} Radio
            </h1>
            <p className="text-xs text-muted-foreground">{generatedPlaylist.length} músicas • Descobrir</p>
          </div>
          <button
            onClick={() => onPlayAll(generatedPlaylist)}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-glow-red active:scale-95 transition-transform"
          >
            <Play size={18} className="text-primary-foreground ml-0.5" fill="currentColor" />
          </button>
        </div>

        {/* Visualizer banner */}
        <div className="mx-4 mb-4 rounded-xl overflow-hidden relative h-32 bg-card">
          <div className="absolute inset-0 grid grid-cols-4">
            {[album1, album2, album3, album4].map((img, i) => (
              <div key={i} className="overflow-hidden">
                <img src={img} alt="" className="w-full h-full object-cover opacity-60" />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-primary" />
              <span className="text-sm font-medium text-foreground">Rádio personalizada</span>
            </div>
            <button onClick={generatePlaylist} className="text-xs text-primary flex items-center gap-1 active:scale-95">
              <Shuffle size={14} /> Misturar
            </button>
          </div>
        </div>

        {/* Playlist */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {generatedPlaylist.map((song, i) => (
            <SongCard key={song.id} song={song} isActive={false} onSelect={onPlaySong} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="p-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-display font-bold text-foreground">Criar rádio</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-6">
        {/* Selected artists */}
        {selectedArtists.length > 0 && (
          <div>
            <div className="flex gap-2 flex-wrap">
              {selectedArtists.map(artist => (
                <span key={artist} className="chip chip-active flex items-center gap-1.5 pr-1.5">
                  {artist}
                  <button onClick={() => toggleArtist(artist)} className="hover:text-primary transition-colors">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Add artist */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Adicionar artistas</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={customArtist}
              onChange={e => setCustomArtist(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustomArtist()}
              placeholder="Nome do artista..."
              className="flex-1 px-3 py-2 rounded-full bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground/30"
            />
            <button
              onClick={addCustomArtist}
              disabled={!customArtist.trim()}
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-95 transition-all"
            >
              +
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_ARTISTS.filter(a => !selectedArtists.includes(a)).slice(0, 10).map(artist => (
              <button
                key={artist}
                onClick={() => toggleArtist(artist)}
                className="chip chip-inactive"
              >
                {artist}
              </button>
            ))}
          </div>
        </div>

        {/* Variety */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Variedade de artistas</h3>
          <div className="flex gap-2">
            {VARIETY_OPTIONS.map(v => (
              <button
                key={v}
                onClick={() => setVariety(v)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  variety === v ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Song selection */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Seleção de músicas</h3>
          <div className="flex gap-3">
            {SELECTION_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSelection(opt.id)}
                className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl transition-all ${
                  selection === opt.id
                    ? "bg-foreground text-background ring-2 ring-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-2xl">{opt.icon}</span>
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mood filters */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Filtros de mood</h3>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map(mood => (
              <button
                key={mood.id}
                onClick={() => setSelectedMoods(prev =>
                  prev.includes(mood.id) ? prev.filter(m => m !== mood.id) : [...prev, mood.id]
                )}
                className={`chip ${selectedMoods.includes(mood.id) ? "chip-active" : "chip-inactive"}`}
              >
                {mood.emoji} {mood.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generatePlaylist}
          disabled={isGenerating}
          className="w-full py-3.5 rounded-full bg-foreground text-background text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isGenerating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Gerando playlist...
            </>
          ) : (
            <>
              <Radio size={18} />
              Gerar rádio
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default RadioScreen;
