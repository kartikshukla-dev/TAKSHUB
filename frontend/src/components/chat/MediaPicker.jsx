import { useEffect, useMemo, useRef, useState } from 'react';
import * as ws from '../../api/workspace';
import Icon from '../Icon';

// ---------- shared sticker state (one fetch per session, kept fresh) ----------

const RECENT_EMOJI_KEY = 'oncare_recent_emoji';
const RECENT_EMOJI_MAX = 24;
const STICKER_FILE_MAX = 1024 * 1024;

let stickerCache = null; // { office, mine, saved, recent, giphy }
const listeners = new Set();
function setStickerCache(next) {
  stickerCache = next;
  listeners.forEach((fn) => fn(next));
}
export function loadStickers() {
  return ws.listStickers().then((data) => {
    setStickerCache(data);
    return data;
  });
}
function useStickers(active) {
  const [data, setData] = useState(stickerCache);
  const [error, setError] = useState('');
  useEffect(() => {
    listeners.add(setData);
    return () => listeners.delete(setData);
  }, []);
  useEffect(() => {
    if (!active) return;
    loadStickers().catch(() => setError('Could not load stickers'));
  }, [active]);
  return { data, error };
}

const sameSticker = (a, b) => a && b && a.source === b.source && String(a.ref) === String(b.ref);
export const isSavedSticker = (media) => Boolean(stickerCache?.saved?.some((s) => sameSticker(s, media)));

// Save / unsave a sticker (WhatsApp-style favourites). Returns the new state.
export async function toggleSavedSticker(media) {
  const sticker = { source: media.source, ref: media.ref, url: media.url, title: media.title, width: media.width, height: media.height };
  const res = await ws.toggleSavedSticker(sticker);
  if (stickerCache) setStickerCache({ ...stickerCache, saved: res.saved });
  return res.on;
}

// After sending a sticker, show it first in Recent without a refetch.
function rememberRecent(media) {
  if (!stickerCache || media.type !== 'sticker') return;
  const rest = (stickerCache.recent || []).filter((s) => !sameSticker(s, media));
  setStickerCache({ ...stickerCache, recent: [media, ...rest].slice(0, 30) });
}

// ---------- images ----------

// Custom sticker images need the auth header, so they are fetched as blobs.
const blobCache = new Map(); // path -> Promise<objectURL>
function apiImage(path) {
  if (!blobCache.has(path)) {
    const p = ws.fetchApiBlob(path).then((b) => URL.createObjectURL(b));
    p.catch(() => blobCache.delete(path));
    blobCache.set(path, p);
  }
  return blobCache.get(path);
}

export function StickerImg({ media, className = '', alt }) {
  const fromApi = media?.url?.startsWith('/chat/');
  const [src, setSrc] = useState(fromApi ? null : media?.preview || media?.url);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (!fromApi) {
      setSrc(media?.preview || media?.url);
      return undefined;
    }
    let live = true;
    apiImage(media.url)
      .then((u) => live && setSrc(u))
      .catch(() => live && setBroken(true));
    return () => {
      live = false;
    };
  }, [fromApi, media?.url, media?.preview]);
  if (broken) return <span className={`sticker-img sticker-missing ${className}`}>Sticker removed</span>;
  if (!src) return <span className={`sticker-img sticker-loading ${className}`} />;
  return (
    <img
      className={`sticker-img ${className}`}
      src={src}
      alt={alt ?? media.title ?? 'Sticker'}
      loading="lazy"
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}

// A GIF / sticker inside a message.
export function MessageMedia({ media }) {
  const gif = media.type === 'gif';
  const style = gif && media.width && media.height ? { aspectRatio: `${media.width} / ${media.height}` } : undefined;
  return (
    <div className={`msg-media ${gif ? 'msg-gif' : 'msg-sticker'}`} style={style}>
      <StickerImg media={{ ...media, preview: undefined }} alt={media.title || (gif ? 'GIF' : 'Sticker')} />
    </div>
  );
}

// ---------- emoji ----------

const GROUPS = [
  { id: 0, label: 'Smileys', icon: '😀' },
  { id: 1, label: 'People', icon: '👋' },
  { id: 3, label: 'Animals & nature', icon: '🐶' },
  { id: 4, label: 'Food & drink', icon: '🍕' },
  { id: 5, label: 'Travel & places', icon: '✈️' },
  { id: 6, label: 'Activities', icon: '⚽' },
  { id: 7, label: 'Objects', icon: '💡' },
  { id: 8, label: 'Symbols', icon: '❤️' },
  { id: 9, label: 'Flags', icon: '🏳️' },
];

