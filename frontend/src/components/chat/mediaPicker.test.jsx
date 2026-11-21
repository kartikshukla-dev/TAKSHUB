import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../api/workspace', () => ({
  listStickers: vi.fn(),
  searchGiphy: vi.fn(),
  fetchApiBlob: vi.fn(),
  toggleSavedSticker: vi.fn(),
  uploadSticker: vi.fn(),
  updateSticker: vi.fn(),
  deleteSticker: vi.fn(),
}));

// eslint-disable-next-line import/first
import * as ws from '../../api/workspace';
// eslint-disable-next-line import/first
import MediaPicker from './MediaPicker';
// eslint-disable-next-line import/first
import Composer from './Composer';

const STICKERS = {
  office: [
    { source: 'office', ref: 'lgtm', url: '/stickers/office/lgtm.svg', title: 'LGTM' },
    { source: 'office', ref: 'coffee', url: '/stickers/office/coffee.svg', title: 'Coffee break' },
  ],
  mine: [],
  saved: [],
  recent: [],
  giphy: false,
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(ws.listStickers).mockResolvedValue(STICKERS);
});

describe('MediaPicker', () => {
  it('searches the full emoji library', async () => {
    const onEmoji = vi.fn();
    render(<MediaPicker onEmoji={onEmoji} onMedia={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search emoji'), { target: { value: 'pizza' } });
    const btn = await screen.findByRole('button', { name: 'pizza' }, { timeout: 5000 });
    fireEvent.click(btn);
    expect(onEmoji).toHaveBeenCalledWith('🍕');
    expect(JSON.parse(localStorage.getItem('oncare_recent_emoji'))).toEqual(['🍕']);
  });

  it('shows office stickers, empty recent, searches them, and GIFs credit the provider that answered', async () => {
    vi.mocked(ws.searchGiphy).mockResolvedValue({
      items: [{ type: 'gif', source: 'klipy', ref: 'k1', title: 'Party', url: 'https://static.klipy.com/a.gif' }],
      next: 'klipy:2',
      label: 'KLIPY',
    });
    const onMedia = vi.fn();
    render(<MediaPicker onEmoji={vi.fn()} onMedia={onMedia} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
    expect(await screen.findByText('Stickers you send show up here.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search stickers'), { target: { value: 'coff' } });
    expect(screen.queryByRole('button', { name: 'LGTM' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Coffee break' }));
    expect(onMedia).toHaveBeenCalledWith(expect.objectContaining({ type: 'sticker', source: 'office', ref: 'coffee' }));

    fireEvent.click(screen.getByRole('tab', { name: 'GIFs' }));
    expect(await screen.findByText('Powered by KLIPY')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Party' }));
    expect(onMedia).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'gif', source: 'klipy' }));
    // Trending once; reopening the tab is served from the session cache.
    fireEvent.click(screen.getByRole('tab', { name: 'Emoji' }));
    fireEvent.click(screen.getByRole('tab', { name: 'GIFs' }));
    await screen.findByText('Powered by KLIPY');
    expect(ws.searchGiphy).toHaveBeenCalledTimes(1);
  });
});

describe('Composer stickers', () => {
  it('sends a sticker as its own message', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<Composer members={[]} meId="me" onSend={onSend} placeholder="Message" />);
    fireEvent.click(screen.getByLabelText('Emoji, GIFs and stickers'));
    fireEvent.click(screen.getByRole('tab', { name: 'Stickers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'LGTM' }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0]).toMatchObject({ text: '', media: { source: 'office', ref: 'lgtm' } });
  });
});
