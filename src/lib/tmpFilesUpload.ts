/**
 * Utility for uploading blobs to tmpfiles.org
 * Returns a direct download link
 */
export const uploadToTmpFiles = async (
  blob: Blob,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', blob, filename);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.status === 'success' && res.data?.url) {
            // Convert to DL link for direct access
            const directUrl = res.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            resolve(directUrl);
          } else {
            reject(new Error('Resposta inválida do tmpfiles.org'));
          }
        } catch (err) {
          reject(new Error('Falha ao processar resposta do tmpfiles.org'));
        }
      } else {
        reject(new Error(`Upload falhou com status: ${xhr.status}. Tente novamente.`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Erro de rede durante upload. Verifique sua conexão.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelado')));
    xhr.addEventListener('timeout', () => reject(new Error('Timeout no upload. Arquivo muito grande ou conexão lenta.')));

    // Set timeout to 5 minutes for large files
    xhr.timeout = 300000;

    xhr.open('POST', 'https://tmpfiles.org/api/v1/upload');
    xhr.send(formData);
  });
};

/**
 * Alternative upload using file.io as fallback
 */
export const uploadToFileIO = async (
  blob: Blob,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', blob, filename);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.link) {
            resolve(res.link);
          } else {
            reject(new Error('Resposta inválida do file.io'));
          }
        } catch (err) {
          reject(new Error('Falha ao processar resposta do file.io'));
        }
      } else {
        reject(new Error(`Upload falhou com status: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Erro de rede durante upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelado')));
    xhr.addEventListener('timeout', () => reject(new Error('Timeout no upload')));

    xhr.timeout = 300000;

    xhr.open('POST', 'https://file.io');
    xhr.send(formData);
  });
};

