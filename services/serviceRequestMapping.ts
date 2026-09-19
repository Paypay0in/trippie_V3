import {
  AssistanceNeed,
  ServiceCategory,
  ServiceRequest,
  ServiceRequestStatus,
  ServiceRequestTask,
  ServiceRequestType,
} from '../types';

/**
 * Between the app's shape and the table's.
 *
 * Kept apart from the network calls so the conversion can be tested without a
 * database, the way the trip and community mappings already are.
 */

export interface ServiceRequestRow {
  id: string;
  trip_id: string;
  requested_by_user_id: string;
  type: string;
  title: string;
  goal: string | null;
  service_category: string;
  location: string;
  requested_date: string | null;
  requested_time: string | null;
  language_needs: string[] | null;
  assistance_needs: string[] | null;
  status: string;
  created_at: string;
}

export interface ServiceRequestTaskRow {
  request_id: string;
  source_task_id: string;
  task_name: string;
  position: number;
}

const TYPES: ServiceRequestType[] = ['task_bundle', 'consultation', 'accompaniment'];
const CATEGORIES: ServiceCategory[] = ['booking', 'translation', 'consultation', 'on_site', 'other'];
const NEEDS: AssistanceNeed[] = ['phone_call', 'on_site', 'translation', 'multi_contact', 'other'];
const STATUSES: ServiceRequestStatus[] = ['requested', 'in_progress', 'completed', 'cancelled'];

export const toRequestRow = (request: ServiceRequest): ServiceRequestRow => ({
  id: request.id,
  trip_id: request.tripId,
  requested_by_user_id: request.requestedByUserId,
  type: request.type,
  title: request.title,
  goal: request.goal?.trim() || null,
  service_category: request.serviceCategory,
  location: request.location,
  // Empty stays null: an empty string would round-trip as a date the helper
  // thinks was chosen.
  requested_date: request.requestedDate?.trim() || null,
  requested_time: request.requestedTime?.trim() || null,
  language_needs: request.languageNeeds,
  assistance_needs: request.assistanceNeeds,
  status: request.status,
  created_at: request.createdAt,
});

export const toTaskRows = (request: ServiceRequest): ServiceRequestTaskRow[] =>
  request.tasks.map((task, index) => ({
    request_id: request.id,
    source_task_id: task.sourceTaskId,
    task_name: task.taskName,
    position: typeof task.position === 'number' ? task.position : index,
  }));

export const fromRequestRow = (
  row: ServiceRequestRow,
  taskRows: ServiceRequestTaskRow[] = [],
): ServiceRequest => ({
  id: row.id,
  tripId: row.trip_id,
  requestedByUserId: row.requested_by_user_id,
  type: TYPES.includes(row.type as ServiceRequestType) ? (row.type as ServiceRequestType) : 'task_bundle',
  title: row.title,
  goal: row.goal || undefined,
  serviceCategory: CATEGORIES.includes(row.service_category as ServiceCategory)
    ? (row.service_category as ServiceCategory)
    : 'other',
  location: row.location || '',
  requestedDate: row.requested_date || undefined,
  requestedTime: row.requested_time || undefined,
  languageNeeds: row.language_needs ?? [],
  assistanceNeeds: (row.assistance_needs ?? []).filter((need): need is AssistanceNeed =>
    NEEDS.includes(need as AssistanceNeed),
  ),
  status: STATUSES.includes(row.status as ServiceRequestStatus)
    ? (row.status as ServiceRequestStatus)
    : 'requested',
  createdAt: row.created_at,
  tasks: taskRows
    .filter(task => task.request_id === row.id)
    .sort((a, b) => a.position - b.position)
    .map(
      (task): ServiceRequestTask => ({
        sourceTaskId: task.source_task_id,
        taskName: task.task_name,
        position: task.position,
      }),
    ),
});
