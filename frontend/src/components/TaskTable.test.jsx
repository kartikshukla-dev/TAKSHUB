import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../api/tasks', () => ({
  getTask: vi.fn().mockResolvedValue({
    _id: 't1',
    title: 'Fix login',
    description: 'Full description here',
    status: 'todo',
    priority: 'high',
    comments: [{ _id: 'c1', text: 'Last comment', author: { name: 'Neha' }, createdAt: new Date().toISOString() }],
  }),
}));

import * as tasksApi from '../api/tasks';
import TaskTable from './TaskTable';

const task = { _id: 't1', title: 'Fix login', status: 'todo', priority: 'high', project: { _id: 'p1', key: 'WEB' }, number: 3 };

describe('TaskTable hover preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: q === '(hover: hover)', media: q, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a preview on hover, closes on leave and fetches details once', async () => {
    render(<TaskTable tasks={[task]} onOpenTask={() => {}} />);
    const row = screen.getByText('Fix login').closest('tr');

    fireEvent.mouseEnter(row, { clientX: 100, clientY: 100 });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('task-preview')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Full description here')).toBeInTheDocument();
    expect(screen.getByText('Last comment')).toBeInTheDocument();

    fireEvent.mouseLeave(row);
    expect(screen.queryByTestId('task-preview')).not.toBeInTheDocument();

    fireEvent.mouseEnter(row, { clientX: 100, clientY: 100 });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(tasksApi.getTask).toHaveBeenCalledTimes(1);
  });

  it('shows no preview on touch devices', async () => {
    window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    render(<TaskTable tasks={[task]} onOpenTask={() => {}} />);
    fireEvent.mouseEnter(screen.getByText('Fix login').closest('tr'));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByTestId('task-preview')).not.toBeInTheDocument();
  });
});
