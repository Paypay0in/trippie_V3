import { describe, expect, it } from 'vitest';
import { ServiceRequest } from '../types';
import { fromRequestRow, toRequestRow, toTaskRows } from './serviceRequestMapping';

const request: ServiceRequest = {
  id: 'r1',
  tripId: 'trip-1',
  requestedByUserId: 'user-1',
  type: 'task_bundle',
  title: '滑雪行前協助',
  goal: '想在出發前把雪場的事情確定好',
  serviceCategory: 'booking',
  location: '日本・橫濱',
  languageNeeds: ['日文'],
  assistanceNeeds: ['phone_call', 'translation'],
  status: 'requested',
  createdAt: '2026-09-16T00:00:00.000Z',
  tasks: [
    { sourceTaskId: 't2', taskName: '預約橫濱 Snova 室內滑雪場', position: 1 },
    { sourceTaskId: 't1', taskName: '查詢滑雪裝備租借', position: 0 },
  ],
};

describe('service request mapping', () => {
  it('round-trips a request with its tasks in order', () => {
    const row = toRequestRow(request);
    const restored = fromRequestRow(row, toTaskRows(request));
    expect(restored.tasks.map(task => task.sourceTaskId)).toEqual(['t1', 't2']);
    expect(restored.title).toBe('滑雪行前協助');
    expect(restored.assistanceNeeds).toEqual(['phone_call', 'translation']);
  });

  it('keeps an unset date null rather than empty', () => {
    // An empty string would come back as a date the helper believes was chosen.
    const row = toRequestRow({ ...request, requestedDate: '  ', requestedTime: '' });
    expect(row.requested_date).toBeNull();
    expect(row.requested_time).toBeNull();
    expect(fromRequestRow(row).requestedDate).toBeUndefined();
  });

  it('keeps the canonical task id alongside the snapshot', () => {
    const rows = toTaskRows(request);
    expect(rows.map(row => row.source_task_id)).toEqual(['t2', 't1']);
    expect(rows[0].task_name).toBe('預約橫濱 Snova 室內滑雪場');
  });

  it('falls back rather than trusting an unknown value from the row', () => {
    const restored = fromRequestRow({
      ...toRequestRow(request),
      type: 'something_else',
      service_category: 'made_up',
      status: 'weird',
      assistance_needs: ['phone_call', 'nonsense'],
    });
    expect(restored.type).toBe('task_bundle');
    expect(restored.serviceCategory).toBe('other');
    expect(restored.status).toBe('requested');
    expect(restored.assistanceNeeds).toEqual(['phone_call']);
  });

  it('only takes the tasks belonging to this request', () => {
    const restored = fromRequestRow(toRequestRow(request), [
      ...toTaskRows(request),
      { request_id: 'other', source_task_id: 'x', task_name: '別人的任務', position: 0 },
    ]);
    expect(restored.tasks).toHaveLength(2);
  });
});
