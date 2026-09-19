import { ServiceRequest, ServiceRequestStatus } from '../types';
import { supabase } from './supabaseClient';
import { SyncResult } from './tripSync';
import {
  ServiceRequestRow,
  ServiceRequestTaskRow,
  fromRequestRow,
  toRequestRow,
  toTaskRows,
} from './serviceRequestMapping';

/**
 * Reading and writing help requests.
 *
 * v1 is requester-only: the policies in 0003 let an account see nothing but
 * its own requests, so these calls carry no notion of a provider. Fails soft
 * like the rest of the sync layer — a network that is down must not lose the
 * request someone just wrote out.
 */

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : String(error),
});

export const fetchMyServiceRequests = async (): Promise<SyncResult<ServiceRequest[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []) as ServiceRequestRow[];
    if (rows.length === 0) return { status: 'ok', data: [] };

    const { data: taskData, error: taskError } = await supabase
      .from('service_request_tasks')
      .select('*')
      .in('request_id', rows.map(row => row.id));
    if (taskError) throw taskError;

    const taskRows = (taskData ?? []) as ServiceRequestTaskRow[];
    return { status: 'ok', data: rows.map(row => fromRequestRow(row, taskRows)) };
  } catch (error) {
    return failed(error);
  }
};

export const publishServiceRequest = async (
  request: ServiceRequest,
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase
      .from('service_requests')
      .upsert(toRequestRow(request), { onConflict: 'id' });
    if (error) throw error;

    const rows = toTaskRows(request);
    if (rows.length > 0) {
      const { error: taskError } = await supabase
        .from('service_request_tasks')
        .upsert(rows, { onConflict: 'request_id,source_task_id' });
      if (taskError) throw taskError;
    }
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

export const updateServiceRequestStatus = async (
  requestId: string,
  status: ServiceRequestStatus,
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase
      .from('service_requests')
      .update({ status })
      .eq('id', requestId);
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

export const deleteServiceRequest = async (requestId: string): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    // The task rows go with it through the foreign key's cascade.
    const { error } = await supabase.from('service_requests').delete().eq('id', requestId);
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};
