import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSocketEvent } from './SocketContext';
import * as ws from '../api/workspace';

// Live, app-wide state fed by the socket: notifications, chat unread count,
// the message sound and browser pop-up notifications.
const LiveContext = createContext(null);

const PUSH_KEY = 'oncare_push';
const SOUND_KEY = 'oncare_msg_sound';

function playPing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    // Audio is a nicety; ignore failures (e.g. autoplay policy).
  }
}

export function LiveProvider({ children }) {
  const { user, userId } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [pushEnabled, setPushEnabledState] = useState(() => localStorage.getItem(PUSH_KEY) === 'on');
  const [soundEnabled, setSoundEnabledState] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');
  const activeConversationRef = useRef(null);

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
      setChatUnread(convs.reduce((sum, c) => sum + (c.unread || 0), 0));
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
    try {
      const n = new Notification(title, { body, tag: link || title });
      n.onclick = () => {
        window.focus();
        if (link) window.location.assign(link);
      };
    } catch {
      /* some browsers block constructor-based notifications */
    }
  };

  useSocketEvent('notification:new', (n) => {
    setNotifications((prev) => [n, ...prev].slice(0, 30));
    setUnreadCount((c) => c + 1);
    popUp('Oncare', n.text, n.link);
  });

  useSocketEvent('chat:message', ({ conversationId, conversationName, message }) => {
    const fromMe = String(message.sender?._id) === userId;
    if (fromMe) return;
    const viewing = location.pathname.startsWith('/chat') && activeConversationRef.current === String(conversationId);
    if (!viewing) setChatUnread((c) => c + 1);
    if (soundEnabled) playPing();
    const title = conversationName ? `${message.sender?.name} in ${conversationName}` : message.sender?.name;
    popUp(title || 'New message', message.text, `/chat?c=${conversationId}`);
  });

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
