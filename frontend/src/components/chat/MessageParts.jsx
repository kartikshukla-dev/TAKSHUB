import { useEffect, useRef, useState } from 'react';
import * as ws from '../../api/workspace';
import Icon from '../Icon';
import { EMOJIS, fileSize } from './format';

const PREVIEW_LINES = 14;

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EXT = { javascript: 'js', typescript: 'ts', python: 'py', java: 'java', sql: 'sql', json: 'json', html: 'html', css: 'css', bash: 'sh', yaml: 'yml', markdown: 'md' };

// Long text / code: collapsed to the first lines with Copy and Download.
export function SnippetView({ snippet }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = snippet.code.split('\n');
  const long = lines.length > PREVIEW_LINES;
  const shown = open || !long ? snippet.code : lines.slice(0, PREVIEW_LINES).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const download = () => {
    const name = snippet.title || `snippet.${EXT[snippet.language] || 'txt'}`;
    saveBlob(new Blob([snippet.code], { type: 'text/plain;charset=utf-8' }), name);
  };

  return (
    <div className="snippet">
      <div className="snippet-head">
        <Icon name="code" size={14} />
        <strong className="snippet-title">{snippet.title || 'Snippet'}</strong>
        <span className="muted small">
          {snippet.language} · {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
        <span className="snippet-actions">
          <button type="button" className="icon-btn icon-btn-sm" onClick={copy} aria-label="Copy snippet" title="Copy">
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
          <button type="button" className="icon-btn icon-btn-sm" onClick={download} aria-label="Download snippet" title="Download">
            <Icon name="download" size={14} />
          </button>
        </span>
      </div>
      <pre className={`snippet-code ${open ? 'snippet-open' : ''}`}>
        <code>
          {shown.split('\n').map((l, i) => (
            <span key={i} className="snippet-line">
              <span className="snippet-ln">{i + 1}</span>
              {l || ' '}
            </span>
          ))}
        </code>
      </pre>
      {long && (
        <button type="button" className="snippet-more" onClick={() => setOpen((v) => !v)}>
          {open ? 'Collapse' : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

function ImageFile({ messageId, file }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    let cancelled = false;
    ws.fetchChatFile(messageId, file.fileId, true)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [messageId, file.fileId]);
  return src ? <img className="chat-image" src={src} alt={file.filename} /> : <div className="chat-image chat-image-loading" />;
}

export function FileList({ message }) {
  const download = async (f) => {
    try {
      saveBlob(await ws.fetchChatFile(message._id, f.fileId), f.filename);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="chat-files">
      {message.files.map((f) => (
        <div key={f.fileId} className="chat-file">
          {/^image\/(png|jpe?g|gif|webp)$/i.test(f.contentType) && <ImageFile messageId={message._id} file={f} />}
          <button type="button" className="chat-file-chip" onClick={() => download(f)} title="Download">
            <Icon name="paperclip" size={14} />
            <span className="chat-file-name">{f.filename}</span>
            <span className="muted small">{fileSize(f.size)}</span>
            <Icon name="download" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Small popover grid; closes on outside click or Escape.
export function EmojiPicker({ onPick, onClose, align = 'left' }) {
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const key = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div className={`emoji-picker emoji-picker-${align}`} ref={ref} role="dialog" aria-label="Pick an emoji">
      {EMOJIS.map((e) => (
        <button key={e} type="button" className="emoji-btn" onClick={() => onPick(e)} aria-label={e}>
          {e}
        </button>
      ))}
    </div>
  );
}
