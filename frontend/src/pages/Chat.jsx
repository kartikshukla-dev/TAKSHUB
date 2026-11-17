import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as ws from '../api/workspace';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { useTaskUi } from '../context/TaskUiContext';
import { useUsers } from '../hooks/useDirectory';
import Icon from '../components/Icon';
import { Avatar, PageHeader } from '../components/ui';
import { timeAgo, idOf } from '../utils/format';
import MessageItem from '../components/chat/MessageItem';
import Composer from '../components/chat/Composer';
import { ThreadPanel, PinsPanel, SavedPanel, SearchPanel } from '../components/chat/Panels';
import { NewConversationModal, BrowseChannelsModal, DetailsModal } from '../components/chat/ChatModals';
import { dayLabel, previewText } from '../components/chat/format';

function convTitle(conv, userId) {
  if (!conv) return 'Chat';
  if (conv.type === 'channel') return `#${conv.name}`;
  if (conv.type === 'group') return conv.name;
  const other = conv.members.find((m) => idOf(m) !== userId);
  return other?.name || 'Direct message';
}

function convPeer(conv, userId) {
  return conv?.type === 'direct' ? conv.members.find((m) => idOf(m) !== userId) : null;
}

const byLatest = (a, b) => new Date(b.lastMessageAt || b.updatedAt || 0) - new Date(a.lastMessageAt || a.updatedAt || 0);

// Server updates don't carry my private "saved" flag; keep the one I have.
const merge = (prev, next) => ({ ...prev, ...next, saved: next.saved ?? prev.saved });

