import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import Subtasks, { SubtaskBadge } from './Subtasks';
import * as tasksApi from '../api/tasks';

vi.mock('../api/tasks', () => ({ addSubtask: vi.fn(), updateSubtask: vi.fn(), deleteSubtask: vi.fn(), reorderSubtasks: vi.fn() }));

const base = {
  _id: 't1',
  subtasks: [
    { _id: 's1', title: 'Write notes', done: false, order: 0 },
    { _id: 's2', title: 'Tag build', done: true, order: 1 },
  ],
};

function Harness({ onError = () => {} }) {
  const [task, setTask] = useState(base);
  return <Subtasks task={task} projectId="p1" people={[]} onTask={setTask} onError={onError} />;
}

describe('Subtasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows progress and ticks a subtask instantly', async () => {
    let resolve;
    tasksApi.updateSubtask.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Mark "Write notes" done'));
    // Before the server answers.
    expect(screen.getByText('2/2')).toBeInTheDocument();
    resolve({ ...base, subtasks: base.subtasks.map((s) => ({ ...s, done: true })) });
    await waitFor(() => expect(tasksApi.updateSubtask).toHaveBeenCalledWith('p1', 't1', 's1', { done: true }));
  });

  it('rolls back and shows the error when the server refuses', async () => {
    tasksApi.updateSubtask.mockRejectedValue({ response: { data: { message: 'Nope' } } });
    const onError = vi.fn();
    render(<Harness onError={onError} />);
    fireEvent.click(screen.getByLabelText('Mark "Write notes" done'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Nope'));
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('adds a subtask on Enter', async () => {
    tasksApi.addSubtask.mockResolvedValue({ ...base, subtasks: [...base.subtasks, { _id: 's3', title: 'QA', done: false, order: 2 }] });
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('New subtask'), { target: { value: 'QA' } });
    fireEvent.submit(screen.getByLabelText('New subtask').closest('form'));
    await waitFor(() => expect(screen.getByText('QA')).toBeInTheDocument());
    expect(tasksApi.addSubtask).toHaveBeenCalledWith('p1', 't1', { title: 'QA' });
  });

  it('badge hides when there are no subtasks', () => {
    const { container } = render(<SubtaskBadge task={{ subtasks: [] }} />);
    expect(container.textContent).toBe('');
    render(<SubtaskBadge task={base} />);
    expect(screen.getByTitle('1 of 2 subtasks done')).toBeInTheDocument();
  });
});
