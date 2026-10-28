import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from './FilterBar';

const members = [{ _id: 'u1', name: 'Alice' }, { _id: 'u2', name: 'Bob' }];
const allLabels = ['bug', 'feature'];

describe('FilterBar', () => {
  it('renders options for members and labels', () => {
    render(
      <FilterBar
        members={members}
        allLabels={allLabels}
        filters={{ assignee: '', priority: '', label: '' }}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
  });

  it('calls onChange with the updated filter when a select changes', () => {
    let lastFilters = null;
    render(
      <FilterBar
        members={members}
        allLabels={allLabels}
        filters={{ assignee: '', priority: '', label: '' }}
        onChange={(f) => (lastFilters = f)}
      />
    );

    fireEvent.change(screen.getByDisplayValue('All priorities'), { target: { value: 'high' } });
    expect(lastFilters).toEqual({ assignee: '', priority: 'high', label: '' });
  });

  it('shows a clear button only when a filter is active and resets on click', () => {
    let lastFilters = null;
    render(
      <FilterBar
        members={members}
        allLabels={allLabels}
        filters={{ assignee: '', priority: 'high', label: '' }}
        onChange={(f) => (lastFilters = f)}
      />
    );

    const clearBtn = screen.getByText('Clear filters');
    fireEvent.click(clearBtn);
    expect(lastFilters).toEqual({ assignee: '', priority: '', label: '' });
  });
});
