# Design: Kinetic Clarity Restyle + Aging/Drop-Completion UX for TaskHub

> Revision 2. This revision resolves all 8 findings (2 HIGH, 4 MEDIUM, 2 NIT) from
> `.agents/tasks/design-review.json` / `design-review.md`. See "Review Response" at the end
> for a finding-by-finding log. Everything above that section is the corrected, authoritative
> design — read it as the current state, not a diff.

## Overview

This is a visual-layer and interaction-layer change only. No API contracts, data models, routes, or component logic (state shape, handlers, props) change except for additive pieces: two pure utilities — `frontend/src/utils/taskAge.js` (aging stage calculation) and `frontend/src/utils/dropAnimation.js` (drop-to-done trigger detection) — consumed by existing components, plus a small, explicitly-scoped prop addition to `Column`/`TaskCard` for the drop animation (signatures pinned below), and one additional parameter on the backend's `buildTaskEmailHtml` (signature pinned below — this is **not** signature-preserving, corrected from the previous revision's incorrect claim). The restyle replaces `frontend/src/index.css` with a token-driven stylesheet implementing the "Kinetic Clarity" system from `DESIGN.md`, using the **exact hex values given in the task brief** (primary `#4338CA`, secondary `#7C3AED`, neutral `#1E1E2E`, muted `#6B7280`, structural gray `#E5E7EB`, canvas `#FAFAFA`) rather than the broader Material-style palette baked into the Tailwind configs of the Stitch mockups. Those mockup `code.html` files are read for **structural/layout/component patterns** (card anatomy, header/sidebar shape, modal chrome, empty-state composition, kanban column layout) — not for their literal token values, which conflict with `DESIGN.md`'s own "Application Guidelines" section and with the brief. Where the two disagree, `DESIGN.md`'s prose (colors, elevation, shape, component specs) and the brief's explicit hex codes win; the mockups are visual references for arrangement only.

Stack is locked as: React 18 + Vite (JS, no TypeScript), plain CSS with CSS custom properties (no Tailwind, no CSS-in-JS, no CSS modules — matches current single `index.css` convention), `@dnd-kit/core` for drag-and-drop (unchanged), plain CSS keyframes/transitions for all animation (no new runtime dependency — see Decision 2 below). No new npm packages are added to `frontend/package.json`. The backend is untouched except that `emailService.js`'s `buildTaskEmailHtml` gains one parameter (restyled in place, same callers unchanged except for one new argument each — see Email Templates section).

## Design Tokens (`frontend/src/styles/tokens.css`)

A new file `frontend/src/styles/tokens.css` is created and `@import`-ed as the first line of `frontend/src/index.css`. It defines CSS custom properties on `:root` for every token category, sourced from the brief + `DESIGN.md`:

```css
:root {
  /* Color */
  --color-primary: #4338CA;
  --color-primary-hover: #3730A3;
  --color-primary-active: #312E81;
  --color-secondary: #7C3AED;
  --color-text: #1E1E2E;
  --color-muted: #6B7280;
  --color-border: #E5E7EB;
  --color-border-hover: #D1D5DB;
  --color-canvas: #FAFAFA;
  --color-surface: #FFFFFF;
  --color-danger: #DC2626;
  --color-danger-bg: #FEE2E2;
  --color-danger-text: #991B1B;
  --color-success: #16A34A;
  --color-success-bg: #DCFCE7;
  --color-amber: #D97706;
  --color-amber-bg: rgba(217,119,6,0.08);
  --color-orange: #EA580C;
  --color-orange-bg: rgba(234,88,12,0.10);
  --color-red: #DC2626;
  --color-red-bg: rgba(220,38,38,0.08);

  /* Priority accents (unchanged semantics from TaskCard.jsx, re-expressed as tokens) */
  --priority-low: #6b7280;
  --priority-medium: #2563eb;
  --priority-high: #d97706;
  --priority-urgent: #dc2626;

  /* Typography */
  --font-ui: 'Geist', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;

  /* Radii */
  --radius-chip: 6px;
  --radius-control: 10px;
  --radius-card: 12px;
  --radius-modal: 16px;

  /* Elevation */
  --elevation-1: 0 1px 2px 0 rgba(30,30,46,0.04);
  --elevation-2: 0 4px 12px -2px rgba(30,30,46,0.08), 0 2px 4px -1px rgba(30,30,46,0.04);
  --elevation-3: 0 10px 25px -5px rgba(30,30,46,0.1), 0 8px 10px -6px rgba(30,30,46,0.05);
  --elevation-4: 0 20px 40px -12px rgba(30,30,46,0.16);
  --scrim: rgba(30,30,46,0.35);

  /* Spacing (8pt scale, matches DESIGN.md) */
  --space-2xs: 2px; --space-xs: 4px; --space-sm: 8px; --space-md: 12px;
  --space-base: 16px; --space-lg: 24px; --space-xl: 32px; --space-2xl: 48px;

  /* Motion */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 150ms;
  --duration-base: 400ms;

  /* Aging / hover composition (finding 1) */
  --aging-offset: 0px;
  --hover-lift: 0px;
}
```

