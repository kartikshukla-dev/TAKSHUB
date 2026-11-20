import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../api/tasks', () => ({
  addComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
}));

// eslint-disable-next-line import/first
import * as tasksApi from '../api/tasks';
// eslint-disable-next-line import/first
import TaskComments from './TaskComments';
// eslint-disable-next-line import/first
import NotApprovedDialog from './NotApprovedDialog';
// eslint-disable-next-line import/first
import { scheduleLabel } from '../utils/repeat';

const users = [
  { _id: 'me', name: 'Anvi Singh' },
  { _id: 'u2', name: 'Neha Kapoor', jobTitle: 'Analyst' },
  { _id: 'u3', name: 'Parvez Head' },
];
const task = (comments = []) => ({ _id: 't1', comments });

beforeEach(() => vi.clearAllMocks());

describe('task comments', () => {
  it('suggests people after @ and sends their id as a mention', async () => {
    vi.mocked(tasksApi.addComment).mockResolvedValue({ task: task(), skippedMentions: [] });
    const onTask = vi.fn();
    render(<TaskComments task={task()} projectId="p1" meId="me" users={users} onTask={onTask} onError={vi.fn()} />);
    const box = screen.getByLabelText('Write a comment');
    fireEvent.change(box, { target: { value: 'Hi @Ne', selectionStart: 6 } });
    fireEvent.mouseDown(screen.getByRole('button', { name: /Neha Kapoor/ }));
    expect(box.value).toBe('Hi @Neha Kapoor ');
    fireEvent.change(box, { target: { value: 'Hi @Neha Kapoor please check', selectionStart: 28 } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(tasksApi.addComment).toHaveBeenCalledWith('p1', 't1', 'Hi @Neha Kapoor please check', ['u2']));
    expect(onTask).toHaveBeenCalled();
  });

  it('warns when a mentioned person cannot see the task', async () => {
    vi.mocked(tasksApi.addComment).mockResolvedValue({ task: task(), skippedMentions: ['Muskan Ops'] });
    render(<TaskComments task={task()} projectId="p1" meId="me" users={users} onTask={vi.fn()} onError={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText(/Muskan Ops can't open this task/)).toBeTruthy();
  });

  it('lets you edit only your own comment', async () => {
    const comments = [
      { _id: 'c1', author: { _id: 'me', name: 'Anvi Singh' }, text: 'mine', createdAt: new Date().toISOString() },
      { _id: 'c2', author: { _id: 'u2', name: 'Neha Kapoor' }, text: 'hers @Anvi Singh', createdAt: new Date().toISOString() },
    ];
    vi.mocked(tasksApi.editComment).mockResolvedValue(task(comments));
    render(<TaskComments task={task(comments)} projectId="p1" meId="me" users={users} onTask={vi.fn()} onError={vi.fn()} />);
    expect(screen.getAllByLabelText('Edit comment')).toHaveLength(1);
    expect(document.querySelector('.md-mention-me').textContent).toBe('@Anvi Singh');
    fireEvent.click(screen.getByLabelText('Edit comment'));
    const edit = screen.getAllByLabelText('Edit comment').find((el) => el.tagName === 'TEXTAREA');
    fireEvent.change(edit, { target: { value: 'mine, fixed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tasksApi.editComment).toHaveBeenCalledWith('p1', 't1', 'c1', 'mine, fixed'));
  });
});

describe('Not approved dialog', () => {
  it('needs a reason before it can be confirmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    render(<NotApprovedDialog task={{ title: 'Fix PDF' }} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Mark Not approved' });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('What needs to change?'), { target: { value: 'Totals are wrong' } });
    fireEvent.click(btn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Totals are wrong'));
  });
});

describe('repeat labels', () => {
  it('describes each schedule', () => {
    expect(scheduleLabel({ freq: 'daily' })).toBe('Every day');
    expect(scheduleLabel({ freq: 'weekly', weekday: 1 })).toBe('Every Monday');
    expect(scheduleLabel({ freq: 'monthly', dayOfMonth: 1 })).toBe('Every month on the 1st');
    expect(scheduleLabel({ freq: 'monthly', dayOfMonth: 31 })).toBe('Every month on the 31st (or the last day)');
  });
});
