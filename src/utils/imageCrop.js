// Utilidad para recortar imágenes en el cliente usando canvas
// crop: { x, y, width, height } en píxeles de la imagen original
export async function getCroppedImageBlob(imageSrc, crop, rotation = 0, fileType = 'image/jpeg', quality = 0.9) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const safeArea = Math.max(image.width, image.height) * 2;
  canvas.width = safeArea;
  canvas.height = safeArea;

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-safeArea / 2, -safeArea / 2);

  ctx.drawImage(image, (safeArea - image.width) / 2, (safeArea - image.height) / 2);

  const data = ctx.getImageData(0, 0, safeArea, safeArea);

  // Set canvas to the exact crop size
  canvas.width = crop.width;
  canvas.height = crop.height;

  // Draw the cropped image
  ctx.putImageData(
    data,
    Math.round(0 - (safeArea / 2 - image.width / 2) - crop.x),
    Math.round(0 - (safeArea / 2 - image.height / 2) - crop.y)
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, fileType, quality);
  });
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous'); // to avoid CORS issues
    image.src = url;
  });
}

// Helper para convertir Blob a File con nombre
export function blobToFile(blob, fileName) {
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
}