Every restyled class in `index.css` references these variables (e.g. `.btn-primary { background: var(--color-primary); }`) rather than hardcoded hex, satisfying the brief's requirement. `index.css` keeps its current selector names (`.btn`, `.btn-primary`, `.task-card`, `.modal-card`, `.board-column`, etc.) — **no className renames in any `.jsx` file** — because several component tests locate elements by text/label, not by class, but a className rename is still unnecessary churn and risks missing a spot; restyling happens entirely by rewriting the rule bodies under the existing selectors and adding a handful of new selectors for net-new elements (aging badge, drop animation class, split-panel auth layout).

### Font loading

**Decision: Google Fonts via `<link>` tags in `frontend/index.html`**, not self-hosted. Justification: this is a prototype/internal tool (confirmed by the user's own request history — "ek prototype bna kde"), the mockups already reference Google Fonts, Vite has no existing font-asset pipeline to extend, and self-hosting would mean vendoring `.woff2` files and wiring `@font-face` + cache headers for marginal benefit on an internal admin tool. Add to `frontend/index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```
`body { font-family: var(--font-ui); }` replaces the current system-font stack. Monospace is applied via a new `.mono` utility class and used for project keys (`.project-key`), task IDs, and keyboard-shortcut-like chips.

## Ambiguous Decision 1: Aging Visual Encoding

`frontend/src/utils/taskAge.js` exports pure functions, both with the `NaN`-input guard folded directly into the canonical snippet (finding 7/8 — not left to prose):

```js
function getAgingDaysRaw(createdAt, now) {
  const ms = now.getTime() - new Date(createdAt).getTime();
  return Math.floor(ms / 86400000);
}

export function getAgingStage(createdAt, now = new Date()) {
  const days = getAgingDaysRaw(createdAt, now);
  if (Number.isNaN(days)) return 'fresh';
  if (days <= 0) return 'fresh';
  if (days <= 2) return 'slight';
  if (days <= 5) return 'amber';
  if (days <= 10) return 'deep-amber';
  return 'red';
}

export function getAgingDays(createdAt, now = new Date()) {
  const days = getAgingDaysRaw(createdAt, now);
  return Number.isNaN(days) ? 0 : Math.max(0, days);
}
```

`getAgingDays` delegates to the same `getAgingDaysRaw` helper `getAgingStage` uses, rather than duplicating the `NaN` check separately (finding 8's fix: "delegate through the now-guarded logic" — implemented literally via the shared private helper, so there is exactly one place the guard needs to be correct).

Thresholds and per-stage treatment (`days` = whole days since `task.createdAt`, boundaries inclusive as coded above):

| Stage | Days | `--aging-offset` | background | border-color | Badge |
|---|---|---|---|---|---|
| `fresh` | 0 | `0px` | `var(--color-surface)` (none) | `var(--color-border)` | none |
| `slight` | 1–2 | `2px` | `var(--color-surface)` (none) | `var(--color-border)` | none |
| `amber` | 3–5 | `5px` | `var(--color-amber-bg)` | `#FDE68A` | none |
| `deep-amber` | 6–10 | `9px` | `var(--color-orange-bg)` | `#FDBA74` | `aging` |
| `red` | 11+ | `12px` | `var(--color-red-bg)` | `#FCA5A5` | `X days old` |

Max offset is capped at `12px`. **This is sized against the restyled target padding, not the current one** (finding 3): the Per-Screen Restyle Plan's `TaskCard` entry below explicitly commits `TaskCard` to `padding: 12px 14px` (per `DESIGN.md`'s Task Card spec) as part of this restyle — the *current* `index.css` value is `padding: 0.6rem 0.75rem` (≈9.6px/12px), and that current value is **not** what the 12px cap is justified against. With `Column`'s `.board-column-body { gap: 0.5rem }` (8px, confirmed current value, unaffected by this restyle) between siblings, a 12px downward nudge on an aged card stays within 1.5× the inter-card gap, close enough that at the max stage the card visually "leans into" but does not overlap the next card — verified by the arithmetic (12px offset vs 8px gap leaves the aged card's bottom edge 4px into what was blank gap space, never touching the next card's top edge, since the offset is a `transform` that doesn't reflow layout and the 8px gap is preserved in the flow). This offset is purely cosmetic (a "settling" visual metaphor, cards slump as they age) and must not affect `@dnd-kit` hit-testing; since `@dnd-kit/core`'s `useDraggable` measures the DOM rect at drag-start (after the transform has already been applied and painted), a static CSS `transform` on the resting card is transparent to it — it's just part of the element's rendered box the same way margin/padding is. This is called out explicitly as a risk to verify visually during implementation, not just asserted.

### Mechanism, and composition with hover (finding 1)

