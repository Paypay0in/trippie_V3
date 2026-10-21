import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 「為什麼沒有辦法定位」 — the location was fine. The route estimate had never
 * once succeeded.
 *
 * It sent `departureTime: new Date().toISOString()`, which is already in the
 * past by the time Google reads it, and Routes answers 「Timestamp must be set
 * to a future time」 with a 400. Every tap on 取得目前位置，估算出發時間 since
 * this existed has ended on 暫時無法計算路線.
 *
 * Read off the source because the request body is the defect: there is no unit
 * to call, and the next person to add a departure time here should have to
 * read why it is absent.
 */
const server = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');

const estimateRoute = (): string => {
  const start = server.indexOf('app.post("/api/routes/estimate"');
  expect(start).toBeGreaterThan(-1);
  const end = server.indexOf('app.post("', start + 10);
  return server.slice(start, end > start ? end : undefined);
};

/** The line that becomes the request, without the prose around it. */
const requestBody = (): string => {
  const block = estimateRoute();
  const line = block.split('\n').find(row => row.includes('JSON.stringify({ origin:'));
  expect(line).toBeTruthy();
  return line as string;
};

describe('the route estimate request', () => {
  it('does not send a departure time at all', () => {
    expect(requestBody()).not.toContain('departureTime');
  });

  /* Without one, Routes reads 「now」, which is what an estimate means. */
  it('still asks for a traffic-aware route', () => {
    expect(requestBody()).toContain('TRAFFIC_AWARE');
  });

  /*
    The client is told only 暫時無法計算路線, and that sentence hid a
    deterministic 400 for as long as this endpoint has existed.
  */
  it('logs what the provider said', () => {
    expect(estimateRoute()).toContain('Routes estimate rejected:');
  });
});

/**
 * The sibling endpoint learned this first: it drops a departure time that has
 * already passed rather than sending it.
 */
describe('the route leg request', () => {
  it('keeps its guard against a departure time in the past', () => {
    expect(server).toContain('Date.parse(departureTime) > Date.now()');
  });
});
