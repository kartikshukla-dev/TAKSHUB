// Slack-style message formatting, rendered as React elements (never raw
// HTML, so message text can't inject markup).
//   *bold* or **bold**, _italic_, ~strike~, `code`, ```code block```,
//   > quote, "- " / "1. " lists, links, @Name mentions, @channel / @here.

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '✅', '👀', '🙏', '🔥'];

export const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '🙂', '😉', '😍', '😘', '😎', '🤩', '🥳',
  '🤔', '🤨', '😐', '😶', '🙄', '😏', '😴', '😌', '😢', '😭', '😤', '😡', '🤯', '😱', '🥲', '🤗',
  '👍', '👎', '👌', '✌️', '🤞', '👏', '🙌', '🙏', '💪', '👀', '👋', '🤝', '✋', '☝️', '👉', '👈',
  '❤️', '💜', '💙', '💚', '🧡', '💛', '🔥', '✨', '⭐', '🎉', '🎊', '✅', '❌', '⚠️', '❓', '💯',
  '🚀', '💡', '📌', '📎', '📅', '⏰', '📈', '📉', '🐛', '🛠️', '💻', '☕', '🍕', '🎯', '🏆', '📞',
];

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// First http(s) link in a text, for the small link card under a message.
export function firstLink(text = '') {
  const m = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/.exec(text);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    return { href: u.href, host: u.hostname.replace(/^www\./, ''), path: (u.pathname + u.search).replace(/\/$/, '') };
  } catch {
    return null;
  }
}

function inline(text, ctx, keyBase) {
  const names = ctx.names || [];
  const mentionPart = names.length ? `|(@(?:${names.map(escapeRegex).join('|')}))(?![\\w])` : '';
  const rx = new RegExp(
    `(\`[^\`\\n]+\`)|(\\*\\*[^*\\n]+\\*\\*|\\*[^*\\s][^*\\n]*\\*)|(~[^~\\n]+~)|(_[^_\\n]+_)|(https?:\\/\\/[^\\s<]+[^\\s<.,;:!?)\\]'"])|(@(?:channel|here|all)\\b)${mentionPart}`,
    'g'
  );
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    const [tok] = m;
    if (m[1]) out.push(<code key={k} className="md-code">{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(tok.replace(/^\*\*?|\*\*?$/g, ''), ctx, k)}</strong>);
    else if (m[3]) out.push(<s key={k}>{inline(tok.slice(1, -1), ctx, k)}</s>);
    else if (m[4]) out.push(<em key={k}>{inline(tok.slice(1, -1), ctx, k)}</em>);
    else if (m[5]) {
      out.push(
        <a key={k} href={tok} target="_blank" rel="noopener noreferrer">
          {tok}
        </a>
      );
    } else {
      const me = ctx.meName && tok.slice(1).toLowerCase() === ctx.meName.toLowerCase();
      const all = Boolean(m[6]);
      out.push(
        <span key={k} className={`md-mention ${me || all ? 'md-mention-me' : ''}`}>
          {tok}
        </span>
      );
    }
    last = rx.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function blocks(text, ctx, keyBase) {
  const lines = text.split('\n');
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (!para.length) return;
    const k = `${keyBase}-p${out.length}`;
    out.push(
      <p key={k} className="md-p">
        {para.map((l, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {inline(l, ctx, `${k}-${i}`)}
          </span>
        ))}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `${keyBase}-l${out.length}`;
    const Tag = list.ordered ? 'ol' : 'ul';
    out.push(
      <Tag key={k} className="md-list">
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, ctx, `${k}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };
  lines.forEach((line) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (bullet || num) {
      flushPara();
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || num)[1]);
    } else if (quote) {
      flushPara();
      flushList();
      out.push(
        <blockquote key={`${keyBase}-q${out.length}`} className="md-quote">
          {inline(quote[1], ctx, `${keyBase}-q${out.length}`)}
        </blockquote>
      );
    } else {
      flushList();
      para.push(line);
    }
  });
  flushPara();
  flushList();
  return out;
}

// ctx: { names: [display names that can be @mentioned], meName }
export function RichText({ text, ctx = {} }) {
  if (!text) return null;
  const parts = text.split(/```/);
  return (
    <div className="md">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // ```lang\ncode``` : first line is an optional language tag.
          const nl = part.indexOf('\n');
          const head = nl >= 0 ? part.slice(0, nl).trim() : '';
          const code = /^[\w+#-]{1,20}$/.test(head) ? part.slice(nl + 1) : part.replace(/^\n/, '');
          return (
            <pre key={i} className="md-pre">
              <code>{code.replace(/\n$/, '')}</code>
            </pre>
          );
        }
        return part.trim() ? <div key={i}>{blocks(part.replace(/^\n|\n$/g, ''), ctx, `b${i}`)}</div> : null;
      })}
    </div>
  );
}

export function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function timeLabel(date) {
  return new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function fileSize(n = 0) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function previewText(m) {
  if (!m) return '';
  if (m.deletedAt) return 'This message was deleted';
  if (m.text) return m.text;
  if (m.snippet) return `Snippet: ${m.snippet.title || m.snippet.language || 'code'}`;
  if (m.media) return m.media.type === 'gif' ? 'GIF' : 'Sticker';
  if (m.files?.length) return `📎 ${m.files[0].filename}`;
  return '';
}
