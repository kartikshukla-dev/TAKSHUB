import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateProjectModal from './CreateProjectModal';

describe('CreateProjectModal', () => {
  it('submits the form with entered values', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<CreateProjectModal onClose={onClose} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Project' } });
    fireEvent.change(screen.getByLabelText(/Key/), { target: { value: 'mp' } });
    fireEvent.click(screen.getByText('Create project'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      name: 'My Project',
      key: 'MP',
      description: '',
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an error message when creation fails', async () => {
    const onCreate = vi.fn().mockRejectedValue({ response: { data: { message: 'Key already in use' } } });

    render(<CreateProjectModal onClose={() => {}} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByLabelText(/Key/), { target: { value: 'DUP' } });
    fireEvent.click(screen.getByText('Create project'));

    await waitFor(() => expect(screen.getByText('Key already in use')).toBeInTheDocument());
  });
});
