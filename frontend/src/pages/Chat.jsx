import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as ws from '../api/workspace';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveContext';
import { useSocketEvent } from '../context/SocketContext';
import { useUsers } from '../hooks/useDirectory';
import Icon from '../components/Icon';
import { Avatar, Modal, PageHeader } from '../components/ui';
import { timeAgo, formatDateTime, idOf } from '../utils/format';

function convTitle(conv, userId) {
  if (conv.type === 'group') return conv.name;
  const other = conv.members.find((m) => idOf(m) !== userId);
  return other?.name || 'Direct message';
}

function convPeer(conv, userId) {
  return conv.type === 'direct' ? conv.members.find((m) => idOf(m) !== userId) : null;
}

function NewGroupModal({ users, userId, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e) => {
    e.preventDefault();
    try {
      await onCreate(name, picked);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create group');
    }
  };

  return (
    <Modal
      title="New group"
      icon="users"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-group-form" className="btn btn-primary" disabled={!name.trim() || picked.length === 0}>
            Create group
          </button>
        </>
      }
    >
      <form id="new-group-form" className="form-stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="group-name">Group name</label>
          <input id="group-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <span className="field-label">Members</span>
          <div className="pick-list">
            {users
              .filter((u) => u._id !== userId)
              .map((u) => (
                <label key={u._id} className="check-row">
                  <input type="checkbox" checked={picked.includes(u._id)} onChange={() => toggle(u._id)} />
                  <Avatar user={u} size="xs" />
                  <span>{u.name}</span>
                  <span className="muted small">{u.jobTitle}</span>
                </label>
              ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Chat() {
  const { userId } = useAuth();
  const { users } = useUsers();
  const { soundEnabled, setSoundEnabled, setActiveConversation, refreshChatUnread } = useLive();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [showGroup, setShowGroup] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  const activeId = params.get('c');
  const active = conversations.find((c) => c._id === activeId) || null;

  const loadConversations = () => ws.listConversations().then(setConversations).catch(() => setError('Could not load chats'));

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    setActiveConversation(activeId);
    if (!activeId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    ws.listMessages(activeId)
      .then((m) => {
        if (cancelled) return;
        setMessages(m);
        ws.markConversationRead(activeId).then(refreshChatUnread).catch(() => {});
        setConversations((prev) => prev.map((c) => (c._id === activeId ? { ...c, unread: 0 } : c)));
      })
      .catch(() => !cancelled && setError('Could not load messages'));
    return () => {
      cancelled = true;
      setActiveConversation(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useSocketEvent('chat:message', ({ conversationId, message }) => {
    const cid = String(conversationId);
    if (cid === activeId) {
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
      ws.markConversationRead(cid).catch(() => {});
    }
    // A message in a conversation we don't have yet (someone just DM'd us).
    if (!conversations.some((c) => c._id === cid)) {
      loadConversations();
      return;
    }
    setConversations((prev) => {
      return prev
        .map((c) =>
          c._id === cid
            ? {
                ...c,
                lastMessageAt: message.createdAt,
                lastMessageText: message.text,
                unread: cid === activeId || idOf(message.sender) === userId ? 0 : (c.unread || 0) + 1,
              }
            : c
        )
        .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
    });
  });

  useSocketEvent('chat:conversation', () => loadConversations());

  const select = (id) => setParams({ c: id });

  const startDirect = async (otherId) => {
    if (!otherId) return;
    try {
      const conv = await ws.openDirect(otherId);
      setConversations((prev) => (prev.some((c) => c._id === conv._id) ? prev : [conv, ...prev]));
      select(conv._id);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start chat');
    }
  };

  const createGroup = async (name, memberIds) => {
    const conv = await ws.createGroup(name, memberIds);
    setConversations((prev) => (prev.some((c) => c._id === conv._id) ? prev : [conv, ...prev]));
    select(conv._id);
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !activeId) return;
    setText('');
    try {
      const msg = await ws.sendMessage(activeId, body);
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
    } catch (err) {
      setText(body);
      setError(err.response?.data?.message || 'Message not sent');
    }
  };

  const directs = conversations.filter((c) => c.type === 'direct');
  const groups = conversations.filter((c) => c.type === 'group');

  const renderConv = (c) => {
    const peer = convPeer(c, userId);
    return (
      <li key={c._id}>
        <button type="button" className={`conv-item ${c._id === activeId ? 'conv-item-active' : ''}`} onClick={() => select(c._id)}>
          {peer ? <Avatar user={peer} size="sm" /> : <span className="avatar avatar-sm avatar-group"><Icon name="users" size={13} /></span>}
          <span className="conv-main">
            <span className="conv-name">{convTitle(c, userId)}</span>
            <span className="conv-preview">{c.lastMessageText || 'No messages yet'}</span>
          </span>
          <span className="conv-side">
            {c.lastMessageAt && <span className="muted small">{timeAgo(c.lastMessageAt)}</span>}
            {c.unread > 0 && <span className="nav-badge">{c.unread}</span>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="page page-fill">
      <PageHeader title="Chat" subtitle="Private chats and groups with people in your workspace." />
      {error && <div className="alert alert-error">{error}</div>}

      <div className="chat">
        <aside className="chat-side">
          <div className="chat-side-actions">
            <select className="input" value="" onChange={(e) => startDirect(e.target.value)} aria-label="New message">
              <option value="">New message…</option>
              {users
                .filter((u) => u._id !== userId)
                .map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
            </select>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setShowGroup(true)}>
              <Icon name="plus" size={15} /> New group
            </button>
            <button type="button" className="link-btn sound-toggle" onClick={() => setSoundEnabled(!soundEnabled)}>
              <Icon name={soundEnabled ? 'bellRing' : 'bellOff'} size={15} /> Message sound {soundEnabled ? 'on' : 'off'}
            </button>
          </div>
          <div className="chat-section">
            <div className="nav-heading">Direct messages</div>
            {directs.length === 0 ? (
              <p className="chat-hint">No conversations yet. Pick someone above to start one.</p>
            ) : (
              <ul className="conv-list">{directs.map(renderConv)}</ul>
            )}
          </div>
          <div className="chat-section">
            <div className="nav-heading">Groups</div>
            {groups.length === 0 ? (
              <p className="chat-hint">No groups yet. Create one to chat with several people.</p>
            ) : (
              <ul className="conv-list">{groups.map(renderConv)}</ul>
            )}
          </div>
        </aside>

        <section className="chat-main">
          {!active ? (
            <div className="chat-empty">
              <Icon name="message" size={32} strokeWidth={1.5} />
              <p>Choose a chat, start a new one, or create a group.</p>
              <span className="muted small">
                <Icon name="lock" size={12} /> Chats are private to the people in them. Admins can&apos;t read them.
              </span>
            </div>
          ) : (
            <>
              <header className="chat-head">
                <strong>{convTitle(active, userId)}</strong>
                <span className="muted small">
                  {active.type === 'group'
                    ? `${active.members.length} members · ${active.members.map((m) => m.name).join(', ')}`
                    : convPeer(active, userId)?.jobTitle || convPeer(active, userId)?.email}
                </span>
              </header>
              <div className="chat-messages">
                {messages.length === 0 && <p className="chat-hint chat-hint-center">Say hello 👋</p>}
                {messages.map((m, i) => {
                  const mine = idOf(m.sender) === userId;
                  const prev = messages[i - 1];
                  const grouped = prev && idOf(prev.sender) === idOf(m.sender) && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60000;
                  return (
                    <div key={m._id} className={`msg ${mine ? 'msg-mine' : ''} ${grouped ? 'msg-grouped' : ''}`}>
                      {!mine && !grouped && <Avatar user={m.sender} size="sm" />}
                      <div className="msg-body">
                        {!grouped && (
                          <div className="msg-meta">
                            {!mine && <strong>{m.sender?.name}</strong>}
                            <span className="muted small" title={formatDateTime(m.createdAt)}>
                              {timeAgo(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className="msg-bubble">{m.text}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form className="chat-composer" onSubmit={send}>
                <input
                  className="input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Message ${convTitle(active, userId)}`}
                  aria-label="Message"
                />
                <button type="submit" className="btn btn-primary" disabled={!text.trim()} aria-label="Send">
                  <Icon name="send" size={15} />
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {showGroup && <NewGroupModal users={users} userId={userId} onClose={() => setShowGroup(false)} onCreate={createGroup} />}
    </div>
  );
}
