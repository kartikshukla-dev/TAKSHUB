
# Design Review — Kinetic Clarity Restyle + Aging/Drop-Completion UX (Revision 2)

Reviewed fresh against the actual repository state, not against the design document's own narrative.
Source files read and cross-checked while writing this review: `frontend/src/components/TaskCard.jsx`,
`frontend/src/components/Column.jsx`, `frontend/src/components/TaskModal.jsx`,
`frontend/src/pages/ProjectBoard.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`,
`frontend/src/index.css`, `frontend/package.json`, `frontend/src/context/SocketContext.jsx`,
`frontend/src/pages/Login.test.jsx`, `frontend/src/App.test.jsx`, `frontend/src/components/FilterBar.test.jsx`,
`frontend/src/components/CreateProjectModal.test.jsx`, `backend/src/services/emailService.js`,
`backend/tests/email.test.js`, `backend/src/controllers/taskController.js`, `backend/src/services/socketService.js`,
and `stitch_onacre_saas_login_page/kinetic_clarity/DESIGN.md`. Both the full frontend (`npm test`) and backend
(`npm test`) suites were run to confirm the claimed 9/30 passing counts.

## Findings

### 1. [HIGH] Aging-offset vs. card-gap arithmetic is wrong, and the gap value itself is contradicted between sections

**Where:** "Ambiguous Decision 1: Aging Visual Encoding" (the paragraph starting "With `Column`'s
`.board-column-body { gap: 0.5rem }`...") vs. "Per-Screen Restyle Plan" → `ProjectBoard.jsx` / `Column.jsx` /
`TaskCard.jsx` bullet ("card stack with `gap: var(--space-md)`").

**Problem:**
- The math is backwards. A `transform: translateY(12px)` moves the card's *painted* box down by 12px without
  changing layout (the design correctly notes this). If the live-DOM gap between cards is 8px, the aged card's
  painted bottom edge moves 12px past its original position, i.e. **4px past the next card's top edge — an
  overlap of 4px**, not "4px into what was blank gap space, never touching the next card's top edge" as the
  document literally concludes. The design's own numbers contradict its own conclusion.
- Worse, the two sections don't even agree on the gap value being tested. Decision 1 asserts the gap is
  "8px, confirmed current value, unaffected by this restyle" and bases the (already-wrong) math on that. But the
  Per-Screen Restyle Plan commits `.board-column-body`'s gap to `var(--space-md)`, which `tokens.css` defines as
  `12px` — i.e. the restyle *does* change the gap, directly contradicting Decision 1's "unaffected" claim. With a
  12px gap and a 12px max offset, the card's bottom edge lands exactly flush with the next card (not the 4px-clear
  outcome claimed either way).

This is one of the two features the review brief explicitly asked to be "fully pinned down with no ambiguity" —
it currently is not: an implementer following this doc could ship visibly overlapping cards at the `red` stage.

**Fix:** Settle the gap value once and reference it from a single place, then recompute honestly. Concretely:
- Decide the final `.board-column-body` gap (recommend keeping it at `var(--space-sm)` = 8px, since 12px eats
  most of the visual breathing room the restyle is trying to add), and have Decision 1 cite that same variable
  instead of a literal `0.5rem`.
- Cap `--aging-offset` at (gap − safety margin), e.g. for an 8px gap cap the max offset at 6px and rescale the
  stage table (`amber: 3px`, `deep-amber: 5px`, `red: 6px`), OR explicitly state that a few px of intentional
  visual overlap at the `red` stage is the desired "slumping into the next card" look and confirm it's harmless
  for `@dnd-kit` hit-testing (which measures layout boxes, not painted boxes, so this would in fact be safe —
  but the doc needs to say so instead of asserting the opposite).

### 2. [HIGH] The "no race" justification for the TaskModal drop-animation path is based on an incorrect model, and is fragile enough to break on a routine refactor

**Where:** "Wiring — corrected for failed-drag cleanup... and stale-`openTask`" section, the paragraph beginning
"Using `tasks.find(...)` ... removes the stale-snapshot ambiguity finding 5 identified."

**Problem:** The doc states: *"`tasks` is updated synchronously by the existing (unchanged) socket `handleUpdated`
closure whenever a `task:updated` event arrives, so by the time `TaskModal`'s `patch()` resolves and calls
`onUpdated`, `tasks` reflects the latest known status for that task, socket-driven or not."*

Reading `backend/src/controllers/taskController.js` confirms `emitToProject(project._id, 'task:updated', populated)`
is called **before** `res.status(200).json(...)` in `updateTask`, and `socketService.js` broadcasts via
`io.to(roomName).emit(...)` to the whole project room — which includes the very client that issued the request
(it already joined that room via `project:join`). So the client that triggers a status change via `TaskModal`
receives its own `task:updated` echo over the socket, and that echo can plausibly arrive **before** the REST
promise in `patch()` resolves.

