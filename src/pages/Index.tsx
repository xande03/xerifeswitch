import { useState, useCallback, useEffect, useRef } from "react";
import { Search, Wifi, WifiOff, ChevronRight, ChevronDown, Music, TrendingUp, Play, Pause, SkipBack, SkipForward, User, Clock, Sparkles, Plus, Sun, Moon, Flame, Headphones, Disc3, Zap, MonitorPlay, Heart, ListMusic, Bookmark, Trash2, Maximize2, Minimize2, ArrowLeft, Captions, CaptionsOff, Home, RefreshCw } from "lucide-react";
import SeekBar from "@/components/SeekBar";
import { formatDuration } from "@/data/mockSongs";
import { useReducedMotionTest } from "@/hooks/useReducedMotionTest";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { mockSongs, Song, sortByVotes } from "@/data/mockSongs";
import { saveSong, getAllSavedSongs, StoredSong, getSong } from "@/lib/indexedDB";
import { getDeviceId, getVotedSongs, addVotedSong, removeVotedSong, saveQueueState, getQueueState, saveCurrentSong, getCurrentSongId, saveVolume, getVolume, addToHistory, getHistory, clearHistory, type HistoryEntry, getFavoritesMetadata, saveFavoriteMetadata, removeFavoriteMetadata, getPlaylists, savePlaylist, deletePlaylist, addSongToPlaylist, Playlist, saveMediaType, getMediaType } from "@/lib/localStorage";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { useNativeCapabilities } from "@/hooks/useNativeCapabilities";
import { useTrendingMusic } from "@/hooks/useTrendingMusic";
import { usePersonalizedDestaques } from "@/hooks/usePersonalizedDestaques";
import { useDiscoverRecommendations } from "@/hooks/useDiscoverRecommendations";
import { useMediaSession } from "@/hooks/useMediaSession";

import { useTheme } from "@/hooks/useTheme";
import { fetchRelatedQueue, popNextFromQueue, clearSmartQueue, shuffleSmartQueue, hasSmartQueue } from "@/lib/smartQueue";
import { fetchRelatedVideoQueue, popNextVideoFromQueue } from "@/lib/smartVideoQueue";
import { fetchArtistAlbumQueue, fetchHistoryBasedQueue } from "@/lib/artistAlbumQueue";

import QueueDrawer from "@/components/QueueDrawer";
import Logo from "@/components/Logo";
import DynamicIslandModules from "@/components/DynamicIslandModules";

import { getSearchSuggestions, searchYouTubeMusic } from "@/lib/youtubeSearch";
import { hdThumbnail } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import SongCard from "@/components/SongCard";
import MiniPlayer from "@/components/MiniPlayer";
import NowPlayingView, { type PlayerMode } from "@/components/NowPlayingView";
import FloatingPiPPlayer from "@/components/FloatingPiPPlayer";
import PiPDiagnostics from "@/components/PiPDiagnostics";
import { trackPip } from "@/lib/pipTelemetry";
import ExploreScreen from "@/components/ExploreScreen";
import VideoHomeScreen, { getWatchLater, removeFromWatchLater } from "@/components/VideoHomeScreen";
import HubHomeScreen from "@/components/HubHomeScreen";
import { useModuleMode } from "@/hooks/useModuleMode";
import ChannelProfile from "@/components/ChannelProfile";
import ArtistProfile from "@/components/ArtistProfile";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/DesktopSidebar";
import SearchSkeleton from "@/components/SearchSkeleton";
import SearchScreen from "@/components/SearchScreen";
import DesktopPlayer from "@/components/DesktopPlayer";
import SplashScreen from "@/components/SplashScreen";
import FullscreenOverlay from "@/components/FullscreenOverlay";
import HeaderMenu from "@/components/HeaderMenu";
import { DownloadModal } from "@/components/DownloadModal";
import { ShareModal } from "@/components/ShareModal";
import { PlaylistModal } from "@/components/PlaylistModal";
import { PlaylistDetail } from "@/components/PlaylistDetail";

import PodcastScreen from "@/components/PodcastScreen";
import LibraryHubScreen from "@/components/LibraryHubScreen";

import { saveEpisodeProgress, getEpisodeProgress, getAllInProgressEpisodes } from "@/lib/podcastStorage";
import ProfileButton from "@/components/ProfileButton";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import QualityBadge from "@/components/QualityBadge";

import album1 from "@/assets/album-1.jpg";
import album2 from "@/assets/album-2.jpg";
import album3 from "@/assets/album-3.jpg";
import album4 from "@/assets/album-4.jpg";


type Tab = "home" | "search" | "library" | "offline" | "profile" | "history" | "playlists" | "podcast" | "libraryhub";
type SearchFilter = "all" | "songs" | "artists" | "albums";
type HomeMode = "hub" | "music" | "video";

const albumCovers = [album1, album2, album3, album4];