// ~540 KB of emoji data, loaded only when the picker first opens.
let emojiPromise = null;
export function loadEmojis() {
  if (!emojiPromise) {
    emojiPromise = import('emojibase-data/en/compact.json')
      .then((mod) => {
        const list = (mod.default || mod).filter((e) => e.group !== undefined && e.group !== 2);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return list.map((e) => ({
          char: e.unicode,
          label: e.label,
          group: e.group,
          search: `${e.label} ${(e.tags || []).join(' ')} ${(e.shortcodes || []).join(' ')}`.toLowerCase(),
        }));
      })
      .catch((err) => {
        emojiPromise = null;
        throw err;
      });
  }
  return emojiPromise;
}

function readRecentEmoji() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_EMOJI_MAX) : [];
  } catch {
    return [];
  }
}
function pushRecentEmoji(char) {
  const next = [char, ...readRecentEmoji().filter((c) => c !== char)].slice(0, RECENT_EMOJI_MAX);
  try {
    localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
  } catch {
    /* storage full / blocked */
  }
}

function EmojiTab({ query, onPick }) {
  const [emojis, setEmojis] = useState(null);
  const [failed, setFailed] = useState(false);
  const [recent] = useState(readRecentEmoji);
  const bodyRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadEmojis()
      .then((list) => live && setEmojis(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!emojis || !q) return null;
    const words = q.split(/\s+/);
    return emojis.filter((e) => words.every((w) => e.search.includes(w))).slice(0, 240);
  }, [emojis, q]);

  const pick = (char) => {
    pushRecentEmoji(char);
    onPick(char);
  };
  const btn = (e) => (
    <button key={e.char} type="button" className="emoji-btn" onClick={() => pick(e.char)} title={e.label} aria-label={e.label}>
      {e.char}
    </button>
  );

  if (failed) return <p className="media-empty">Could not load emoji.</p>;
  if (!emojis) return <p className="media-empty">Loading emoji…</p>;
  if (results) {
    return results.length ? <div className="emoji-grid">{results.map(btn)}</div> : <p className="media-empty">No emoji for “{query}”.</p>;
  }

  const jump = (id) => bodyRef.current?.querySelector(`[data-group="${id}"]`)?.scrollIntoView({ block: 'start' });
  return (
    <>
      <div className="emoji-groups" role="tablist" aria-label="Emoji groups">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" className="emoji-group-btn" onClick={() => jump(g.id)} title={g.label} aria-label={g.label}>
            {g.icon}
          </button>
        ))}
      </div>
      <div className="media-scroll" ref={bodyRef}>
        {recent.length > 0 && (
          <section>
            <h4 className="media-heading">Recent</h4>
            <div className="emoji-grid">
              {recent.map((c) => (
                <button key={c} type="button" className="emoji-btn" onClick={() => pick(c)} aria-label={c}>
                  {c}
                </button>
              ))}
            </div>
          </section>
        )}
        {GROUPS.map((g) => (
          <section key={g.id} data-group={g.id}>
            <h4 className="media-heading">{g.label}</h4>
            <div className="emoji-grid">{emojis.filter((e) => e.group === g.id).map(btn)}</div>
          </section>
        ))}
      </div>
    </>
  );
}

// ---------- GIPHY (GIFs and animated stickers) ----------

function useGiphy(kind, query, enabled) {
  const [state, setState] = useState({ items: [], next: null, loading: false, error: '' });
  const q = query.trim();
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const t = setTimeout(() => {
      ws.searchGiphy(kind, q, 0)
        .then((r) => live && setState({ items: r.items || [], next: r.next, loading: false, error: '' }))
        .catch((err) => live && setState({ items: [], next: null, loading: false, error: err.response?.data?.message || 'GIF search failed' }));
    }, q ? 350 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kind, q, enabled]);

  const more = () => {
    if (state.next == null || state.loading) return;
    setState((s) => ({ ...s, loading: true }));
    ws.searchGiphy(kind, q, state.next)
      .then((r) => setState((s) => ({ items: [...s.items, ...(r.items || [])], next: r.next, loading: false, error: '' })))
      .catch(() => setState((s) => ({ ...s, loading: false })));
  };
  return { ...state, more };
}

