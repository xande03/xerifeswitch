import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ChordsPanel from "@/components/ChordsPanel";

interface ChordsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: string;
  title: string;
}

const ChordsSheet = ({ open, onOpenChange, artist, title }: ChordsSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 bg-background border-l border-border"
      >
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="text-left text-lg font-bold truncate">{title}</SheetTitle>
          <p className="text-sm text-muted-foreground truncate text-left">{artist}</p>
        </SheetHeader>
        {open && (
          <ChordsPanel
            key={`${artist}::${title}`}
            artist={artist}
            title={title}
            showHeading={false}
            className="flex-1 min-h-0"
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ChordsSheet;
