import { useState, useCallback } from "react";

export const useDownloadProgress = () => {
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadFile = useCallback(async (url: string, filename: string) => {
    setIsDownloading(true);
    setProgress(0);
    setError(null);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Status ${response.status}`);

      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body) throw new Error("Stream not supported");

      const reader = response.body.getReader();
      let loaded = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          if (total) {
            setProgress(Math.round((loaded / total) * 100));
          } else {
            // Fake progress if no content-length
            setProgress((prev) => Math.min(prev + 1, 99));
          }
        }
      }

      const blob = new Blob(chunks as any);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      
      setProgress(100);
      return true;
    } catch (err: any) {
      console.error("Download failed:", err);
      setError(err.message || "Failed to download file");
      return false;
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return { downloadFile, progress, isDownloading, error };
};
