import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Guitar, Type } from "lucide-react";
import ChordsPanel from "@/components/ChordsPanel";
import LyricsPanel from "@/components/LyricsPanel";

interface ChordsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: string;
  title: string;
  /** Usados para refinar a busca da letra (match exato no LRCLIB). */
  album?: string;
  duration?: number;
  /** Quando informado (telas com player), a letra sincronizada acompanha a reprodução. */
  currentTime?: number;
  /** Aba inicial — padrão: cifra. */
  defaultTab?: "chords" | "lyrics";
  className?: string;
}

const ChordsSheet = ({
  open,
  onOpenChange,
  artist,
  title,
  album,
  duration,
  currentTime,
  defaultTab = "chords",
}: ChordsSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 bg-background border-l border-border"
      >
        <SheetHeader className="px-4 pt-4 pb-3">
          <SheetTitle className="text-left text-lg font-bold truncate">{title}</SheetTitle>
          <p className="text-sm text-muted-foreground truncate text-left">{artist}</p>
        </SheetHeader>

        <Tabs defaultValue={defaultTab} className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pb-2">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="chords" className="gap-1.5 text-xs">
                <Guitar size={13} /> Cifra
              </TabsTrigger>
              <TabsTrigger value="lyrics" className="gap-1.5 text-xs">
                <Type size={13} /> Letra
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chords" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            {open && (
              <ChordsPanel
                key={`${artist}::${title}`}
                artist={artist}
                title={title}
                showHeading={false}
                className="h-full min-h-0"
              />
            )}
          </TabsContent>

          <TabsContent value="lyrics" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            {open && (
              <LyricsPanel
                key={`${artist}::${title}`}
                artist={artist}
                title={title}
                album={album}
                duration={duration}
                currentTime={currentTime}
                className="h-full min-h-0"
              />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export default ChordsSheet;
