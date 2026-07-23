import { uploadToTmpFiles, uploadToFileIO } from "./tmpFilesUpload";
import { supabase } from "@/integrations/supabase/client";

export { uploadToTmpFiles, uploadToFileIO };

/**
 * Download media from YouTube using Supabase Edge Function
 * Returns a Blob that can be uploaded to tmpfiles.org
 */
export const downloadCobaltMedia = async (
  youtubeId: string,
  isAudio: boolean,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  try {
    // Call the youtube-download edge function
    const { data, error } = await supabase.functions.invoke('youtube-download', {
      body: { 
        videoId: youtubeId,
        format: isAudio ? 'audio' : 'video'
      }
    });

    if (error) {
      console.error('Edge function error:', error);
      throw new Error(`Erro ao baixar: ${error.message}`);
    }

    if (!data || !data.url) {
      throw new Error('URL de download não retornada pela Edge Function');
    }

    // Download the file from the returned URL
    const response = await fetch(data.url);
    
    if (!response.ok) {
      throw new Error(`Erro ao baixar arquivo: ${response.status}`);
    }

    // Get content length for progress tracking
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) {
      throw new Error('Response body não disponível');
    }

    // Read the stream with progress tracking
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loaded += value.length;
      
      if (onProgress && total > 0) {
        onProgress(Math.round((loaded / total) * 100));
      }
    }

    // Combine chunks into a single blob
    const blob = new Blob(chunks as BlobPart[], { 
      type: isAudio ? 'audio/mpeg' : 'video/mp4' 
    });

    return blob;

  } catch (err: any) {
    console.error('Download error:', err);
    throw new Error(err.message || 'Falha ao baixar mídia do YouTube');
  }
};

/**
 * Upload blob with automatic fallback
 * Tries tmpfiles.org first, then file.io if it fails
 */
export const uploadWithFallback = async (
  blob: Blob,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    // Try tmpfiles.org first
    return await uploadToTmpFiles(blob, filename, onProgress);
  } catch (error) {
    console.warn('tmpfiles.org failed, trying file.io:', error);
    // Fallback to file.io
    return await uploadToFileIO(blob, filename, onProgress);
  }
};
