import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WhatsNew from './WhatsNew';
import { hasSeenRelease } from '../utils/whatsNew';

const renderIt = (onClose = vi.fn()) =>
  render(
    <MemoryRouter>
      <WhatsNew onClose={onClose} />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
});

describe("What's new", () => {
  it('shows only this release, switches between entries and marks it seen', () => {
    expect(hasSeenRelease()).toBe(false);
    const onClose = vi.fn();
    renderIt(onClose);
    expect(hasSeenRelease()).toBe(true);
    expect(screen.getByRole('heading', { name: 'Not approved, with a reason' })).toBeTruthy();
    expect(screen.getByText('1 of 5')).toBeTruthy();
    ['Deadline reminders', 'Notifications even when the app is closed', '@mention people in task comments', 'Repeating tasks'].forEach((t) =>
      expect(screen.getByRole('button', { name: new RegExp(t) })).toBeTruthy()
    );
    // Older releases are gone.
    expect(screen.queryByText('See new comments at a glance')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Repeating tasks/ }));
    expect(screen.getByRole('heading', { name: 'Repeating tasks' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
