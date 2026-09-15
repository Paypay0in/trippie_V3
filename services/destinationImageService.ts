export type DestinationImage = {
  provider: 'Pexels';
  providerPhotoId: string;
  imageUrl: string;
  sourceUrl: string;
  photographer: string;
  photographerUrl: string;
  licenseName: string;
  licenseUrl: string;
  attributionRequired: boolean;
  destinationQuery: string;
  selectedAt: number;
};

type DestinationImageCache = Record<string, DestinationImage>;

const CACHE_KEY = 'trippie_destination_image_cache_v1';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const normalizeDestinationQuery = (destination: string) =>
  destination.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

const readCache = (): DestinationImageCache => {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value ? (JSON.parse(value) as DestinationImageCache) : {};
  } catch {
    return {};
  }
};

const writeCache = (cache: DestinationImageCache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Optional imagery must not block the homepage when storage is unavailable.
  }
};

const isDestinationImage = (value: unknown): value is Omit<DestinationImage, 'selectedAt'> => {
  if (!value || typeof value !== 'object') return false;
  const image = value as Record<string, unknown>;
  return (
    image.provider === 'Pexels' &&
    typeof image.providerPhotoId === 'string' &&
    typeof image.imageUrl === 'string' &&
    typeof image.sourceUrl === 'string' &&
    typeof image.photographer === 'string' &&
    typeof image.photographerUrl === 'string' &&
    typeof image.licenseName === 'string' &&
    typeof image.licenseUrl === 'string' &&
    typeof image.attributionRequired === 'boolean' &&
    typeof image.destinationQuery === 'string'
  );
};

export const fetchDestinationImage = async (
  destination: string,
): Promise<DestinationImage | null> => {
  const normalizedDestination = normalizeDestinationQuery(destination);
  if (!normalizedDestination) return null;

  const cache = readCache();
  const cached = cache[normalizedDestination];
  if (
    cached &&
    normalizeDestinationQuery(cached.destinationQuery) === normalizedDestination &&
    Date.now() - cached.selectedAt < CACHE_MAX_AGE_MS
  ) return cached;

  try {
    const response = await fetch(
      `/api/destination-image?query=${encodeURIComponent(destination.trim())}`,
    );
    if (!response.ok) {
      return null;
    }

    const result: unknown = await response.json();
    if (
      !isDestinationImage(result) ||
      normalizeDestinationQuery(result.destinationQuery) !== normalizedDestination
    ) {
      return null;
    }

    const selectedImage: DestinationImage = { ...result, selectedAt: Date.now() };
    writeCache({ ...readCache(), [normalizedDestination]: selectedImage });
    return selectedImage;
  } catch {
    return null;
  }
};