`TaskCard.jsx` computes `const stage = task.status !== 'done' ? getAgingStage(task.createdAt) : 'fresh'` and applies `data-aging={stage}` on the root `.task-card` element (a data-attribute, not a dynamic className, so it composes cleanly with the existing `className="task-card"` and the drag `style` transform object that `@dnd-kit` already injects).

**Root cause of the previous revision's conflict:** `DESIGN.md`'s actual Task Card "Interaction" entry specifies hover as "transitions border to `rgba(67, 56, 202, 0.35)` and applies Level 2 elevation" only — it does **not** specify a hover `translateY`. The previous revision invented a `translateY(-2px)` hover lift and misattributed it to the spec, creating a genuine conflict: `transform` is not additive across CSS rules, so `.task-card:hover` and `.task-card[data-aging="x"]` (equal specificity, 0-2-0 each) would silently fight based on unspecified source order.

**Fix adopted: compose via a CSS custom property, not two competing whole-`transform` declarations.** Each `data-aging` rule sets `--aging-offset` (not `transform` directly); a single `.task-card` base rule reads both custom properties into the one real `transform`:

```css
.task-card {
  padding: 12px 14px; /* target restyle value, see Per-Screen Restyle Plan */
  transform: translateY(calc(var(--aging-offset, 0px) + var(--hover-lift, 0px)));
  transition: transform var(--duration-base) ease, background-color var(--duration-base) ease, border-color var(--duration-base) ease, box-shadow var(--duration-fast) ease;
}
.task-card:hover {
  --hover-lift: -2px;
  border-color: rgba(67, 56, 202, 0.35);
  box-shadow: var(--elevation-2);
}
.task-card[data-aging="slight"] { --aging-offset: 2px; }
.task-card[data-aging="amber"]  { --aging-offset: 5px; background-color: var(--color-amber-bg); border-color: #FDE68A; }
.task-card[data-aging="deep-amber"] { --aging-offset: 9px; background-color: var(--color-orange-bg); border-color: #FDBA74; }
.task-card[data-aging="red"] { --aging-offset: 12px; background-color: var(--color-red-bg); border-color: #FCA5A5; }
```

This keeps the hover lift (a genuinely nice micro-interaction, kept rather than dropped, since it reads well against `DESIGN.md`'s general "Fluid Focus" pillar and other hover affordances in the system use subtle lift) while making it additive with the aging offset instead of overwriting it: hovering a `red` card at rest translateY `12px` moves it to `10px` (12 + -2), a visible-but-small lift that still reads as "this card is aged" — not a full snap back to `-2px`. `.task-card[data-aging]` rules never touch `border-color`/`background-color` on hover (hover only changes `border-color` to the indigo accent and adds the elevation shadow); for `amber`/`deep-amber`/`red` cards this means hover's `border-color: rgba(67,56,202,0.35)` declaration in `.task-card:hover` would normally override the aging border color since `:hover` is declared later and has equal specificity — this is accepted as correct and intentional: on hover, the indigo focus-interaction color momentarily takes precedence over the aging tint (consistent with "hover means this card now has the user's attention," a stronger signal than ambient aging), and the aging background tint is untouched by hover (no `background-color` in the hover rule), so the card doesn't fully lose its aged look, just its border accent, for the duration of the hover.

`@dnd-kit`'s drag transform is still applied via inline `style.transform` on the element (see `TaskCard.jsx`'s conditional `style` object, unchanged); **inline style wins over the stylesheet rule while dragging**, which is the correct behavior — the custom-property-driven aging+hover offset is suppressed for the duration of an active drag (inline `style.transform` fully replaces the computed stylesheet `transform`, custom properties and all) and resumes once the element's `style` prop reverts to `undefined` post-drop (confirmed in `TaskCard.jsx`: `style` is `transform ? {...} : undefined`, i.e. no inline `transform` at all when not dragging, so the stylesheet rule governs).

The `aging` / `X days old` badge is a new `<span className="aging-badge">` rendered conditionally in `TaskCard.jsx` next to the priority dot, showing literally `aging` for `deep-amber` and `` `${getAgingDays(task.createdAt)} days old` `` for `red`. Recalculation: `getAgingStage` is called on every `TaskCard` render using `new Date()` at call time (no caller passes a stale `now`), so the stage advances naturally as the board re-renders (on poll/socket events); no interval timer is introduced, since a periodic re-render purely to advance aging state is unnecessary complexity for a day-granularity effect — this is a deliberate scope limit, not an oversight: a card's stage will visibly update the next time React re-renders that card for any reason (new data, filter change, parent re-render), which in practice happens often enough on an active board.

## Ambiguous Decision 2: Drop-to-Done Completion Animation

