import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Upgrade a YouTube thumbnail URL to the highest available resolution.
 * Handles both i.ytimg.com and yt3.ggpht.com / lh3.googleusercontent.com URLs.
 */
export function hdThumbnail(url: string | undefined): string {
  if (!url) return "/placeholder.svg";

  // For standard YouTube video thumbnails: upgrade to maxresdefault
  if (url.includes("i.ytimg.com") || url.includes("i9.ytimg.com")) {
    return url
      .replace(/\/(hqdefault|mqdefault|default|sddefault)\.(jpg|webp)/, "/maxresdefault.$2")
      .replace(/\/vi\//, "/vi/")
      // Remove size constraints like ?sqp=... 
      .replace(/\?sqp=.*$/, "");
  }

  // For Google user content (channel avatars, music thumbnails): request larger size
  if (url.includes("ggpht.com") || url.includes("googleusercontent.com")) {
    // Replace size params like =s88, =s176, =w120-h120 with larger ones
    return url
      .replace(/=s\d+/, "=s800")
      .replace(/=w\d+-h\d+/, "=w800-h800")
      .replace(/w\d+-h\d+/, "w800-h800");
  }

  // For lh3 music thumbnails with size in path
  if (url.includes("lh3.")) {
    return url.replace(/=w\d+-h\d+/, "=w800-h800");
  }

  return url;
}
