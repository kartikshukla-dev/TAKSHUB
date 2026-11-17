import { useEffect, useState } from 'react';
import * as ws from '../../api/workspace';
import Icon from '../Icon';
import { Avatar } from '../ui';
import { timeAgo } from '../../utils/format';
import MessageItem from './MessageItem';
import Composer from './Composer';
import { previewText } from './format';

function PanelShell({ title, icon, onClose, children }) {
  return (
    <aside className="chat-panel" aria-label={title}>
      <header className="chat-panel-head">
        <Icon name={icon} size={15} />
        <strong>{title}</strong>
        <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close panel">
          <Icon name="x" size={15} />
        </button>
      </header>
      <div className="chat-panel-body">{children}</div>
    </aside>
  );
}

export function ThreadPanel({ thread, meId, usersById, ctx, actions, members, allowChannelMention, onSend, onClose }) {
  return (
    <PanelShell title="Thread" icon="reply" onClose={onClose}>
      {!thread ? (
        <p className="muted small">Loading…</p>
      ) : (
        <>
          <MessageItem message={thread.parent} meId={meId} usersById={usersById} ctx={ctx} actions={actions} inThread />
          <div className="thread-divider">
            {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
          </div>
          {thread.replies.map((r, i) => {
            const prev = thread.replies[i - 1];
            const grouped = prev && prev.sender?._id === r.sender?._id && new Date(r.createdAt) - new Date(prev.createdAt) < 5 * 60000;
            return <MessageItem key={r._id} message={r} meId={meId} usersById={usersById} ctx={ctx} actions={actions} grouped={grouped} inThread />;
          })}
          <Composer compact placeholder="Reply…" members={members} meId={meId} allowChannelMention={allowChannelMention} onSend={onSend} autoFocus />
        </>
      )}
    </PanelShell>
  );
}

function MessageList({ messages, convTitle, onJump, empty }) {
  if (messages === null) return <p className="muted small">Loading…</p>;
  if (messages.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <ul className="panel-list">
      {messages.map((m) => (
        <li key={m._id}>
          <button type="button" className="panel-item" onClick={() => onJump(m)}>
            <span className="panel-item-head">
              <Avatar user={m.sender} size="xs" />
              <strong>{m.sender?.name}</strong>
              <span className="muted small">
                {convTitle(m.conversation)} · {timeAgo(m.createdAt)}
              </span>
            </span>
            <span className="panel-item-text">{previewText(m)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PinsPanel({ conversationId, refreshKey, convTitle, onJump, onClose }) {
  const [messages, setMessages] = useState(null);
  useEffect(() => {
    ws.listPins(conversationId).then(setMessages).catch(() => setMessages([]));
  }, [conversationId, refreshKey]);
  return (
    <PanelShell title="Pinned" icon="pin" onClose={onClose}>
      <MessageList messages={messages} convTitle={convTitle} onJump={onJump} empty="Nothing pinned yet. Use ⋯ → Pin on a message." />
    </PanelShell>
  );
}

export function SavedPanel({ refreshKey, convTitle, onJump, onClose }) {
  const [messages, setMessages] = useState(null);
  useEffect(() => {
    ws.listSaved().then(setMessages).catch(() => setMessages([]));
  }, [refreshKey]);
  return (
    <PanelShell title="Saved items" icon="bookmark" onClose={onClose}>
      <MessageList messages={messages} convTitle={convTitle} onJump={onJump} empty="Save messages with the bookmark icon to find them here." />
    </PanelShell>
  );
}

export function SearchPanel({ convTitle, onJump, onClose }) {
  const [q, setQ] = useState('');
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setMessages([]);
      return undefined;
    }
    const t = setTimeout(() => ws.searchChat(q.trim()).then(setMessages).catch(() => setMessages([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <PanelShell title="Search messages" icon="search" onClose={onClose}>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all your chats" aria-label="Search text" autoFocus />
      {q.trim().length >= 2 && <MessageList messages={messages} convTitle={convTitle} onJump={onJump} empty="No messages match." />}
    </PanelShell>
  );
}
