import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ canApproveTask: () => false }) }));
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => children,
  PointerSensor: function PointerSensor() {},
  useSensor: () => null,
  useSensors: () => [],
}));
vi.mock('./Column', () => ({ default: ({ title, tasks }) => <section aria-label={title}>{tasks.length}</section> }));

// eslint-disable-next-line import/first
import NotApprovedMenu from './NotApprovedMenu';
// eslint-disable-next-line import/first
import TaskBoard from './TaskBoard';

const tasks = [
  { _id: '1', title: 'Fix PDF', status: 'not-approved', number: 3, project: { key: 'REQ' }, notApproved: { reason: 'Totals are wrong', by: { name: 'Parvez' }, at: new Date().toISOString() } },
  { _id: '2', title: 'Write docs', status: 'todo' },
];

describe('Not approved button', () => {
  it('board has four columns, without Not approved', () => {
    render(<TaskBoard tasks={tasks} setTasks={vi.fn()} onOpenTask={vi.fn()} />);
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['To do', 'In progress', 'In review', 'Done']);
  });

  it('shows the count, lists the tasks with the reason and opens one', () => {
    const onOpenTask = vi.fn();
    render(<NotApprovedMenu tasks={tasks} onOpenTask={onOpenTask} />);
    const btn = screen.getByRole('button', { name: /Not approved/ });
    expect(btn.textContent).toContain('1');
    fireEvent.click(btn);
    expect(screen.getByText(/Totals are wrong/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fix PDF/ }));
    expect(onOpenTask).toHaveBeenCalledWith(tasks[0]);
  });

  it('says so when there are none', () => {
    render(<NotApprovedMenu tasks={[tasks[1]]} onOpenTask={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Not approved/ }));
    expect(screen.getByText('No tasks are Not approved right now.')).toBeTruthy();
  });
});
