import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';
import { Modal, Toggle } from './ui';
import {
  MEME_SOUNDS,
  MEME_SOUND_KEY,
  SOUND_STYLE_KEY,
  getMemeSound,
  getSoundStyle,
  playMemeSound,
} from '../utils/messageSounds';
import { markReleaseSeen } from '../utils/whatsNew';


const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
};

// Try meme sounds right from the modal (same setting as Settings → Message sound).
function MemeSoundControl() {
  const [on, setOn] = useState(() => getSoundStyle() === 'meme');
  const [sound, setSound] = useState(getMemeSound);
  const toggle = (v) => {
    store(SOUND_STYLE_KEY, v ? 'meme' : 'default');
    setOn(v);
  };
  return (
    <div className="wn-control">
      <div className="wn-control-row">
        <span>Use meme sounds for new messages</span>
        <Toggle checked={on} onChange={toggle} label="Use meme sounds for new messages" />
      </div>
      <div className="wn-control-row">
        <select
          className="input"
          value={sound}
          onChange={(e) => {
            store(MEME_SOUND_KEY, e.target.value);
            setSound(e.target.value);
          }}
          aria-label="Meme sound"
        >
          <option value="random">🎲 Random each time</option>
          {MEME_SOUNDS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => playMemeSound(sound)}>
          Play
        </button>
      </div>
    </div>
  );
}

function features({ canApprove }) {
  return [
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
    {
      id: 'media',
      title: 'GIFs, emoji and stickers',
      summary: 'Search emoji, GIFs and office stickers in chat.',
      image: '/whats-new/stickers.webp',
      alt: 'Sticker picker in chat',
      lead: 'Click the 😊 button in any message box to open the new picker.',
      points: [
        'Emoji: the full library (1,900+), with search and your recent emoji on top.',
        'GIFs: search GIPHY and send a GIF in one click.',
        'Stickers: a ready-made Office stickers pack (Done, LGTM, On it, Coffee break, WFH and more), plus stickers your colleagues share.',
        'Stickers and GIFs go out as their own message. You can still react to any message with any emoji.',
      ],
      action: { label: 'Open chat', to: '/chat' },
    },
    {
      id: 'own-stickers',
      title: 'Make your own stickers',
      summary: 'Turn any image into a sticker and share it.',
      image: '/whats-new/make-sticker.webp',
      alt: 'Creating a new sticker',
      lead: 'Stickers → My stickers → Create.',
      points: [
        'Pick a PNG, JPG, GIF or WebP image (up to 1 MB) and give it a name.',
        'Tick “Share with everyone” to add it to the Office stickers collection for the whole company.',
        'Hover your sticker later to turn sharing on or off, or delete it.',
      ],
      action: { label: 'Open chat', to: '/chat' },
    },
    {
      id: 'save-stickers',
      title: 'Save stickers you like',
      summary: 'Keep a colleague’s sticker, like on WhatsApp.',
      image: '/whats-new/save-sticker.webp',
      alt: 'Save sticker option on a message',
      lead: 'Hover a sticker in chat, open ⋯ and pick “Save sticker”.',
      points: [
        'Saved stickers appear in the Saved section of the sticker tab.',
        'Recent starts empty and fills up with the stickers you send.',
        'Change your mind? Pick “Remove from saved stickers” from the same menu.',
      ],
    },
    {
      id: 'not-approved',
      title: 'Not approved status',
      summary: 'Team Heads can send work back as Not approved.',
      image: '/whats-new/not-approved.webp',
      image2: '/whats-new/not-approved-list.webp',
      alt: 'Task marked Not approved',
      note: canApprove
        ? 'As a Team Head, you can set this on your team’s tasks.'
        : 'Only your Team Head (or a Super Admin) can set or clear this.',
      lead: 'Tasks have a new status: Not approved.',
      points: [
        'Only the head of the task’s team (or a Super Admin) can mark a task Not approved.',
        'Once it is Not approved, only they can change the status again. Everyone else sees the status locked.',
        'Your whole team can still see these tasks, filter by them, and find them in the new Not approved board column.',
      ],
      action: { label: 'Open my tasks', to: '/my-tasks' },
    },
    {
      id: 'meme-sounds',
      title: 'Meme message sounds',
      summary: 'Swap the ping for a meme sound. Off by default.',
      image: '/whats-new/meme-sound.webp',
      alt: 'Message sound settings',
      lead: 'New chat messages can now play a meme sound instead of the usual ping.',
      points: [
        `Pick one of ${MEME_SOUNDS.length} sounds (FAAAH, Kaun hai re, Are baap re…) or let it pick at random.`,
        'It is just for you, on this browser. If you don’t turn it on, nothing changes.',
        'You can change it any time in Settings → Message sound.',
      ],
      control: <MemeSoundControl />,
      action: { label: 'Open Settings', to: '/settings' },
    },
  ];
}

export default function WhatsNew({ onClose }) {
  const { isAdmin, isHead } = useAuth();
  const navigate = useNavigate();
  const list = features({ canApprove: isAdmin || isHead });
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