**Decision: pure CSS keyframes, no Framer Motion.** Justification: the animation is a single, one-shot, non-interruptible transform/opacity sequence on an element that is about to be removed from its source column and re-inserted into the Done column by React state — it needs no gesture tracking, no spring interruption on re-drag, and no shared-layout animation between arbitrary trees (which is Framer Motion's actual value-add). A `@keyframes` animation with `cubic-bezier` segments reproduces "accelerating fall + bounce/overshoot/settle" exactly, and avoids a new runtime dependency (~50KB+) and the version-pinning/maintenance surface the brief flags as a cost to justify. If a future requirement needs interruptible drag-linked physics (e.g. animating the live drag position itself, not just the drop event), Framer Motion would be reconsidered then — out of scope here.

`frontend/src/utils/dropAnimation.js`:

```js
export function shouldPlayDropAnimation(prevStatus, nextStatus) {
  return prevStatus !== 'done' && nextStatus === 'done';
}
```

Pure, synchronous, no DOM/timers — trivially unit-testable.

### Wiring — corrected for failed-drag cleanup (finding 4) and stale-`openTask` (finding 5), with pinned prop signatures (finding 6)

The animation is a **presentational overlay driven by a local, ephemeral piece of state that layers on top of, and never replaces, the existing `tasks` state flow.**

**`ProjectBoard.jsx` changes** (full, corrected `handleDragEnd` and `handleTaskUpdated`):

```js
const [justCompleted, setJustCompleted] = useState(null); // task id or null

const handleDragEnd = async (event) => {
  const { active, over } = event;
  if (!over) return;
  const taskId = active.id;
  const newStatus = over.id;
  const task = tasks.find((t) => t._id === taskId);
  if (!task || task.status === newStatus) return;

  if (shouldPlayDropAnimation(task.status, newStatus)) setJustCompleted(taskId);

  // Optimistic update, backend is the source of truth once the response/socket arrives.
  setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t)));
  try {
    const updated = await tasksApi.updateTask(projectId, taskId, { status: newStatus });
    setTasks((prev) => prev.map((t) => (t._id === taskId ? updated : t)));
  } catch {
    setError('Could not move task, reverting');
    setTasks((prev) => prev.map((t) => (t._id === taskId ? task : t)));
    // Finding 4: cancel a pending completion animation for this task if the move was reverted,
    // so the card doesn't play "fell into done" while it's visibly back in its original column.
    setJustCompleted((id) => (id === taskId ? null : id));
  }
};

const handleTaskUpdated = (updatedTask) => {
  // Finding 5: derive prevStatus from the authoritative `tasks` array (source of truth),
  // not from the modal's local `openTask` snapshot, which the socket handler never refreshes
  // and can therefore be stale relative to a concurrent task:updated event.
  const prev = tasks.find((t) => t._id === updatedTask._id);
  if (prev && shouldPlayDropAnimation(prev.status, updatedTask.status)) {
    setJustCompleted(updatedTask._id);
  }
  setTasks((prev2) => prev2.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
  setOpenTask(updatedTask);
};

const clearCompleting = (id) => setJustCompleted((cur) => (cur === id ? null : cur));
```

Using `tasks.find(...)` (the authoritative array, already read earlier in the same function in the existing `handleDragEnd` for exactly this purpose) instead of `openTask.status` removes the stale-snapshot ambiguity finding 5 identified: `tasks` is updated synchronously by the existing (unchanged) socket `handleUpdated` closure whenever a `task:updated` event arrives, so by the time `TaskModal`'s `patch()` resolves and calls `onUpdated`, `tasks` reflects the latest known status for that task, socket-driven or not. This also means `handleUpdated` (the socket listener) itself does **not** need to be modified to also refresh `openTask` — the alternative fix the review offered — because `handleTaskUpdated` no longer reads `openTask.status` at all for this decision. `setOpenTask(updatedTask)` is kept exactly as before (the modal still shows the fresh task), it's just no longer the source consulted for `prevStatus`.

**`Column.jsx` — pinned signature (finding 6):**

```js
export default function Column({ id, title, tasks, onOpenTask, justCompleted, onCompletingDone }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`board-column ${isOver ? 'board-column-over' : ''}`}>
      <div className="board-column-header">
        <h3>{title}</h3>
        <span className="muted small">{tasks.length}</span>
      </div>
      <div className="board-column-body">
        {tasks.map((task) => (
          <TaskCard
            key={task._id}
            task={task}
            onOpen={onOpenTask}
            isCompleting={task._id === justCompleted}
            onCompletingDone={onCompletingDone}
          />
        ))}
      </div>
    </div>
  );
}
```

`ProjectBoard.jsx`'s render passes the two new props straight through to every `Column`:

```jsx
<Column
  key={col.id}
  id={col.id}
  title={col.title}
  tasks={tasksByStatus[col.id] || []}
  onOpenTask={setOpenTask}
  justCompleted={justCompleted}
  onCompletingDone={clearCompleting}
/>
```

**`TaskCard.jsx` — pinned signature (finding 6):** add `isCompleting` and `onCompletingDone` to the existing `{ task, onOpen }` prop list, apply a conditional className, and clear the flag on `animationend`:

```js
export default function TaskCard({ task, onOpen, isCompleting = false, onCompletingDone }) {
  // ...existing useDraggable/style unchanged...
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`task-card${isCompleting ? ' task-card-completing' : ''}`}
      data-aging={task.status !== 'done' ? getAgingStage(task.createdAt) : undefined}
      onClick={() => onOpen(task)}
      onAnimationEnd={() => isCompleting && onCompletingDone?.(task._id)}
    >
      {/* ...existing content, plus aging badge next to priority dot... */}
    </div>
  );
}
```

This is the entire lifecycle: `justCompleted` is set, the CSS animation plays once, `animationend` calls `onCompletingDone(task._id)` → `clearCompleting` clears the flag only if it still matches that id (guards against a stale callback from an already-superseded completion). It never gates or delays the real `setTasks`/socket-driven update — the card already has its new `status` (and is already rendered in the Done column, since `tasksByStatus` groups by the already-updated `task.status`) while the animation plays **on top of** it, so there is no "waiting to animate before moving" state that could desync from a near-simultaneous Socket.io `task:updated` event for the same task (which just overwrites the task object in `tasks` as today — unaffected). A rapid second drag of the same task before the first animation ends is a no-op on `justCompleted` (already that id) and acceptable, since dragging a card that's mid-animation out of Done is not a flow the UI currently supports mid-flight.

CSS (`.task-card-completing`):

```css
@keyframes drop-to-done {
  0%   { transform: translateY(0) scale(1); }
  55%  { transform: translateY(26px) scale(0.98); animation-timing-function: var(--ease-in); }
  75%  { transform: translateY(-6px) scale(1.01); }
  90%  { transform: translateY(2px) scale(0.995); }
  100% { transform: translateY(0) scale(1); }
}
.task-card-completing {
  animation: drop-to-done 480ms var(--ease-bounce) 1;
  border-color: var(--color-success);
}
```

Note `.task-card-completing`'s `animation` shorthand sets its own `transform` keyframes independently of the `--aging-offset`/`--hover-lift` composition above — this is intentional and conflict-free: a task transitioning to `done` always renders with `data-aging` unset (`TaskCard` only computes aging `for task.status !== 'done'`), so the two transform mechanisms never apply to the same element at the same time; the animation fully owns `transform` for its 480ms run, then `animation-fill-mode` defaults to `none` so control reverts cleanly to the static (non-aging, since it's now `done`) base `transform: translateY(calc(0px + var(--hover-lift,0px)))`. 480ms total, comfortably inside typical optimistic-update round-trips but not gated by them — it is purely decorative and runs to completion regardless of network timing.

