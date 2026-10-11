/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import CreateCommunityPostScreen from '../components/CreateCommunityPostScreen';
import { CommunityPost, UserProfile } from '../types';

/**
 * 「用戶新增貼文可以上傳照片」.
 *
 * He could already. This test is about why he could not find it: the screen led
 * with 封面圖片網址（選填）and placeholder https://… among the text fields, and
 * put the camera-roll picker below all five of them. Asking a person holding a
 * phone for the public URL of a photo that only exists in their camera roll is
 * the avatar field's mistake, two screens over.
 *
 * So these assert position, not existence. A picker that exists but sits under
 * a URL box is the bug being fixed, and it would pass any test that only looked
 * for the input.
 */

const profile = { name: '北', avatar: '' } as UserProfile;
const noop = () => {};

afterEach(cleanup);

const renderScreen = (initialPost?: CommunityPost) =>
  render(
    <CreateCommunityPostScreen
      userId="u1"
      profile={profile}
      initialPost={initialPost}
      onBack={noop}
      onSave={noop}
      onPublish={noop}
    />,
  );

describe('adding a photo to a post', () => {
  it('offers the camera roll before any text field', () => {
    renderScreen();
    const photos = screen.getByTestId('post-photos');
    const title = screen.getByPlaceholderText('東京三日遊');

    // compareDocumentPosition: FOLLOWING means `title` comes after `photos`.
    const relation = photos.compareDocumentPosition(title);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not ask for a URL as the way to add a picture', () => {
    renderScreen();
    expect(screen.queryByPlaceholderText('https://...')).toBeNull();
    expect(screen.queryByText('封面圖片網址（選填）')).toBeNull();
  });

  it('keeps a link as a secondary way to set a cover', () => {
    renderScreen();
    expect(screen.getByTestId('cover-url')).toBeTruthy();
  });

  it('withdraws the link once there are photos, so the cover has one source', () => {
    renderScreen({
      id: 'p1', creatorId: 'u1', authorName: '北', title: '', content: '',
      country: '', city: '', photos: ['data:image/jpeg;base64,x'], status: 'draft',
      createdAt: '', updatedAt: '',
    } as CommunityPost);
    expect(screen.queryByTestId('cover-url')).toBeNull();
  });

  it('accepts images from the camera roll, several at a time', () => {
    renderScreen();
    const input = screen.getByTestId('post-photos').querySelector('input[type="file"]');
    expect(input?.getAttribute('accept')).toBe('image/*');
    expect(input?.hasAttribute('multiple')).toBe(true);
  });
});