const Index = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('demus-active-tab') as Tab) || "home"; } catch { return "home"; }
  });
  // Single source of truth for the session module (hub/music/video/podcast).
  // Owns localStorage persistence, ?module=podcast URL sync, <html data-module>
  // and back/forward navigation. Never mutate those directly — always use the
  // setters below.
  const { homeMode, podcastMode, moduleKey, setHomeMode, setPodcastMode } = useModuleMode();
  // Persist activeTab
  useEffect(() => {
    try { localStorage.setItem('demus-active-tab', activeTab); } catch {}
  }, [activeTab]);
  // Ativa podcastMode quando a aba Podcast for selecionada diretamente
  useEffect(() => {
    if (activeTab === "podcast" && !podcastMode) setPodcastMode(true);
  }, [activeTab, podcastMode, setPodcastMode]);
  // Quando o usuário volta para uma sessão não-podcast via navegação, também
  // volta a aba para "home" para manter comportamento anterior.
  useEffect(() => {
    if (!podcastMode && activeTab === "podcast") setActiveTab("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podcastMode]);

  // Handles bottom-nav / sidebar clicks while respecting the current module.
  // In podcast mode, Início / Buscar / Favoritos are routed inside the
  // PodcastScreen via `xerife:podcast-nav`, while Biblioteca opens the hub
  // pre-filtered to Podcasts. This keeps the lilac accent locked in.
  const handleNavChange = (tab: Tab) => {
    if (podcastMode) {
      if (tab === "home") {
        setChannelView(null); setArtistView(null);
        setActiveTab("home");
        window.dispatchEvent(new CustomEvent("xerife:podcast-nav", { detail: { target: "home" } }));
        return;
      }
      if (tab === "search") {
        setChannelView(null); setArtistView(null);
        setActiveTab("home");
        window.dispatchEvent(new CustomEvent("xerife:podcast-nav", { detail: { target: "explore" } }));
        return;
      }
      if (tab === "library") {
        setActiveTab("home");
        window.dispatchEvent(new CustomEvent("xerife:podcast-nav", { detail: { target: "favorites" } }));
        return;
      }
      if (tab === "libraryhub") {
        setActiveTab("libraryhub");
        return;
      }
      if (tab === "history") {
        setActiveTab("home");
        window.dispatchEvent(new CustomEvent("xerife:podcast-nav", { detail: { target: "history" } }));
        return;
      }
    }
    if (tab === "home" && activeTab === "home") {
      setChannelView(null);
      setArtistView(null);
    }
    setActiveTab(tab);
  };
  const [channelView, setChannelView] = useState<{ name: string; thumbnail?: string; channelId?: string; channelUrl?: string } | null>(null);
  const [artistView, setArtistView] = useState<{ name: string; image?: string } | null>(null);
  const [currentSong, setCurrentSong] = useState<Song>(mockSongs[0]);
  // Always start collapsed on Xerife Music home; user must expand the player manually
  const [expanded, setExpanded] = useState<boolean>(false);
  const [playerMode, setPlayerMode] = useState<PlayerMode>(() => (localStorage.getItem('demus-player-mode') as PlayerMode) || 'audio');
  const [showFloatingPiP, setShowFloatingPiP] = useState<boolean>(() => localStorage.getItem('demus-pip-floating') === '1');
  const prePipExpandedRef = useRef<boolean>(false);
  const prevClickRef = useRef<number>(0);

  const [showVideoOverlayControls, setShowVideoOverlayControls] = useState(true);
  const [videoAudioOnly, setVideoAudioOnly] = useState(false);
  useEffect(() => {
    const onAudioOnly = (e: Event) => setVideoAudioOnly(!!(e as CustomEvent).detail?.active);
    window.addEventListener("xerife:video-audio-only", onAudioOnly);
    return () => window.removeEventListener("xerife:video-audio-only", onAudioOnly);
  }, []);
  const videoOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoOverlayInteractingRef = useRef(false);
  const videoOverlayKeepOpenRef = useRef(false);
  const revealVideoOverlay = useCallback((opts?: { sticky?: boolean }) => {
    setShowVideoOverlayControls(true);
    if (videoOverlayTimerRef.current) {
      clearTimeout(videoOverlayTimerRef.current);
      videoOverlayTimerRef.current = null;
    }
    // Don't schedule auto-hide while user is interacting (e.g. dragging seekbar)
    // or when caller explicitly wants controls to stay visible (paused/buffering).
    if (opts?.sticky || videoOverlayInteractingRef.current || videoOverlayKeepOpenRef.current) return;
    videoOverlayTimerRef.current = setTimeout(() => setShowVideoOverlayControls(false), 4000);
  }, []);
  useEffect(() => () => { if (videoOverlayTimerRef.current) clearTimeout(videoOverlayTimerRef.current); }, []);

  // (module accent, localStorage, URL query, back/forward — todos centralizados
  // em useModuleMode; não replicar aqui.)
  useEffect(() => {
    if (expanded && playerMode === "video") revealVideoOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, playerMode]);





  // Persist player panel + mode + floating PiP so context survives reloads,
  // returning from PiP/home screen on mobile, and PWA relaunches.
  useEffect(() => { localStorage.setItem('demus-player-expanded', expanded ? '1' : '0'); }, [expanded]);
  useEffect(() => { localStorage.setItem('demus-player-mode', playerMode); }, [playerMode]);
  useEffect(() => { localStorage.setItem('demus-pip-floating', showFloatingPiP ? '1' : '0'); }, [showFloatingPiP]);

  const [isShuffled, setIsShuffled] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [smartQueueList, setSmartQueueList] = useState<Song[]>([]);
  const [offlineIsPlaying, setOfflineIsPlaying] = useState(false);
  const [offlineCurrentTime, setOfflineCurrentTime] = useState(0);
  const [offlineDuration, setOfflineDuration] = useState(0);
  const [albumQueue, setAlbumQueue] = useState<Song[] | null>(null);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { isDark, toggle: toggleTheme } = useTheme();
  const [colorTheme, setColorTheme] = useState(() => localStorage.getItem('demus-color') || 'default');
  const [ambientColors, setAmbientColors] = useState<{primary: string, secondary: string} | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [volume, setVolumeState] = useState(getVolume);
  const [savedSongs, setSavedSongs] = useState<Song[]>([]);
  const [savedSongIds, setSavedSongIds] = useState<Set<string>>(new Set());
  const [blobSavedSongIds, setBlobSavedSongIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [votedSongs, setVotedSongs] = useState<Set<string>>(() => new Set(getVotedSongs()));
  const [favoritesMetadata, setFavoritesMetadata] = useState<Song[]>(() => getFavoritesMetadata());
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>(() => getHistory());
  const [showAllDestaques, setShowAllDestaques] = useState(false);
  const [showAllListenAgain, setShowAllListenAgain] = useState(false);
  // Per-session seed so "Ouvir novamente" rotates on each new session/reload
  const listenAgainSeed = useRef<number>(Math.floor(Math.random() * 1_000_000));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => getPlaylists());
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);
  const [playlistModalMode, setPlaylistModalMode] = useState<"manage" | "add">("manage");
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [modalSong, setModalSong] = useState<Song | null>(null);
  const [appZoom, setAppZoom] = useState(() => parseFloat(localStorage.getItem('xerife-zoom') || '1'));
  const [miniPlayerVisible, setMiniPlayerVisible] = useState(true);
  const mobileFooterRef = useRef<HTMLDivElement | null>(null);

  // Publish the mobile footer (mini player + bottom nav) height as a CSS
  // variable so overlays (album detail, etc.) can pad their scroll area
  // exactly right on any device height + safe-area combination.
  useEffect(() => {
    const el = mobileFooterRef.current;
    const root = document.documentElement;
    const apply = () => {
      const h = el?.getBoundingClientRect().height ?? 0;
      root.style.setProperty("--mobile-footer-h", `${Math.ceil(h)}px`);
    };
    apply();
    if (!el) return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  });
  
  const [reducedMotionActive, setReducedMotionActive] = useState(() => localStorage.getItem('demus-reduced-motion') === 'true');
  useReducedMotionTest(reducedMotionActive);

  const { user: localUser, login: localLogin, logout: localLogout, updateName } = useLocalProfile();
  const [isSyncing] = useState(false);
  const suggestTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const deviceId = useRef(getDeviceId());
  const offlineShouldBePlayingRef = useRef(false);
  const offlineUserPausedRef = useRef(false);
  const offlineBgIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const offlineHiddenSinceRef = useRef<number | null>(null);
  const isIOSRef = useRef(/iphone|ipad|ipod/i.test(navigator.userAgent));

  const [songs, setSongs] = useState<Song[]>(() => {
    const savedVotes = getQueueState();
    return mockSongs.map((s) => ({ ...s, votes: savedVotes[s.id] ?? s.votes }));
  });

  const { state: playerState, loadVideo, loadVideoAt, preloadClip, play, pause, seekTo, setVolume: setPlayerVolume, togglePiP, requestAirPlay, requestFullscreen, exitFullscreen, setPlaybackRate, toggleCaptions, proxyAudioElement, getCurrentTime: getPlayerCurrentTime } = useYouTubePlayer("yt-player");

  // Desktop: sync the fixed YouTube player with the NowPlayingView scroll so
  // the video "sobe" enquanto o usuário rola para ver comentários/relacionados,
  // e volta a aparecer quando ele rola de volta ao topo. Não mexe em mobile,
  // fullscreen ou modo áudio (mantém posição original).
  useEffect(() => {
    if (!expanded || playerMode !== "video") return;
    if (typeof window === "undefined") return;
    // Skip when in music-video mode: positioning já é feito via getBoundingClientRect
    // do #music-video-anchor (efeito abaixo), então não aplicamos transform.
    const isMusicVideoMode = homeMode !== "video";
    if (isMusicVideoMode) return;
    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return;

    const container = document.getElementById("yt-fullscreen-container");
    if (!container) return;

    let scroller: HTMLElement | null = null;
    let raf = 0;

    const apply = () => {
      raf = 0;
      if (!scroller || !container) return;
      if (playerState.isFullscreen) {
        container.style.transform = "";
        return;
      }
      const y = Math.max(0, scroller.scrollTop);
      container.style.transform = `translate3d(0, ${-y}px, 0)`;
      container.style.willChange = "transform";
    };


    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    const attach = () => {
      const el = document.querySelector<HTMLElement>(".now-playing-scroll");
      if (el && el !== scroller) {
        if (scroller) scroller.removeEventListener("scroll", onScroll);
        scroller = el;
        scroller.addEventListener("scroll", onScroll, { passive: true });
        apply();
      }
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (scroller) scroller.removeEventListener("scroll", onScroll);
      if (container) {
        container.style.transform = "";
        container.style.willChange = "";
      }
    };
  }, [expanded, playerMode, playerState.isFullscreen, activeTab, podcastMode, homeMode]);

  // Xerife Music: modo Vídeo deve substituir a área da capa. Medimos o
  // retângulo de #music-video-anchor (dentro do NowPlayingView) e aplicamos
  // como left/top/width/height ao container fixo do player, para que o vídeo
  // fique centralizado sobre a capa em 1024px, 1440px e mobile — mantendo
  // 16:9 sem ultrapassar os limites laterais.
  const [musicVideoRect, setMusicVideoRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const active = expanded && playerMode === "video" && homeMode !== "video";
    if (!active) { setMusicVideoRect(null); return; }

    let raf = 0;
    let raf2 = 0;
    let stopped = false;
    const measure = () => {
      raf = 0;
      if (stopped) return;
      const anchor = document.getElementById("music-video-anchor");
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      // Clamp to viewport to guarantee o iframe nunca ultrapasse limites laterais
      // (portrait/landscape/resize com scrollbar aparecendo).
      const vw = (window.visualViewport?.width ?? window.innerWidth) || r.width;
      const pad = 12;
      const maxW = Math.max(0, vw - pad * 2);
      const width = Math.min(r.width, maxW);
      const height = width * (r.height / r.width);
      const left = Math.max(pad, Math.min(r.left, vw - pad - width));
      const top = r.top;
      setMusicVideoRect((prev) => {
        if (prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) return prev;
        return { left, top, width, height };
      });
    };
    // Double rAF: aguardar o layout do NowPlayingView estabilizar após
    // orientationchange antes de reposicionar, evitando flicker.
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(measure);
      });
    };
    schedule();

    const ro = new ResizeObserver(schedule);
    const observeAnchor = () => {
      const anchor = document.getElementById("music-video-anchor");
      if (anchor) ro.observe(anchor);
    };
    observeAnchor();
    // Também observar o body para pegar mudanças de safe-area/URL bar em mobile.
    ro.observe(document.body);
    const mo = new MutationObserver(() => { observeAnchor(); schedule(); });
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    const scroller = document.querySelector<HTMLElement>(".now-playing-scroll");
    scroller?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (raf2) cancelAnimationFrame(raf2);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule, { capture: true } as any);
      scroller?.removeEventListener("scroll", schedule);
    };
  }, [expanded, playerMode, podcastMode, homeMode, currentSong?.id]);




  // PiP status: gives the button visible feedback + guides the fallback flow.
  //  - off:    PiP not active
  //  - armed:  requested (esp. iOS) — waiting for OS to switch when app backgrounds
  //  - active: floating window is currently rendering
  //  - denied: request was refused/unsupported this session
  type PipStatus = "off" | "armed" | "active" | "denied";
  const [pipStatus, setPipStatus] = useState<PipStatus>("off");
  const [pipDiagnosticsOpen, setPipDiagnosticsOpen] = useState(false);
  const pipArmedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chromecast / AirPlay status — drives icon color + toast feedback.
  const [castStatus, setCastStatus] = useState<"unavailable" | "available" | "connecting" | "connected" | "error">("unavailable");
  const [castDevice, setCastDevice] = useState<string | undefined>();
  useEffect(() => {
    let unsub: (() => void) | undefined;
    import("@/lib/castService").then(({ subscribeCastStatus, loadCastSdk, isCastSupported }) => {
      if (isCastSupported()) loadCastSdk();
      unsub = subscribeCastStatus((status, device) => {
        setCastStatus(status);
        setCastDevice(device);
      });
    });
    return () => { unsub?.(); };
  }, []);

  // Helper: current video context for telemetry
  const pipMeta = () => ({
    videoId: currentSong?.youtubeId,
    isLive: (currentSong as any)?.isLive === true || (currentSong as any)?.duration === 0,
  });

  // Track native PiP lifecycle (Safari desktop/iOS, Chrome, Document PiP).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onEnter = () => {
      setPipStatus("active");
      trackPip("active", pipMeta());
      if (pipArmedTimerRef.current) clearTimeout(pipArmedTimerRef.current);
    };
    const onLeave = () => {
      setPipStatus((s) => (s === "active" || s === "armed" ? "off" : s));
      trackPip("leave", pipMeta());
    };
    const onWebkitPresentation = (e: Event) => {
      const v = e.target as any;
      if (v && typeof v.webkitPresentationMode === "string") {
        if (v.webkitPresentationMode === "picture-in-picture") {
          setPipStatus("active");
          trackPip("active", { ...pipMeta(), reason: "webkit-presentation" });
        } else if (pipStatus === "active") {
          setPipStatus("off");
          trackPip("leave", { ...pipMeta(), reason: "webkit-presentation" });
        }
      }
    };
    document.addEventListener("enterpictureinpicture", onEnter, true);
    document.addEventListener("leavepictureinpicture", onLeave, true);
    document.addEventListener("webkitpresentationmodechanged", onWebkitPresentation, true);
    const docPiP = (window as any).documentPictureInPicture;
    const onDocPipEnter = (ev: any) => {
      setPipStatus("active");
      trackPip("active", { ...pipMeta(), reason: "document-pip" });
      ev.window?.addEventListener?.("pagehide", () => {
        setPipStatus("off");
        trackPip("leave", { ...pipMeta(), reason: "document-pip-close" });
      }, { once: true });
    };
    docPiP?.addEventListener?.("enter", onDocPipEnter);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && pipStatus === "armed") {
        setPipStatus("off");
        trackPip("denied", { ...pipMeta(), reason: "returned-without-pip" });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("enterpictureinpicture", onEnter, true);
      document.removeEventListener("leavepictureinpicture", onLeave, true);
      document.removeEventListener("webkitpresentationmodechanged", onWebkitPresentation, true);
      docPiP?.removeEventListener?.("enter", onDocPipEnter);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipStatus, currentSong]);

  // Unified PiP handler with telemetry
  const handleTogglePiP = async () => {
    prePipExpandedRef.current = expanded;
    try { sessionStorage.setItem('demus-prepip-expanded', expanded ? '1' : '0'); } catch {}

    if (pipStatus === "active") {
      trackPip("close-tap", pipMeta());
      try { await togglePiP(); } catch {}
      setPipStatus("off");
      return;
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;

    trackPip("request", pipMeta());
    const result = await togglePiP();

    if (result === "native") {
      setPipStatus("active");
      trackPip("enter-native", pipMeta());
      return;
    }

    if (result === "fallback") {
      if (isMobile) {
        try {
          await requestFullscreen();
          setPipStatus("armed");
          trackPip("enter-armed", { ...pipMeta(), reason: isIOS ? "ios-fullscreen" : "android-fullscreen" });
          if (pipArmedTimerRef.current) clearTimeout(pipArmedTimerRef.current);
          pipArmedTimerRef.current = setTimeout(() => {
            setPipStatus((s) => {
              if (s === "armed") {
                trackPip("timeout", { ...pipMeta(), reason: "30s-no-os-pip" });
                return "off";
              }
              return s;
            });
          }, 30_000);
          toast.info(isIOS ? "PiP armado — saia do app" : "Ative o PiP nativo", {
            description: isIOS
              ? "iOS abrirá o vídeo em janela flutuante ao voltar à tela inicial. Se recusado, use o ícone PiP dentro do player."
              : "Toque no ícone Picture-in-Picture do player para destacar o vídeo.",
            duration: 6000,
          });
        } catch (err) {
          setShowFloatingPiP(true);
          setPipStatus("active");
          trackPip("enter-fallback", { ...pipMeta(), reason: "fullscreen-failed" });
          toast.info("Mini player flutuante ativo", { description: "O vídeo continuará dentro do app." });
        }
      } else {
        setShowFloatingPiP(true);
        setPipStatus("active");
        trackPip("enter-fallback", { ...pipMeta(), reason: "desktop-no-native" });
        toast.info("PiP nativo indisponível", { description: "Mostrando mini player flutuante." });
      }
    } else if (result === "failed") {
      setPipStatus("denied");
      trackPip("denied", { ...pipMeta(), reason: "toggle-failed" });
      toast.error("Picture-in-Picture recusado", {
        description: "Seu navegador ou app negou o pedido. Tente iniciar a reprodução antes.",
      });
      setTimeout(() => setPipStatus((s) => (s === "denied" ? "off" : s)), 4000);
    }
  };

  // Restore panel state when native PiP window closes or app comes back from home screen
  useEffect(() => {
    const onLeavePip = () => {
      const prev = sessionStorage.getItem('demus-prepip-expanded');
      if (prev === '1') setExpanded(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        const prev = sessionStorage.getItem('demus-prepip-expanded');
        if (prev === '1' && !expanded) setExpanded(true);
      }
    };
    document.addEventListener('leavepictureinpicture', onLeavePip);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('leavepictureinpicture', onLeavePip);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fullscreen video + app backgrounded → converte para janela flutuante (PiP interno).
  // IMPORTANTE: NÃO pausamos nem paramos a reprodução aqui — apenas trocamos o
  // container visual. O YouTube/vídeo continua tocando; o FloatingPiPPlayer
  // apenas dá controles quando o usuário voltar ao app.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (playerMode !== 'video') return;
      if (!playerState.isFullscreen && !expanded) return;
      // Sai do fullscreen sem tocar em play/pause
      try { exitFullscreen(); } catch {}
      setExpanded(false);
      setShowFloatingPiP(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [playerMode, playerState.isFullscreen, expanded, exitFullscreen]);






  const isPlayingOffline = blobSavedSongIds.has(currentSong.id);
  const ct = isPlayingOffline ? offlineCurrentTime : (playerState.currentTime || 0);
  const dur = isPlayingOffline ? (offlineDuration || currentSong.duration) : (playerState.duration || currentSong.duration);
  const isPlaying = isPlayingOffline ? offlineIsPlaying : playerState.isPlaying;

  // Keep video overlay controls visible while paused (or before playback starts):
  // users need to see play/seek/time when the video isn't actively playing.
  useEffect(() => {
    const shouldKeepOpen = expanded && playerMode === "video" && !isPlaying;
    videoOverlayKeepOpenRef.current = shouldKeepOpen;
    if (shouldKeepOpen) {
      setShowVideoOverlayControls(true);
      if (videoOverlayTimerRef.current) {
        clearTimeout(videoOverlayTimerRef.current);
        videoOverlayTimerRef.current = null;
      }
    } else if (expanded && playerMode === "video") {
      // Playback resumed — restart auto-hide countdown
      revealVideoOverlay();
    }
  }, [isPlaying, expanded, playerMode, revealVideoOverlay]);
  const { trendingSongs, isLoading: trendingLoading } = useTrendingMusic();
  useNativeCapabilities(isPlaying);
  



  useEffect(() => {
    // Proportional UI scaling: change root font-size so every rem-based
    // token (Tailwind spacing, font sizes, icons, gaps) scales together.
    // 16px is the browser default base; multiplying it by appZoom
    // rescales the whole interface without breaking layout like CSS `zoom` does.
    const clamped = Math.min(2, Math.max(0.5, appZoom));
    document.documentElement.style.fontSize = `${16 * clamped}px`;
    // Respect user's OS-level text-size-adjust preference (mobile Safari/Chrome).
    (document.documentElement.style as any).webkitTextSizeAdjust = '100%';
    (document.documentElement.style as any).textSizeAdjust = '100%';
    localStorage.setItem('xerife-zoom', String(clamped));
    return () => {
      // no-op: keep font-size applied across route changes
    };
  }, [appZoom]);

  // Sync reduced motion state for testing and components
  useEffect(() => {
    const handleStorage = () => {
      setReducedMotionActive(localStorage.getItem('demus-reduced-motion') === 'true');
    };
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 1000);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);


  // Save podcast episode progress periodically
  useEffect(() => {
    if (!currentSong?.id?.startsWith("yt-") || !isPlaying || activeTab !== "podcast") return;
    const interval = setInterval(() => {
      if (ct > 5 && dur > 0) {
        saveEpisodeProgress({
          episodeId: currentSong.id,
          title: currentSong.title,
          channel: currentSong.artist,
          thumbnail: currentSong.cover,
          duration: dur,
          currentTime: ct,
          lastPlayedAt: Date.now(),
          ...(ct / dur > 0.95 ? { completedAt: Date.now() } : {}),
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [currentSong, isPlaying, ct, dur, activeTab]);

  // Restore last played track (full metadata) on mount so we resume where we left off
  const resumeTimeRef = useRef<number>(0);
  const didResumeSeekRef = useRef<boolean>(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('demus-last-track');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.song?.id && parsed?.song?.youtubeId) {
          setCurrentSong(parsed.song as Song);
          resumeTimeRef.current = Number(parsed.currentTime) || 0;
          // Restore the correct player surface for videos so the video player mounts
          if (parsed.song.type === "video" || String(parsed.song.id).startsWith("yt-")) {
            setPlayerMode("video");
          }
        }
      }
    } catch {}

    const savedId = getCurrentSongId();
    if (savedId) {
      // Prioritize podcast progress if we were on the podcast tab
      const isPodcastTab = localStorage.getItem("demus_active_tab") === "podcast";
      const podcastProgress = isPodcastTab ? getAllInProgressEpisodes()[0] : null;

      if (podcastProgress) {
        const song: Song = {
          id: podcastProgress.episodeId,
          youtubeId: podcastProgress.episodeId.replace("yt-", ""),
          title: podcastProgress.title,
          artist: podcastProgress.channel,
          album: podcastProgress.channel,
          cover: podcastProgress.thumbnail,
          duration: podcastProgress.duration,
          votes: 0,
          isDownloaded: false,
          type: "music",
        };
        setCurrentSong(song);
        if (isPodcastTab) setActiveTab("podcast");
      } else {
        const found = mockSongs.find((s) => s.id === savedId);
        if (found) setCurrentSong(found);
      }
    }
  }, []);

  // Persist current track + playback position (throttled to 3s while playing)
  useEffect(() => {
    if (!currentSong?.id) return;
    const payload = JSON.stringify({
      song: currentSong,
      currentTime: ct || 0,
      duration: dur || 0,
      savedAt: Date.now(),
    });
    try { localStorage.setItem('demus-last-track', payload); } catch {}
  }, [currentSong.id, Math.floor((ct || 0) / 3)]);

  // Immediate flush of resume state on pause / end so a fast reload doesn't lose position
  useEffect(() => {
    if (!currentSong?.id) return;
    if (playerState.isPlaying) return; // handled by throttled effect above
    try {
      const payload = JSON.stringify({
        song: currentSong,
        currentTime: ct || 0,
        duration: dur || 0,
        savedAt: Date.now(),
      });
      localStorage.setItem('demus-last-track', payload);
    } catch {}
  }, [playerState.isPlaying, playerState.isEnded, currentSong.id]);

  // Auto-seek to the resume position once the player is ready for the restored track
  useEffect(() => {
    if (didResumeSeekRef.current) return;
    if (!playerState.isReady) return;
    if (!playerState.videoId || playerState.videoId !== currentSong.youtubeId) return;
    const t = resumeTimeRef.current;
    if (t > 3 && (playerState.duration ? t < playerState.duration - 5 : true)) {
      seekTo(t);
    }
    didResumeSeekRef.current = true;
  }, [playerState.isReady, playerState.videoId, playerState.duration, currentSong.youtubeId, seekTo]);


  // Save active tab
  useEffect(() => {
    localStorage.setItem("demus_active_tab", activeTab);
  }, [activeTab]);

  // Handle resuming podcast progress when a podcast starts playing
  useEffect(() => {
    if (currentSong?.id?.startsWith("yt-") && activeTab === "podcast" && playerState.isReady && !playerState.isPlaying && playerState.currentTime === 0) {
      const progress = getEpisodeProgress(currentSong.id);
      if (progress && progress.currentTime > 5 && progress.currentTime < progress.duration - 10) {
        console.log(`[Podcast] Resuming from ${progress.currentTime}s`);
        seekTo(progress.currentTime);
      }
    }
  }, [currentSong.id, activeTab, playerState.isReady]);

  useEffect(() => {
    getAllSavedSongs().then((saved) => {
      const converted = saved.map(s => ({
        ...s, votes: 0, isDownloaded: true
      }));
      setSavedSongs(converted);
      const ids = new Set(saved.map((s) => s.id));
      setSavedSongIds(ids);
      
      // Track songs that actually have blobs
      const blobIds = new Set(saved.filter(s => s.blob).map(s => s.id));
      setBlobSavedSongIds(blobIds);
      
      setSongs((prev) => prev.map((s) => ({ ...s, isDownloaded: ids.has(s.id) })));
    });
  }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const handleLogin = async () => {
    // Auth disabled as requested
  };

  const handleLogout = async () => {
    // Auth disabled as requested
  };

  useEffect(() => { setPlayerVolume(volume); saveVolume(volume); }, [volume, setPlayerVolume]);

  useEffect(() => {
    const votes: Record<string, number> = {};
    songs.forEach((s) => { votes[s.id] = s.votes; });
    saveQueueState(votes);
  }, [songs]);

  // Ambient Lighting: Update colors based on album art with debounce to avoid flicker
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    
    if (colorTheme === 'ambient' && currentSong?.cover) {
      timeout = setTimeout(() => {
        import('@/lib/ambientTheme').then(({ extractThemeFromImage, applyAmbientTheme }) => {
          extractThemeFromImage(currentSong.cover).then(theme => {
            applyAmbientTheme(theme);
            setAmbientColors({ primary: theme.primary, secondary: theme.secondary });
          });
        });
      }, 300); // Debounce to avoid flicker during rapid track changes
    } else {
      setAmbientColors(null);
      const root = document.documentElement;
      root.style.removeProperty('--ambient-primary');
      root.style.removeProperty('--ambient-secondary');
      root.style.removeProperty('--ambient-accent');
      root.style.removeProperty('--ambient-bg');
    }
    
    return () => clearTimeout(timeout);
  }, [currentSong.id, colorTheme]);


  // Pre-fetch related queue when a song starts playing in music mode
  useEffect(() => {
    if (homeMode === "music" && currentSong.youtubeId && currentSong.type !== "video") {
      fetchRelatedQueue(currentSong).then((q) => setSmartQueueList(q)).catch(() => {});
    }
  }, [currentSong.id, homeMode]);

  // Pre-fetch related VIDEO queue when a video starts playing
  useEffect(() => {
    if (currentSong.type === "video" && currentSong.youtubeId) {
      fetchRelatedVideoQueue(currentSong).catch(() => {});
    }
  }, [currentSong.id]);

  useEffect(() => {
    if (!playerState.isEnded) return;
    (async () => {
      // 1) If playing from an album, advance to the next track of that album
      if (albumQueue && albumQueue.length > 0) {
        const idx = albumQueue.findIndex((s) => s.youtubeId === currentSong.youtubeId);
        if (idx >= 0 && idx < albumQueue.length - 1) {
          handleSelect(albumQueue[idx + 1]);
          return;
        }
        setAlbumQueue(null);
      }
      // 2a) Video mode: use smart video queue (same channel / related topic)
      if (currentSong.type === "video") {
        let next = popNextVideoFromQueue();
        if (!next) {
          try {
            const q = await fetchRelatedVideoQueue(currentSong);
            if (q.length > 0) next = popNextVideoFromQueue();
          } catch {}
        }
        if (next) {
          handleSelect(next);
          return;
        }
      }
      // 2b) Music mode: use smart queue (similar artist/genre)
      if (homeMode === "music" && currentSong.type !== "video") {
        let next = popNextFromQueue();
        if (!next) {
          try {
            const q = await fetchRelatedQueue(currentSong);
            if (q.length > 0) next = popNextFromQueue();
          } catch {}
        }
        if (next) {
          handleSelect(next);
          return;
        }
      }
      // 3) Fallback: cycle through local songs
      const sorted = sortByVotes(songs);
      const idx = sorted.findIndex((s) => s.id === currentSong.id);
      const next = sorted[(idx + 1) % sorted.length];
      setCurrentSong(next);
      saveCurrentSong(next.id);
      loadVideo(next.youtubeId);
    })();
  }, [playerState.isEnded]);

  // Refresh personalized recommendations immediately on playback lifecycle changes
  // (start, pause, end) and when history is updated from anywhere in the app.
  useEffect(() => {
    setRecentHistory(getHistory());
  }, [playerState.isPlaying, playerState.isEnded, playerState.videoId]);

  useEffect(() => {
    const bump = () => setRecentHistory(getHistory());
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === "demus_history") bump(); };
    window.addEventListener("demus:history-updated", bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("demus:history-updated", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);


  const handleSelect = useCallback((song: Song) => {
    setCurrentSong(song);
    saveCurrentSong(song.id);
    offlineShouldBePlayingRef.current = false;
    offlineUserPausedRef.current = false;
    setOfflineIsPlaying(false);
    setOfflineCurrentTime(0);
    setOfflineDuration(0);
    addToHistory({
      songId: song.id, youtubeId: song.youtubeId, title: song.title,
      artist: song.artist, album: song.album, cover: song.cover,      duration: song.duration,
      type: song.type
    });
    setRecentHistory(getHistory());
    setMiniPlayerVisible(true); // Reexibe o mini player ao trocar de música
    
    // Se NÃO for um vídeo explícito (Xerife Videos), força modo áudio.
    // IMPORTANTE: músicas vindas do YouTube têm id `yt-<videoId>` mas NÃO são
    // vídeo — são faixas de áudio (Xerife Music). Só entradas com
    // `type === "video"` (criadas em VideoHomeScreen / ChannelProfile /
    // RelatedVideos) devem manter o modo "video". Caso contrário o lock
    // screen / Dynamic Island mostraria ±10s no lugar de ⏮ ⏭.
    if (song.type !== 'video') {
      setPlayerMode('audio');
    }
    
    // Offline playback check
    const offlineVideo = document.getElementById("offline-player") as HTMLVideoElement | null;
    if (offlineVideo) {
      offlineVideo.pause();
      offlineVideo.src = "";
    }

    getSong(song.id).then((stored) => {
      if (stored?.blob) {
        const url = URL.createObjectURL(stored.blob);
        if (offlineVideo) {
          offlineUserPausedRef.current = false;
          offlineShouldBePlayingRef.current = true;
          offlineVideo.src = url;
          offlineVideo.currentTime = 0;
          offlineVideo.play().catch(() => {});
          pause(); // Stop YouTube
        }
      } else {
        offlineShouldBePlayingRef.current = false;
        loadVideo(song.youtubeId);
      }
    });

    // Refresh queue list from localStorage
    try {
      const raw = localStorage.getItem("demus_smart_queue");
      if (raw) {
        const parsed = JSON.parse(raw);
        setSmartQueueList(parsed.songs || []);
      }
    } catch {}
  }, [loadVideo]);

  const handleTogglePlay = useCallback(() => {
    const offlineVideo = document.getElementById("offline-player") as HTMLVideoElement | null;
    const isPlayingOffline = blobSavedSongIds.has(currentSong.id);

    if (isPlayingOffline && offlineVideo) {
      if (offlineVideo.paused) {
        offlineUserPausedRef.current = false;
        offlineShouldBePlayingRef.current = true;
        offlineVideo.play().catch(() => {});
      } else {
        offlineUserPausedRef.current = true;
        offlineShouldBePlayingRef.current = false;
        offlineVideo.pause();
      }
      return;
    }

    if (playerState.isPlaying) { pause(); }
    else if (!playerState.videoId) { loadVideo(currentSong.youtubeId); }
    else { play(); }
  }, [playerState, pause, play, loadVideo, currentSong, blobSavedSongIds]);

  const handleNext = useCallback(async () => {
    // If playing from album, go to next album track
    if (albumQueue && albumQueue.length > 0) {
      const idx = albumQueue.findIndex((s) => s.youtubeId === currentSong.youtubeId);
      if (idx >= 0 && idx < albumQueue.length - 1) {
        handleSelect(albumQueue[idx + 1]);
        return;
      }
      // Album ended, clear and fall through
      setAlbumQueue(null);
    }
    // Video: use smart video queue
    if (currentSong.type === "video") {
      let next = popNextVideoFromQueue();
      if (!next) {
        const queue = await fetchRelatedVideoQueue(currentSong);
        if (queue.length > 0) next = popNextVideoFromQueue();
      }
      if (next) {
        handleSelect(next);
        return;
      }
    } else if (playerMode === "video" && homeMode === "music") {
      // Faixa musical exibida em modo vídeo: comportamento especial pedido pelo usuário.
      //  - Shuffle OFF → segue a ordem do álbum/artista.
      //  - Shuffle ON  → próxima referente ao histórico de escuta.
      if (isShuffled) {
        const historyQueue = await fetchHistoryBasedQueue(currentSong);
        if (historyQueue.length > 0) {
          handleSelect(historyQueue[0]);
          return;
        }
      } else {
        const albumList = await fetchArtistAlbumQueue(currentSong);
        if (albumList.length > 0) {
          const idx = albumList.findIndex((s) => s.youtubeId === currentSong.youtubeId);
          const nextTrack = idx >= 0 && idx < albumList.length - 1
            ? albumList[idx + 1]
            : albumList.find((s) => s.youtubeId !== currentSong.youtubeId);
          if (nextTrack) {
            setAlbumQueue(albumList);
            handleSelect(nextTrack);
            return;
          }
        }
      }
      // Fallback para a smart queue padrão de música se nada acima resolveu.
      const next = popNextFromQueue();
      if (next) { handleSelect(next); return; }
      const queue = await fetchRelatedQueue(currentSong);
      if (queue.length > 0) {
        const nextSong = popNextFromQueue();
        if (nextSong) { handleSelect(nextSong); return; }
      }
    } else if (homeMode === "music") {
      // Try smart queue first
      const next = popNextFromQueue();
      if (next) {
        handleSelect(next);
        return;
      }
      // If queue is empty, fetch and pop
      const queue = await fetchRelatedQueue(currentSong);
      if (queue.length > 0) {
        const nextSong = popNextFromQueue();
        if (nextSong) {
          handleSelect(nextSong);
          return;
        }
      }
    }
    // Fallback: cycle local songs
    const sorted = sortByVotes(songs);
    const idx = sorted.findIndex((s) => s.id === currentSong.id);
    handleSelect(sorted[(idx + 1) % sorted.length]);
  }, [currentSong, songs, handleSelect, homeMode, albumQueue, playerMode, isShuffled]);

  const handlePrev = useCallback(() => {
    // Double-click (within 500ms) => go to previous track.
    // Single click => restart current track from the beginning.
    const now = Date.now();
    const last = prevClickRef.current;
    prevClickRef.current = now;
    if (!last || now - last > 500) {
      handleSeekAbsolute(0);
      return;
    }
    // Reset so a 3rd click restarts again
    prevClickRef.current = 0;
    // If playing from album, go to previous album track
    if (albumQueue && albumQueue.length > 0) {
      const idx = albumQueue.findIndex((s) => s.youtubeId === currentSong.youtubeId);
      if (idx > 0) {
        handleSelect(albumQueue[idx - 1]);
        return;
      }
    }
    // Go back through history
    const history = getHistory();
    const currentIdx = history.findIndex((h) => h.youtubeId === currentSong.youtubeId);
    if (currentIdx > 0) {
      const prev = history[currentIdx - 1];
      const song: Song = {
        id: prev.songId,
        youtubeId: prev.youtubeId,
        title: prev.title,
        artist: prev.artist,
        album: prev.album,
        cover: prev.cover,
        duration: prev.duration,
        votes: 0,
        isDownloaded: false,
      };
      handleSelect(song);
      return;
    }
    // Fallback
    const sorted = sortByVotes(songs);
    const idx = sorted.findIndex((s) => s.id === currentSong.id);
    handleSelect(sorted[(idx - 1 + sorted.length) % sorted.length]);
  }, [currentSong, songs, handleSelect, albumQueue]);

  const handleShuffle = useCallback(() => {
    const shuffled = shuffleSmartQueue();
    setIsShuffled((prev) => !prev);
    if (!shuffled && !hasSmartQueue()) {
      // If no smart queue, shuffle local songs
      setSongs((prev) => [...prev].sort(() => Math.random() - 0.5));
    }
  }, []);

  const handleSeek = useCallback((fraction: number) => {
    const offlineVideo = document.getElementById("offline-player") as HTMLVideoElement | null;
    if (blobSavedSongIds.has(currentSong.id) && offlineVideo) {
      const nextTime = fraction * (offlineVideo.duration || currentSong.duration);
      setOfflineCurrentTime(nextTime);
      offlineVideo.currentTime = nextTime;
      return;
    }
    seekTo(fraction * (playerState.duration || currentSong.duration));
  }, [seekTo, playerState.duration, currentSong.duration, currentSong.id, blobSavedSongIds]);

  const handlePlayFromQueue = useCallback((song: Song, index: number) => {
    // Pop items up to and including the selected index
    for (let i = 0; i <= index; i++) popNextFromQueue();
    handleSelect(song);
  }, [handleSelect]);

  const handleRemoveFromQueue = useCallback((index: number) => {
    try {
      const raw = localStorage.getItem("demus_smart_queue");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.songs.splice(index, 1);
        localStorage.setItem("demus_smart_queue", JSON.stringify(parsed));
        setSmartQueueList([...parsed.songs]);
      }
    } catch {}
  }, []);

  const handleClearQueue = useCallback(() => {
    clearSmartQueue();
    setSmartQueueList([]);
  }, []);

  const handleReorderQueue = useCallback((newQueue: Song[]) => {
    setSmartQueueList(newQueue);
    try {
      const raw = localStorage.getItem("demus_smart_queue");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.songs = newQueue;
        localStorage.setItem("demus_smart_queue", JSON.stringify(parsed));
      }
    } catch {}
  }, []);

  const handleSeekAbsolute = useCallback((seconds: number) => {
    const offlineVideo = document.getElementById("offline-player") as HTMLVideoElement | null;
    if (blobSavedSongIds.has(currentSong.id) && offlineVideo) {
      setOfflineCurrentTime(seconds);
      offlineVideo.currentTime = seconds;
      return;
    }
    seekTo(seconds);
  }, [seekTo, currentSong.id, blobSavedSongIds]);

  useEffect(() => {
    const clearOfflineHeartbeat = () => {
      if (offlineBgIntervalRef.current) {
        clearInterval(offlineBgIntervalRef.current);
        offlineBgIntervalRef.current = undefined;
      }
    };

    const syncOfflinePlayback = () => {
      const offlineVideo = document.getElementById("offline-player") as HTMLVideoElement | null;
      const shouldResume = isPlayingOffline && offlineShouldBePlayingRef.current && !offlineUserPausedRef.current;

      if (document.visibilityState === "hidden") {
        offlineHiddenSinceRef.current ??= Date.now();
      } else {
        offlineHiddenSinceRef.current = null;
      }

      if (!offlineVideo || !isPlayingOffline) {
        clearOfflineHeartbeat();
        return;
      }

      if (document.visibilityState === "hidden") {
        if (shouldResume) {
          offlineVideo.play().catch(() => {});
          if (!offlineBgIntervalRef.current) {
            offlineBgIntervalRef.current = setInterval(() => {
              const currentOffline = document.getElementById("offline-player") as HTMLVideoElement | null;
              if (currentOffline?.paused && offlineShouldBePlayingRef.current && !offlineUserPausedRef.current) {
                currentOffline.play().catch(() => {});
              }
              try { localStorage.setItem("__offline_bg_ts", Date.now().toString()); } catch {}
            }, 3000);
          }
        }
        return;
      }

      clearOfflineHeartbeat();
      if (shouldResume && offlineVideo.paused) {
        offlineVideo.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", syncOfflinePlayback);
    window.addEventListener("focus", syncOfflinePlayback);
    window.addEventListener("pageshow", syncOfflinePlayback);
    window.addEventListener("pagehide", syncOfflinePlayback);

    return () => {
      document.removeEventListener("visibilitychange", syncOfflinePlayback);
      window.removeEventListener("focus", syncOfflinePlayback);
      window.removeEventListener("pageshow", syncOfflinePlayback);
      window.removeEventListener("pagehide", syncOfflinePlayback);
      clearOfflineHeartbeat();
    };
  }, [isPlayingOffline]);

  const isOffline = false; // Legacy, replace with logic if needed

  // Derive current media type from song/player mode, and persist it so the
  // very first render after a reload registers the correct lock-screen buttons.
  // IMPORTANT: base the OS lock-screen control layout on the PLAYER MODE, not
  // on the song's source type. YouTube-backed music entries have
  // `type: "video"` because the underlying stream is a YouTube video, but the
  // user is listening in audio (music) mode and expects prev/next track
  // buttons — not ±10s seek buttons. Only true video playback (playerMode ===
  // "video") should expose the seekbackward/seekforward transport.
  const derivedMediaType: "music" | "video" =
    playerMode === "video" ? "video" : "music";
  const [mediaType, setMediaType] = useState<"music" | "video">(() => getMediaType());
  useEffect(() => {
    if (derivedMediaType !== mediaType) {
      setMediaType(derivedMediaType);
      saveMediaType(derivedMediaType);
    }
  }, [derivedMediaType, mediaType]);

  useMediaSession({
    song: currentSong, isPlaying: isPlaying,
    currentTime: ct,
    duration: dur,
    proxyAudioElement,
    mediaType,
    onPlay: () => {
      const v = document.getElementById("offline-player") as HTMLVideoElement | null;
      if (isPlayingOffline && v) {
        offlineUserPausedRef.current = false;
        offlineShouldBePlayingRef.current = true;
        setOfflineIsPlaying(true);
        v.play().catch(() => {});
      }
      else play();
    },
    onPause: () => {
      const v = document.getElementById("offline-player") as HTMLVideoElement | null;
      if (isPlayingOffline && v) {
        offlineUserPausedRef.current = true;
        offlineShouldBePlayingRef.current = false;
        setOfflineIsPlaying(false);
        v.pause();
      }
      else pause();
    }, 
    onNext: handleNext, onPrev: handlePrev, onSeek: handleSeekAbsolute,
  });

  const handleVote = useCallback((song: Song) => {
    if (votedSongs.has(song.id)) {
      // Un-favorite
      removeVotedSong(song.id);
      removeFavoriteMetadata(song.id);
      setVotedSongs((prev) => {
        const next = new Set(prev);
        next.delete(song.id);
        return next;
      });
      setFavoritesMetadata((prev) => prev.filter(f => f.id !== song.id));
      setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, votes: Math.max(0, s.votes - 1) } : s)));
    } else {
      // Favorite
      addVotedSong(song.id);
      saveFavoriteMetadata(song);
      setVotedSongs((prev) => new Set([...prev, song.id]));
      setFavoritesMetadata((prev) => [...prev, song]);
      setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, votes: s.votes + 1 } : s)));
    }
  }, [votedSongs]);

  const handleDownload = useCallback((song: Song) => {
    setModalSong(song);
    setShowDownloadModal(true);
  }, []);

  const handleShare = useCallback((song: Song) => {
    setModalSong(song);
    setShowShareModal(true);
  }, []);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (q.length >= 2) {
      if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
      suggestTimeoutRef.current = setTimeout(async () => {
        setSuggestions(await getSearchSuggestions(q));
      }, 500);

      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(async () => {
        setIsSearching(true);
        setSearchResults(await searchYouTubeMusic(q, searchFilter));
        setIsSearching(false);
      }, 1000);
    } else {
      setSuggestions([]);
      setSearchResults([]);
    }
  };

  const handleSuggestionClick = (term: string) => {
    setSearchQuery(term);
    setSuggestions([]);
    setIsSearching(true);
    searchYouTubeMusic(term, searchFilter).then((results) => {
      setSearchResults(results);
      setIsSearching(false);
    });
  };

  useEffect(() => {
    if (searchQuery.length >= 2) {
      setIsSearching(true);
      searchYouTubeMusic(searchQuery, searchFilter).then((results) => {
        setSearchResults(results);
        setIsSearching(false);
      });
    }
  }, [searchFilter]);

  const uniqueArtists = searchQuery.length >= 2
    ? [...new Set(searchResults.map((s) => s.artist).filter(a => a && a !== "Desconhecido"))]
    : [];
  const uniqueAlbums = searchQuery.length >= 2
    ? [...new Set(searchResults.map((s) => `${s.album}|||${s.artist}|||${s.cover}`).filter(a => !a.startsWith("|||")))]
    : [];

  const offlineSongs = savedSongs;
  const queueSongs = sortByVotes(songs);

  // Personalized pool: derive destaques/recomendados from user's listening history (localStorage).
  // Falls back to real YouTube trending, then to mock data.
  // Strict music-only filter: exclude podcasts, videos and any yt-prefixed ids,
  // even when historical entries were saved with inconsistent type metadata.
  const musicHistory = recentHistory.filter(h => {
    if (!h) return false;
    if (h.type === "podcast" || h.type === "video") return false;
    if (h.songId?.startsWith("yt-")) return false;
    // Broadened: keep any legit music entry — YouTube-music tracks (type:"music"),
    // mock catalog tracks (with album), or legacy entries that at least carry a
    // playable youtubeId. Prevents empty "Ouvir novamente" when history was
    // saved without a `type` field on older builds.
    if (h.type === "music") return true;
    if (!h.type && (!!h.album || !!h.youtubeId)) return true;
    return false;
  });

  // "Ouvir novamente": already-heard tracks, rotated per session so the
  // ordering varies between reloads while still coming from real history.
  const listenAgainSongs: Song[] = (() => {
    if (musicHistory.length === 0) return [];
    // Only keep entries that carry a playable youtubeId — otherwise the click
    // would land on `loadVideo("")` and appear broken to the user.
    const base = musicHistory
      .filter(e => !!e.youtubeId)
      .map(e => ({
        id: e.songId, youtubeId: e.youtubeId, title: e.title, artist: e.artist,
        album: e.album, cover: e.cover, duration: e.duration, votes: 0, isDownloaded: false,
      }));
    if (base.length === 0) return [];
    // Deterministic shuffle seeded by session so it's stable within a session
    // but rotates on next reload.
    const seed = listenAgainSeed.current;
    const arr = [...base];
    for (let i = arr.length - 1; i > 0; i--) {
      const x = Math.sin(seed + i) * 10000;
      const r = x - Math.floor(x);
      const j = Math.floor(r * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  })();

  const personalizedSongs = (() => {
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const h of musicHistory) {
      const key = h.youtubeId || h.songId;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: h.songId, youtubeId: h.youtubeId, title: h.title, artist: h.artist,
        album: h.album, cover: h.cover, duration: h.duration, votes: 0, isDownloaded: false,
      });
    }
    return out;
  })();

  // Artists the user has listened to — used to bias "related/suggestions"
  const heardArtistSet = new Set(
    personalizedSongs.map(s => (s.artist || "").trim().toLowerCase()).filter(Boolean)
  );
  const heardKeySet = new Set(
    personalizedSongs.map(s => s.youtubeId || s.id).filter(Boolean)
  );

  // Suggestions: tracks NOT already heard, prioritized by matching an artist from history.
  const suggestionsPool = (() => {
    const pool: Song[] = [...(trendingSongs.length > 0 ? trendingSongs : songs)];
    const notHeard = pool.filter(s => !heardKeySet.has(s.youtubeId || s.id));
    const related = notHeard.filter(s => heardArtistSet.has((s.artist || "").trim().toLowerCase()));
    const others = notHeard.filter(s => !heardArtistSet.has((s.artist || "").trim().toLowerCase()));
    const merged: Song[] = [];
    const seen = new Set<string>();
    for (const s of [...related, ...others]) {
      const k = s.youtubeId || s.id;
      if (!k || seen.has(k)) continue;
      seen.add(k);
      merged.push(s);
    }
    return merged;
  })();

  // Trending data: use real YouTube trending if available, fallback to mock
  const heroSong = personalizedSongs[0] || trendingSongs[0] || queueSongs[0];
  const quickPicks = suggestionsPool.length >= 6
    ? suggestionsPool.slice(0, 6)
    : [...suggestionsPool, ...(trendingSongs.length > 0 ? trendingSongs : songs)].slice(0, 6);
  const topCharts = trendingSongs.length > 0 ? trendingSongs.slice(0, 10) : queueSongs.slice(0, 5);

  // "Destaques" = recomendações personalizadas conforme o que o usuário ouve e busca.
  // Explicitamente exclui faixas do "Top 10" para não haver duplicação com a seção de trending abaixo.
  const topChartsKeys = new Set(topCharts.map(s => s.youtubeId || s.id).filter(Boolean) as string[]);
  const excludeForDestaques = new Set<string>([...topChartsKeys, ...heardKeySet]);
  const { songs: personalizedDestaques } = usePersonalizedDestaques(excludeForDestaques);

  // Fallback: se ainda não há histórico/buscas suficientes para gerar recomendações,
  // usa o pool de sugestões existente (também filtrado para não repetir o Top 10).
  const suggestionsFallback = suggestionsPool.filter(s => !topChartsKeys.has(s.youtubeId || s.id));
  const forYouSongs = personalizedDestaques.length > 0
    ? personalizedDestaques.slice(0, 15)
    : (suggestionsFallback.length > 0 ? suggestionsFallback.slice(0, 15) : songs.slice(0, 6));

  // "Recomendados para você" = feed de DESCOBERTA — múltiplos gêneros/estilos,
  // independente do histórico. Também exclui o Top 10 e o que já toca em Destaques
  // para evitar repetição visual na mesma tela.
  const destaquesKeys = new Set(
    forYouSongs.map(s => s.youtubeId || s.id).filter(Boolean) as string[]
  );
  const excludeForDiscover = new Set<string>([...topChartsKeys, ...destaquesKeys]);
  const { songs: discoverSongs } = useDiscoverRecommendations(excludeForDiscover);
  const recommendedForYou = discoverSongs.length > 0
    ? discoverSongs.slice(0, 20)
    : forYouSongs;

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Bom dia" : greetingHour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <MotionConfig reducedMotion="user">
      <>

      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      

      <div className={`flex bg-background overflow-hidden h-screen ${reducedMotionActive ? 'force-reduced-motion' : ''}`} style={{ height: '100dvh' }} data-theme={colorTheme}>
        {/* Desktop Sidebar */}
        <DesktopSidebar
          active={activeTab}
          onChange={handleNavChange}
          homeMode={homeMode}
          podcastMode={podcastMode}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          colorTheme={colorTheme}
          onColorChange={(id: string) => {
            document.documentElement.classList.remove('theme-red','theme-blue','theme-purple','theme-green','theme-orange','theme-pink','theme-default');
            if (id !== 'default') {
              document.documentElement.classList.add(`theme-${id}`);
            }
            localStorage.setItem('demus-color', id);
            setColorTheme(id);
          }}
          onHomeModeChange={setHomeMode}
          onCast={() => {
            // Priority 1: Use hook logic (handles AirPlay/Cast picker)
            requestAirPlay(homeMode === "video" ? "video" : "audio");
            
            // Priority 2: Force prompt on any available video element (backup)
            const video = document.querySelector('video');
            if (video && 'remote' in video) {
              (video as any).remote.prompt().catch(() => {});
            }
          }}
          onOpenHistory={() => setActiveTab("history")}
          onOpenPlaylists={() => setActiveTab("playlists")}
          onOpenDownloads={() => setActiveTab("offline")}
          onZoomChange={setAppZoom}
          onLogin={localLogin}
          onLogout={localLogout}
          user={localUser}
          isLoadingUser={false}
          currentZoom={appZoom}
          onUpdateName={updateName}
        />

        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0">
        {/* YouTube Player + Fullscreen Container */}
        {(() => {
          const isRailMode = expanded && playerMode === "video" && homeMode === "video";
          const isMusicVideoMode = expanded && playerMode === "video" && homeMode !== "video";
          return (
        <div
          id="yt-fullscreen-container"
          className={
            playerState.isFullscreen
              ? "fixed inset-0 z-[10000] bg-black"
              : isRailMode
                ? "fixed left-0 right-0 md:left-4 md:right-[calc(var(--xerife-video-rail)+32px)] z-[60] top-[env(safe-area-inset-top)] md:top-[90px] bg-black"
                : isMusicVideoMode
                  ? (musicVideoRect
                      ? "fixed z-[60] bg-black rounded-2xl overflow-hidden ring-1 ring-border/60 dark:ring-white/10 transition-[left,top,width,height] duration-200 ease-out"
                      : "fixed left-1/2 -translate-x-1/2 z-[60] top-[calc(env(safe-area-inset-top)+56px)] md:top-[112px] bg-black rounded-2xl overflow-hidden ring-1 ring-border/60 dark:ring-white/10")
                  : "absolute -top-[9999px] -left-[9999px]"
          }
          style={
            playerState.isFullscreen
              ? { width: '100vw', height: '100vh' }
              : isRailMode
                ? { height: 'var(--xerife-video-h)' }
                : isMusicVideoMode
                  ? (musicVideoRect
                      ? { left: `${musicVideoRect.left}px`, top: `${musicVideoRect.top}px`, width: `${musicVideoRect.width}px`, height: `${musicVideoRect.height}px` }
                      : { width: 'min(calc(100vw - 24px), 520px)', aspectRatio: '16 / 9' })
                  : {}
          }
        >

          <div id="yt-player" className="w-full h-full rounded-xl overflow-hidden relative z-0" />
          {expanded && playerMode === "video" && <QualityBadge />}
          {/* Audio-only mask: hides the video image while keeping YT audio playing.
              Toggled via the Headphones pill in VideoInfoBar. Video resumes visually from the same spot. */}
          {expanded && playerMode === "video" && !isPlayingOffline && videoAudioOnly && (
            <div className="absolute inset-0 z-[205] bg-black md:rounded-xl flex flex-col items-center justify-center gap-3 pointer-events-none select-none">
              <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center text-primary">
                <Music size={28} />
              </div>
              <div className="text-white/90 text-sm font-semibold tracking-wide">Reproduzindo apenas o áudio</div>
              <div className="text-white/50 text-[11px] uppercase tracking-[0.2em]">Toque em "Só áudio" novamente para voltar ao vídeo</div>
            </div>
          )}
          {/* Overlay controls on top of the actual YouTube player */}
          {expanded && playerMode === "video" && !isPlayingOffline && !playerState.isFullscreen && (
            <>
              {/* Full-inset tap catcher: ALWAYS active so clicks never reach the YouTube iframe.
                  Tapping the background only toggles the visibility of our custom controls —
                  it never plays/pauses the video. Play/pause happens exclusively via the center button. */}
              <button
                type="button"
                aria-label={showVideoOverlayControls ? "Ocultar controles" : "Mostrar controles"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (showVideoOverlayControls) {
                    if (videoOverlayTimerRef.current) { clearTimeout(videoOverlayTimerRef.current); videoOverlayTimerRef.current = null; }
                    setShowVideoOverlayControls(false);
                  } else {
                    revealVideoOverlay();
                  }
                }}
                className="absolute inset-0 z-[210] bg-transparent cursor-default"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              />
              <div
                className={`absolute inset-0 pointer-events-none transition-opacity duration-300 z-[215] ${
                  showVideoOverlayControls ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {/* Dimming gradient behind controls */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

                {/* Back / minimize (top-left) */}
                <button
                  onClick={(e) => { e.stopPropagation(); revealVideoOverlay(); playerState.isFullscreen ? exitFullscreen() : setExpanded(false); }}
                  className="pointer-events-auto absolute top-2 left-2 z-[220] p-2 rounded-full bg-black/55 backdrop-blur-sm text-white hover:bg-black/75 active:scale-90 transition"
                  title={playerState.isFullscreen ? "Sair da Tela Cheia" : "Voltar"}
                >
                  <ArrowLeft size={20} />
                </button>

                {/* Recarregar videoclipe (somente no modo Música → Vídeo).
                    1 toque = próximo candidato do ranking em cache (<200ms);
                    2 toques em ≤2s = busca fresca. A lógica vive no NowPlayingView. */}
                {isMusicVideoMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      revealVideoOverlay();
                      window.dispatchEvent(new CustomEvent("xerife:reload-video-clip"));
                    }}
                    className="pointer-events-auto absolute top-2 right-2 z-[220] p-2 rounded-full bg-black/55 backdrop-blur-sm text-white hover:bg-black/75 active:scale-90 transition"
                    title="Não é este clipe? Toque para trocar (2x = buscar novo)"
                    aria-label="Recarregar videoclipe"
                  >
                    <RefreshCw size={18} />
                  </button>
                )}

                {/* Center transport: prev / play-pause / next */}
                <div className="absolute inset-0 flex items-center justify-center gap-8 sm:gap-12 pointer-events-none">
                  <button
                    onClick={(e) => { e.stopPropagation(); revealVideoOverlay(); handlePrev(); }}
                    className="pointer-events-auto p-3 rounded-full bg-black/55 backdrop-blur-sm text-white hover:bg-black/75 active:scale-90 transition"
                    title="Anterior"
                  >
                    <SkipBack size={22} fill="currentColor" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); revealVideoOverlay(); handleTogglePlay(); }}
                    className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/55 backdrop-blur-sm text-white hover:bg-black/75 active:scale-90 transition flex items-center justify-center"
                    title={isPlaying ? "Pausar" : "Reproduzir"}
                  >
                    {isPlaying
                      ? <Pause size={32} fill="currentColor" />
                      : <Play size={32} fill="currentColor" className="ml-1" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); revealVideoOverlay(); handleNext(); }}
                    className="pointer-events-auto p-3 rounded-full bg-black/55 backdrop-blur-sm text-white hover:bg-black/75 active:scale-90 transition"
                    title="Próximo"
                  >
                    <SkipForward size={22} fill="currentColor" />
                  </button>
                </div>

                {/* Bottom bar: time + seekbar + PiP/AirPlay/fullscreen */}
                <div
                  className="absolute left-0 right-0 bottom-0 px-3 pb-2 pt-6 z-[220] pointer-events-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="pointer-events-auto flex items-center gap-2"
                    onPointerDown={() => { videoOverlayInteractingRef.current = true; revealVideoOverlay({ sticky: true }); }}
                    onPointerUp={() => { videoOverlayInteractingRef.current = false; revealVideoOverlay(); }}
                    onPointerCancel={() => { videoOverlayInteractingRef.current = false; revealVideoOverlay(); }}
                    onPointerLeave={() => { if (videoOverlayInteractingRef.current) { videoOverlayInteractingRef.current = false; revealVideoOverlay(); } }}
                  >
                    <span className="text-[11px] font-mono text-white/90 tabular-nums min-w-[42px] text-right">
                      {formatDuration(ct)}
                    </span>
                    <div className="flex-1">
                      <SeekBar
                        progress={dur > 0 ? ct / dur : 0}
                        onSeek={(f) => { videoOverlayInteractingRef.current = false; revealVideoOverlay(); handleSeek(f); }}
                        trackHeight="thin"
                        showThumb
                        duration={dur}
                        className=""
                      />
                    </div>
                    <span className="text-[11px] font-mono text-white/90 tabular-nums min-w-[42px]">
                      {formatDuration(dur)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); revealVideoOverlay(); toggleCaptions(); }}
                      title={playerState.captionsEnabled ? "Desativar legendas" : "Ativar legendas"}
                      aria-pressed={playerState.captionsEnabled}
                      className={`p-1.5 rounded-md backdrop-blur-sm transition-all active:scale-90 ${
                        playerState.captionsEnabled
                          ? "bg-primary/80 text-white hover:bg-primary"
                          : "bg-black/60 text-white/90 hover:text-white hover:bg-black/80"
                      }`}
                    >
                      {playerState.captionsEnabled ? <Captions size={16} /> : <CaptionsOff size={16} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); revealVideoOverlay(); playerState.isFullscreen ? exitFullscreen() : requestFullscreen(); }}
                      title={playerState.isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
                      className="p-1.5 rounded-md bg-black/60 backdrop-blur-sm text-white/90 hover:text-white hover:bg-black/80 transition-all active:scale-90"
                    >
                      {playerState.isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          <video 
            id="offline-player" 
            data-eq-enabled="true"
            className={`absolute inset-0 w-full h-full bg-black z-10 rounded-xl ${isPlayingOffline ? "block" : "hidden"}`}
            playsInline
            controls={false}
            onPlay={() => {
              offlineUserPausedRef.current = false;
              offlineShouldBePlayingRef.current = true;
              setOfflineIsPlaying(true);
            }}
            onPause={() => {
              setOfflineIsPlaying(false);
              const hiddenForMs = offlineHiddenSinceRef.current ? Date.now() - offlineHiddenSinceRef.current : 0;
              if (
                isIOSRef.current &&
                document.visibilityState === "hidden" &&
                offlineShouldBePlayingRef.current &&
                !offlineUserPausedRef.current &&
                hiddenForMs > 1500
              ) {
                offlineUserPausedRef.current = true;
                offlineShouldBePlayingRef.current = false;
                return;
              }
              if (offlineShouldBePlayingRef.current && !offlineUserPausedRef.current && document.visibilityState === "hidden") {
                setTimeout(() => {
                  const video = document.getElementById("offline-player") as HTMLVideoElement | null;
                  if (video?.paused && offlineShouldBePlayingRef.current && !offlineUserPausedRef.current) {
                    video.play().catch(() => {});
                  }
                }, 250);
              }
            }}
            onEnded={() => {
              offlineShouldBePlayingRef.current = false;
              offlineUserPausedRef.current = false;
              setOfflineIsPlaying(false);
              handleNext();
            }}
            onTimeUpdate={(e) => {
              setOfflineCurrentTime(e.currentTarget.currentTime);
              setOfflineDuration(e.currentTarget.duration);
            }}
            onLoadedMetadata={(e) => {
              setOfflineDuration(e.currentTarget.duration);
            }}
          />
          {/* Fullscreen overlay controls rendered here */}
          {playerState.isFullscreen && (
            <FullscreenOverlay
              song={currentSong}
              isPlaying={playerState.isPlaying}
              currentTime={ct}
              duration={dur}
              progress={dur > 0 ? ct / dur : 0}
              onTogglePlay={handleTogglePlay}
              onNext={handleNext}
              onPrev={handlePrev}
              onSeek={handleSeek}
              onExit={() => exitFullscreen()}
            />
          )}
        </div>
          );
        })()}


        {/* Header */}
        <header
          className="relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 flex-shrink-0 bg-background"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
          <div className="flex items-center lg:hidden shrink-0">
            <Logo size={32} />
          </div>



          <div className="hidden lg:flex items-center gap-3">
            {activeTab !== "home" && activeTab !== "podcast" && (() => {
              const mod = homeMode === "video" ? "video" : "music";
              const Icon = mod === "video" ? MonitorPlay : Music;
              const label = mod === "video" ? "Xerife Videos" : "Xerife Music";
              return (
                <>
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary">
                    <Icon size={17} />
                  </span>
                  <h2 className="text-lg font-display font-semibold text-foreground">
                    <span className="text-primary">{label.split(" ")[0]}</span> {label.split(" ").slice(1).join(" ")}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      · {activeTab === "library" ? "Biblioteca" : activeTab === "offline" ? "Downloads" : activeTab === "search" ? "Buscar" : "Playlists"}
                    </span>
                  </h2>
                </>
              );
            })()}
          </div>


          {/* Center: Dynamic-island module switcher (Início / Música / Vídeo / Podcast) */}
          <DynamicIslandModules
            activeModule={
              podcastMode
                ? "podcast"
                : (homeMode === "video" ? "video" : homeMode === "music" ? "music" : "hub")
            }
            onSelect={(id) => {
              if (id === "podcast") { setPodcastMode(true); setActiveTab("podcast"); }
              else { setPodcastMode(false); setHomeMode(id); setActiveTab("home"); }
            }}
          />

          <div className="flex items-center gap-2 ml-auto">

            {!isOnline && (
              <span className="flex items-center text-xs text-primary">
                <WifiOff size={18} />
              </span>
            )}
            <div className="md:hidden">
              <ProfileButton
                user={localUser}
                onLogin={localLogin}
                onLogout={localLogout}
                onOpenHistory={() => setActiveTab("history")}
                onUpdateName={updateName}
              />
            </div>
            {/* Mobile-only: Tools button (replaces 3-dots submenu) */}
            <div className="md:hidden">
              <HeaderMenu
                homeMode={homeMode}
                onHomeModeChange={setHomeMode}
                isDark={isDark}
                onToggleTheme={toggleTheme}
                colorTheme={colorTheme}
                onColorChange={(id: string) => {
                  document.documentElement.classList.remove('theme-red','theme-blue','theme-purple','theme-green','theme-orange','theme-pink','theme-default');
                  if (id !== 'default') {
                    document.documentElement.classList.add(`theme-${id}`);
                  }
                  localStorage.setItem('demus-color', id);
                  setColorTheme(id);
                }}
                onCast={() => {
                  const iframe = document.querySelector('#yt-player iframe') as HTMLIFrameElement | null;
                  if (iframe && 'remote' in iframe) {
                    (iframe as any).remote.prompt().catch(() => {
                      console.warn('Cast not available');
                    });
                  } else {
                    const video = document.querySelector('video');
                    if (video && 'remote' in video) {
                      (video as any).remote.prompt().catch(() => {});
                    }
                  }
                }}
                onOpenHistory={() => setActiveTab("history")}
                onOpenPlaylists={() => setActiveTab("playlists")}
                onOpenDownloads={() => setActiveTab("offline")}
                
                onZoomChange={setAppZoom}
                onLogin={localLogin}
                onLogout={localLogout}
                user={localUser}
                isLoadingUser={false}
                currentZoom={appZoom}
              />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-4 overscroll-contain lg:px-2" key={activeTab} style={{ animation: 'fade-in 0.25s ease-out' }}>
          {activeTab === "home" && podcastMode && (
            <PodcastScreen
              onPlayPodcast={(song) => {
                handleSelect(song);
                setPlayerMode("audio");
                setExpanded(true);
              }}
              currentPodcastId={currentSong?.id}
              isPlaying={isPlaying}
              currentTime={ct}
              duration={dur}
              onSpeedChange={(speed) => setPlaybackRate(speed)}
              onSeek={(fraction) => handleSeek(fraction)}
              onAddToPlaylist={(song) => {
                setSongToAddToPlaylist(song);
                setPlaylistModalMode("add");
                setShowPlaylistModal(true);
              }}
            />
          )}
          {activeTab === "home" && !podcastMode && (
            <div className="space-y-4 sm:space-y-6">

              {/* Channel Profile View (Video mode) */}
              {channelView ? (
                <ChannelProfile
                  channelName={channelView.name}
                  channelId={channelView.channelId}
                  channelUrl={channelView.channelUrl}
                  channelThumbnail={channelView.thumbnail}
                  onBack={() => setChannelView(null)}
                  onPlayVideo={(video) => {
                    const song: Song = {
                      id: `yt-${video.videoId}`, youtubeId: video.videoId,
                      title: video.title, artist: video.channel, album: video.title,
                      cover: video.thumbnail, duration: video.lengthSeconds, votes: 0, isDownloaded: false,
                    };
                    handleSelect(song);
                    setPlayerMode("video");
                    setExpanded(true);
                  }}
                  onFullscreenVideo={(video) => {
                    const song: Song = {
                      id: `yt-${video.videoId}`, youtubeId: video.videoId,
                      title: video.title, artist: video.channel, album: video.title,
                      cover: video.thumbnail, duration: video.lengthSeconds, votes: 0, isDownloaded: false,
                    };
                    handleSelect(song);
                    setPlayerMode("video");
                    setExpanded(true);
                    setTimeout(() => requestFullscreen(), 500);
                  }}
                />
              ) : artistView ? (
                <motion.div
                  key={`artist-${artistView.name}`}
                  initial={{ opacity: 0, y: 40, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 40, scale: 0.97 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full h-full"
                >
                  <ArtistProfile
                    artistName={artistView.name}
                    artistImage={artistView.image}
                    onBack={() => setArtistView(null)}
                    onPlaySong={(song, queue) => {
                      if (queue) setAlbumQueue(queue);
                      handleSelect(song);
                      setPlayerMode("audio");
                    }}
                    currentPlayingSong={currentSong}
                    isPlaying={playerState.isPlaying}
                    currentTime={ct}
                    duration={dur}
                    onTogglePlay={handleTogglePlay}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onExpand={() => setExpanded(true)}
                  />
                </motion.div>
              ) : homeMode === "hub" ? (
                <HubHomeScreen
                  greeting={greeting}
                  onEnterMusic={() => { setHomeMode("music"); setActiveTab("home"); }}
                  onEnterVideo={() => { setHomeMode("video"); setActiveTab("home"); }}
                  onPlayMusic={(m) => {
                    setHomeMode("music");
                    const song: Song = {
                      id: m.id, youtubeId: m.youtubeId, title: m.title, artist: m.artist,
                      album: m.album, cover: m.cover, duration: m.duration, votes: 0, isDownloaded: false,
                    };
                    handleSelect(song);
                    setPlayerMode("audio");
                  }}
                  onPlayVideo={(v) => {
                    setHomeMode("video");
                    const song: Song = {
                      id: `yt-${v.videoId}`, youtubeId: v.videoId,
                      title: v.title, artist: v.channel, album: v.title,
                      cover: v.thumbnail, duration: v.lengthSeconds, votes: 0, isDownloaded: false,
                      type: "video" as const,
                    };
                    handleSelect(song);
                    setPlayerMode("video");
                    setExpanded(true);
                  }}
                />
              ) : homeMode === "video" ? (
                <VideoHomeScreen
                  onPlayVideo={(video) => {
                    const song: Song = {
                      id: `yt-${video.videoId}`, youtubeId: video.videoId,
                      title: video.title, artist: video.channel, album: video.title,
                      cover: video.thumbnail, duration: video.lengthSeconds, votes: 0, isDownloaded: false,
                      type: "video" as const,
                    };
                    handleSelect(song);
                    setPlayerMode("video");
                    setExpanded(true);
                  }}
                  onFullscreenVideo={(video) => {
                    const song: Song = {
                      id: `yt-${video.videoId}`, youtubeId: video.videoId,
                      title: video.title, artist: video.channel, album: video.title,
                      cover: video.thumbnail, duration: video.lengthSeconds, votes: 0, isDownloaded: false,
                      type: "video" as const,
                    };
                    handleSelect(song);
                    setPlayerMode("video");
                    setExpanded(true);
                    setTimeout(() => requestFullscreen(), 500);
                  }}
                  onChannelClick={(name, thumb, channelId, channelUrl) => setChannelView({ name, thumbnail: thumb, channelId, channelUrl })}
                  onAddToPlaylist={(v) => {
                    const song: Song = {
                      id: `yt-${v.videoId}`, youtubeId: v.videoId,
                      title: v.title, artist: v.channel, album: v.title,
                      cover: v.thumbnail, duration: v.lengthSeconds || 0, votes: 0, isDownloaded: false,
                      type: "video" as const,
                    };
                    setSongToAddToPlaylist(song);
                    setPlaylistModalMode("add");
                    setShowPlaylistModal(true);
                  }}
                  onNavigateToExplore={() => setActiveTab("search")}
                />
              ) : (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
                >
                  {/* Desktop logo banner removed — header already shows module title */}


                  {/* Greeting (Mobile only now as desktop has its own) */}
                  <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }} className="px-4 pb-1 lg:hidden">
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground">{greeting}</h1>
                  </motion.div>



                  {/* Quick picks */}
                  <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }} className="px-3 sm:px-4 pb-2">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                      {quickPicks.map((song) => (
                        <button
                          key={song.id}
                          onClick={() => handleSelect(song)}
                          className={`flex items-center gap-2.5 sm:gap-3 rounded-2xl overflow-hidden transition-all active:scale-[0.98] p-1 ${
                            song.id === currentSong.id ? "bg-primary/10 ring-1 ring-primary/30" : "bg-card hover:bg-accent/40 shadow-sm"
                          }`}
                        >
                          <img src={hdThumbnail(song.cover)} alt={song.album} className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-cover flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-bold text-foreground truncate pr-2 leading-tight text-left">{song.title}</span>
                        </button>
                      ))}
                    </div>
                  </motion.section>

                  {/* Featured Albums */}
                  <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }} className="pt-4 border-t border-border/10 mx-3 sm:mx-4">
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <h2 className="text-base sm:text-xl font-black text-foreground uppercase tracking-widest italic">Destaques</h2>
                      {forYouSongs.length > 5 && (
                        <button
                          onClick={() => setShowAllDestaques(v => !v)}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          {showAllDestaques ? "VER MENOS" : "VER MAIS"}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5">
                      {forYouSongs.slice(0, showAllDestaques ? forYouSongs.length : 5).map((song) => (
                        <button
                          key={song.id}
                          onClick={() => handleSelect(song)}
                          className="group active:scale-[0.97] transition-transform text-left"
                        >
                          <div className="w-full aspect-square rounded-2xl overflow-hidden mb-2.5 relative shadow-lg">
                            <img src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                               <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center text-white scale-75 group-hover:scale-100 transition-transform shadow-xl">
                                  <Play size={24} fill="currentColor" className="ml-1" />
                               </div>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-foreground truncate leading-snug">{song.title}</p>
                          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{song.artist}</p>
                        </button>
                      ))}
                    </div>
                  </motion.section>

                  {/* Listen again */}
                  <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
                    <div className="flex items-center justify-between px-3 sm:px-4 mb-3 sm:mb-4 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <Clock size={18} className="text-primary" />
                        <h2 className="text-base sm:text-lg font-black text-foreground italic">Ouvir novamente</h2>
                      </div>
                      {listenAgainSongs.length > 8 && (
                        <button
                          onClick={() => setShowAllListenAgain(v => !v)}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          {showAllListenAgain ? "VER MENOS" : "VER MAIS"}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 px-3 sm:px-4">
                      {(listenAgainSongs.length > 0
                        ? listenAgainSongs.slice(0, showAllListenAgain ? listenAgainSongs.length : 8)
                        : songs.slice(0, 8)
                      ).map((song) => (
                        <button
                          key={song.id}
                          onClick={() => handleSelect(song)}
                          className="group relative active:scale-95 transition-transform"
                        >
                          <div className="w-full aspect-square rounded-2xl overflow-hidden mb-2 relative shadow-md">
                            <img src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-primary/95 flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-2xl">
                                <Play size={18} className="text-white ml-0.5" fill="currentColor" />
                              </div>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-foreground truncate text-left">{song.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate text-left">{song.artist}</p>
                        </button>
                      ))}
                    </div>
                  </motion.section>


                  {/* Top Charts */}
                  <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }} className="px-3 sm:px-4 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base sm:text-lg font-black text-foreground flex items-center gap-2 italic">
                        <TrendingUp size={20} className="text-primary" />
                        Top Charts
                      </h2>
                      <ChevronRight size={18} className="text-muted-foreground" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                      {topCharts.map((song, i) => (
                        <div
                          key={song.id}
                          className={`w-full flex items-center gap-4 p-2 sm:p-3 rounded-2xl transition-all ${
                            song.id === currentSong.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-secondary/60"
                          }`}
                        >
                          <span className={`text-base sm:text-2xl font-black w-8 text-center ${i < 3 ? "text-primary italic" : "text-muted-foreground/30"}`}>
                            {i + 1}
                          </span>
                          <button onClick={() => handleSelect(song)} className="flex-shrink-0 relative group">
                            <img src={hdThumbnail(song.cover)} alt={song.album} className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl object-cover shadow-lg" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl flex items-center justify-center">
                               <Play size={20} className="text-white opacity-0 group-hover:opacity-100 fill-white" />
                            </div>
                          </button>
                          <div className="flex-1 min-w-0 text-left">
                            <button onClick={() => handleSelect(song)} className="w-full text-left">
                              <p className="text-sm sm:text-base font-bold text-foreground truncate leading-tight">{song.title}</p>
                            </button>
                            <button onClick={() => setArtistView({ name: song.artist, image: song.cover })} className="text-left">
                              <p className="text-[11px] sm:text-xs text-muted-foreground truncate hover:text-primary mt-1">{song.artist}</p>
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-black italic text-primary bg-primary/5 px-2 py-1 rounded-lg">
                            <Flame size={14} />
                            <span>{song.votes}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.section>

                  {/* For you carousel */}
                  <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }} className="pt-6">
                    <div className="flex items-center justify-between px-3 sm:px-4 mb-4">
                      <h2 className="text-base sm:text-lg font-black text-foreground flex items-center gap-2 italic uppercase tracking-tighter">
                        <Sparkles size={18} className="text-primary animate-pulse" />
                        Recomendados para você
                      </h2>
                    </div>
                    <div className="flex gap-4 sm:gap-6 overflow-x-auto px-3 sm:px-4 pb-4 snap-x snap-mandatory scrollbar-hide">
                      {recommendedForYou.map((song) => (
                        <div key={song.id} className="flex-shrink-0 w-[140px] sm:w-[180px] md:w-[220px] lg:w-[260px] group snap-start">
                          <button onClick={() => handleSelect(song)} className="w-full text-left">
                            <div className="w-full aspect-square rounded-[32px] overflow-hidden mb-3 relative shadow-2xl-glow">
                              <img src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                              <div className="absolute inset-0 bg-gradient-to-tr from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute bottom-4 right-4 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-2xl scale-75 group-hover:scale-100 transition-all">
                                <Play size={24} className="ml-1" fill="currentColor" />
                              </div>
                            </div>
                            <p className="text-sm sm:text-base font-black text-foreground truncate mt-1">{song.title}</p>
                          </button>
                          <button onClick={() => setArtistView({ name: song.artist, image: song.cover })} className="text-left w-full">
                            <p className="text-[11px] sm:text-xs text-muted-foreground truncate hover:text-primary transition-colors">{song.artist}</p>
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.section>

                  {/* Featured mixes */}
                  <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }} className="px-3 sm:px-4 pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base sm:text-lg font-black italic text-foreground flex items-center gap-2">
                        <Disc3 size={20} className="text-primary" />
                        Sua Vibe
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { title: "Rock Clássico", subtitle: "Queen, Led Zeppelin", color: "from-red-600/20" },
                        { title: "Pop Hits", subtitle: "Ed Sheeran, Adele", color: "from-blue-600/20" },
                        { title: "Mix Latino", subtitle: "Shakira, Bad Bunny", color: "from-orange-600/20" },
                        { title: "Chill & Relax", subtitle: "Lofi Beats, Acoustic", color: "from-emerald-600/20" },
                      ].map((mix, i) => (
                        <button
                          key={mix.title}
                          onClick={() => handleSelect(songs[i % songs.length])}
                          className="relative rounded-[28px] overflow-hidden aspect-[4/3] group active:scale-[0.98] transition-transform shadow-xl"
                        >
                          <img src={albumCovers[i]} alt={mix.title} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                          <div className={`absolute inset-0 bg-gradient-to-tr ${mix.color} to-transparent`} />
                          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                          <div className="absolute bottom-0 left-0 right-0 p-4">
                            <p className="text-xs sm:text-base font-black text-white text-left italic tracking-tighter">{mix.title}</p>
                            <p className="text-[9px] sm:text-[11px] text-white/70 font-medium truncate text-left">{mix.subtitle}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.section>

                  {/* Voting queue */}
                  <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } }} className="px-3 sm:px-4 py-8">
                    <div className="flex items-center justify-between mb-4 bg-secondary/30 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg">
                           <Headphones size={20} />
                        </div>
                        <div>
                           <h2 className="text-base sm:text-lg font-black text-foreground italic">Comunidade</h2>
                           <p className="text-[10px] sm:text-xs text-muted-foreground uppercase font-bold tracking-widest">{songs.reduce((a, s) => a + s.votes, 0)} Votos Ativos</p>
                        </div>
                      </div>
                      <Plus className="text-muted-foreground" size={24} />
                    </div>
                    <div className="space-y-1">
                      {queueSongs.map((song) => (
                        <SongCard key={song.id} song={song} isActive={song.id === currentSong.id} onSelect={handleSelect} onVote={handleVote} onDownload={handleDownload} onAddToPlaylist={(s) => { setSongToAddToPlaylist(s); setPlaylistModalMode("add"); setShowPlaylistModal(true); }} showVotes hasVoted={votedSongs.has(song.id)} />
                      ))}
                    </div>
                  </motion.section>
                </motion.div>
              )}
            </div>
          )}

          {activeTab === "search" && (
            homeMode === "video" ? (
              <ExploreScreen
                onPlayVideo={(video) => {
                  const song: Song = {
                    id: `yt-${video.videoId}`, youtubeId: video.videoId,
                    title: video.title, artist: video.channel, album: video.title,
                    cover: video.thumbnail, duration: video.lengthSeconds, votes: 0, isDownloaded: false,
                    type: "video" as const,
                  };
                  handleSelect(song);
                  setPlayerMode("video");
                  setExpanded(true);
                }}
                onFullscreenVideo={(video) => {
                  const song: Song = {
                    id: `yt-${video.videoId}`, youtubeId: video.videoId,
                    title: video.title, artist: video.channel, album: video.title,
                    cover: video.thumbnail, duration: video.lengthSeconds, votes: 0, isDownloaded: false,
                    type: "video" as const,
                  };
                  handleSelect(song);
                  setPlayerMode("video");
                  setExpanded(true);
                  setTimeout(() => requestFullscreen(), 500);
                }}
                onChannelClick={(name, thumb, channelId, channelUrl) => {
                  setActiveTab("home");
                  setChannelView({ name, thumbnail: thumb, channelId, channelUrl });
                }}
                onAddToPlaylist={(v) => {
                  const song: Song = {
                    id: `yt-${v.videoId}`, youtubeId: v.videoId,
                    title: v.title, artist: v.channel, album: v.title,
                    cover: v.thumbnail, duration: v.lengthSeconds || 0, votes: 0, isDownloaded: false,
                    type: "video" as const,
                  };
                  setSongToAddToPlaylist(song);
                  setPlaylistModalMode("add");
                  setShowPlaylistModal(true);
                }}
              />
            ) : (
              <SearchScreen
                currentSongId={currentSong.id}
                onSelect={handleSelect}
                onArtistClick={(name, image) => {
                  setActiveTab("home");
                  setArtistView({ name, image });
                }}
                onAddToPlaylist={(s) => {
                  setSongToAddToPlaylist(s);
                  setPlaylistModalMode("add");
                  setShowPlaylistModal(true);
                }}
              />
            )
          )}

          {activeTab === "library" && (
            <div className="px-4 space-y-3">
              <h1 className="text-xl font-display font-bold text-foreground lg:hidden">
                {homeMode === "video" ? "Biblioteca" : "Favoritos"}
              </h1>

              {/* ── Watch Later section (video mode only) ── */}
              {homeMode === "video" && (() => {
                const watchLaterList = getWatchLater();
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bookmark size={16} className="text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">Assistir mais tarde</h2>
                        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">{watchLaterList.length}</span>
                      </div>
                      {watchLaterList.length > 0 && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors">
                              <Trash2 size={12} />
                              Limpar tudo
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Limpar lista?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Todos os {watchLaterList.length} vídeos salvos serão removidos. Essa ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  localStorage.removeItem("demus_watch_later");
                                  setRecentHistory([...recentHistory]);
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Limpar tudo
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    {watchLaterList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground opacity-30">
                        <Bookmark size={48} strokeWidth={1} />
                        <p className="mt-3 text-sm font-medium">Nenhum vídeo salvo</p>
                        <p className="text-xs mt-1">Toque no ícone de bookmark para salvar vídeos</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <AnimatePresence mode="popLayout">
                          {watchLaterList.map((video) => (
                            <motion.div
                              key={video.videoId}
                              layout
                              initial={{ opacity: 0, x: -20, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.25 } }}
                              transition={{ type: "spring", stiffness: 400, damping: 30 }}
                              className="flex gap-3 items-start group bg-card rounded-lg p-2 hover:bg-accent/50 transition-colors"
                            >
                              <button
                                onClick={() => {
                                  const song: Song = {
                                    id: `yt-${video.videoId}`, youtubeId: video.videoId,
                                    title: video.title, artist: video.channel, album: video.title,
                                    cover: video.thumbnail, duration: video.lengthSeconds, votes: 0, isDownloaded: false,
                                    type: "video" as const,
                                  };
                                  handleSelect(song);
                                  setPlayerMode("video");
                                  setExpanded(true);
                                }}
                                className="flex-shrink-0 relative w-36 aspect-video rounded-md overflow-hidden"
                              >
                                <img src={hdThumbnail(video.thumbnail)} alt={video.title} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Play size={24} className="text-white" fill="white" />
                                </div>
                                {video.duration && (
                                  <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[9px] bg-black/80 text-white font-medium">
                                    {video.duration}
                                  </span>
                                )}
                              </button>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{video.title}</p>
                                <p className="text-xs text-muted-foreground mt-1 truncate">{video.channel}</p>
                              </div>
                              <button
                                onClick={() => {
                                  removeFromWatchLater(video.videoId);
                                  setRecentHistory([...recentHistory]);
                                }}
                                className="flex-shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Remover"
                              >
                                <Trash2 size={14} />
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Favorites section ── */}
              <div className="flex gap-2 mb-2 overflow-x-auto scrollbar-hide">
                <span className="chip chip-active flex-shrink-0">
                  {homeMode === "music" ? "Músicas" : "Vídeos"} Curtidos
                </span>
              </div>
              
              {(() => {
                const historyAsSongs = recentHistory.map(e => ({
                  id: e.songId, youtubeId: e.youtubeId, title: e.title, artist: e.artist,
                  album: e.album, cover: e.cover, duration: e.duration, votes: 1, isDownloaded: savedSongIds.has(e.songId),
                  type: e.type || (e.songId.startsWith('yt-') ? 'video' as const : 'music' as const)
                }));
                
                const allRecentItems = [...songs, ...historyAsSongs, ...favoritesMetadata];
                const uniqueItems = Array.from(new Map(allRecentItems.map(item => [item.id, item])).values());
                
                const favorites = uniqueItems.filter(s => {
                  const isFavorited = votedSongs.has(s.id);
                  if (!isFavorited) return false;
                  const itemType = s.type || (s.id.startsWith('yt-') ? 'video' : 'music');
                  if (itemType === 'podcast') return false;
                  if (homeMode === "music") {
                    return itemType === "music";
                  } else {
                    return itemType === "video";
                  }
                });
                
                return favorites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-30">
                    <Heart size={64} strokeWidth={1} />
                    <p className="mt-4 text-sm font-medium">Nenhum favorito ainda</p>
                  </div>
                ) : (
                  favorites.map((song) => (
                    <SongCard key={song.id} song={song} isActive={song.id === currentSong.id} onSelect={handleSelect} onDownload={handleDownload} onAddToPlaylist={(s) => { setSongToAddToPlaylist(s); setPlaylistModalMode("add"); setShowPlaylistModal(true); }} />
                  ))
                );
              })()}
            </div>
          )}

          {activeTab === "libraryhub" && (
            <LibraryHubScreen
              homeMode={homeMode}
              initialFilter={podcastMode ? "podcast" : (homeMode === "video" ? "video" : "music")}
              onHomeModeChange={setHomeMode}
              onOpenTool={(id, mod) => {
                // Sync module state so downstream screens filter correctly
                if (mod === "podcast") {
                  setPodcastMode(true);
                } else {
                  setPodcastMode(false);
                  setHomeMode(mod);
                }
                switch (id) {
                  case "downloads":
                    if (mod === "podcast") setActiveTab("podcast");
                    else setActiveTab("offline");
                    break;
                  case "liked":
                    if (mod === "podcast") setActiveTab("podcast");
                    else setActiveTab("library");
                    break;
                  case "watchlater":
                    setHomeMode("video");
                    setActiveTab("library");
                    break;
                  case "playlists":
                    setActiveTab("playlists");
                    break;
                  case "podcasts":
                    setActiveTab("podcast");
                    break;
                  case "history":
                    setActiveTab("history");
                    break;
                }
              }}
            />
          )}


          {activeTab === "podcast" && (
            <PodcastScreen
              onPlayPodcast={(song) => {
                handleSelect(song);
                setPlayerMode("audio");
                setExpanded(true);
              }}
              currentPodcastId={currentSong?.id}
              isPlaying={isPlaying}
              currentTime={ct}
              duration={dur}
              onSpeedChange={(speed) => setPlaybackRate(speed)}
              onSeek={(fraction) => handleSeek(fraction)}
              onAddToPlaylist={(song) => {
                setSongToAddToPlaylist(song);
                setPlaylistModalMode("add");
                setShowPlaylistModal(true);
              }}
            />
          )}

          {activeTab === "offline" && (
            <div className="px-4 space-y-3">
              <h1 className="text-xl font-display font-bold text-foreground lg:hidden">Downloads</h1>
              <p className="text-xs text-muted-foreground">{offlineSongs.length} músicas salvas</p>
              {offlineSongs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Music size={48} className="mb-4 opacity-20" />
                  <p className="text-sm">Nenhum download ainda</p>
                  <p className="text-xs mt-1">Toque em ☁️ para salvar offline</p>
                </div>
              ) : (
                offlineSongs.map((song) => (
                  <SongCard key={song.id} song={song} isActive={song.id === currentSong.id} onSelect={handleSelect} onAddToPlaylist={(s) => { setSongToAddToPlaylist(s); setPlaylistModalMode("add"); setShowPlaylistModal(true); }} />
                ))
              )}
            </div>
          )}

          {activeTab === "profile" && (
            <div className="px-4 space-y-5">
              <div className="flex items-center gap-4 pt-2">
                <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-bold shadow-glow-red">D</div>
                <div>
                  <h1 className="text-lg font-display font-bold text-foreground">DJ Host</h1>
                  <p className="text-xs text-muted-foreground font-mono">ID: {deviceId.current.substring(0, 16)}...</p>
                </div>
              </div>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  { label: "Músicas", value: songs.length },
                  { label: "Downloads", value: offlineSongs.length },
                  { label: "Votos", value: songs.reduce((a, s) => a + s.votes, 0) },
                ].map((stat) => (
                  <div key={stat.label} className="bg-secondary rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-secondary rounded-lg p-3 space-y-1.5">
                <h3 className="text-xs font-medium text-foreground">Sobre</h3>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p>Player: YouTube IFrame API</p>
                  <p>Storage: IndexedDB + localStorage</p>
                  <p>Fila: Democracy Mode</p>
                  <p>PWA: Standalone</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="px-4 space-y-4 pb-24">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-display font-bold text-foreground">Histórico</h1>
                <button 
                  onClick={() => { if(confirm("Limpar histórico?")) { clearHistory(); setRecentHistory([]); } }}
                  className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full bg-secondary"
                >
                  Limpar Tudo
                </button>
              </div>
              
              {(() => {
                const currentModule: 'hub' | 'music' | 'video' | 'podcast' =
                  (homeMode as any) || 'hub';
                const filteredHistory = recentHistory.filter(item => {
                  const t = item.type || (item.songId.startsWith('yt-') ? 'video' : 'music');
                  if (currentModule === 'hub') return true;
                  return t === currentModule;
                });
                return filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-20">
                    <Clock size={64} />
                    <p className="mt-4 text-sm font-medium">Histórico vazio</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredHistory.map((item) => {
                      const song: Song = {
                        id: item.songId, youtubeId: item.youtubeId, title: item.title, artist: item.artist,
                        album: item.album, cover: item.cover, duration: item.duration, votes: 0, isDownloaded: savedSongIds.has(item.songId),
                        type: item.type as any || (item.songId.startsWith('yt-') ? 'video' : 'music')
                      };
                      return (
                        <SongCard 
                          key={`${item.songId}-${item.playedAt}`} 
                          song={song} 
                          isActive={song.id === currentSong.id} 
                          onSelect={handleSelect} 
                          onDownload={handleDownload}
                          onAddToPlaylist={(s) => { setSongToAddToPlaylist(s); setPlaylistModalMode("add"); setShowPlaylistModal(true); }}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === "playlists" && (
            <div className="px-4 space-y-4 pb-24">
              {(() => {
                const openPlaylist = openPlaylistId
                  ? playlists.find(p => p.id === openPlaylistId)
                  : null;
                if (openPlaylist) {
                  return (
                    <PlaylistDetail
                      playlist={openPlaylist}
                      currentSongId={currentSong?.id}
                      onBack={() => setOpenPlaylistId(null)}
                      onUpdate={(next) => {
                        setPlaylists(getPlaylists());
                        if (!next) setOpenPlaylistId(null);
                      }}
                      onPlaySong={(song, queue) => {
                        handleSelect(song);
                        setAlbumQueue(queue.length > 0 ? queue : null);
                      }}
                    />
                  );
                }
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <h1 className="text-xl font-display font-bold text-foreground">Minhas Playlists</h1>
                      <button
                        onClick={() => { setPlaylistModalMode("manage"); setShowPlaylistModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full font-bold text-xs"
                      >
                        <Plus size={14} /> Criar Playlist
                      </button>
                    </div>

                    {playlists.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 opacity-20">
                        <ListMusic size={64} />
                        <p className="mt-4 text-sm font-medium">Nenhuma playlist personalizada</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {playlists.map(playlist => (
                          <button
                            key={playlist.id}
                            onClick={() => setOpenPlaylistId(playlist.id)}
                            className="flex items-center gap-4 p-4 bg-secondary/40 hover:bg-secondary rounded-2xl transition-all text-left group"
                          >
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform overflow-hidden">
                              {playlist.songs.find((s: any) => s?.cover)?.cover ? (
                                <img
                                  src={playlist.songs.find((s: any) => s?.cover)!.cover}
                                  alt={playlist.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ListMusic size={32} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-foreground truncate">{playlist.name}</p>
                              <p className="text-xs text-muted-foreground">{playlist.songs.length} itens</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        </main>

        {!expanded && (
          <>
            <div className="md:hidden" ref={mobileFooterRef}>
              {miniPlayerVisible && (
                <MiniPlayer
                  song={currentSong}
                  isPlaying={isPlaying}
                  currentTime={ct}
                  duration={dur}
                  onTogglePlay={handleTogglePlay}
                  onNext={handleNext}
                  onPrev={handlePrev}
                  onExpand={() => setExpanded(true)}
                  onDismiss={() => setMiniPlayerVisible(false)}
                />
              )}
              <BottomNav
                active={activeTab}
                onChange={handleNavChange}
                homeMode={homeMode}
                podcastMode={podcastMode}
              />
            </div>
            <div className="hidden md:block">
              <DesktopPlayer
                song={currentSong}
                isPlaying={isPlaying}
                currentTime={ct}
                duration={dur}
                volume={volume}
                onTogglePlay={handleTogglePlay}
                onNext={handleNext}
                onPrev={handlePrev}
                onExpand={() => setExpanded(true)}
                onSeek={handleSeek}
                onVolumeChange={setVolumeState}
                isShuffled={isShuffled}
                onShuffle={handleShuffle}
              />
            </div>
          </>
        )}

        {expanded && (
          <div className="md:hidden" ref={mobileFooterRef}>
            <BottomNav
              active={activeTab}
              onChange={handleNavChange}
              homeMode={homeMode}
              podcastMode={podcastMode}
            />
          </div>
        )}


        {expanded && (
          <NowPlayingView song={currentSong} isPlaying={isPlaying} isEnded={isPlayingOffline ? false : playerState.isEnded} currentTime={ct} duration={dur} onTogglePlay={handleTogglePlay} onNext={handleNext} onPrev={handlePrev} onCollapse={() => setExpanded(false)} onSeek={handleSeek} volume={volume} onVolumeChange={setVolumeState} onTogglePiP={handleTogglePiP} onModeChange={setPlayerMode} onAirPlay={requestAirPlay} onCast={() => requestAirPlay(playerMode === "lyrics" ? "audio" : playerMode)} onPlayRelated={(video) => {
            const song: Song = {
              id: `yt-${video.videoId}`,
              youtubeId: video.videoId,
              title: video.title,
              artist: video.channel,
              album: video.title,
              cover: video.thumbnail,
              duration: video.lengthSeconds,
              votes: 0,
              isDownloaded: false,
            };
            handleSelect(song);
            setPlayerMode("video");
          }}             onFullscreen={() => requestFullscreen()}
            onExitFullscreen={() => exitFullscreen()}
            isFullscreen={playerState.isFullscreen}
            isShuffled={isShuffled}
            onShuffle={handleShuffle}
            context={podcastMode ? "podcast" : (homeMode === "video" ? "video" : "music")}
            onShowQueue={() => setShowQueue(true)}
            initialMode={playerMode}
            activeVideoId={playerState.videoId}
            onPreloadClip={(videoId) => preloadClip(videoId)}
            onSwapClipAt={(video, startSeconds) => {
              // Captura o tempo LIVE do IFrame no instante do swap para
              // eliminar drift entre state React e player real (crítico em
              // Safari/iOS e Chrome/Windows, onde o state pode atrasar
              // 200-800ms). Aplica compensação de latência do handshake do
              // IFrame API (loadVideoById até a primeira frame).
              const ua = navigator.userAgent;
              const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && (navigator as any).maxTouchPoints > 1);
              const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
              const isWindows = /Windows/.test(ua);
              // Handshake medido empiricamente: Safari/iOS ~350ms, Windows Chrome ~180ms, resto ~120ms.
              const handshakeBiasSec = (isIOS || isSafari) ? 0.35 : isWindows ? 0.18 : 0.12;
              const liveNow = getPlayerCurrentTime?.() || 0;
              const base = liveNow > 0 ? liveNow : Math.max(0, startSeconds || 0);
              const target = Math.max(0, base + handshakeBiasSec);
              const newSong: Song = {
                id: `yt-${video.videoId}`,
                youtubeId: video.videoId,
                title: video.title || currentSong.title,
                artist: video.channel || currentSong.artist,
                album: video.title || currentSong.album,
                cover: video.thumbnail || currentSong.cover,
                duration: video.lengthSeconds || currentSong.duration,
                votes: 0,
                isDownloaded: false,
              };
              setCurrentSong(newSong);
              setPlayerMode("video");
              loadVideoAt(video.videoId, target, { crossfade: true });
            }}
            onArtistClick={(artist) => {
              setArtistView(artist);
              setExpanded(false);
              setActiveTab("home");
            }}
            queueCount={smartQueueList.length + (albumQueue ? albumQueue.length : 0)}
            onDownload={() => handleDownload(currentSong)}
            onShare={() => handleShare(currentSong)}
            isLiked={votedSongs.has(currentSong.id)}
            onLike={() => handleVote(currentSong)}
            onAddToPlaylist={(s) => { setSongToAddToPlaylist(s); setPlaylistModalMode("add"); setShowPlaylistModal(true); }}
          />
        )}

        <AnimatePresence>
          {showQueue && (
            <QueueDrawer
              isOpen={showQueue}
              onClose={() => setShowQueue(false)}
              currentSong={currentSong}
              queue={smartQueueList}
              onPlayFromQueue={handlePlayFromQueue}
              onRemoveFromQueue={handleRemoveFromQueue}
              onClearQueue={handleClearQueue}
              onReorder={handleReorderQueue}
            />
          )}
        </AnimatePresence>

        {showFloatingPiP && !expanded && (
          <FloatingPiPPlayer
            song={currentSong}
            isPlaying={playerState.isPlaying}
            currentTime={ct}
            duration={dur}
            onTogglePlay={handleTogglePlay}
            onNext={handleNext}
            onPrev={handlePrev}
            onExpand={() => { setShowFloatingPiP(false); setExpanded(true); }}
            onClose={() => setShowFloatingPiP(false)}
          />
        )}

        <PiPDiagnostics
          open={pipDiagnosticsOpen}
          onClose={() => setPipDiagnosticsOpen(false)}
          currentStatus={pipStatus}
        />



        <PlaylistModal 
           isOpen={showPlaylistModal}
           onClose={() => setShowPlaylistModal(false)}
           playlists={playlists}
           onUpdate={() => setPlaylists(getPlaylists())}
           mode={playlistModalMode}
           songToAdd={songToAddToPlaylist}
           onSelectPlaylist={(pl) => {
             setShowPlaylistModal(false);
             setActiveTab("playlists");
             setOpenPlaylistId(pl.id);
           }}
           onSongAdded={() => {
             setShowPlaylistModal(false);
             setSongToAddToPlaylist(null);
           }}
         />

        <ShareModal
          open={showShareModal}
          onOpenChange={setShowShareModal}
          song={modalSong}
          isVideo={homeMode === "video"}
        />

        <DownloadModal
          open={showDownloadModal}
          onOpenChange={setShowDownloadModal}
          song={modalSong}
          isVideo={homeMode === "video"}
        />
        </div>{/* end main column */}

      </div>
      </>
    </MotionConfig>
  );

};

export default Index;
