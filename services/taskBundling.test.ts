import { describe, expect, it } from 'vitest';
import { ShoppingItem } from '../types';
import { keepProposalsWithKnownTasks, proposeTaskBundles } from './taskBundling';

const task = (id: string, name: string): ShoppingItem => ({
  id,
  name,
  isPurchased: false,
  phase: 'pre',
});

describe('task bundling', () => {
  it('puts one errand together', () => {
    const tasks = [
      task('t1', '查詢滑雪場裝備全套租借服務'),
      task('t2', '預約橫濱 Snova 室內滑雪場'),
      task('t3', '確認富士山 Snow Town Yeti 的開場日期'),
    ];
    const [bundle] = proposeTaskBundles(tasks, '日本');
    expect(bundle.taskIds).toEqual(expect.arrayContaining(['t1', 't2']));
    expect(bundle.suggestedTitle).toContain('滑雪');
  });

  it('does not bundle two tasks merely because they share a trip', () => {
    const tasks = [task('t1', '預約東京餐廳'), task('t2', '處理大阪遺失行李')];
    expect(proposeTaskBundles(tasks, '日本')).toEqual([]);
  });

  it('ignores the destination as a reason to group', () => {
    // Everything on a Japan trip says 日本; grouping on it would make the whole
    // checklist a single job.
    const tasks = [task('t1', '日本藥妝店採購'), task('t2', '日本租車手續')];
    expect(proposeTaskBundles(tasks, '日本')).toEqual([]);
  });

  it('says why it grouped them', () => {
    const tasks = [task('t1', '預約滑雪課程'), task('t2', '查詢滑雪裝備租借')];
    expect(proposeTaskBundles(tasks)[0].reason).toContain('滑雪');
  });

  it('proposes nothing for a single task', () => {
    expect(proposeTaskBundles([task('t1', '預約滑雪課程')])).toEqual([]);
  });

  it('drops a proposal naming a task that does not exist', () => {
    // The same guard runs over a model's answer, where an invented id would
    // publish a request with a blank line in it.
    const tasks = [task('t1', '預約滑雪課程'), task('t2', '查詢滑雪裝備租借')];
    const kept = keepProposalsWithKnownTasks(
      [{ id: 'b1', suggestedTitle: '滑雪協助', taskIds: ['t1', 't2', 'ghost'] }],
      tasks,
    );
    expect(kept[0].taskIds).toEqual(['t1', 't2']);
  });

  it('drops a proposal left with fewer than two real tasks', () => {
    const kept = keepProposalsWithKnownTasks(
      [{ id: 'b1', suggestedTitle: '滑雪協助', taskIds: ['ghost', 'phantom'] }],
      [task('t1', '預約滑雪課程')],
    );
    expect(kept).toEqual([]);
  });
});
