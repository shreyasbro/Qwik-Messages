/**
 * Compresses and converts any raw image to Full HD WebP in-browser
 * @param {File} file - Original raw image file
 * @param {number} maxDim - Maximum width/height dimension (1920px for HD Stories)
 * @param {number} quality - Compression quality (0.85 = crystal clear HD)
 * @returns {Promise<Blob>} Optimized WebP Blob
 */
export const compressImageToHD = (file, maxDim = 1920, quality = 0.85) => {
  return new Promise((resolve, reject) => {
    // If SVG or small GIF, do not compress
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio while bounding to 1080x1920 HD
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-efficiency WebP
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const optimizedFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, '') + '.webp',
              { type: 'image/webp' }
            );
            resolve(optimizedFile);
          },
          'image/webp',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

/**
 * Injects Cloudinary fast delivery transformations (Auto-WebP/AVIF + Auto-Quality)
 */
export const optimizeMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('cloudinary.com')) return url;
  
  // Inject f_auto,q_auto:good,w_1080 into Cloudinary upload path
  if (url.includes('/upload/') && !url.includes('/f_auto')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto:good,w_1080,c_limit/');
  }
  return url;
};
