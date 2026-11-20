import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = { isAdmin: false, isHead: false };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

// eslint-disable-next-line import/first
import WhatsNew from './WhatsNew';
// eslint-disable-next-line import/first
import { hasSeenRelease } from '../utils/whatsNew';

const renderIt = (onClose = vi.fn()) =>
  render(
    <MemoryRouter>
      <WhatsNew onClose={onClose} />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  auth.isAdmin = false;
  auth.isHead = false;
});

describe("What's new", () => {
  it('lists the new features, switches between them and marks the release seen', () => {
    expect(hasSeenRelease()).toBe(false);
    const onClose = vi.fn();
    renderIt(onClose);
    expect(hasSeenRelease()).toBe(true);
    expect(screen.getByRole('heading', { name: 'See new comments at a glance' })).toBeTruthy();
    ['Install Tasks Manager as an app', 'GIFs, emoji and stickers', 'Make your own stickers', 'Save stickers you like', 'Not approved status', 'Meme message sounds'].forEach((t) =>
      expect(screen.getByRole('button', { name: new RegExp(t) })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: /Not approved status/ }));
    expect(screen.getByRole('heading', { name: 'Not approved status' })).toBeTruthy();
    expect(screen.getByText(/Only your Team Head/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('tells Team Heads they can use Not approved', () => {
    auth.isHead = true;
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /Not approved status/ }));
    expect(screen.getByText(/As a Team Head, you can set this/)).toBeTruthy();
  });

  it('turns on meme sounds from the modal', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /Meme message sounds/ }));
    fireEvent.click(screen.getByLabelText('Use meme sounds for new messages'));
    expect(localStorage.getItem('oncare_msg_sound_style')).toBe('meme');
  });
});
