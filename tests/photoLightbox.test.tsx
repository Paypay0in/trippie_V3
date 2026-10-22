/**
 * @vitest-environment jsdom
 *
 * 「點擊照片能讓他變大嗎」.
 *
 * A day's photographs are 64px squares — enough to recognise a picture, and
 * nowhere near enough to look at one. A receipt is unreadable at that size,
 * and reading it back is most of why it was photographed.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PhotoLightbox from '../components/PhotoLightbox';

afterEach(cleanup);

const shots = ['one', 'two', 'three'];

const open = (props: Record<string, unknown> = {}) => {
  const onIndex = vi.fn();
  const onClose = vi.fn();
  render(<PhotoLightbox photos={shots} index={0} onIndex={onIndex} onClose={onClose} {...props} />);
  return { onIndex, onClose };
};

describe('the lightbox', () => {
  it('shows the photograph it was opened on, and where it is in the set', () => {
    open({ index: 1 });

    expect(screen.getByTestId('photo-lightbox-image').getAttribute('src')).toBe('two');
    expect(screen.getByTestId('photo-lightbox-count').textContent).toBe('2 / 3');
  });

  it('moves through the set', () => {
    const { onIndex } = open({ index: 1 });

    fireEvent.click(screen.getByTestId('photo-lightbox-next'));
    expect(onIndex).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId('photo-lightbox-prev'));
    expect(onIndex).toHaveBeenCalledWith(0);
  });

  /* No arrow pointing at nothing. */
  it('offers no way past either end', () => {
    cleanup();
    open({ index: 0 });
    expect(screen.queryByTestId('photo-lightbox-prev')).toBeNull();

    cleanup();
    open({ index: 2 });
    expect(screen.queryByTestId('photo-lightbox-next')).toBeNull();
  });

  it('closes on the backdrop and on the button', () => {
    const { onClose } = open();

    fireEvent.click(screen.getByTestId('photo-lightbox-close'));
    fireEvent.click(screen.getByTestId('photo-lightbox'));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  /* Pressing the picture itself is not asking to leave. */
  it('stays open when the photograph is pressed', () => {
    const { onClose } = open();

    fireEvent.click(screen.getByTestId('photo-lightbox-image'));

    expect(onClose).not.toHaveBeenCalled();
  });

  /*
    A full-screen overlay with no keyboard way out is a trap on a laptop, and
    this app runs on one.
  */
  it('answers the keyboard', () => {
    const { onIndex, onClose } = open({ index: 1 });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndex).toHaveBeenCalledWith(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  /* An index past the end is clamped rather than drawn as a blank screen. */
  it('clamps an index that is out of range', () => {
    open({ index: 99 });

    expect(screen.getByTestId('photo-lightbox-image').getAttribute('src')).toBe('three');
  });

  it('draws nothing at all when there are no photographs', () => {
    render(<PhotoLightbox photos={[]} index={0} onIndex={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByTestId('photo-lightbox')).toBeNull();
  });

  /* One photograph needs no counter and no arrows. */
  it('is bare for a single photograph', () => {
    render(<PhotoLightbox photos={['only']} index={0} onIndex={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByTestId('photo-lightbox-count')).toBeNull();
    expect(screen.queryByTestId('photo-lightbox-next')).toBeNull();
  });
});
