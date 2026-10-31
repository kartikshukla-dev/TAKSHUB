import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar, { EMPTY_FILTERS } from './FilterBar';

const users = [{ _id: 'u1', name: 'Alice' }, { _id: 'u2', name: 'Bob' }];
const projects = [{ _id: 'p1', name: 'Website' }];

describe('FilterBar', () => {
  it('renders options for people and projects', () => {
    render(<FilterBar filters={EMPTY_FILTERS} onChange={() => {}} users={users} projects={projects} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Website')).toBeInTheDocument();
  });

  it('calls onChange with the updated filter when a select changes', () => {
    let last = null;
    render(<FilterBar filters={EMPTY_FILTERS} onChange={(f) => (last = f)} users={users} projects={projects} />);
    fireEvent.change(screen.getByDisplayValue('Any due date'), { target: { value: 'overdue' } });
    expect(last).toEqual({ ...EMPTY_FILTERS, due: 'overdue' });
  });

  it('toggles a priority in the Priority menu', () => {
    let last = null;
    render(<FilterBar filters={EMPTY_FILTERS} onChange={(f) => (last = f)} />);
    fireEvent.click(screen.getByText('Priority'));
    fireEvent.click(screen.getByLabelText('High'));
    expect(last.priority).toEqual(['high']);
  });

  it('hides filters fixed by the page', () => {
    render(<FilterBar filters={EMPTY_FILTERS} onChange={() => {}} users={users} hide={['assignee']} />);
    expect(screen.queryByText('Any assignee')).not.toBeInTheDocument();
  });

  it('shows a clear button only when a filter is active and resets on click', () => {
    let last = null;
    const { rerender } = render(<FilterBar filters={EMPTY_FILTERS} onChange={(f) => (last = f)} />);
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
    rerender(<FilterBar filters={{ ...EMPTY_FILTERS, priority: ['high'] }} onChange={(f) => (last = f)} />);
    fireEvent.click(screen.getByText('Clear filters'));
    expect(last).toEqual(EMPTY_FILTERS);
  });
});