If the design's stated model were actually true — that `tasks` "reflects the latest known status... by the time
patch() resolves" — then `handleTaskUpdated`'s `tasks.find(...)` would already see the *new* status (`'done'`) as
`prev.status`, making `shouldPlayDropAnimation('done', 'done')` return `false`. That is the opposite of what's
wanted: the modal path's drop animation would silently never fire. The code happens to still work today only
because of an unstated detail the design never identifies: `TaskModal.patch()`'s closure over `onUpdated` (and
transitively `handleTaskUpdated`'s closure over `tasks`) is pinned to the render in effect when `patch()` was
invoked; a later re-render triggered by the self-echoed socket event produces a *new* `handleTaskUpdated` instance
that the already-in-flight `patch()` call never sees. That's real, but it's an accident of React closure semantics,
not something the design reasons about or protects — and it is exactly the kind of thing that breaks silently if
anyone later wraps `handleTaskUpdated` in `useCallback` with a ref-based "always read latest tasks" pattern (a
common, unremarkable React refactor), which would reintroduce the exact race this section claims is a non-issue.

This is squarely the thing the review brief asked to have nailed down ("precisely how `shouldPlayDropAnimation`
wires in... without racing the existing optimistic-update + Socket.io reconciliation") — the current answer is
correct by coincidence, not by design.

**Fix:** Don't depend on closure timing at all. Mirror the drag path, which is safe because it captures
`prevStatus` synchronously before any `await`. Capture `task.status` in `TaskModal.patch()` before calling the
API and pass it through explicitly instead of re-deriving it from `tasks` inside `ProjectBoard`:

```js
// TaskModal.jsx
const patch = async (payload) => {
  setError('');
  const prevStatus = task.status; // captured synchronously, before the API call
  try {
    const updated = await tasksApi.updateTask(projectId, task._id, payload);
    onUpdated(updated, prevStatus);
  } catch (err) {
    setError(err.response?.data?.message || 'Update failed');
  }
};
```
```js
// ProjectBoard.jsx
const handleTaskUpdated = (updatedTask, prevStatus) => {
  if (shouldPlayDropAnimation(prevStatus, updatedTask.status)) {
    setJustCompleted(updatedTask._id);
  }
  setTasks((prev) => prev.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
  setOpenTask(updatedTask);
};
```
This removes the dependency on render timing entirely and is robust to future refactors of `handleTaskUpdated`.

### 3. [MEDIUM] Contradiction: whether `data-aging` is `'fresh'` or `undefined` for a done task

**Where:** "Mechanism, and composition with hover" — `const stage = task.status !== 'done' ? getAgingStage(task.createdAt) : 'fresh'`
— versus the later pinned `TaskCard.jsx` code block — `data-aging={task.status !== 'done' ? getAgingStage(task.createdAt) : undefined}`.

**Problem:** Two snippets in the same document compute different values for the same case. One assigns the
literal string `'fresh'` to `data-aging` for a done task; the other omits the attribute (`undefined`). It's
harmless today because no CSS rule targets `[data-aging="fresh"]` or `:not([data-aging])`, but it's a genuine,
unreconciled contradiction, and any test written against `toHaveAttribute('data-aging', ...)` for a done task
would get a different answer depending on which snippet the implementer follows.

**Fix:** Use one value everywhere — recommend `undefined` (omit the attribute for done tasks, since "fresh" is
semantically a non-done state and reusing it for "done" is misleading). Update the prose snippet in Decision 1 to
read `: undefined` instead of `: 'fresh'` so it matches the pinned `TaskCard.jsx` block.

### 4. [MEDIUM] Priority-dot "now reading from `--priority-*` tokens" has no pinned implementation

**Where:** Per-Screen Restyle Plan → ProjectBoard/Column/TaskCard bullet: "Priority dot kept as the existing
colored `<span>` (now reading from `--priority-*` tokens)."

**Problem:** Verified in `frontend/src/components/TaskCard.jsx`: the dot's color is set via an inline
`style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}`, where `PRIORITY_COLORS` is a plain JS object of hex
strings (not CSS variables). The design asserts this becomes "token-driven" but never pins how: does
`PRIORITY_COLORS`'s values change to `'var(--priority-high)'` strings (still an inline style, now indirect), or
does the dot move to a `data-priority` attribute plus a CSS rule (the same pattern already used for `data-aging`)?
Given the review brief explicitly calls out "design tokens... referenced everywhere, not hardcoded" as a point to
nail down, and the design is otherwise careful to pin exact signatures for every other small JSX change in this
revision, this is a real gap.

**Fix:** Pin one approach, e.g.:
```js
const PRIORITY_VARS = {
  low: 'var(--priority-low)',
  medium: 'var(--priority-medium)',
  high: 'var(--priority-high)',
  urgent: 'var(--priority-urgent)',
};
// ...
<span className="priority-dot" style={{ backgroundColor: PRIORITY_VARS[task.priority] }} />
```

### 5. [NIT] Label-chip "accent variants alternated by index" is not a concrete rule

**Where:** Per-Screen Restyle Plan → board bullet: "label chips restyled to the chip spec..., indigo/violet
accent variants alternated by index for visual variety."

**Fix:** Pin the actual rule, e.g.:
```jsx
{task.labels.map((l, i) => (
  <span key={l} className={`label-chip ${i % 2 === 0 ? 'label-chip-indigo' : 'label-chip-violet'}`}>{l}</span>
))}
```

### 6. [NIT] Aging-badge JSX is only a comment placeholder, and `getAgingStage` would be computed twice

**Where:** The pinned `TaskCard.jsx` code block ends with `{/* ...existing content, plus aging badge next to
priority dot... */}` instead of real markup, even though the badge's text content was pinned earlier in prose
("`aging`" / "`${days} days old`"). As written, the badge condition and the `data-aging` attribute would each
need to call `getAgingStage`/compare `task.status` independently, since no shared `stage` variable is pinned.

**Fix:** Show the actual snippet and compute the stage once:
```jsx
const stage = task.status !== 'done' ? getAgingStage(task.createdAt) : undefined;
// ...
<div ... data-aging={stage} ...>
  <div className="task-card-top">
    <span className="priority-dot" style={{ backgroundColor: PRIORITY_VARS[task.priority] }} />
    <span className="task-title">{task.title}</span>
    {stage === 'deep-amber' && <span className="aging-badge">aging</span>}
    {stage === 'red' && <span className="aging-badge">{getAgingDays(task.createdAt)} days old</span>}
  </div>
  ...
```

## Verified Assumptions

- `frontend/src/components/TaskCard.jsx`, `Column.jsx`, `ProjectBoard.jsx`, `TaskModal.jsx` match the design's
  claims about current structure, prop shapes, and the `handleDragEnd`/`handleTaskUpdated`/`patch()` flows the
  design extends.
- `frontend/src/index.css`'s current `.task-card` padding is `0.6rem 0.75rem`, as the design states (and distinct
  from the `12px 14px` restyle target it commits to).
