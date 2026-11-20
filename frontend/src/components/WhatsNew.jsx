import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { Modal } from './ui';
import { markReleaseSeen } from '../utils/whatsNew';

// RULE: this list shows only the current release. When a new feature ships,
// replace these entries with the new ones (don't keep the old ones), put the
// screenshots in public/whats-new/, and bump RELEASE in utils/whatsNew.js
// so everyone sees the modal once more.
//
// Entry fields: id, title, summary (left list), image, image2?, alt, note?,
// lead, points[], control? (JSX shown under the lead), action? { label, to }.
const FEATURES = [
  {
    id: 'new-comments',
    title: 'See new comments at a glance',
    summary: 'Tasks show when someone has commented.',
    image: '/whats-new/comment-badge.webp',
    image2: '/whats-new/comment-new.webp',
    alt: 'A task with a "1 new" comment badge',
    lead: 'When someone comments on a task you are on, the task now shows a purple “1 new” badge in lists and on the board.',
    points: [
      'You get it on tasks you are assigned to, raised, commented on, or (as a Team Head) that involve your team.',
      'Open the task and the new comments are marked “New”. The badge then goes away.',
      'Your own comments never show as new. You still get the bell notification and email as before.',
    ],
    action: { label: 'Open my tasks', to: '/my-tasks' },
  },
  {
    id: 'install-app',
    title: 'Install Tasks Manager as an app',
    summary: 'Its own window and icon on your computer or phone.',
    image: '/icons/icon-512.png',
    image2: '/whats-new/install-app.webp',
    alt: 'Tasks Manager app icon',
    lead: 'Tasks Manager can now be installed like a normal app.',
    points: [
      'Computer (Chrome / Edge): Settings → Install the app, or the install icon in the address bar.',
      'Android: browser menu → “Install app” / “Add to Home screen”.',
      'iPhone / iPad: open it in Safari → Share → “Add to Home Screen”.',
      'It opens faster and in its own window. Your data still comes live from the server.',
    ],
    action: { label: 'Open Settings', to: '/settings' },
  },
];

export default function WhatsNew({ onClose }) {
  const navigate = useNavigate();
  const list = FEATURES;
  const [activeId, setActiveId] = useState(list[0].id);
  const active = list.find((f) => f.id === activeId) || list[0];
  const index = list.indexOf(active);

  useEffect(() => {
    markReleaseSeen();
  }, []);

  const go = (to) => {
    onClose();
    navigate(to);
  };
  const last = index === list.length - 1;

  return (
    <Modal
      title="What's new"
      icon="gift"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted small wn-count">
            {index + 1} of {list.length}
          </span>
          {!last && (
            <button type="button" className="btn btn-secondary" onClick={() => setActiveId(list[index + 1].id)}>
              Next
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <p className="muted wn-intro">The latest features and improvements in Tasks Manager.</p>
      <div className="wn">
        <nav className="wn-list" aria-label="New features">
          {list.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`wn-item ${f.id === active.id ? 'wn-item-on' : ''}`}
              onClick={() => setActiveId(f.id)}
              aria-current={f.id === active.id ? 'true' : undefined}
            >
              <strong>{f.title}</strong>
              <span>{f.summary}</span>
            </button>
          ))}
        </nav>
        <article className="wn-detail" key={active.id}>
          <div className="wn-shot">
            <img src={active.image} alt={active.alt} />
          </div>
          {active.image2 && (
            <div className="wn-shot wn-shot-strip">
              <img src={active.image2} alt="" />
            </div>
          )}
          {active.note && <p className="wn-note">{active.note}</p>}
          <h3 className="wn-title">{active.title}</h3>
          <p className="wn-lead">{active.lead}</p>
          {active.control}
          <ul className="wn-points">
            {active.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {active.action && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(active.action.to)}>
              {active.action.label} <Icon name="chevronRight" size={14} />
            </button>
          )}
        </article>
      </div>
    </Modal>
  );
}
