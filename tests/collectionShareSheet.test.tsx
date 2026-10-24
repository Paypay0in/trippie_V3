/**
 * @vitest-environment jsdom
 *
 * 分享設定 and 預覽公開版本.
 *
 * Two screens in the mock and one component, because they are the same
 * decision seen twice: the preview is not a mock-up of what publishing would
 * do, it is the publisher's own output rendered. These assert the three
 * things that make that true — nothing publishes by being looked at, the
 * preview moves with the switches, and somebody else's words never appear.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import CollectionShareSheet from '../components/CollectionShareSheet';
import { newCollection } from '../services/collectionLifecycle';
import { SavedExperienceNote, SavedTravelInspiration } from '../types';

const ME = 'me';
const ANN = 'ann';

const note = (creator: string, text: string): SavedExperienceNote => ({
  id: `n-${creator}`, sourceNoteId: `n-${creator}`, sourceSliceId: 's',
  sourcePostId: 'post-tokyo', sourceCreatorId: creator, type: 'recommendation', text,
});

const place = (patch: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1', savedByUserId: ME, country: '日本', city: '東京',
  placeName: 'Onibus Coffee', placeId: 'g-1', formattedAddress: '東京都目黑區',
  sourcePostId: 'post-tokyo', sourceSliceId: 's', sourceCreatorId: ANN,
  sourceNoteIds: [], savedAt: '2026-10-01T00:00:00.000Z', notes: [],
  ...patch,
});

const collection = () => newCollection(
  { title: '東京咖啡地圖', country: '日本', city: '東京' }, ME, () => 'c1',
  () => '2026-10-24T00:00:00.000Z',
);

const sheet = (props: Record<string, unknown> = {}) => {
  const handlers = { onClose: vi.fn(), onPublish: vi.fn(), onUnpublish: vi.fn() };
  render(
    <CollectionShareSheet
      collection={collection()}
      places={[place()]}
      origin="https://trippie"
      {...handlers}
      {...(props as never)}
    />,
  );
  return handlers;
};

afterEach(cleanup);

describe('分享設定', () => {
  /* A tap on 公開 must not quietly put a list on the internet. */
  it('publishes nothing until 發布 is pressed', async () => {
    const { onPublish } = sheet();

    await userEvent.click(screen.getByTestId('collection-visibility-public'));
    expect(onPublish).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('collection-publish'));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onPublish.mock.calls[0][0].visibility).toBe('public');
  });

  it('carries the switches into what it publishes', async () => {
    const { onPublish } = sheet();

    await userEvent.click(screen.getByTestId('collection-visibility-link'));
    await userEvent.click(screen.getByTestId('collection-switch-photos'));
    await userEvent.click(screen.getByTestId('collection-publish'));

    expect(onPublish.mock.calls[0][0]).toMatchObject({
      visibility: 'link', sharesPhotos: false, sharesOwnNotes: true,
    });
  });

  /*
    The rule most likely to surprise, so it is said out loud rather than
    discovered. A place saved from somebody's post carries their sentence.
  */
  it('says how many of the notes are actually the owner’s', () => {
    sheet({ places: [place({ notes: [note(ANN, '座位很少'), note(ME, '手沖很好喝')] })] });

    expect(screen.getByTestId('collection-switch-notes').textContent)
      .toContain('共有 2 則筆記，其中 1 則是你寫的');
  });
});

describe('預覽公開版本', () => {
  it('shows what a stranger would see, and never somebody else’s words', async () => {
    sheet({ places: [place({ notes: [note(ANN, '座位很少'), note(ME, '手沖很好喝')] })] });

    await userEvent.click(screen.getByTestId('collection-preview-toggle'));
    const preview = screen.getByTestId('collection-preview');

    expect(within(preview).getByText('Onibus Coffee')).toBeTruthy();
    expect(within(preview).getByText('手沖很好喝')).toBeTruthy();
    expect(preview.textContent).not.toContain('座位很少');
  });

  /* The preview answers for the switches on screen, not the ones last saved. */
  it('follows the switches', async () => {
    sheet();

    await userEvent.click(screen.getByTestId('collection-preview-toggle'));
    expect(screen.getByTestId('collection-preview').textContent).toContain('東京都目黑區');

    await userEvent.click(screen.getByTestId('collection-switch-details'));
    expect(screen.getByTestId('collection-preview').textContent).not.toContain('東京都目黑區');
    /* Still named, still in its city: withholding the address is not hiding it. */
    expect(screen.getByTestId('collection-preview').textContent).toContain('東京');
  });
});

describe('一個還沒公開的收藏集', () => {
  it('offers no link at all', () => {
    sheet();
    expect(screen.queryByTestId('collection-live-link')).toBeNull();
  });

  it('cannot be unpublished', async () => {
    const { onUnpublish } = sheet();

    await userEvent.click(screen.getByTestId('collection-visibility-private'));
    expect(screen.getByTestId('collection-unpublish')).toHaveProperty('disabled', true);
    expect(onUnpublish).not.toHaveBeenCalled();
  });
});
