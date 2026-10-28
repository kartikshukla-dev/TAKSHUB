export default function FilterBar({ members, allLabels, filters, onChange }) {
  const update = (field) => (e) => onChange({ ...filters, [field]: e.target.value });

  return (
    <div className="filter-bar">
      <select value={filters.assignee} onChange={update('assignee')}>
        <option value="">All assignees</option>
        {members.map((m) => (
          <option key={m._id || m.id} value={m._id || m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select value={filters.priority} onChange={update('priority')}>
        <option value="">All priorities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      <select value={filters.label} onChange={update('label')}>
        <option value="">All labels</option>
        {allLabels.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      {(filters.assignee || filters.priority || filters.label) && (
        <button
          className="btn btn-ghost"
          onClick={() => onChange({ assignee: '', priority: '', label: '' })}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
