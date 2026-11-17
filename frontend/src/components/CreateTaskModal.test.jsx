import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateTaskModal from './CreateTaskModal';
import * as tasksApi from '../api/tasks';

vi.mock('../api/tasks', () => ({ createTask: vi.fn(), uploadAttachment: vi.fn() }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ departmentId: 'd1', canManageTeam: () => false, canPlanTeamTask: () => true }),
}));
vi.mock('../hooks/useDirectory', () => ({
  useUsers: () => ({ users: [] }),
  useProjects: () => ({ projects: [{ _id: 'p1', name: 'Website' }] }),
  useDepartments: () => ({ departments: [] }),
}));

const file = (name, size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

function fill() {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brochure' } });
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'p1' } });
}

describe('CreateTaskModal attachments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads picked files onto the new task, then closes', async () => {
    tasksApi.createTask.mockResolvedValue({ _id: 't1', project: { _id: 'p1' } });
    tasksApi.uploadAttachment.mockImplementation(async () => ({ _id: 't1', project: { _id: 'p1' } }));
    const onClose = vi.fn();
    render(<CreateTaskModal onClose={onClose} />);
    fill();
    fireEvent.change(screen.getByLabelText('Attachments'), { target: { files: [file('a.pdf'), file('b.pdf')] } });
    expect(screen.getByText('a.pdf')).toBeInTheDocument();

    // Remove one before submitting.
    fireEvent.click(screen.getByLabelText('Remove b.pdf'));
    fireEvent.click(screen.getByText('Create task'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tasksApi.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(tasksApi.uploadAttachment.mock.calls[0][0]).toBe('p1');
    expect(tasksApi.uploadAttachment.mock.calls[0][1]).toBe('t1');
    expect(tasksApi.uploadAttachment.mock.calls[0][2].name).toBe('a.pdf');
  });

  it('rejects files over 10 MB before upload', () => {
    render(<CreateTaskModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Attachments'), { target: { files: [file('big.zip', 11 * 1024 * 1024)] } });
    expect(screen.getByText(/big.zip is over 10 MB/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Remove big.zip')).toBeNull();
  });

  it('keeps the created task and does not allow a second submit when an upload fails', async () => {
    tasksApi.createTask.mockResolvedValue({ _id: 't1', project: { _id: 'p1' } });
    tasksApi.uploadAttachment.mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    render(<CreateTaskModal onClose={onClose} />);
    fill();
    fireEvent.change(screen.getByLabelText('Attachments'), { target: { files: [file('a.pdf')] } });
    fireEvent.click(screen.getByText('Create task'));

    await waitFor(() => expect(screen.getByText(/Task created, but a.pdf could not be attached/)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Create task')).toBeNull();
    expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
  });
});
