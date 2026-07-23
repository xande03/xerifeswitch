import album1 from "@/assets/album-1.jpg";
import album2 from "@/assets/album-2.jpg";
import album3 from "@/assets/album-3.jpg";
import album4 from "@/assets/album-4.jpg";

export interface Song {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number; // seconds
  votes: number;
  isDownloaded: boolean;
  type?: 'music' | 'video' | 'podcast';
}

// Mock songs with real YouTube video IDs for playback
export const mockSongs: Song[] = [
  { id: "1", youtubeId: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", album: "Whenever You Need Somebody", cover: album1, duration: 213, votes: 12, isDownloaded: false },
  { id: "2", youtubeId: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", album: "A Night at the Opera", cover: album2, duration: 354, votes: 8, isDownloaded: false },
  { id: "3", youtubeId: "hTWKbfoikeg", title: "Smells Like Teen Spirit", artist: "Nirvana", album: "Nevermind", cover: album3, duration: 301, votes: 15, isDownloaded: false },
  { id: "4", youtubeId: "YQHsXMglC9A", title: "Hello", artist: "Adele", album: "25", cover: album4, duration: 295, votes: 5, isDownloaded: false },
  { id: "5", youtubeId: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi ft. Daddy Yankee", album: "Vida", cover: album1, duration: 282, votes: 20, isDownloaded: false },
  { id: "6", youtubeId: "RgKAFK5djSk", title: "See You Again", artist: "Wiz Khalifa ft. Charlie Puth", album: "Furious 7", cover: album2, duration: 237, votes: 3, isDownloaded: false },
  { id: "7", youtubeId: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran", album: "÷", cover: album3, duration: 234, votes: 9, isDownloaded: false },
  { id: "8", youtubeId: "CevxZvSJLk8", title: "Roar", artist: "Katy Perry", album: "Prism", cover: album4, duration: 224, votes: 7, isDownloaded: false },
];

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Democracy mode: sort by votes (highest first), tiebreaker by position (oldest first)
export function sortByVotes(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return Number(a.id) - Number(b.id);
  });
}
