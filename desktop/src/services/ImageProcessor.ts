export interface CompressedFrame {
  base64: string;
  sizeBytes: number;
  width: number;
  height: number;
  mimeType: string;
}

export class ImageProcessor {
  /**
   * Resizes a video or canvas frame and compresses it to JPEG or WebP format.
   *
   * @param source HTMLVideoElement or HTMLCanvasElement containing screen frame
   * @param maxDimension Maximum bounding dimension for width or height (e.g. 1280px)
   * @param quality Compression quality factor from 0.0 to 1.0 (default 0.6)
   * @param preferredFormat "image/webp" or "image/jpeg" (default "image/jpeg")
   */
  public static async compress(
    source: HTMLVideoElement | HTMLCanvasElement,
    maxDimension = 1280,
    quality = 0.6,
    preferredFormat = "image/jpeg"
  ): Promise<CompressedFrame> {
    return new Promise((resolve, reject) => {
      try {
        let srcW = 0;
        let srcH = 0;

        if (source instanceof HTMLVideoElement) {
          srcW = source.videoWidth;
          srcH = source.videoHeight;
        } else {
          srcW = source.width;
          srcH = source.height;
        }

        if (srcW === 0 || srcH === 0) {
          throw new Error("Invalid source video/canvas dimensions.");
        }

        // Calculate scaling preserving aspect ratio
        let dstW = srcW;
        let dstH = srcH;
        if (srcW > maxDimension || srcH > maxDimension) {
          if (srcW > srcH) {
            dstW = maxDimension;
            dstH = Math.round((srcH * maxDimension) / srcW);
          } else {
            dstH = maxDimension;
            dstW = Math.round((srcW * maxDimension) / srcH);
          }
        }

        // Setup offscreen canvas
        const canvas = document.createElement("canvas");
        canvas.width = dstW;
        canvas.height = dstH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to get 2d context for compression canvas.");
        }

        // Draw and scale down
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, dstW, dstH);

        // Export compression to Blob / base64
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob from canvas."));
              return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              
              resolve({
                base64: base64data,
                sizeBytes: blob.size,
                width: dstW,
                height: dstH,
                mimeType: preferredFormat,
              });
            };
            reader.onerror = () => {
              reject(new Error("Failed to read compressed blob as base64 string."));
            };
            reader.readAsDataURL(blob);
          },
          preferredFormat,
          quality
        );
      } catch (err) {
        reject(err);
      }
    });
  }
}
