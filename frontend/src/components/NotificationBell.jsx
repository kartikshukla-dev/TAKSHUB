import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLive } from '../context/LiveContext';
import { timeAgo } from '../utils/format';
import Icon from './Icon';
import { Avatar } from './ui';

export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead } = useLive();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openNotification = (n) => {
    markRead(n._id).catch(() => {});
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && <span className="dot-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="popover notif-popover">
          <div className="popover-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="link-btn small" onClick={() => markAllRead().catch(() => {})}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="notif-list">
            {notifications.length === 0 && <li className="notif-empty">You&apos;re all caught up.</li>}
            {notifications.map((n) => (
              <li key={n._id}>
                <button
                  type="button"
                  className={`notif-item ${n.read ? '' : 'notif-unread'}`}
                  onClick={() => openNotification(n)}
                >
                  <Avatar user={n.actor} size="sm" />
                  <span className="notif-body">
                    <span>{n.text}</span>
                    <span className="muted small">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