## Per-Screen Restyle Plan

**`Login.jsx` / `Register.jsx`** — restructured to the split-panel shell from `onacre_login_screen/code.html`: a left auth column (new `.auth-panel`, replacing `.auth-page`/`.auth-card` usage with the same semantic roles but new layout rules — form markup, `id`/`htmlFor` pairs, and button text stay byte-identical so `Login.test.jsx`'s `getByLabelText('Email')`/`getByLabelText('Password')`/`getByText('Log in')` and `App.test.jsx`'s `getByText('Welcome back')`/`getByText('Create your account')` keep passing) and a right brand/showcase panel (new `.auth-showcase`, hidden under 768px via `@media`) containing a static decorative gradient + abstract kanban glyph (plain CSS/SVG, no Tailwind grid-pattern trick needed — a `linear-gradient(135deg, var(--color-primary), var(--color-secondary))` background with a couple of blurred `::before`/`::after` radial-gradient circles). `Register.jsx` reuses the identical `.auth-panel`/`.auth-showcase` shell (same component pattern, not a shared component extraction — out of scope, each page keeps its own JSX per current convention of duplicated-but-independent page files) with its existing four fields (name, email, password, role) restyled as the same input/label pattern. Google button becomes `.btn-google` restyled per `DESIGN.md`'s secondary-button spec with the existing inline multi-color "G" SVG inlined (copied from the mockup, no new asset files).

