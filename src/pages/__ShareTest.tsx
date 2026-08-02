import { useState } from "react";
import { ShareModal } from "@/components/ShareModal";

const song = {
  id: "1",
  title: "FIDELIS FALANTE AO VIVO | PÂNICO - 23/07/26",
  artist: "Pânico Jovem Pan",
  youtubeId: "A3xYz1234567",
  thumbnail: "",
  duration: "25:07",
} as never;

export default function ShareTest() {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-screen bg-background">
      <button onClick={() => setOpen(true)}>abrir</button>
      <ShareModal open={open} onOpenChange={setOpen} song={song} isVideo />
    </div>
  );
}
