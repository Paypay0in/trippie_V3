import i18n from '../i18n/config';
import { ExperienceNoteType, PostSliceType } from '../types';

export type SliceCandidate = {
  type: PostSliceType;
  title: string;
  summary?: string;
  placeName?: string;
  sourceText?: string;
  notes: Array<{ type: ExperienceNoteType; text: string; sourceText?: string }>;
};

export const extractPostSliceCandidates = async (input: { postId: string; title: string; content: string; country: string; city: string }): Promise<SliceCandidate[]> => {
  const response = await fetch('/api/community/post-slices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const data = await response.json() as { slices?: SliceCandidate[]; error?: string };
  // Same sentence the post detail screen already shows for this failure, so it
  // resolves `community.detail.analysisUnavailable` rather than adding a second
  // key holding the identical copy.
  if (!response.ok) throw new Error(data.error || i18n.t('community.detail.analysisUnavailable'));
  return Array.isArray(data.slices) ? data.slices.filter(slice => slice && typeof slice.title === 'string' && ['place', 'food', 'hotel', 'activity', 'transport', 'tip'].includes(slice.type as PostSliceType) && Array.isArray(slice.notes)) : [];
};
