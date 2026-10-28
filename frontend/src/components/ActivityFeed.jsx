function describeEntry(entry) {
  const who = entry.changedBy?.name || 'Someone';
  if (entry.field === 'comment') return `${who} commented on "${entry.taskTitle}"`;
  return `${who} changed ${entry.field} on "${entry.taskTitle}" from "${entry.oldValue ?? '-'}" to "${entry.newValue ?? '-'}"`;
}

export default function ActivityFeed({ feed, onClose }) {
  return (
    <aside className="activity-feed">
      <div className="activity-feed-header">
        <h3>Project activity</h3>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="activity-feed-list">
        {feed.length === 0 && <li className="muted">No activity yet.</li>}
        {feed.map((entry, idx) => (
          <li key={idx}>
            <p>{describeEntry(entry)}</p>
            <span className="muted small">{new Date(entry.changedAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
