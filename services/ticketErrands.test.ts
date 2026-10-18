/**
 * 「這邊就是可以服務功能可以出現的地方～ 可以發包要求給別人」.
 */
import { describe, expect, it } from 'vitest';
import { ERRAND_ID_PREFIX, ticketErrands } from './ticketErrands';

describe('handing a booking to somebody else', () => {
  it('says what the job is before it says where', () => {
    const [errand] = ticketErrands([
      { itemId: 'i1', placeName: 'Yoroniku', kind: 'booking', date: '2026-10-22' },
    ]);

    expect(errand.name).toBe('訂位：Yoroniku（10/22）');
  });

  /* 「購票」 and 「訂位」 are different errands at different places. */
  it('keeps a ticket apart from a table', () => {
    const [errand] = ticketErrands([
      { itemId: 'i2', placeName: 'teamLab', kind: 'ticket', date: '2026-10-23' },
    ]);

    expect(errand.name).toBe('購票：teamLab（10/23）');
  });

  /* An errand with no day on it is still an errand. */
  it('leaves the date out when there is none', () => {
    const [errand] = ticketErrands([{ itemId: 'i3', placeName: '鮨 さいとう', kind: 'booking' }]);

    expect(errand.name).toBe('訂位：鮨 さいとう');
  });

  it('carries a link for whoever picks it up', () => {
    const [errand] = ticketErrands([
      { itemId: 'i4', placeName: 'teamLab', kind: 'ticket', bookingUrl: 'https://example.com/t' },
    ]);

    expect(errand.description).toContain('https://example.com/t');
  });

  /* A synthetic id must never collide with a real to-do's. */
  it('prefixes the id', () => {
    const [errand] = ticketErrands([{ itemId: 'i5', placeName: 'X', kind: 'booking' }]);

    expect(errand.id).toBe(`${ERRAND_ID_PREFIX}i5`);
  });

  /* It is a thing still to do, by definition: nothing arrives already done. */
  it('is never already done', () => {
    expect(ticketErrands([{ itemId: 'i6', placeName: 'X', kind: 'booking' }])[0].isPurchased).toBe(false);
    expect(ticketErrands([{ itemId: 'i6', placeName: 'X', kind: 'booking' }])[0].phase).toBe('pre');
  });
});
