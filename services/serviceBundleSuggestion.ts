import { ShoppingItem } from '../types';
import { TaskBundleProposal, keepProposalsWithKnownTasks, proposeTaskBundles } from './taskBundling';

/**
 * A grouping suggestion, from the model when it answers and from arithmetic
 * when it does not.
 *
 * The model is allowed to propose which eligible tasks belong together, what to
 * call the bundle and why — nothing else. It never decides that a task needs a
 * person, never publishes, and every id it returns is checked against the real
 * checklist before anything is shown. On the night this was written the Gemini
 * quota was exhausted, which is the ordinary case this fallback exists for, not
 * an exceptional one.
 */

export const suggestTaskBundles = async (
  tasks: ShoppingItem[],
  destination?: string,
): Promise<TaskBundleProposal[]> => {
  const local = proposeTaskBundles(tasks, destination);
  if (tasks.length < 2) return local;

  try {
    const response = await fetch('/api/service-bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination,
        tasks: tasks.map(task => ({ id: task.id, name: task.name })),
      }),
    });
    if (!response.ok) return local;
    const data = await response.json();
    const proposals: TaskBundleProposal[] = Array.isArray(data?.bundles)
      ? data.bundles.map((bundle: any, index: number) => ({
          id: typeof bundle?.id === 'string' ? bundle.id : `ai-${index + 1}`,
          suggestedTitle: typeof bundle?.suggestedTitle === 'string' ? bundle.suggestedTitle.trim() : '',
          taskIds: Array.isArray(bundle?.taskIds) ? bundle.taskIds.filter((id: unknown) => typeof id === 'string') : [],
          reason: typeof bundle?.reason === 'string' ? bundle.reason.trim() || undefined : undefined,
        }))
      : [];

    // Ids are checked against the checklist, not trusted: a bundle naming a
    // task that does not exist would publish a request with a blank line in it.
    const checked = keepProposalsWithKnownTasks(
      proposals.filter(proposal => proposal.suggestedTitle),
      tasks,
    );
    return checked.length > 0 ? checked : local;
  } catch {
    return local;
  }
};
