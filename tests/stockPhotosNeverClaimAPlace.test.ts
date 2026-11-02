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
  it('tells the reader a stock image is illustrative', () => {
    const collection = readFileSync(resolve(COMPONENTS, 'SavedTravelDestinationDetail.tsx'), 'utf8');

    expect(collection).toContain('saved.decorativeImage');
  });

  /*
    The cover left this guard by answering the question instead of labelling
    it. 「我覺得是台北車站還是太怪了」 — so it stopped searching stock entirely
    and now shows the photo Google holds against the destination's own
    placeId. The 示意圖片 badge existed to warn that the picture might not be
    the place; keeping it on a photo attached to that place would make the
    badge the false statement.

    Asserted as 「does not search by name」 rather than 「uses placeId」 alone,
    because the defect was never the photo: it was asking a ranking engine a
    question only an identity can answer.
  */
  it('does not ask a stock library for the trip cover at all', () => {
    const cover = readFileSync(resolve(COMPONENTS, 'TripCover.tsx'), 'utf8');

    expect(cover).not.toContain('destinationImageService');
    expect(cover).not.toContain('saved.decorativeImage');
    expect(cover).toContain('fetchPlacePhoto');
    expect(cover).toContain('placeId');
  });
});
