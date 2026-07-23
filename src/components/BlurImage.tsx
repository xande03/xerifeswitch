import { useState, useRef, useEffect, useMemo } from "react";

interface BlurImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}

/**
 * Build a fallback chain for YouTube thumbnails so a missing maxresdefault
 * doesn't leave the card blank. Order: current → sd → hq → mq → default.
 */
function buildYoutubeFallbacks(src: string): string[] {
  if (!src) return [];
  const chain: string[] = [src];

  // i.ytimg.com / i9.ytimg.com video thumbnails
  const ytMatch = src.match(/(https?:\/\/i9?\.ytimg\.com\/vi\/[^/]+\/)([^./]+)\.(jpg|webp)(.*)?$/);
  if (ytMatch) {
    const [, base, , ext] = ytMatch;
    const order = ["maxresdefault", "sddefault", "hqdefault", "mqdefault", "default"];
    for (const q of order) {
      const url = `${base}${q}.${ext}`;
      if (!chain.includes(url)) chain.push(url);
    }
  }

  // googleusercontent / ggpht sized URLs — fall back to smaller variants
  if (/googleusercontent\.com|ggpht\.com/.test(src)) {
    const sizes = ["=s800", "=s400", "=s176", "=s88"];
    for (const s of sizes) {
      const alt = src.replace(/=s\d+/, s).replace(/=w\d+-h\d+/, s.replace("=s", "=w") + "-h" + s.slice(2));
      if (!chain.includes(alt)) chain.push(alt);
    }
  }

  return chain;
}

/**
 * Image component with lazy loading, blur-up placeholder, and automatic
 * fallback through lower-resolution YouTube thumbnail variants on error.
 */
const BlurImage = ({ src, alt, className = "", loading = "lazy" }: BlurImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const fallbacks = useMemo(() => buildYoutubeFallbacks(src), [src]);
  const currentSrc = fallbacks[attempt] || src || "/placeholder.svg";

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
    setAttempt(0);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      // YouTube returns a 120×90 grey "no thumbnail" image (HTTP 200) when
      // maxresdefault/sddefault don't exist. Detect it and fall back.
      if (img.naturalWidth <= 120 && attempt < fallbacks.length - 1) {
        setAttempt((a) => a + 1);
      } else {
        setLoaded(true);
      }
    }
  }, [currentSrc, attempt, fallbacks.length]);

  const handleError = () => {
    if (attempt < fallbacks.length - 1) {
      setAttempt(attempt + 1);
    } else {
      setErrored(true);
    }
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth <= 120 && attempt < fallbacks.length - 1) {
      setAttempt((a) => a + 1);
      return;
    }
    setLoaded(true);
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Blurred placeholder background */}
      <div
        className={`absolute inset-0 bg-muted transition-opacity duration-500 ${
          loaded ? "opacity-0" : "opacity-100"
        }`}
        style={{
          backgroundImage: `url(${currentSrc})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(20px)",
          transform: "scale(1.1)",
        }}
      />
      {/* Actual image */}
      <img
        ref={imgRef}
        src={errored ? "/placeholder.svg" : currentSrc}
        alt={alt}
        loading={loading}
        onLoad={handleLoad}
        onError={handleError}
        className={`relative z-10 w-full h-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
};

export default BlurImage;
