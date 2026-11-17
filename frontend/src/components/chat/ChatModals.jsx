import { useEffect, useState } from 'react';
import * as ws from '../../api/workspace';
import Icon from '../Icon';
import { Avatar, Modal } from '../ui';
import { idOf } from '../../utils/format';

function PeoplePicker({ users, exclude = [], picked, setPicked }) {
  const [q, setQ] = useState('');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const list = users.filter((u) => !exclude.includes(u._id) && u.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="field">
      <span className="field-label">People</span>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" />
      <div className="pick-list">
        {list.map((u) => (
          <label key={u._id} className="check-row">
            <input type="checkbox" checked={picked.includes(u._id)} onChange={() => toggle(u._id)} />
            <Avatar user={u} size="xs" />
            <span>{u.name}</span>
            <span className="muted small">{u.jobTitle}</span>
          </label>
        ))}
        {list.length === 0 && <p className="muted small">No one matches.</p>}
      </div>
    </div>
  );
}

// kind: 'group' (private) or 'channel' (public, anyone can join)
export function NewConversationModal({ kind, users, userId, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');
  const channel = kind === 'channel';

  const submit = async (e) => {
    e.preventDefault();
    try {
      const conv = channel
        ? await ws.createChannel(name.trim().replace(/^#/, ''), description, picked)
        : await ws.createGroup(name, picked);
      onCreated(conv);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create it');
    }
  };

  return (
    <Modal
      title={channel ? 'New channel' : 'New private group'}
      icon={channel ? 'hash' : 'users'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-conv-form" className="btn btn-primary" disabled={!name.trim() || (!channel && picked.length === 0)}>
            Create
          </button>
        </>
      }
    >
      <form id="new-conv-form" className="form-stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <p className="muted small">
          {channel
            ? 'Channels are public: anyone in the workspace can find and join them. Good for teams and topics.'
            : 'Private groups are only visible to the people in them.'}
        </p>
        <div className="field">
          <label htmlFor="conv-name">{channel ? 'Channel name' : 'Group name'}</label>
          <input id="conv-name" className="input" value={name} placeholder={channel ? 'e.g. tech-team' : 'e.g. Launch crew'} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        {channel && (
          <div className="field">
            <label htmlFor="conv-desc">Description (optional)</label>
            <input id="conv-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        )}
        <PeoplePicker users={users} exclude={[userId]} picked={picked} setPicked={setPicked} />
      </form>
    </Modal>
  );
}

export function BrowseChannelsModal({ onClose, onOpen, onNew }) {
  const [channels, setChannels] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    ws.listChannels().then(setChannels).catch(() => setError('Could not load channels'));
  }, []);

  const join = async (c) => {
    try {
      const conv = c.joined ? { _id: c._id } : await ws.joinChannel(c._id);
      onOpen(conv, !c.joined);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not join');
    }
  };

  const list = (channels || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal
      title="Browse channels"
      icon="hash"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onNew}>
          <Icon name="plus" size={15} /> New channel
        </button>
      }
    >
      <div className="form-stack">
        {error && <div className="alert alert-error">{error}</div>}
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search channels" aria-label="Search channels" autoFocus />
        {channels === null ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="muted">No channels yet. Create the first one.</p>
        ) : (
          <ul className="channel-browse">
            {list.map((c) => (
              <li key={c._id}>
                <div>
                  <strong>#{c.name}</strong>
                  <span className="muted small">
                    {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                    {c.description ? ` · ${c.description}` : ''}
                  </span>
                </div>
                <button type="button" className={`btn btn-sm ${c.joined ? 'btn-secondary' : 'btn-primary'}`} onClick={() => join(c)}>
                  {c.joined ? 'Open' : 'Join'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// Rename, description, members (add / remove), leave.
export function DetailsModal({ conversation: conv, users, userId, isAdmin, presence, onClose, onChanged, onLeft }) {
  const named = conv.type !== 'direct';
  const [name, setName] = useState(conv.name || '');
  const [description, setDescription] = useState(conv.description || '');
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');
  const canRemove = idOf(conv.createdBy) === userId || isAdmin;

  const run = async (fn) => {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    }
  };

  const save = () =>
    run(async () => {
      onChanged(await ws.updateConversation(conv._id, { name, description }));
    });
  const add = () =>
    run(async () => {
      onChanged(await ws.addConversationMembers(conv._id, picked));
      setPicked([]);
      setAdding(false);
    });
  const remove = (uid) =>
    run(async () => {
      await ws.removeConversationMember(conv._id, uid);
      if (uid === userId) {
        onLeft(conv._id);
        onClose();
      }
    });

  return (
    <Modal title={named ? (conv.type === 'channel' ? `#${conv.name}` : conv.name) : 'Conversation details'} icon="info" onClose={onClose}>
      <div className="form-stack">
        {error && <div className="alert alert-error">{error}</div>}
        {named && (
          <>
            <div className="field">
              <label htmlFor="d-name">Name</label>
              <input id="d-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="d-desc">Description</label>
              <input id="d-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={save} disabled={!name.trim()}>
                Save changes
              </button>
            </div>
          </>
        )}
        <div className="field">
          <span className="field-label">Members ({conv.members.length})</span>
          <ul className="member-list">
            {conv.members.map((m) => (
              <li key={idOf(m)}>
                <span className="presence-wrap">
                  <Avatar user={m} size="xs" />
                  <i className={`presence-dot presence-${presence[idOf(m)] || 'offline'}`} />
                </span>
                <span>
                  {m.name}
                  {idOf(m) === userId ? ' (you)' : ''}
                </span>
                <span className="muted small">{m.jobTitle}</span>
                {named && canRemove && idOf(m) !== userId && (
                  <button type="button" className="link-btn text-danger small" onClick={() => remove(idOf(m))}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        {named &&
          (adding ? (
            <>
              <PeoplePicker users={users} exclude={conv.members.map(idOf)} picked={picked} setPicked={setPicked} />
              <div className="row-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!picked.length}>
                  Add {picked.length || ''}
                </button>
              </div>
            </>
          ) : (
            <div className="row-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
                <Icon name="userPlus" size={14} /> Add people
              </button>
              <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => remove(userId)}>
                Leave {conv.type === 'channel' ? 'channel' : 'group'}
              </button>
            </div>
          ))}
      </div>
    </Modal>
  );
}
