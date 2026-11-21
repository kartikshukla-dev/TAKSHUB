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
  it('shows this release plus the comments / install entries, switches between them and marks it seen', () => {
    expect(hasSeenRelease()).toBe(false);
    const onClose = vi.fn();
    renderIt(onClose);
    expect(hasSeenRelease()).toBe(true);
    expect(screen.getByRole('heading', { name: 'GIF search that keeps working' })).toBeTruthy();
    expect(screen.getByText('1 of 8')).toBeTruthy();
    [
      'Not approved, with a reason',
      'Deadline reminders',
      'Notifications even when the app is closed',
      '@mention people in task comments',
      'Repeating tasks',
      'See new comments at a glance',
      'Install Tasks Manager as an app',
    ].forEach((t) => expect(screen.getByRole('button', { name: new RegExp(t) })).toBeTruthy());
    // Older releases (stickers etc.) stay gone.
    expect(screen.queryByText('GIFs, emoji and stickers')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Install Tasks Manager as an app/ }));
    expect(screen.getByRole('heading', { name: 'Install Tasks Manager as an app' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
