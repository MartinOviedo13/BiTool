/**
 * Utilidad de compresión de imágenes en el navegador antes de subir por red.
 * Ideal para celulares (reduce fotos de 10-15MB a ~350KB sin perder legibilidad de texto manuscrito o impreso).
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<File> {
  // Si el archivo ya es liviano (< 400 KB) o no es imagen, no tocarlo
  if (!file.type.startsWith('image/') || file.size < 400 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Fondo blanco por si hay transparencias PNG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file); // Si no se redujo, mantener original
              return;
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export async function compressImageBatch(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<File[]> {
  const result: File[] = [];
  for (let i = 0; i < files.length; i++) {
    const compressed = await compressImage(files[i]);
    result.push(compressed);
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }
  return result;
}