function GiphyGrid({ kind, query, enabled, onPick }) {
  const { items, next, loading, error, more } = useGiphy(kind, query, enabled);
  return (
    <>
      {error && <p className="media-empty">{error}</p>}
      {!error && !loading && items.length === 0 && <p className="media-empty">Nothing found.</p>}
      <div className={kind === 'gifs' ? 'gif-grid' : 'sticker-grid'}>
        {items.map((g) => (
          <button key={g.ref} type="button" className={kind === 'gifs' ? 'gif-btn' : 'sticker-btn'} onClick={() => onPick(g)} title={g.title}>
            <StickerImg media={g} />
          </button>
        ))}
      </div>
      {loading && <p className="media-empty">Loading…</p>}
      {!loading && next != null && (
        <button type="button" className="btn btn-secondary btn-sm media-more" onClick={more}>
          Load more
        </button>
      )}
      <p className="giphy-credit">Powered by GIPHY</p>
    </>
  );
}

function GifTab({ query, giphy, onPick }) {
  if (giphy === undefined) return <p className="media-empty">Loading…</p>;
  if (!giphy) {
    return (
      <p className="media-empty">
        GIF search isn’t switched on yet. Ask your admin to add a free GIPHY API key on the server.
      </p>
    );
  }
  return (
    <div className="media-scroll">
      <GiphyGrid kind="gifs" query={query} enabled onPick={onPick} />
    </div>
  );
}

// ---------- stickers ----------

function UploadSticker({ onDone, onCancel }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [global, setGlobal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const choose = (f) => {
    setError('');
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(f.type)) return setError('Use a PNG, JPG, GIF or WebP image.');
    if (f.size > STICKER_FILE_MAX) return setError('Image must be 1 MB or smaller.');
    setFile(f);
    if (!name) setName(f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60));
    return undefined;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setBusy(true);
    try {
      await ws.uploadSticker({ file, name: name.trim(), global });
      await loadStickers();
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
      setBusy(false);
    }
  };

  return (
    <form className="sticker-upload" onSubmit={submit}>
      <strong>New sticker</strong>
      <label className="sticker-drop">
        {preview ? <img src={preview} alt="" /> : <span className="muted small">Pick an image (PNG, JPG, GIF, WebP · up to 1 MB)</span>}
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => choose(e.target.files?.[0])} />
      </label>
      <input className="input" value={name} maxLength={60} placeholder="Sticker name" onChange={(e) => setName(e.target.value)} aria-label="Sticker name" />
      <label className="media-check">
        <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
        <span>Share with everyone (adds it to Office stickers)</span>
      </label>
      {error && <p className="text-danger small">{error}</p>}
      <div className="sticker-upload-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !file || !name.trim()}>
          {busy ? 'Uploading…' : 'Add sticker'}
        </button>
      </div>
    </form>
  );
}

function StickerButton({ s, onPick, children }) {
  return (
    <div className="sticker-cell">
      <button type="button" className="sticker-btn" onClick={() => onPick(s)} title={s.title} aria-label={s.title || 'Sticker'}>
        <StickerImg media={s} />
      </button>
      {children}
    </div>
  );
}

