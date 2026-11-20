import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { newComments, followsTask } from './comments';

const auth = { userId: 'me', isHead: false, departmentId: 'tech' };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
// eslint-disable-next-line import/first
import CommentBadge from '../components/CommentBadge';

const at = (iso) => new Date(iso).toISOString();
const task = (over = {}) => ({
  assignee: { _id: 'me' },
  reporter: 'boss',
  comments: [
    { _id: 'c1', author: 'boss', createdAt: at('2026-11-19T10:00:00Z') },
    { _id: 'c2', author: { _id: 'me' }, createdAt: at('2026-11-19T11:00:00Z') },
    { _id: 'c3', author: 'boss', createdAt: at('2026-11-19T12:00:00Z') },
  ],
  commentReads: [],
  ...over,
});

describe('new comment badges', () => {
  it('counts other people’s comments after I last opened the task', () => {
    expect(newComments(task(), auth)).toBe(2);
    expect(newComments(task({ commentReads: [{ user: 'me', at: at('2026-11-19T11:30:00Z') }] }), auth)).toBe(1);
    expect(newComments(task({ commentReads: [{ user: 'me', at: at('2026-11-20T00:00:00Z') }] }), auth)).toBe(0);
  });

  it('ignores comments from before the feature and tasks I don’t follow', () => {
    expect(newComments(task({ comments: [{ author: 'boss', createdAt: at('2026-01-01T00:00:00Z') }] }), auth)).toBe(0);
    const other = task({ assignee: 'x', reporter: 'y', comments: [{ author: 'boss', createdAt: at('2026-11-19T10:00:00Z') }] });
    expect(followsTask(other, auth)).toBe(false);
    expect(followsTask({ ...other, toTeam: { _id: 'tech' } }, { ...auth, isHead: true })).toBe(true);
  });

  it('shows "2 new" on the card, or just the count when all seen', () => {
    const { rerender } = render(<CommentBadge task={task()} />);
    expect(screen.getByText(/2 new/)).toBeTruthy();
    rerender(<CommentBadge task={task({ commentReads: [{ user: 'me', at: at('2026-11-21T00:00:00Z') }] })} />);
    expect(screen.queryByText(/new/)).toBeNull();
    expect(screen.getByTitle('3 comments')).toBeTruthy();
  });
});
