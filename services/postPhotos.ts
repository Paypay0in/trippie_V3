/**
 * Photos attached to a community post.
 *
 * Downscaled in the browser before they are stored. A phone photo is three to
 * five megabytes; ten of them would exceed everything this app is allowed to
 * keep on a device, and the failure would land on whoever pressed 發布 — their
 * whole post lost to a photo. Resizing to a width a phone screen can actually
 * show costs nothing visible and keeps a post in the tens of kilobytes.
 */

export const MAX_POST_PHOTOS = 10;
const MAX_EDGE = 1280;
const QUALITY = 0.72;

export interface PhotoAddResult {
  photos: string[];
  /** How many were refused because the post is already full. */
  rejected: number;
}

/** Adds what fits, and reports what did not, rather than silently dropping it. */
export const addPhotos = (current: string[], incoming: string[]): PhotoAddResult => {
  const room = Math.max(0, MAX_POST_PHOTOS - current.length);
  return {
    photos: [...current, ...incoming.slice(0, room)],
    rejected: Math.max(0, incoming.length - room),
  };
};

export const removePhoto = (current: string[], photo: string): string[] =>
  current.filter(item => item !== photo);

/** Reads one file and returns a downscaled JPEG data URL. */
export const readAndDownscale = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('decode_failed'));
      image.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          // No canvas: keep the original rather than losing the photo.
          resolve(String(reader.result));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