function StickerTab({ query, data, error, onPick }) {
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const q = query.trim().toLowerCase();

  if (error && !data) return <p className="media-empty">{error}</p>;
  if (!data) return <p className="media-empty">Loading stickers…</p>;
  if (uploading) return <UploadSticker onDone={() => setUploading(false)} onCancel={() => setUploading(false)} />;

  const match = (s) => !q || String(s.title || '').toLowerCase().includes(q) || String(s.emoji || '') === q;
  const toggleGlobal = async (s) => {
    setBusyId(s.ref);
    try {
      await ws.updateSticker(s.ref, { global: !s.global });
      await loadStickers();
    } finally {
      setBusyId(null);
    }
  };
  const remove = async (s) => {
    if (!window.confirm(`Delete the sticker “${s.title}”? It will disappear from old messages too.`)) return;
    setBusyId(s.ref);
    try {
      await ws.deleteSticker(s.ref);
      await loadStickers();
    } finally {
      setBusyId(null);
    }
  };

  const sections = [
    { id: 'recent', title: 'Recent', items: data.recent.filter(match), empty: 'Stickers you send show up here.' },
    { id: 'saved', title: 'Saved', items: data.saved.filter(match), empty: 'Hover a sticker in chat and pick “Save sticker”.' },
    { id: 'office', title: 'Office stickers', items: data.office.filter(match) },
  ];

  return (
    <div className="media-scroll">
      {sections.map((sec) =>
        sec.items.length || (!q && sec.empty) ? (
          <section key={sec.id}>
            <h4 className="media-heading">{sec.title}</h4>
            {sec.items.length ? (
              <div className="sticker-grid">
                {sec.items.map((s) => (
                  <StickerButton key={`${s.source}-${s.ref}`} s={{ ...s, type: 'sticker' }} onPick={onPick} />
                ))}
              </div>
            ) : (
              <p className="media-hint">{sec.empty}</p>
            )}
          </section>
        ) : null
      )}

      <section>
        <div className="media-heading-row">
          <h4 className="media-heading">My stickers</h4>
          <button type="button" className="link-btn" onClick={() => setUploading(true)}>
            <Icon name="plus" size={13} /> Create
          </button>
        </div>
        {data.mine.filter(match).length ? (
          <div className="sticker-grid">
            {data.mine.filter(match).map((s) => (
              <StickerButton key={s.ref} s={{ ...s, type: 'sticker' }} onPick={onPick}>
                <span className="sticker-tools">
                  <button
                    type="button"
                    className={`icon-btn icon-btn-xs ${s.global ? 'is-on' : ''}`}
                    disabled={busyId === s.ref}
                    onClick={() => toggleGlobal(s)}
                    title={s.global ? 'Shared with everyone. Click to make private' : 'Share with everyone'}
                    aria-label={s.global ? 'Make private' : 'Share with everyone'}
                  >
                    <Icon name="users" size={11} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-xs" disabled={busyId === s.ref} onClick={() => remove(s)} title="Delete" aria-label="Delete sticker">
                    <Icon name="trash" size={11} />
                  </button>
                </span>
              </StickerButton>
            ))}
          </div>
        ) : (
          <p className="media-hint">{q ? 'No match.' : 'Make your own sticker from any image.'}</p>
        )}
      </section>

      {q && data.giphy && (
        <section>
          <h4 className="media-heading">From GIPHY</h4>
          <GiphyGrid kind="stickers" query={query} enabled onPick={onPick} />
        </section>
      )}
    </div>
  );
}

// ---------- the picker ----------

const TABS = [
  { id: 'emoji', label: 'Emoji' },
  { id: 'gif', label: 'GIFs' },
  { id: 'sticker', label: 'Stickers' },
];

/**
 * Emoji / GIF / sticker popover.
 * props: onEmoji(char), onMedia(media) (omit for an emoji-only picker),
 *        onClose, align ('left' | 'right')
 */
export default function MediaPicker({ onEmoji, onMedia, onClose, align = 'left' }) {
  const ref = useRef(null);
  const emojiOnly = !onMedia;
  const [tab, setTab] = useState('emoji');
  const [queries, setQueries] = useState({ emoji: '', gif: '', sticker: '' });
  const { data, error } = useStickers(!emojiOnly);

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

  const query = queries[tab];
  const setQuery = (v) => setQueries((p) => ({ ...p, [tab]: v }));
  const pickMedia = (m) => {
    const media = { type: m.type || 'sticker', source: m.source, ref: m.ref, url: m.url, title: m.title || '', width: m.width || null, height: m.height || null };
    rememberRecent(media);
    onMedia(media);
  };
  const placeholder = { emoji: 'Search emoji', gif: 'Search GIFs', sticker: 'Search stickers' }[tab];

  return (
    <div className={`media-picker media-picker-${align}`} ref={ref} role="dialog" aria-label={emojiOnly ? 'Pick an emoji' : 'Emoji, GIFs and stickers'}>
      {!emojiOnly && (
        <div className="media-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`media-tab ${tab === t.id ? 'media-tab-on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="media-search">
        <Icon name="search" size={14} />
        <input
          className="media-search-input"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={placeholder}
          autoFocus
        />
        {query && (
          <button type="button" className="icon-btn icon-btn-xs" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
      <div className="media-body">
        {tab === 'emoji' && <EmojiTab query={query} onPick={onEmoji} />}
        {tab === 'gif' && <GifTab query={query} giphy={data ? data.giphy : error ? false : undefined} onPick={pickMedia} />}
        {tab === 'sticker' && <StickerTab query={query} data={data} error={error} onPick={pickMedia} />}
      </div>
    </div>
  );
}