export default function Chat() {
  const { user, userId, isAdmin } = useAuth();
  const { users } = useUsers();
  const { soundEnabled, setSoundEnabled, setActiveConversation, refreshChatUnread, presence } = useLive();
  const { socket } = useSocket();
  const { openNewTask } = useTaskUi();
  const [params, setParams] = useSearchParams();

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [aroundMode, setAroundMode] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [typing, setTyping] = useState({}); // { convId: { userId: name } }
  const [panel, setPanel] = useState(null); // 'thread' | 'pins' | 'saved' | 'search'
  const [thread, setThread] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [modal, setModal] = useState(null); // 'group' | 'channel' | 'browse' | 'details'
  const [pinsKey, setPinsKey] = useState(0);
  const [savedKey, setSavedKey] = useState(0);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const prependAnchor = useRef(null);
  const convRef = useRef(conversations);
  convRef.current = conversations;
  const typingTimers = useRef({});

  const activeId = params.get('c');
  const jumpTo = params.get('m');
  const active = conversations.find((c) => c._id === activeId) || null;

  const usersById = useMemo(() => {
    const map = {};
    users.forEach((u) => (map[u._id] = u));
    (active?.members || []).forEach((m) => (map[idOf(m)] = map[idOf(m)] || m));
    return map;
  }, [users, active]);
  const ctx = useMemo(
    () => ({ names: (active?.members || []).map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length), meName: user?.name }),
    [active, user]
  );
  const titleOf = useCallback((cid) => convTitle(convRef.current.find((c) => c._id === String(cid)), userId), [userId]);

  const loadConversations = useCallback(
    () => ws.listConversations().then(setConversations).catch(() => setError('Could not load chats')),
    []
  );
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const upsertConversation = (conv) =>
    setConversations((prev) => {
      const exists = prev.some((c) => c._id === conv._id);
      const next = exists ? prev.map((c) => (c._id === conv._id ? { ...c, ...conv } : c)) : [conv, ...prev];
      return next.sort(byLatest);
    });

  // ---------- open a conversation ----------
  useEffect(() => {
    setActiveConversation(activeId);
    setPanel((p) => (p === 'pins' || p === 'thread' ? null : p));
    setThread(null);
    setThreadId(null);
    if (!activeId) {
      setMessages([]);
      return undefined;
    }
    const conv = convRef.current.find((c) => c._id === activeId);
    const mine = conv?.reads?.find((r) => r.user === userId);
    setLastReadAt(mine ? mine.at : null);
    let cancelled = false;
    const query = jumpTo ? { around: jumpTo } : {};
    ws.listMessages(activeId, query)
      .then(({ messages: list, hasMore: more }) => {
        if (cancelled) return;
        stickToBottom.current = !jumpTo;
        setMessages(list);
        setHasMore(more);
        setAroundMode(Boolean(jumpTo));
        if (jumpTo) {
          const target = list.find((m) => m._id === jumpTo);
          setHighlight(target ? jumpTo : null);
          // A thread reply (not in the main list): open its thread.
          if (!target) openThread({ _id: jumpTo });
        }
        ws.markConversationRead(activeId).then(refreshChatUnread).catch(() => {});
        setConversations((prev) => prev.map((c) => (c._id === activeId ? { ...c, unread: 0 } : c)));
      })
      .catch(() => !cancelled && setError('Could not load messages'));
    return () => {
      cancelled = true;
      setActiveConversation(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, jumpTo]);

  // Keep the view pinned to the newest message, or restore position after
  // loading older ones, or bring a jumped-to message into view.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependAnchor.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);
  useEffect(() => {
    if (!highlight) return undefined;
    document.getElementById(`msg-${highlight}`)?.scrollIntoView({ block: 'center' });
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [highlight, messages]);

  const onScroll = () => {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (!messages.length) return;
    try {
      const { messages: older, hasMore: more } = await ws.listMessages(activeId, { before: messages[0].createdAt });
      prependAnchor.current = listRef.current.scrollHeight - listRef.current.scrollTop;
      setMessages((prev) => [...older.filter((o) => !prev.some((p) => p._id === o._id)), ...prev]);
      setHasMore(more);
    } catch {
      setError('Could not load older messages');
    }
  };

  const jumpToLatest = () => setParams({ c: activeId });

  // ---------- threads ----------
  const openThread = useCallback(async (m) => {
    setPanel('thread');
    setThreadId(m._id);
    setThread(null);
    try {
      const t = await ws.getThread(m._id);
      setThread(t);
      setThreadId(t.parent._id);
    } catch {
      setError('Could not open the thread');
      setPanel(null);
    }
  }, []);

  // ---------- live events ----------
  const applyUpdate = (msg) => {
    setMessages((prev) => prev.map((m) => (m._id === msg._id ? merge(m, msg) : m)));
    setThread((t) =>
      t
        ? {
            parent: t.parent._id === msg._id ? merge(t.parent, msg) : t.parent,
            replies: t.replies.map((r) => (r._id === msg._id ? merge(r, msg) : r)),
          }
        : t
    );
  };

  useSocketEvent('chat:message', ({ conversationId, message }) => {
    const cid = String(conversationId);
    // Whoever sent it has stopped typing.
    setTyping((prev) => {
      if (!prev[cid]?.[idOf(message.sender)]) return prev;
      const next = { ...prev, [cid]: { ...prev[cid] } };
      delete next[cid][idOf(message.sender)];
      return next;
    });
    if (message.parent) {
      if (threadId && String(message.parent) === threadId) {
        setThread((t) => (t && !t.replies.some((r) => r._id === message._id) ? { ...t, replies: [...t.replies, message] } : t));
      }
      return;
    }
    if (cid === activeId) {
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
      ws.markConversationRead(cid).catch(() => {});
    }
    if (!convRef.current.some((c) => c._id === cid)) {
      loadConversations();
      return;
    }
    setConversations((prev) =>
      prev
        .map((c) =>
          c._id === cid
            ? {
                ...c,
                lastMessageAt: message.createdAt,
                lastMessageText: previewText(message),
                unread: cid === activeId || idOf(message.sender) === userId ? 0 : (c.unread || 0) + 1,
              }
            : c
        )
        .sort(byLatest)
    );
  });

  useSocketEvent('chat:message:update', ({ message }) => {
    applyUpdate(message);
    setPinsKey((k) => k + 1);
  });

  useSocketEvent('chat:conversation', (conv) => {
    if (conv.removed) {
      setConversations((prev) => prev.filter((c) => c._id !== String(conv._id)));
      if (String(conv._id) === activeId) setParams({});
      return;
    }
    upsertConversation(conv);
  });

  useSocketEvent('chat:read', ({ conversationId, userId: uid, at }) => {
    setConversations((prev) =>
      prev.map((c) =>
        c._id === String(conversationId)
          ? { ...c, reads: [...(c.reads || []).filter((r) => r.user !== uid), { user: uid, at }] }
          : c
      )
    );
  });

  useSocketEvent('chat:typing', ({ conversationId, userId: uid, name }) => {
    const cid = String(conversationId);
    setTyping((prev) => ({ ...prev, [cid]: { ...(prev[cid] || {}), [uid]: name } }));
    const key = `${cid}:${uid}`;
    clearTimeout(typingTimers.current[key]);
    typingTimers.current[key] = setTimeout(() => {
      setTyping((prev) => {
        const next = { ...prev, [cid]: { ...(prev[cid] || {}) } };
        delete next[cid][uid];
        return next;
      });
    }, 4000);
  });
  useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

  // ---------- actions ----------
  const select = (id) => setParams({ c: id });

  const startDirect = async (otherId) => {
    if (!otherId) return;
    try {
      const conv = await ws.openDirect(otherId);
      upsertConversation(conv);
      select(conv._id);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start chat');
    }
  };

  const fail = (err, fallback) => {
    setError(err.response?.data?.message || fallback);
    return false;
  };

  const sendMain = async (payload) => {
    try {
      const msg = await ws.sendMessage(activeId, payload);
      stickToBottom.current = true;
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
      setError('');
      return true;
    } catch (err) {
      return fail(err, 'Message not sent');
    }
  };

  const sendReply = async (payload) => {
    if (!thread) return false;
    try {
      const msg = await ws.sendMessage(activeId, { ...payload, parent: thread.parent._id });
      setThread((t) => (t && !t.replies.some((r) => r._id === msg._id) ? { ...t, replies: [...t.replies, msg] } : t));
      return true;
    } catch (err) {
      return fail(err, 'Reply not sent');
    }
  };

  const actions = {
    react: async (m, emoji) => {
      try {
        applyUpdate(await ws.reactToMessage(m._id, emoji));
      } catch (err) {
        fail(err, 'Could not react');
      }
    },
    save: async (m) => {
      try {
        applyUpdate(await ws.saveMessage(m._id));
        setSavedKey((k) => k + 1);
      } catch (err) {
        fail(err, 'Could not save');
      }
    },
    pin: async (m) => {
      try {
        applyUpdate(await ws.pinMessage(m._id));
        setPinsKey((k) => k + 1);
      } catch (err) {
        fail(err, 'Could not pin');
      }
    },
    edit: async (m, text) => {
      try {
        applyUpdate(await ws.editMessage(m._id, text));
        return true;
      } catch (err) {
        return fail(err, 'Could not edit');
      }
    },
    remove: async (m) => {
      if (!window.confirm('Delete this message for everyone?')) return;
      try {
        applyUpdate(await ws.deleteMessage(m._id));
      } catch (err) {
        fail(err, 'Could not delete');
      }
    },
    toTask: (m) => {
      const body = m.text || m.snippet?.code || '';
      const first = (m.text || m.snippet?.title || 'Task from chat').split('\n')[0].slice(0, 120);
      openNewTask({
        title: first,
        description: `${body}\n\n— From chat (${convTitle(active, userId)}), ${m.sender?.name}`.trim(),
      });
    },
    openThread,
  };

  const toggle = async (kind) => {
    try {
      const conv = kind === 'mute' ? await ws.muteConversation(activeId, !active.muted) : await ws.starConversation(activeId, !active.starred);
      upsertConversation(conv);
      if (kind === 'mute') refreshChatUnread();
    } catch (err) {
      fail(err, 'Could not update');
    }
  };

  const jump = (m) => {
    const cid = String(m.conversation);
    setParams({ c: cid, m: m.parent ? String(m.parent) : m._id });
  };

  const emitTyping = () => socket?.emit('chat:typing', activeId);

  // ---------- render helpers ----------
  const starred = conversations.filter((c) => c.starred);
  const channels = conversations.filter((c) => !c.starred && c.type === 'channel');
  const directs = conversations.filter((c) => !c.starred && c.type === 'direct');
  const groups = conversations.filter((c) => !c.starred && c.type === 'group');

  const renderConv = (c) => {
    const peer = convPeer(c, userId);
    const status = peer ? presence[idOf(peer)] : null;
    return (
      <li key={c._id}>
        <button
          type="button"
          className={`conv-item ${c._id === activeId ? 'conv-item-active' : ''} ${c.muted ? 'conv-muted' : ''} ${c.unread > 0 && !c.muted ? 'conv-unread' : ''}`}
          onClick={() => select(c._id)}
        >
          {peer ? (
            <span className="presence-wrap">
              <Avatar user={peer} size="sm" />
              <i className={`presence-dot presence-${status || 'offline'}`} />
            </span>
          ) : (
            <span className="avatar avatar-sm avatar-group">
              <Icon name={c.type === 'channel' ? 'hash' : 'users'} size={13} />
            </span>
          )}
          <span className="conv-main">
            <span className="conv-name">
              {convTitle(c, userId)}
              {c.muted && <Icon name="bellOff" size={11} className="conv-mute-icon" />}
            </span>
            <span className="conv-preview">{Object.keys(typing[c._id] || {}).length ? 'typing…' : c.lastMessageText || 'No messages yet'}</span>
          </span>
          <span className="conv-side">
            {c.lastMessageAt && <span className="muted small">{timeAgo(c.lastMessageAt)}</span>}
            {c.unread > 0 && <span className={`nav-badge ${c.muted ? 'nav-badge-muted' : ''}`}>{c.unread}</span>}
          </span>
        </button>
      </li>
    );
  };

  const section = (title, list, extra) => (
    <div className="chat-section">
      <div className="chat-section-head">
        <span className="nav-heading">{title}</span>
        {extra}
      </div>
      {list.length > 0 && <ul className="conv-list">{list.map(renderConv)}</ul>}
    </div>
  );

  // Read receipts on my latest message.
  const seenFor = (m) => {
    if (!active || idOf(m.sender) !== userId) return null;
    const readers = (active.reads || []).filter((r) => r.user !== userId && new Date(r.at) >= new Date(m.createdAt));
    if (!readers.length) return null;
    if (active.type === 'direct') return 'Seen';
    const names = readers.map((r) => usersById[r.user]?.name?.split(' ')[0] || 'Someone');
    return `Seen by ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
  };
  const myLastId = [...messages].reverse().find((m) => idOf(m.sender) === userId && !m.deletedAt)?._id;
  const firstUnread = lastReadAt ? messages.findIndex((m) => idOf(m.sender) !== userId && new Date(m.createdAt) > new Date(lastReadAt)) : -1;
  const typingNames = Object.values(typing[activeId] || {}).filter(Boolean);
  const peer = convPeer(active, userId);

  return (
    <div className="page page-fill">
      <PageHeader title="Chat" subtitle="Direct messages, private groups and public channels for your workspace." />
      {error && (
        <div className="alert alert-error">
          {error}{' '}
          <button type="button" className="link-btn" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className={`chat ${panel ? 'chat-with-panel' : ''}`}>
        <aside className="chat-side">
          <div className="chat-side-actions">
            <div className="chat-side-tools">
              <button type="button" className={`btn btn-secondary btn-sm ${panel === 'search' ? 'is-on' : ''}`} onClick={() => setPanel(panel === 'search' ? null : 'search')}>
                <Icon name="search" size={14} /> Search
              </button>
              <button type="button" className={`btn btn-secondary btn-sm ${panel === 'saved' ? 'is-on' : ''}`} onClick={() => setPanel(panel === 'saved' ? null : 'saved')}>
                <Icon name="bookmark" size={14} /> Saved
              </button>
            </div>
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
            <button type="button" className="link-btn sound-toggle" onClick={() => setSoundEnabled(!soundEnabled)}>
              <Icon name={soundEnabled ? 'bellRing' : 'bellOff'} size={15} /> Message sound {soundEnabled ? 'on' : 'off'}
            </button>
          </div>
          {starred.length > 0 && section('Starred', starred)}
          {section(
            'Channels',
            channels,
            <span className="chat-section-btns">
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setModal('browse')} aria-label="Browse channels" title="Browse channels">
                <Icon name="search" size={13} />
              </button>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setModal('channel')} aria-label="New channel" title="New channel">
                <Icon name="plus" size={13} />
              </button>
            </span>
          )}
          {section('Direct messages', directs)}
          {section(
            'Groups',
            groups,
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => setModal('group')} aria-label="New group" title="New group">
              <Icon name="plus" size={13} />
            </button>
          )}
          {conversations.length === 0 && <p className="chat-hint">No conversations yet. Pick someone above, or browse channels.</p>}
        </aside>

        <section className="chat-main">
          {!active ? (
            <div className="chat-empty">
              <Icon name="message" size={32} strokeWidth={1.5} />
              <p>Choose a chat, start a new one, or browse channels.</p>
              <span className="muted small">
                <Icon name="lock" size={12} /> Chats are private to the people in them. Admins can&apos;t read them.
              </span>
            </div>
          ) : (
            <>
              <header className="chat-head">
                <div className="chat-head-title">
                  <strong>{convTitle(active, userId)}</strong>
                  <span className="muted small">
                    {active.type === 'direct'
                      ? `${presence[idOf(peer)] === 'online' ? 'Active now' : presence[idOf(peer)] === 'away' ? 'Away' : 'Offline'}${peer?.jobTitle ? ` · ${peer.jobTitle}` : ''}`
                      : `${active.members.length} members${active.description ? ` · ${active.description}` : ''}`}
                  </span>
                </div>
                <div className="chat-head-actions">
                  <button type="button" className={`icon-btn ${panel === 'pins' ? 'is-on' : ''}`} onClick={() => setPanel(panel === 'pins' ? null : 'pins')} aria-label="Pinned messages" title="Pinned">
                    <Icon name="pin" size={16} />
                  </button>
                  <button type="button" className={`icon-btn ${active.starred ? 'is-on' : ''}`} onClick={() => toggle('star')} aria-label={active.starred ? 'Unstar' : 'Star'} title={active.starred ? 'Starred' : 'Star'}>
                    <Icon name="star" size={16} />
                  </button>
                  <button type="button" className={`icon-btn ${active.muted ? 'is-on' : ''}`} onClick={() => toggle('mute')} aria-label={active.muted ? 'Unmute' : 'Mute'} title={active.muted ? 'Muted' : 'Mute'}>
                    <Icon name={active.muted ? 'bellOff' : 'bell'} size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setModal('details')} aria-label="Conversation details" title="Details">
                    <Icon name="info" size={16} />
                  </button>
                </div>
              </header>
              <div className="chat-messages" ref={listRef} onScroll={onScroll}>
                {hasMore && (
                  <button type="button" className="load-older" onClick={loadOlder}>
                    Load earlier messages
                  </button>
                )}
                {messages.length === 0 && <p className="chat-hint chat-hint-center">Say hello 👋</p>}
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                  const unreadLine = i === firstUnread && i > 0;
                  const grouped =
                    !newDay &&
                    !unreadLine &&
                    prev &&
                    idOf(prev.sender) === idOf(m.sender) &&
                    !prev.deletedAt &&
                    new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60000;
                  return (
                    <div key={m._id}>
                      {newDay && (
                        <div className="day-divider">
                          <span>{dayLabel(m.createdAt)}</span>
                        </div>
                      )}
                      {unreadLine && (
                        <div className="unread-divider">
                          <span>New messages</span>
                        </div>
                      )}
                      <MessageItem
                        message={m}
                        meId={userId}
                        grouped={grouped}
                        usersById={usersById}
                        ctx={ctx}
                        actions={actions}
                        highlight={highlight === m._id}
                        seenText={m._id === myLastId ? seenFor(m) : null}
                      />
                    </div>
                  );
                })}
              </div>
              {aroundMode && (
                <button type="button" className="jump-latest" onClick={jumpToLatest}>
                  Jump to latest <Icon name="chevronDown" size={14} />
                </button>
              )}
              <div className="typing-line" aria-live="polite">
                {typingNames.length > 0 &&
                  `${typingNames.slice(0, 2).join(' and ')}${typingNames.length > 2 ? ' and others' : ''} ${typingNames.length > 1 ? 'are' : 'is'} typing…`}
              </div>
              <Composer
                key={activeId}
                placeholder={`Message ${convTitle(active, userId)}`}
                members={active.members}
                meId={userId}
                allowChannelMention={active.type !== 'direct'}
                onSend={sendMain}
                onTyping={emitTyping}
              />
            </>
          )}
        </section>

        {panel === 'thread' && (
          <ThreadPanel
            key={threadId}
            thread={thread}
            meId={userId}
            usersById={usersById}
            ctx={ctx}
            actions={actions}
            members={active?.members || []}
            allowChannelMention={active?.type !== 'direct'}
            onSend={sendReply}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'pins' && active && <PinsPanel conversationId={activeId} refreshKey={pinsKey} convTitle={titleOf} onJump={jump} onClose={() => setPanel(null)} />}
        {panel === 'saved' && <SavedPanel refreshKey={savedKey} convTitle={titleOf} onJump={jump} onClose={() => setPanel(null)} />}
        {panel === 'search' && <SearchPanel convTitle={titleOf} onJump={jump} onClose={() => setPanel(null)} />}
      </div>

      {(modal === 'group' || modal === 'channel') && (
        <NewConversationModal
          kind={modal}
          users={users}
          userId={userId}
          onClose={() => setModal(null)}
          onCreated={(conv) => {
            upsertConversation(conv);
            select(conv._id);
          }}
        />
      )}
      {modal === 'browse' && (
        <BrowseChannelsModal
          onClose={() => setModal(null)}
          onNew={() => setModal('channel')}
          onOpen={(conv, joined) => {
            if (joined) upsertConversation(conv);
            select(conv._id);
          }}
        />
      )}
      {modal === 'details' && active && (
        <DetailsModal
          conversation={active}
          users={users}
          userId={userId}
          isAdmin={isAdmin}
          presence={presence}
          onClose={() => setModal(null)}
          onChanged={upsertConversation}
          onLeft={(cid) => {
            setConversations((prev) => prev.filter((c) => c._id !== cid));
            setParams({});
          }}
        />
      )}
    </div>
  );
}
