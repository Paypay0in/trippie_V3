import { CommunityPost, PostComment } from '../types';
import { supabase } from './supabaseClient';
import { SyncResult } from './tripSync';
import {
  CommunityPostRow,
  PostCommentRow,
  fromCommentRow,
  fromPostRow,
  toCommentRow,
  toPostRow,
} from './communitySyncMapping';

/**
 * Reading and writing community posts and their comments.
 *
 * Every call fails soft, like the trip ledger's: the local copy keeps working
 * when the network does not, and a failed push never costs someone the post
 * they just wrote.
 */

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : String(error),
});

/**
 * Everything this account may read: published posts by anyone, plus its own
 * drafts. The database decides that, not the client — 不公開 has to mean
 * unreadable rather than merely unrendered.
 */
export const fetchCommunityPosts = async (): Promise<SyncResult<CommunityPost[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return { status: 'ok', data: (data as CommunityPostRow[]).map(fromPostRow) };
  } catch (error) {
    return failed(error);
  }
};

export const pushCommunityPost = async (post: CommunityPost): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase
      .from('community_posts')
      .upsert(toPostRow(post), { onConflict: 'id' });
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

export const deleteCommunityPost = async (postId: string): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase.from('community_posts').delete().eq('id', postId);
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

export const fetchComments = async (postId: string): Promise<SyncResult<PostComment[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return { status: 'ok', data: (data as PostCommentRow[]).map(fromCommentRow) };
  } catch (error) {
    return failed(error);
  }
};

export const pushComment = async (comment: PostComment): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase.from('post_comments').insert(toCommentRow(comment));
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

export const deleteComment = async (commentId: string): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};
