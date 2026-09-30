// Decode a photo from the camera roll into ImageData, honouring EXIF
// orientation (phones store portrait shots sideways) and capping the long edge
// so the rest of the pipeline stays fast on a phone.
export async function loadPhoto(file, maxEdge = 2400) {
  const source = await decode(file);
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();
  return ctx.getImageData(0, 0, width, height);
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers: an <img> applies EXIF orientation on its own.
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('not a readable image'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
