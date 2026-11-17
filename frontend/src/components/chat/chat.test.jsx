import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RichText, firstLink } from './format';
import Composer from './Composer';

describe('chat formatting', () => {
  it('renders bold, italic, code, links and mentions without raw HTML', () => {
    const { container } = render(
      <RichText text={'*Deploy* _today_ `npm ci` see https://example.com/x @Rahul Dev <b>x</b>'} ctx={{ names: ['Rahul Dev'], meName: 'Rahul Dev' }} />
    );
    expect(container.querySelector('strong').textContent).toBe('Deploy');
    expect(container.querySelector('em').textContent).toBe('today');
    expect(container.querySelector('.md-code').textContent).toBe('npm ci');
    expect(container.querySelector('a').getAttribute('href')).toBe('https://example.com/x');
    expect(container.querySelector('.md-mention-me').textContent).toBe('@Rahul Dev');
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>x</b>');
  });

  it('renders code blocks, lists and quotes', () => {
    const { container } = render(<RichText text={'```js\nconst a = 1;\n```\n- one\n- two\n> note'} />);
    expect(container.querySelector('pre').textContent).toBe('const a = 1;');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('blockquote').textContent).toBe('note');
  });

  it('finds the first link for the link card', () => {
    expect(firstLink('go to https://www.oncarecancer.com/about.')).toMatchObject({ host: 'oncarecancer.com', path: '/about' });
    expect(firstLink('no link')).toBeNull();
  });
});

describe('Composer', () => {
  const members = [
    { _id: 'me', name: 'Kartik Shukla' },
    { _id: 'u2', name: 'Rahul Dev' },
  ];

  it('sends on Enter with the @mentioned people', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<Composer members={members} meId="me" onSend={onSend} placeholder="Message" />);
    const box = screen.getByLabelText('Message');
    fireEvent.change(box, { target: { value: '@Rah', selectionStart: 4 } });
    fireEvent.mouseDown(screen.getByText('Rahul Dev'));
    fireEvent.change(box, { target: { value: '@Rahul Dev please check', selectionStart: 23 } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0]).toMatchObject({ text: '@Rahul Dev please check', mentions: ['u2'] });
  });

  it('opens the snippet box when a long block is pasted, and sends it as a snippet', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<Composer members={members} meId="me" onSend={onSend} placeholder="Message" />);
    const code = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
    fireEvent.paste(screen.getByLabelText('Message'), { clipboardData: { getData: () => code, files: [] } });
    expect(screen.getByText('Share a snippet')).toBeInTheDocument();
    expect(screen.getByText(/1,000 lines/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Share snippet'));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0].snippet.code.split('\n')).toHaveLength(1000);
  });
});