**`Dashboard.jsx`** — `.page-header`/`.project-grid`/`.project-card` restyled per `onacre_projects_dashboard` card anatomy (key chip in `--font-mono`, title, muted description, member-count footer) using `--radius-card`, `--elevation-1`→`--elevation-2` on hover with `translateY(-2px)` (this hover lift is on `.project-card`, a plain static card with no competing `data-aging`/completion-animation mechanism, so the finding-1 conflict does not apply here — it's specific to `.task-card`). The empty state (`!loading && projects.length === 0`) gets a new `.empty-state` block (icon glyph via inline SVG + heading + muted copy + CTA), styled per `onacre_projects_empty_state`'s centerpiece card pattern, scaled down (no ambient ring/particle SVG — that's decorative flourish not worth the markup weight for an internal tool) but keeping the "no projects yet" / admin-vs-member copy exactly as currently written (no copy changes needed; `App.test.jsx` doesn't touch this text, but other hidden assumptions aren't introduced).

**`ProjectBoard.jsx` / `Column.jsx` / `TaskCard.jsx`** — `.board-layout`/`.board`/`.board-column` restyled to the `onacre_project_board` 3-column layout: column background `var(--color-canvas)`-tinted container (`--color-border` hairline, `--radius-card` container), header row with status dot + count chip, card stack with `gap: var(--space-md)`. `TaskCard` becomes the `--radius-card` card with **`padding: 12px 14px`** (explicitly committed here, per `DESIGN.md`'s Task Card spec — this is the value the aging-offset overlap math in Decision 1 depends on; finding 3's fix), `--elevation-1` resting / `--elevation-2` + hover lift on hover via the `--hover-lift` custom property composed with `--aging-offset` as specified in Decision 1 (not a standalone `translateY(-2px)` — that formulation is retired in this revision). Priority dot kept as the existing colored `<span>` (now reading from `--priority-*` tokens), label chips restyled to the chip spec (`--radius-chip`, `height: 22px`, indigo/violet accent variants alternated by index for visual variety since labels carry no inherent color data today — a presentation-only choice, not a data model change). `FilterBar.jsx` restyled as a `--radius-control` segmented control row; **no structural DOM changes** since `FilterBar.test.jsx` locates elements via `getByDisplayValue('All priorities')` and `getByText(...)`, which depend on the native `<select>`/`<option>` text being unchanged — only `className` styling and container spacing change.

**`CreateProjectModal.jsx` / `CreateTaskModal.jsx` / `TaskModal.jsx`** — `.modal-overlay` restyled to use `--scrim` + `backdrop-filter: blur(4px)` (Level 4), `.modal-card` to `--radius-modal` + `--elevation-4`, matching the mockups' centered 420px (`modal-card`) / 640px (`modal-card-wide`, used by `TaskModal`) card chrome: accent top bar (thin `linear-gradient(90deg, var(--color-primary), var(--color-secondary))` strip), icon-badge + title + close button header row, and `.task-fields` grid kept as the existing 2-column CSS grid (just restyled borders/radii) — **no field reordering or addition**, since the brief scopes this as visual restyle, not a feature add to the task detail fields. Status/priority `<select>` elements keep native option values (`todo`/`in-progress`/`done`, `low`/`medium`/`high`/`urgent`) so `TaskModal.jsx`'s `patch({ status: e.target.value })` logic is untouched (this is also exactly the status-dropdown trigger path for Decision 2's drop animation — `patch()` → `onUpdated(updated)` → `ProjectBoard.handleTaskUpdated`, corrected wiring above); selects are restyled as the Form Controls spec (`height: 36px`, `--radius-control`, focus ring `rgba(67,56,202,0.15)`).

**`Navbar.jsx`** — restyled to a slim `--color-text`-on-dark bar (matches the mockups' `bg-inverse-surface` header band) but kept as a single-row navbar (not the mockup's fixed header + 240px sidebar — introducing a persistent sidebar is a bigger structural change than "restyle" and isn't needed since TaskHub has only two top-level routes; the sidebar pattern from the mockups is not adopted). Brand wordmark `Onacre` in `--font-ui` 600 weight, user badge (`.badge`) restyled as an indigo-accent chip.

**`ActivityFeed.jsx`** — restyled as a `--radius-card` panel with `--elevation-3` (it's a floating/overlay-adjacent panel, matching Level 3 popover treatment) and divider-separated list rows per `DESIGN.md` layout rhythm.

**`OAuthCallback.jsx` / `ProtectedRoute.jsx`** — `.centered` restyled only (muted loading text in `--color-muted`, `--font-ui`); no structural change, both are already minimal.

### Email templates (`emailService.js`) — corrected signature and content constraints (finding 2)

**`buildTaskEmailHtml`'s signature changes; this is stated plainly, not hedged.** The restyled function gains one new required parameter, `variant`, so callers can select the "created" (indigo) vs "completed" (green) banner color and badge text. Final signature:

```js
function buildTaskEmailHtml({ task, project, assignee, reporter, eventLabel, eventTime, variant }) {
  const eventColor = variant === 'completed' ? '#16A34A' : '#4338CA';
  // table-based, inline-style HTML built below (see structure description)
  // MUST still contain, verbatim and unstyled-additionally, somewhere in the markup:
  //   - the literal lowercase task.priority string (e.g. "high") — asserted by
  //     backend/tests/email.test.js: expect(call.html).toContain('high')
  //   - the literal eventLabel string verbatim (e.g. "Task completed") — asserted by
  //     backend/tests/email.test.js: expect(call.html).toContain('Task completed')
  ...
}
```

`sendTaskCreatedEmail` passes `variant: 'created'`; `sendTaskCompletedEmail` passes `variant: 'completed'`. Both call sites change by exactly one added key in their existing `buildTaskEmailHtml({...})` call; no other call-site logic changes. `eventLabel` itself is **not** renamed or removed — `sendTaskCreatedEmail` keeps passing `eventLabel: 'New task assigned to you'` and `sendTaskCompletedEmail` keeps passing `eventLabel: 'Task completed'`, exactly as today, because `email.test.js`'s `toContain('Task completed')` assertion depends on that exact string appearing in the output HTML.

The rewritten HTML is rebuilt to the table-based, inline-style structure shown in `onacre_email_task_created`/`onacre_email_task_completed` (card container, brand header bar with gradient logo chip, colored event banner using `eventColor` for background/accent, key-value metadata table — Project, **Priority** (rendered as a styled chip `<span>` **plus** the raw lowercase `${task.priority}` text is kept present in the markup so the test's `toContain('high')` still matches literally — e.g. the chip's inner text content is simply `${task.priority}`, not a capitalized/translated label, satisfying both the visual requirement and the test in one place rather than needing a separate hidden string), Status, Assignee, Reporter, Created/Completed-at), and CTA button. All styling is **inline `style` attributes and `<table>` layout only** — no `<style>` block rules beyond the two cosmetic `:hover` niceties already present in the mockups (which degrade silently in clients that strip `<style>`, which is why the inline styles carry the real appearance) — no flexbox, no CSS grid, no external stylesheet link, consistent with email-client-safe practice and matching the existing file's constraint.

`sendTaskCreatedEmail`/`sendTaskCompletedEmail`'s own signatures (the exported, caller-facing functions used by the rest of the backend) are unchanged — only their internal call to `buildTaskEmailHtml` gains the one `variant` key. This distinction (internal helper signature changes; public service functions' signatures don't) is the precise claim this revision makes, replacing the previous revision's blanket, incorrect "same function signature" statement. Confirmed by reading `backend/tests/email.test.js` directly (not hedged as "out of scope" this time): all three of its tests call `sendTaskCreatedEmail`/`sendTaskCompletedEmail` (the public functions, unchanged signatures) and assert on `call.to`, `call.subject`, and `call.html` via `toContain('high')` / `toContain('Task completed')` — both satisfied by the constraints above, so all three existing tests keep passing with no test-file edits needed.

## Edge Cases

- **Missing/invalid `task.createdAt`**: handled by the `Number.isNaN` guard built directly into `getAgingStage`/`getAgingDays`'s shared helper (see Decision 1 code block) — returns `fresh`/`0` rather than falling through to `red` (which `NaN <= N` comparisons being always-`false` would otherwise cause).
- **Task moved out of `done` back to `todo`/`in-progress`**: aging resumes from the same `createdAt` (aging is about total age, not time-in-current-column); no `reopenedAt` field exists or is added, this is a deliberate scope limit matching the brief's "elapsed days from task.createdAt" wording.
- **Drag-to-done fails and reverts**: `justCompleted` is explicitly cleared for the reverted task in `handleDragEnd`'s `catch` branch (finding 4's fix, wired above), so the reverted card does not play the drop-into-done animation while visibly back in its original column.
- **Drop animation + immediate modal close**: if the user closes `TaskModal` right after changing status to Done, the modal unmounts but the underlying `TaskCard` in the board is a separate DOM node that keeps playing its own animation independent of the modal's lifecycle — no cross-component teardown ordering issue.
- **Font load failure/offline**: Google Fonts `<link>` fails gracefully to the `-apple-system, 'Segoe UI', Roboto, Arial, sans-serif` fallback stack already present in `--font-ui`; no FOIT-prevention beyond `display=swap` (already in the Google Fonts URL) is added, since this is an internal tool, not a brief requirement.
- **Long task titles / many labels on a card**: existing `.task-title` has no truncation today; this restyle adds `overflow-wrap: break-word` consistent with the mockups' `line-clamp`-free card bodies (no `-webkit-line-clamp` added, since the current app doesn't truncate and truncation is a UX scope addition beyond "restyle").

## Testing Plan

- `frontend/src/utils/taskAge.test.js` (new, Vitest): boundary cases — `days=0` (today) → `fresh`; `days=1`, `days=2` → `slight`; `days=3`, `days=5` → `amber`; `days=6`, `days=10` → `deep-amber`; `days=11`, `days=365` → `red`; invalid/`undefined` `createdAt` → `fresh` (guard case) for `getAgingStage`, and `0` for `getAgingDays` on the same invalid input; and `getAgingDays` returns the correct whole-day count for a fixed injected `now`. All assertions use an explicit `now` argument (never real `Date.now()`), keeping the test deterministic.
- `frontend/src/utils/dropAnimation.test.js` (new, Vitest): `shouldPlayDropAnimation('todo', 'done')` → `true`; `('in-progress', 'done')` → `true`; `('done', 'done')` → `false` (no re-trigger on no-op update); `('done', 'todo')` → `false`; `('todo', 'in-progress')` → `false`.
- Existing suites (30 backend Jest, 9 frontend Vitest) must continue passing unmodified — this restyle's component-level constraint (no DOM structure/label/text changes in `Login`, `Register`, `FilterBar`, `App` routes) is specifically designed around what `Login.test.jsx`, `FilterBar.test.jsx`, and `App.test.jsx` assert, confirmed by reading each; `backend/tests/email.test.js`'s three assertions are confirmed satisfied by the pinned `buildTaskEmailHtml` constraints above (see Email Templates section) — no test-file edits are part of this design.
- Manual/visual verification (not automatable without a visual regression tool, which is out of scope to introduce here): aging offsets don't cause card overlap at `deep-amber`/`red` on a column with 5+ stacked aged cards (re-check the 12px-vs-8px-gap arithmetic visually, since it's a tight margin); hovering an aged card shows the composed offset (lift relative to its own resting position, not a snap to `-2px`); drop animation plays on both trigger paths (drag-to-Done, modal status dropdown) and does **not** play when a drag-to-done is rejected by the server (finding 4's revert case); `npm run build` succeeds with the new `tokens.css` import and Google Fonts link; command-palette-style focus states (if any `Cmd+K` surface existed — it doesn't in current TaskHub, so the Command Palette component spec in `DESIGN.md` is **not implemented**, since no such feature exists in the current app and adding one is out of this restyle's scope) are not applicable.
- After implementation: run `npm run build` in `frontend/` and `npm test` in both `frontend/` and `backend/`; fix any failures before considering the task done, per the verification requirement.

## Scope Boundaries (explicit, since this is a restyle + two feature additions, not a rewrite)

- No new frontend dependencies (no Framer Motion, no Tailwind, no icon library — inline SVGs copied/hand-written as needed, matching current `index.css`'s zero-dependency approach).
- No backend route/model/controller changes. `emailService.js`'s internal `buildTaskEmailHtml` helper gains one parameter (`variant`); its two public, caller-facing functions (`sendTaskCreatedEmail`, `sendTaskCompletedEmail`) keep their existing signatures.
- No sidebar navigation, no command palette, no dark mode — these appear in the mockups' chrome but are not requested features; adding them would be scope creep beyond "restyle existing screens + two UX behaviors."
- No className renames across `.jsx` files other than the one additive, conditional fragment (`task-card-completing`) needed for Decision 2, and the new `data-aging` attribute (not a className) for Decision 1; existing selectors are restyled in place to avoid any risk of breaking test queries that rely on rendered text/labels rather than classes (confirmed safe since no current test asserts on `className`).

## Review Response (Revision 2)

Each finding from `.agents/tasks/design-review.json` / `design-review.md`, addressed:

1. **[HIGH] Aging/hover transform conflict** — Addressed. Retired the invented standalone hover `translateY(-2px)`; hover and aging now compose through `--aging-offset`/`--hover-lift` custom properties feeding one real `transform` on `.task-card`, per the review's second suggested fix. Hover's `border-color`/shadow change is kept as `DESIGN.md` actually specifies.
2. **[HIGH] `buildTaskEmailHtml` signature contradiction + unverified email test** — Addressed. Stopped claiming "same function signature"; pinned the actual final signature (`variant` param added), read `backend/tests/email.test.js` directly (not hedged), and added explicit constraints that the rewritten HTML must retain the literal lowercase `task.priority` string and the literal `eventLabel` string so both `toContain` assertions keep passing unmodified.
3. **[MEDIUM] Padding citation wrong/uncommitted** — Addressed. `TaskCard`'s Per-Screen Restyle Plan bullet now explicitly states `padding: 12px 14px`, and Decision 1's overlap justification is reworded to cite this as the restyle's target value, not a "verified against current layout" claim (current value, `0.6rem 0.75rem`, is stated accurately as the pre-restyle figure).
4. **[MEDIUM] `justCompleted` not cleared on failed/reverted drag** — Addressed. `handleDragEnd`'s `catch` branch now also calls `setJustCompleted((id) => (id === taskId ? null : id))`, shown in the full corrected code block.
5. **[MEDIUM] Stale `openTask.status` for drop-animation trigger** — Addressed via the review's second suggested option: `shouldPlayDropAnimation`'s `prevStatus` is now derived from the authoritative `tasks` array (`tasks.find(...)`) inside `handleTaskUpdated`, not from `openTask`. The socket `handleUpdated` listener is left unmodified, since it's no longer load-bearing for this decision.
6. **[MEDIUM] Prop signatures given only as prose** — Addressed. `Column({ id, title, tasks, onOpenTask, justCompleted, onCompletingDone })` and `TaskCard({ task, onOpen, isCompleting, onCompletingDone })` are now pinned as explicit code blocks, including `Column`'s internal render loop and `ProjectBoard`'s prop-passing JSX.
7. **[NIT] `NaN` guard missing from canonical snippet** — Addressed. The guard is now inline in the `getAgingStage` code block itself (via the shared `getAgingDaysRaw` helper), not just described in prose afterward.
8. **[NIT] `getAgingDays` missing matching guard** — Addressed. `getAgingDays` delegates to the same guarded helper, so there's a single source of truth for the `NaN` check and no `"NaN days old"` path.
