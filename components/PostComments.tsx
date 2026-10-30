import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocaleDate } from '../services/localeFormat';
import { Send, Trash2 } from 'lucide-react';
import { PostComment } from '../types';
import { canDeleteComment } from '../services/postComments';

interface Props {
  comments: PostComment[];
  viewerId: string;
  postCreatorId: string;
  onSubmit: (content: string) => void;
  onDelete: (comment: PostComment) => void;
}

const formatWhen = (iso: string) => formatLocaleDate(iso);

/**
 * The conversation under a post.
 *
 * Oldest first, because a thread read in reverse makes replies arrive before
 * what they answer. Delete is offered to the comment's author and to the post's
 * author — someone should be able to clear something off their own writing
 * without waiting for anyone.
 */
const PostComments: React.FC<Props> = ({ comments, viewerId, postCreatorId, onSubmit, onDelete }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const send = () => {
    if (!draft.trim()) return;
    onSubmit(draft);
    setDraft('');
  };

  return (
    <section className="mt-8">
      <h2 className="text-xl font-black">{t('comments.title')} {comments.length > 0 && <span className="text-base text-slate-400">{comments.length}</span>}</h2>

      <div className="mt-3 space-y-3">
        {comments.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-400 shadow-sm">{t('comments.empty')}</p>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-xs font-black text-violet-700">
                  {comment.authorAvatar
                    ? <img src={comment.authorAvatar} alt="" className="h-full w-full object-cover" />
                    : comment.authorName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-[#11183d]">{comment.authorName}</p>
                  <p className="text-[11px] text-slate-400">{formatWhen(comment.createdAt)}</p>
                </div>
                {canDeleteComment(comment, viewerId, postCreatorId) && (
                  <button
                    type="button"
                    aria-label={t('comments.deleteAria', { excerpt: comment.content.slice(0, 12) })}
                    onClick={() => onDelete(comment)}
                    className="shrink-0 rounded-lg p-2 text-slate-300 hover:text-rose-500"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); send(); } }}
          maxLength={500}
          placeholder={t('comments.placeholder')}
          aria-label={t('comments.inputAria')}
          className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-violet-300"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim()}
          aria-label={t('comments.sendAria')}
          className="flex min-h-11 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </section>
  );
};

export default PostComments;