- `frontend/src/index.css`'s `.board-column-body` gap is `0.5rem` (8px) today, and `.modal-card-wide` is already
  `640px` — both as claimed.
- `stitch_onacre_saas_login_page/kinetic_clarity/DESIGN.md` exists and its Task Card spec (`padding: 12px 14px`,
  hover = border transition to `rgba(67,56,202,0.35)` + Level 2 elevation, no hover `translateY`) and its
  Elevation Hierarchy (Level 1–4 shadows, Level 4 scrim `rgba(30,30,46,0.35)` + `blur(4px)`) match exactly what the
  design document quotes and what `tokens.css` encodes.
- `backend/src/services/emailService.js`'s current `buildTaskEmailHtml` has exactly the signature the design says
  it will change from (`{ task, project, assignee, reporter, eventLabel, eventTime }`, no `variant`), and
  `backend/tests/email.test.js`'s three assertions (`toContain('high')`, `toContain('Task completed')`, recipient
  strings) are exactly as the design describes and would still pass under the planned change.
- `frontend/src/pages/Login.jsx` / `Register.jsx` and their tests (`Login.test.jsx`, `App.test.jsx`,
  `FilterBar.test.jsx`) use exactly the label text, button text, and `getByDisplayValue` selectors the design
  relies on for its "no structural/test-breaking changes" claim.
- Ran both suites: frontend `npm test` → 9 passed (4 files); backend `npm test` → 30 passed (10 suites) — matches
  the design's stated baseline exactly.
- `frontend/package.json` confirms no Framer Motion or Tailwind dependency exists today, consistent with the
  "no new dependency" decision.
- `backend/src/controllers/taskController.js` confirms `emitToProject` (the socket broadcast) is called before the
  HTTP response is sent in `updateTask`, and `socketService.js` confirms the broadcast targets the whole project
  room (not `socket.broadcast`, i.e. it includes the sender) — this is what underlies Finding 2.

## Unverified / Wrong Assumptions

- The claim that the 12px max aging offset "stays within 1.5× the inter-card gap... does not overlap the next
  card" is not just unverified — it is **wrong** by the design's own numbers (see Finding 1), and it rests on a
  gap value (`8px`, "unaffected by this restyle") that a different section of the same document overwrites to
  `12px` via `--space-md`.
- The claim that, for the `TaskModal` patch path, "`tasks` reflects the latest known status... by the time
  `patch()` resolves" is an incorrect description of the actual (currently safe, but only by closure-timing
  accident) runtime behavior (see Finding 2); taken at face value it would predict the opposite of the behavior
  the design wants.

## Verdict

2 HIGH + 2 MEDIUM findings → **CHANGES_REQUESTED**.
