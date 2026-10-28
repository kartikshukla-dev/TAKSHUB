const { diffTaskFields } = require('../src/utils/taskDiff');

describe('diffTaskFields', () => {
  const userId = 'user-1';

  it('returns an entry for each tracked field that changed', () => {
    const task = { status: 'todo', priority: 'medium', assignee: null, labels: [], dueDate: null, title: 'Old' };
    const updates = { status: 'in-progress', priority: 'high' };

    const entries = diffTaskFields(task, updates, userId);

    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.field === 'status')).toMatchObject({
      field: 'status',
      oldValue: 'todo',
      newValue: 'in-progress',
      changedBy: userId,
    });
    expect(entries.find((e) => e.field === 'priority')).toMatchObject({
      oldValue: 'medium',
      newValue: 'high',
    });
  });

  it('ignores fields that are present but unchanged', () => {
    const task = { status: 'todo', priority: 'medium' };
    const updates = { status: 'todo' };

    const entries = diffTaskFields(task, updates, userId);
    expect(entries).toHaveLength(0);
  });

  it('ignores fields not in the update payload', () => {
    const task = { status: 'todo', priority: 'medium' };
    const updates = { description: 'unrelated change, not tracked' };

    const entries = diffTaskFields(task, updates, userId);
    expect(entries).toHaveLength(0);
  });

  it('detects array field (labels) changes via value comparison', () => {
    const task = { labels: ['bug'] };
    const updates = { labels: ['bug', 'urgent'] };

    const entries = diffTaskFields(task, updates, userId);
    expect(entries).toHaveLength(1);
    expect(entries[0].field).toBe('labels');
  });
});
