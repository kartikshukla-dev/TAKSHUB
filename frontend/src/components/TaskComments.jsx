import { useMemo, useRef, useState } from 'react';
import * as tasksApi from '../api/tasks';
import { idOf, timeAgo } from '../utils/format';
import { RichText } from './chat/format';
import { Avatar } from './ui';
import Icon from './Icon';

const MAX = 5000;

// "@Na" right before the caret -> { start, q }.
function mentionQuery(value, caret) {
  const m = /(^|\s)@([\w.-]*(?: [\w.-]*)?)$/.exec(value.slice(0, caret));
  return m && m[2].length <= 30 ? { start: caret - m[2].length - 1, q: m[2] } : null;
}

/**
 * Task comments: list (with formatting and @mention highlights), edit /
 * delete your own, and a box with @mention suggestions.
 * props: task, projectId, meId, isAdmin, users (directory), isNew(comment),
 *        onTask(updatedTask), onError(message)
 */
export default function TaskComments({ task, projectId, meId, isAdmin, users = [], isNew, onTask, onError }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState([]); // [{ id, name }]
  const [query, setQuery] = useState(null);
  const [pick, setPick] = useState(0);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // comment id
  const [draft, setDraft] = useState('');
  const box = useRef(null);

  const people = useMemo(() => users.filter((u) => u.status !== 'disabled'), [users]);
  const names = useMemo(() => people.map((u) => u.name).filter(Boolean), [people]);
  const me = people.find((u) => idOf(u) === meId);
  const ctx = { names, meName: me?.name };

  const options = useMemo(() => {
    if (!query) return [];
    const q = query.q.toLowerCase();
    return people.filter((u) => idOf(u) !== meId && u.name?.toLowerCase().includes(q)).slice(0, 6);
  }, [query, people, meId]);

  const change = (e) => {
    setText(e.target.value);
    setQuery(mentionQuery(e.target.value, e.target.selectionStart));
    setPick(0);
  };

  const insert = (u) => {
    const caret = box.current.selectionStart;
    const token = `@${u.name} `;
    setText(text.slice(0, query.start) + token + text.slice(caret));
    setPicked((p) => (p.some((x) => x.id === idOf(u)) ? p : [...p, { id: idOf(u), name: u.name }]));
    setQuery(null);
    const pos = query.start + token.length;
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    setNotice('');
    try {
      const mentions = picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      const { task: updated, skippedMentions = [] } = await tasksApi.addComment(projectId, task._id, body, mentions);
      onTask(updated);
      setText('');
      setPicked([]);
      if (skippedMentions.length) {
        setNotice(`${skippedMentions.join(', ')} can't open this task, so they were not notified.`);
      }
    } catch (err) {
      onError(err.response?.data?.message || 'Could not add comment');
    } finally {
      setPosting(false);
    }
  };

  const keyDown = (e) => {
    if (query && options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insert(options[pick]);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const saveEdit = async (c) => {
    const body = draft.trim();
    if (!body || body === c.text) return setEditing(null);
    try {
      onTask(await tasksApi.editComment(projectId, task._id, c._id, body));
      setEditing(null);
    } catch (err) {
      onError(err.response?.data?.message || 'Could not save the comment');
    }
    return undefined;
  };

  const remove = async (c) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      onTask(await tasksApi.deleteComment(projectId, task._id, c._id));
    } catch (err) {
      onError(err.response?.data?.message || 'Could not delete the comment');
    }
  };

  return (
    <>
      <ul className="comment-list">
        {task.comments?.map((c) => {
          const mine = idOf(c.author) === meId;
          const fresh = isNew?.(c);
          return (
            <li key={c._id} className={`comment ${fresh ? 'comment-new' : ''}`}>
              <Avatar user={c.author} size="sm" />
              <div className="comment-body">
                <div className="comment-meta">
                  <strong>{c.author?.name || 'User'}</strong>
                  <span className="muted small">{timeAgo(c.createdAt)}</span>
                  {c.editedAt && <span className="muted small">(edited)</span>}
                  {fresh && <span className="comment-new-tag">New</span>}
                  {editing !== c._id && (mine || isAdmin) && (
                    <span className="comment-actions">
                      {mine && (
                        <button type="button" className="icon-btn icon-btn-sm" onClick={() => { setEditing(c._id); setDraft(c.text); }} aria-label="Edit comment" title="Edit">
                          <Icon name="pen" size={13} />
                        </button>
                      )}
                      <button type="button" className="icon-btn icon-btn-sm" onClick={() => remove(c)} aria-label="Delete comment" title="Delete">
                        <Icon name="trash" size={13} />
                      </button>
                    </span>
                  )}
                </div>
                {editing === c._id ? (
                  <div className="comment-edit">
                    <textarea
                      className="input"
                      rows={Math.min(8, draft.split('\n').length + 1)}
                      value={draft}
                      maxLength={MAX}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit(c);
                        }
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      aria-label="Edit comment"
                      autoFocus
                    />
                    <div className="comment-edit-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEdit(c)}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="comment-text">
                    <RichText text={c.text} ctx={ctx} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {(!task.comments || task.comments.length === 0) && <li className="muted small">No comments yet</li>}
      </ul>

      <form onSubmit={submit} className="comment-form comment-form-mention">
        <div className="comment-box">
          {query && options.length > 0 && (
            <ul className="mention-list" role="listbox" aria-label="People">
              {options.map((u, i) => (
                <li key={idOf(u)}>
                  <button
                    type="button"
                    className={`mention-opt ${i === pick ? 'mention-opt-on' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insert(u);
                    }}
                  >
                    <Avatar user={u} size="xs" />
                    <span>{u.name}</span>
                    {u.jobTitle && <span className="muted small">{u.jobTitle}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={box}
            className="input comment-input"
            rows={Math.min(6, text.split('\n').length)}
            value={text}
            maxLength={MAX}
            onChange={change}
            onKeyDown={keyDown}
            onClick={(e) => setQuery(mentionQuery(text, e.target.selectionStart))}
            placeholder="Write a comment… type @ to mention someone"
            aria-label="Write a comment"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={posting || !text.trim()}>
          Post
        </button>
      </form>
      {notice && <p className="small comment-notice">{notice}</p>}
    </>
  );
}
