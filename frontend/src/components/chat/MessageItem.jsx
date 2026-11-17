import { useState } from 'react';
import Icon from '../Icon';
import { Avatar } from '../ui';
import { formatDateTime, timeAgo, idOf } from '../../utils/format';
import { QUICK_REACTIONS, RichText, firstLink, timeLabel } from './format';
import { EmojiPicker, FileList, SnippetView } from './MessageParts';

/**
 * One chat message with Slack-style hover actions.
 * props: message, meId, grouped, usersById, ctx (mention names),
 *        actions: { react, reply, edit, remove, pin, save, toTask, openThread }
 *        seenText, highlight, inThread
 */
export default function MessageItem({ message: m, meId, grouped, usersById, ctx, actions, seenText, highlight, inThread }) {
  const mine = idOf(m.sender) === meId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const deleted = Boolean(m.deletedAt);
  const link = !deleted && firstLink(m.text);

  const saveEdit = async () => {
    const next = draft.trim();
    if (next === m.text) return setEditing(false);
    if (await actions.edit(m, next)) setEditing(false);
    return undefined;
  };

  const reactorNames = (r) =>
    r.users
      .map((u) => (u === meId ? 'You' : usersById[u]?.name || 'Someone'))
      .join(', ');

  return (
    <div
      id={`msg-${m._id}`}
      className={`cmsg ${grouped ? 'cmsg-grouped' : ''} ${highlight ? 'cmsg-highlight' : ''} ${m.pinnedAt ? 'cmsg-pinned' : ''}`}
      onMouseLeave={() => setMenu(false)}
    >
      <div className="cmsg-gutter">
        {grouped ? (
          <span className="cmsg-time-hover" title={formatDateTime(m.createdAt)}>
            {timeLabel(m.createdAt)}
          </span>
        ) : (
          <Avatar user={m.sender} size="sm" />
        )}
      </div>
      <div className="cmsg-body">
        {!grouped && (
          <div className="cmsg-meta">
            <strong>{m.sender?.name}</strong>
            <span className="muted small" title={formatDateTime(m.createdAt)}>
              {timeLabel(m.createdAt)}
            </span>
          </div>
        )}
        {m.pinnedAt && (
          <div className="cmsg-flag">
            <Icon name="pin" size={12} /> Pinned
          </div>
        )}

        {deleted ? (
          <p className="cmsg-deleted">This message was deleted</p>
        ) : editing ? (
          <div className="cmsg-edit">
            <textarea
              className="input"
              value={draft}
              rows={Math.min(8, draft.split('\n').length + 1)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === 'Escape') setEditing(false);
              }}
              aria-label="Edit message"
              autoFocus
            />
            <div className="cmsg-edit-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            {m.text && <RichText text={m.text} ctx={ctx} />}
            {m.editedAt && <span className="cmsg-edited">(edited)</span>}
            {m.snippet && <SnippetView snippet={m.snippet} />}
            {m.files?.length > 0 && <FileList message={m} />}
            {link && (
              <a className="link-card" href={link.href} target="_blank" rel="noopener noreferrer">
                <strong>{link.host}</strong>
                <span className="muted small">{link.path || '/'}</span>
              </a>
            )}
          </>
        )}

        {m.reactions?.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`reaction ${r.users.includes(meId) ? 'reaction-mine' : ''}`}
                onClick={() => actions.react(m, r.emoji)}
                title={reactorNames(r)}
              >
                {r.emoji} <span>{r.users.length}</span>
              </button>
            ))}
          </div>
        )}

        {!inThread && m.replyCount > 0 && (
          <button type="button" className="thread-link" onClick={() => actions.openThread(m)}>
            <Icon name="reply" size={13} /> {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
            {m.lastReplyAt && <span className="muted small"> · last reply {timeAgo(m.lastReplyAt)}</span>}
          </button>
        )}
        {seenText && <div className="seen">{seenText}</div>}
      </div>

      {!deleted && !editing && (
        <div className="cmsg-actions" role="toolbar" aria-label="Message actions">
          {QUICK_REACTIONS.slice(0, 3).map((e) => (
            <button key={e} type="button" className="icon-btn icon-btn-sm" onClick={() => actions.react(m, e)} aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
          <div className="popover-anchor">
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => setPicker((v) => !v)} aria-label="Add reaction" title="Add reaction">
              <Icon name="smile" size={15} />
            </button>
            {picker && (
              <EmojiPicker
                align="right"
                onClose={() => setPicker(false)}
                onPick={(e) => {
                  setPicker(false);
                  actions.react(m, e);
                }}
              />
            )}
          </div>
          {!inThread && (
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => actions.openThread(m)} aria-label="Reply in thread" title="Reply in thread">
              <Icon name="reply" size={15} />
            </button>
          )}
          <button
            type="button"
            className={`icon-btn icon-btn-sm ${m.saved ? 'is-on' : ''}`}
            onClick={() => actions.save(m)}
            aria-label={m.saved ? 'Remove from saved' : 'Save message'}
            title={m.saved ? 'Saved' : 'Save for later'}
          >
            <Icon name="bookmark" size={15} />
          </button>
          <div className="popover-anchor">
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => setMenu((v) => !v)} aria-label="More actions" title="More">
              <Icon name="more" size={15} />
            </button>
            {menu && (
              <div className="popover cmsg-menu">
                <button type="button" className="menu-item" onClick={() => { setMenu(false); actions.pin(m); }}>
                  <Icon name="pin" size={14} /> {m.pinnedAt ? 'Unpin' : 'Pin to conversation'}
                </button>
                <button type="button" className="menu-item" onClick={() => { setMenu(false); actions.toTask(m); }}>
                  <Icon name="taskAdd" size={14} /> Create task from message
                </button>
                {m.text && (
                  <button type="button" className="menu-item" onClick={() => { setMenu(false); navigator.clipboard?.writeText(m.text); }}>
                    <Icon name="copy" size={14} /> Copy text
                  </button>
                )}
                {mine && m.text !== undefined && (
                  <button type="button" className="menu-item" onClick={() => { setMenu(false); setDraft(m.text); setEditing(true); }}>
                    <Icon name="pen" size={14} /> Edit message
                  </button>
                )}
                {mine && (
                  <button type="button" className="menu-item text-danger" onClick={() => { setMenu(false); actions.remove(m); }}>
                    <Icon name="trash" size={14} /> Delete message
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
