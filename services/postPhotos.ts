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
const DEFAULT_MAX_EDGE = 1280;
const DEFAULT_QUALITY = 0.72;

/**
 * What a receipt is downscaled to before it is read.
 *
 * Larger than a photo meant for a screen: the labels that matter — 즉시환급,
 * 판매 가격, the product lines — are small print, and a 1280px pass smeared
 * them. Still a twentieth of what the camera produced.
 */
export const RECEIPT_SCAN_OPTIONS = { maxEdge: 1800, quality: 0.85 };

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

export interface DownscaleOptions {
  /** Longest edge in pixels. */
  maxEdge?: number;
  /** JPEG quality, 0 to 1. */
  quality?: number;
}

/**
 * Reads one file and returns a downscaled JPEG data URL.
 *
 * The defaults are sized for a photo somebody looks at. A photograph somebody's
 * eyes never see — a receipt on its way to the parser — wants a different
 * trade: more pixels, because 즉시환급 is printed at six point, and still far
 * smaller than the four megabytes a phone camera produces.
 */
export const readAndDownscale = (file: File, options: DownscaleOptions = {}): Promise<string> =>
  new Promise((resolve, reject) => {
    const MAX_EDGE = options.maxEdge ?? DEFAULT_MAX_EDGE;
    const QUALITY = options.quality ?? DEFAULT_QUALITY;
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
