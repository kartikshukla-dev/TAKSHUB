import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSocket, useSocketEvent } from './SocketContext';
import * as ws from '../api/workspace';
import { playMessageSound } from '../utils/messageSounds';
import { showNotification } from '../utils/pwa';

// Live, app-wide state fed by the socket: notifications, chat unread count,
// the message sound and browser pop-up notifications.
const LiveContext = createContext(null);

const PUSH_KEY = 'oncare_push';
const SOUND_KEY = 'oncare_msg_sound';


export function LiveProvider({ children }) {
  const { user, userId } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [pushEnabled, setPushEnabledState] = useState(() => localStorage.getItem(PUSH_KEY) === 'on');
  const [soundEnabled, setSoundEnabledState] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');
  const activeConversationRef = useRef(null);
  const { socket } = useSocket();
  const [presence, setPresence] = useState({});

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await ws.listNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      /* offline or logged out */
    }
  }, [user]);

  const refreshChatUnread = useCallback(async () => {
    if (!user) return;
    try {
      const convs = await ws.listConversations();
      setChatUnread(convs.reduce((sum, c) => sum + (c.muted ? 0 : c.unread || 0), 0));
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    refreshNotifications();
    refreshChatUnread();
  }, [refreshNotifications, refreshChatUnread]);

  const popUp = (title, body, link) => {
    if (!pushEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!document.hidden) return; // in-app UI already shows it
    showNotification(title, { body, link }).catch(() => {});
  };

  useSocketEvent('notification:new', (n) => {
    setNotifications((prev) => [n, ...prev].slice(0, 30));
    setUnreadCount((c) => c + 1);
    popUp('Tasks Manager', n.text, n.link);
  });

  useSocketEvent('chat:message', ({ conversationId, conversationName, conversationType, mutedBy = [], message }) => {
    const fromMe = String(message.sender?._id) === userId;
    if (fromMe) return;
    const mentioned = message.mentionAll || (message.mentions || []).map(String).includes(userId);
    // Muted chats stay quiet unless you're @mentioned. Thread replies don't
    // count towards the unread badge (they show on the thread instead).
    const muted = mutedBy.map(String).includes(userId) && !mentioned;
    const viewing = location.pathname.startsWith('/chat') && activeConversationRef.current === String(conversationId);
    if (!viewing && !muted && !message.parent) setChatUnread((c) => c + 1);
    if (muted) return;
    // Default ping, or the meme sound picked in Settings.
    if (soundEnabled) playMessageSound();
    const where = conversationName ? `${conversationType === 'channel' ? '#' : ''}${conversationName}` : '';
    const title = where ? `${message.sender?.name} in ${where}` : message.sender?.name;
    popUp(title || 'New message', message.text ||
        (message.snippet ? 'Shared a snippet' : message.media ? (message.media.type === 'gif' ? 'Sent a GIF' : 'Sent a sticker') : 'Shared a file'), `/chat?c=${conversationId}`);
  });

  // Who's online: initial snapshot + live changes. Hidden tab = "away".
  useEffect(() => {
    if (!user) return;
    ws.getPresence().then(setPresence).catch(() => {});
  }, [user]);
  useSocketEvent('presence', ({ userId: uid, status }) => {
    setPresence((prev) => {
      const next = { ...prev };
      if (status === 'offline') delete next[uid];
      else next[uid] = status;
      return next;
    });
  });
  useEffect(() => {
    if (!socket) return undefined;
    const report = () => socket.emit('presence:away', document.hidden);
    const onConnect = () => {
      report();
      ws.getPresence().then(setPresence).catch(() => {});
    };
    document.addEventListener('visibilitychange', report);
    socket.on('connect', onConnect);
    if (socket.connected) report();
    return () => {
      document.removeEventListener('visibilitychange', report);
      socket.off('connect', onConnect);
    };
  }, [socket]);

  const markAllRead = async () => {
    await ws.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const markRead = async (id) => {
    const target = notifications.find((n) => n._id === id);
    if (!target || target.read) return;
    await ws.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const setPushEnabled = async (on) => {
    if (on) {
      if (typeof Notification === 'undefined') throw new Error('This browser does not support notifications');
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications are blocked for this site in your browser settings');
    }
    localStorage.setItem(PUSH_KEY, on ? 'on' : 'off');
    setPushEnabledState(on);
  };

  const setSoundEnabled = (on) => {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    setSoundEnabledState(on);
  };

  const setActiveConversation = (id) => {
    activeConversationRef.current = id ? String(id) : null;
  };

  return (
    <LiveContext.Provider
      value={{
        notifications,
        unreadCount,
        markAllRead,
        markRead,
        refreshNotifications,
        chatUnread,
        refreshChatUnread,
        setActiveConversation,
        pushEnabled,
        setPushEnabled,
        soundEnabled,
        setSoundEnabled,
        presence,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used within a LiveProvider');
  return ctx;
}
