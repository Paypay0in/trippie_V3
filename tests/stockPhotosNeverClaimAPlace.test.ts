import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A stock photo never says which place it is of.
 *
 * 「新北市 但圖片是台北」 — Pexels, asked for 「台灣 新北市」, returned Taipei
 * Main Station, because a mid-sized city beside a famous one always will. The
 * fetch was not broken; the markup was, because it asserted what the picture
 * showed.
 *
 * I fixed that on the collection screen, told him it was done, and he sent
 * back a screenshot of the trip cover doing exactly the same thing. Then there
 * were two more in the trip list. One rule, four homes, and I had looked at
 * one of them.
 *
 * So the rule stops being a habit and becomes an assertion: no component may
 * write an alt that names a destination for an image it fetched from a stock
 * provider. The traveller's own photographs are a different thing and are not
 * matched here — those we can vouch for.
 */
const COMPONENTS = resolve(__dirname, '../components');

/** `alt={`${anything} destination …`}` — the shape every one of them used. */
const CLAIMS_A_DESTINATION = /alt=\{`\$\{[^}]*\}\s*destination/;

describe('stock photography', () => {
  it('never carries an alt that claims to be of a destination', () => {
    const offenders = readdirSync(COMPONENTS)
      .filter(name => name.endsWith('.tsx'))
      .filter(name => CLAIMS_A_DESTINATION.test(readFileSync(resolve(COMPONENTS, name), 'utf8')));

    expect(offenders).toEqual([]);
  });

  /*
    The positive half. A guard that only forbids is satisfied by deleting the
    feature, so this states that the screens still mark the picture as
    illustrative rather than silently dropping both the claim and the label.
  */
  it('tells the reader the cover image is illustrative', () => {
    const cover = readFileSync(resolve(COMPONENTS, 'TripCover.tsx'), 'utf8');
    const collection = readFileSync(resolve(COMPONENTS, 'SavedTravelDestinationDetail.tsx'), 'utf8');

    expect(cover).toContain('saved.decorativeImage');
    expect(collection).toContain('saved.decorativeImage');
  });
});
