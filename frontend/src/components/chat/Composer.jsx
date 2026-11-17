import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import { Avatar, Modal } from '../ui';
import { idOf } from '../../utils/format';
import { EmojiPicker } from './MessageParts';
import { fileSize } from './format';

export const TEXT_MAX = 4000;
export const SNIPPET_MAX = 200000;
const FILE_MAX = 10 * 1024 * 1024;
const FILES_MAX = 5;
// Pasting more than this many lines suggests the snippet box.
const PASTE_SNIPPET_LINES = 30;

const LANGUAGES = ['text', 'javascript', 'typescript', 'python', 'java', 'sql', 'json', 'html', 'css', 'bash', 'yaml', 'markdown'];

// Big box for long text / code (e.g. 1000+ lines): sent as one snippet.
export function SnippetModal({ initialCode = '', onClose, onSend }) {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('text');
  const [code, setCode] = useState(initialCode);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lines = code ? code.split('\n').length : 0;
  const tooLong = code.length > SNIPPET_MAX;

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim() || tooLong) return;
    setBusy(true);
    setError('');
    const ok = await onSend({ text: comment.trim(), snippet: { title: title.trim(), language, code } });
    setBusy(false);
    if (ok) onClose();
    else setError('Could not send the snippet. Try again.');
  };

  return (
    <Modal
      title="Share a snippet"
      icon="code"
      wide
      onClose={onClose}
      footer={
        <>
          <span className={`muted small snippet-count ${tooLong ? 'text-danger' : ''}`}>
            {lines.toLocaleString()} lines · {code.length.toLocaleString()} / {SNIPPET_MAX.toLocaleString()} characters
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="snippet-form" className="btn btn-primary" disabled={busy || !code.trim() || tooLong}>
            {busy ? 'Sending…' : 'Share snippet'}
          </button>
        </>
      }
    >
      <form id="snippet-form" className="form-stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="snip-title">Title (optional)</label>
            <input id="snip-title" className="input" value={title} placeholder="e.g. estimateService.js" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="snip-lang">Type</label>
            <select id="snip-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l === 'text' ? 'Plain text' : l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="snip-code">Content</label>
          <textarea
            id="snip-code"
            className="input snippet-input"
            value={code}
            spellCheck={false}
            rows={18}
            placeholder="Paste code or long text here. Thousands of lines are fine."
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              // Tab inserts spaces instead of leaving the box.
              if (e.key === 'Tab') {
                e.preventDefault();
                const { selectionStart: s, selectionEnd: en } = e.target;
                const box = e.target;
                setCode(`${code.slice(0, s)}  ${code.slice(en)}`);
                requestAnimationFrame(() => box.isConnected && box.setSelectionRange(s + 2, s + 2));
              }
            }}
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="snip-comment">Message (optional)</label>
          <input id="snip-comment" className="input" value={comment} maxLength={TEXT_MAX} placeholder="Add a note" onChange={(e) => setComment(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

/**
 * props: placeholder, members (people who can be @mentioned), allowChannelMention,
 *        onSend({ text, mentions, files, snippet }) -> Promise<boolean>, onTyping
 */
export default function Composer({ placeholder, members = [], meId, allowChannelMention, onSend, onTyping, autoFocus, compact }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [mentions, setMentions] = useState([]); // [{ id, name }]
  const [query, setQuery] = useState(null); // { start, q }
  const [pick, setPick] = useState(0);
  const [emoji, setEmoji] = useState(false);
  const [snippet, setSnippet] = useState(null); // null | initial code
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const fileRef = useRef(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const options = useMemo(() => {
    if (!query) return [];
    const q = query.q.toLowerCase();
    const people = members
      .filter((u) => idOf(u) !== meId && u.name?.toLowerCase().includes(q))
      .slice(0, 6)
      .map((u) => ({ id: idOf(u), name: u.name, user: u }));
    const special = allowChannelMention
      ? ['channel', 'here'].filter((s) => s.startsWith(q)).map((s) => ({ id: s, name: s, special: true }))
      : [];
    return [...people, ...special];
  }, [query, members, meId, allowChannelMention]);

  const detectMention = (value, caret) => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\w.-]*(?: [\w.-]*)?)$/.exec(before);
    if (m && m[2].length <= 30) {
      setQuery({ start: caret - m[2].length - 1, q: m[2] });
      setPick(0);
    } else setQuery(null);
  };

  const change = (e) => {
    setText(e.target.value);
    setError('');
    detectMention(e.target.value, e.target.selectionStart);
    const now = Date.now();
    if (onTyping && e.target.value && now - lastTyping.current > 3000) {
      lastTyping.current = now;
      onTyping();
    }
  };

  const insertMention = (opt) => {
    const caret = ref.current.selectionStart;
    const token = `@${opt.name} `;
    const next = text.slice(0, query.start) + token + text.slice(caret);
    setText(next);
    if (!opt.special) setMentions((prev) => (prev.some((p) => p.id === opt.id) ? prev : [...prev, { id: opt.id, name: opt.name }]));
    setQuery(null);
    const pos = query.start + token.length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const insertAtCaret = (str) => {
    const el = ref.current;
    const s = el?.selectionStart ?? text.length;
    const en = el?.selectionEnd ?? text.length;
    setText(text.slice(0, s) + str + text.slice(en));
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(s + str.length, s + str.length);
    });
  };

  // Wrap the selection: *bold*, _italic_, `code`.
  const wrap = (mark) => {
    const el = ref.current;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const sel = text.slice(s, en) || 'text';
    setText(text.slice(0, s) + mark + sel + mark + text.slice(en));
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(s + mark.length, s + mark.length + sel.length);
    });
  };

  const addFiles = (list) => {
    const picked = Array.from(list || []);
    const big = picked.filter((f) => f.size > FILE_MAX);
    const ok = picked.filter((f) => f.size <= FILE_MAX);
    setFiles((prev) => [...prev, ...ok].slice(0, FILES_MAX));
    if (big.length) setError(`${big.map((f) => f.name).join(', ')} is over 10 MB.`);
    else if (files.length + ok.length > FILES_MAX) setError(`Up to ${FILES_MAX} files per message.`);
  };

  const submit = async (extra) => {
    const body = (extra?.text ?? text).trim();
    if (extra?.snippet || body || files.length) {
      if (!extra?.snippet && body.length > TEXT_MAX) {
        setError(`This is over ${TEXT_MAX.toLocaleString()} characters. Send it as a snippet.`);
        return false;
      }
      setBusy(true);
      const used = mentions.filter((mm) => body.includes(`@${mm.name}`)).map((mm) => mm.id);
      const ok = await onSend({ text: body, mentions: used, files: extra?.snippet ? [] : files, snippet: extra?.snippet || null });
      setBusy(false);
      if (ok && !extra?.snippet) {
        setText('');
        setFiles([]);
        setMentions([]);
      }
      if (ok && extra?.snippet) setMentions([]);
      return ok;
    }
    return false;
  };

  const keyDown = (e) => {
    if (query && options.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPick((p) => (p + 1) % options.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPick((p) => (p - 1 + options.length) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(options[pick]);
        return;
      }
      if (e.key === 'Escape') {
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const paste = (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (pasted.split('\n').length > PASTE_SNIPPET_LINES || pasted.length > TEXT_MAX) {
      e.preventDefault();
      setSnippet(pasted);
    }
    if (e.clipboardData?.files?.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  return (
    <div className={`composer ${compact ? 'composer-compact' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      {query && options.length > 0 && (
        <ul className="mention-list" role="listbox">
          {options.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                className={`mention-opt ${i === pick ? 'mention-opt-on' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(o);
                }}
              >
                {o.special ? <Icon name="users" size={14} /> : <Avatar user={o.user} size="xs" />}
                <span>{o.special ? `@${o.name}` : o.name}</span>
                {o.special && <span className="muted small">notify everyone here</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <div className="composer-files">
          {files.map((f, i) => (
            <span key={`${f.name}${i}`} className="composer-file">
              <Icon name="paperclip" size={13} /> {f.name} <span className="muted small">{fileSize(f.size)}</span>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setFiles((p) => p.filter((_, x) => x !== i))} aria-label={`Remove ${f.name}`}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="composer-input"
        rows={1}
        value={text}
        placeholder={placeholder}
        onChange={change}
        onKeyDown={keyDown}
        onPaste={paste}
        onClick={(e) => detectMention(text, e.target.selectionStart)}
        aria-label="Message"
        autoFocus={autoFocus}
      />
      {error && (
        <div className="composer-error">
          {error}
          {text.length > TEXT_MAX && (
            <button type="button" className="link-btn" onClick={() => setSnippet(text)}>
              Send as snippet
            </button>
          )}
        </div>
      )}
      <div className="composer-bar">
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => wrap('*')} aria-label="Bold" title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => wrap('_')} aria-label="Italic" title="Italic">
          <em>I</em>
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => wrap('`')} aria-label="Inline code" title="Code">
          <Icon name="code" size={14} />
        </button>
        <span className="composer-sep" />
        <div className="popover-anchor">
          <button type="button" className="icon-btn icon-btn-sm" onClick={() => setEmoji((v) => !v)} aria-label="Emoji" title="Emoji">
            <Icon name="smile" size={15} />
          </button>
          {emoji && (
            <EmojiPicker
              onClose={() => setEmoji(false)}
              onPick={(e) => {
                setEmoji(false);
                insertAtCaret(e);
              }}
            />
          )}
        </div>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files">
          <Icon name="paperclip" size={15} />
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn btn-secondary btn-sm composer-snippet" onClick={() => setSnippet(text.length > 200 ? text : '')} title="Long text or code">
          <Icon name="code" size={14} /> Snippet
        </button>
        <span className="composer-hint muted small">Enter to send · Shift+Enter new line</span>
        <button
          type="button"
          className="btn btn-primary btn-sm composer-send"
          onClick={() => submit()}
          disabled={busy || (!text.trim() && files.length === 0)}
          aria-label="Send"
        >
          <Icon name="send" size={14} />
        </button>
      </div>
      {snippet !== null && (
        <SnippetModal
          initialCode={snippet}
          onClose={() => setSnippet(null)}
          onSend={async (payload) => {
            const ok = await submit(payload);
            if (ok && snippet === text) setText('');
            return ok;
          }}
        />
      )}
    </div>
  );
}
