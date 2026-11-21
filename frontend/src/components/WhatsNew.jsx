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
    id: 'gif-fallback',
    title: 'GIF search that keeps working',
    summary: 'More GIF sources, so it doesn’t run out.',
    image: '/whats-new/gif-search.webp',
    alt: 'GIF search in chat',
    lead: 'GIF search now uses more than one GIF library and remembers recent searches.',
    points: [
      'If one library hits its free limit, the next one answers. The picker shows which one at the bottom.',
      'Searches are saved for a few hours, so the same search by anyone in the office is instant.',
      'If every GIF library is resting, you still get popular meme templates until they come back.',
    ],
    action: { label: 'Open chat', to: '/chat' },
  },
  {
    id: 'not-approved-reason',
    title: 'Not approved, with a reason',
    summary: 'Team Heads now say what needs to change.',
    image: '/whats-new/not-approved-reason.webp',
    image2: '/whats-new/not-approved-box.webp',
    alt: 'Giving a reason when marking a task Not approved',
    lead: 'When a Team Head marks a task Not approved, they now write a short reason.',
    points: [
      'The reason shows on the task in red, with who wrote it and when.',
      'The assignee and everyone on the task get it in their notification and email.',
      'Works from the task and when dragging a card to the Not approved column. Once the status moves on, the reason is cleared.',
    ],
    action: { label: 'Open my tasks', to: '/my-tasks' },
  },
  {
    id: 'reminders',
    title: 'Deadline reminders',
    summary: 'A heads-up the day before, and an alert when late.',
    image: '/whats-new/reminders.webp',
    alt: 'Due tomorrow and overdue reminders in notifications',
    lead: 'Tasks Manager now reminds people about deadlines by itself.',
    points: [
      'The day before a deadline, the assignee gets “due tomorrow”.',
      'If the deadline passes and the task isn’t done, the assignee and their Team Head both get “overdue”.',
      'Each reminder comes once per deadline, by notification and email, only between 9 AM and 9 PM.',
    ],
    action: { label: 'Open my tasks', to: '/my-tasks' },
  },
  {
    id: 'push',
    title: 'Notifications even when the app is closed',
    summary: 'Pop-ups on your phone or computer, app open or not.',
    image: '/whats-new/push.webp',
    alt: 'Push notifications setting',
    lead: 'Turn on push notifications once and you get them even when Tasks Manager is closed.',
    points: [
      'Settings → Push notifications → turn on “Notifications on this device”. Do it once on each phone and computer.',
      'You get chat messages, new tasks, @mentions, comments, changes and deadline reminders.',
      'On iPhone, add Tasks Manager to the Home Screen first (Safari → Share → Add to Home Screen).',
      'Logging out stops them on that device.',
    ],
    action: { label: 'Open Settings', to: '/settings' },
  },
  {
    id: 'mentions',
    title: '@mention people in task comments',
    summary: 'Tag someone so they get pinged.',
    image: '/whats-new/mention-pick.webp',
    image2: '/whats-new/mention-comment.webp',
    alt: 'Mentioning someone in a task comment',
    lead: 'Type @ in a task comment and pick a name.',
    points: [
      'They get a “mentioned you” notification and email, even if they weren’t on the task, as long as they can open it.',
      'If someone can’t open the task, you’ll be told they weren’t notified.',
      'You can now edit or delete your own comments (hover a comment). Comments also support *bold*, _italic_ and links.',
    ],
  },
  {
    id: 'repeating',
    title: 'Repeating tasks',
    summary: 'Daily, weekly or monthly tasks create themselves.',
    image: '/whats-new/repeat-form.webp',
    image2: '/whats-new/repeat-info.webp',
    alt: 'Setting a task to repeat every week',
    lead: 'New task → Repeat: every day, every weekday, every week or every month.',
    points: [
      'A new copy is created at 9:00 AM on each repeat day, with the same assignee, subtasks and labels.',
      'If you set a deadline, each copy gets one the same number of days later.',
      'Open any of the tasks to see the schedule. The person who set it up, the Team Head or a Super Admin can stop it.',
    ],
    action: { label: 'Open my tasks', to: '/my-tasks' },
  },
  // From the previous release, kept on request.
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
