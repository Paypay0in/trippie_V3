import { describe, expect, it } from 'vitest';
import { driftLooksLikeAnOverwrite, identityDrift } from './tripIdentityDrift';

/**
 * 「我的釜山不見了」 — it was overwritten locally, and the cloud still has the name.
 */
describe('identityDrift', () => {
  const cloud = [
    { id: 'tokyo', name: '東京', destination: 'Tokyo', startDate: '2026-10-20', endDate: '2026-10-24' },
    { id: 'busan', name: '釜山', destination: 'Busan', startDate: '2026-10-02', endDate: '2026-10-06' },
  ];

  it('finds the trip wearing another trip\'s name', () => {
    const drafts = [
      { id: 'tokyo', name: '東京' },
      { id: 'busan', name: '東京' },
    ];
    expect(identityDrift(drafts, cloud)).toEqual([{
      id: 'busan',
      localName: '東京',
      cloudName: '釜山',
      cloudDestination: 'Busan',
      cloudStartDate: '2026-10-02',
      cloudEndDate: '2026-10-06',
    }]);
  });

  it('says nothing when both agree', () => {
    expect(identityDrift([{ id: 'busan', name: '釜山' }], cloud)).toEqual([]);
  });

  it('ignores a trip the cloud has never heard of', () => {
    expect(identityDrift([{ id: 'seoul', name: '首爾' }], cloud)).toEqual([]);
  });

  it('never offers a placeholder over a name somebody typed', () => {
    const placeholder = [{ id: 'busan', name: '未命名旅程' }];
    expect(identityDrift([{ id: 'busan', name: '釜山之旅' }], placeholder)).toEqual([]);
  });

  /*
    The reason this is a report and not a repair: `ensureTripRow` never updates
    the row, so a rename the traveller meant drifts exactly like an overwrite.
  */
  it('reports a deliberate rename too, because the data cannot tell them apart', () => {
    const renamed = [{ id: 'busan', name: '釜山吃到飽' }];
    expect(identityDrift(renamed, cloud)).toEqual([
      expect.objectContaining({ id: 'busan', localName: '釜山吃到飽', cloudName: '釜山' }),
    ]);
  });
});

describe('driftLooksLikeAnOverwrite', () => {
  const drift = { id: 'busan', localName: '東京', cloudName: '釜山' };

  it('is true when another trip on the shelf already has that name', () => {
    expect(driftLooksLikeAnOverwrite(drift, [
      { id: 'tokyo', name: '東京' },
      { id: 'busan', name: '東京' },
    ])).toBe(true);
  });

  it('is false for a rename that collides with nothing', () => {
    expect(driftLooksLikeAnOverwrite(
      { id: 'busan', localName: '釜山吃到飽', cloudName: '釜山' },
      [{ id: 'tokyo', name: '東京' }, { id: 'busan', name: '釜山吃到飽' }],
    )).toBe(false);
  });
});
