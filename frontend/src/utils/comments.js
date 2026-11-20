// "New comment" badges on task cards and rows.
//
// A comment is new for me when someone else wrote it after I last opened
// the task (task.commentReads, kept by the server). Comments from before
// this feature went live never count, so old tasks don't all light up.
export const COMMENT_BADGES_SINCE = new Date('2026-11-18T00:00:00Z');

const ref = (v) => (v ? String(v._id || v) : null);

// People who should be told: the task's assignee and reporter, the heads of
// the teams it moves between, and anyone who has commented on it.
export function followsTask(task, me) {
  if (!task || !me?.userId) return false;
  const id = me.userId;
  if (ref(task.assignee) === id || ref(task.reporter) === id) return true;
  if (me.isHead && me.departmentId && [ref(task.fromTeam), ref(task.toTeam)].includes(me.departmentId)) return true;
  return (task.comments || []).some((c) => ref(c.author) === id);
}

export function lastSeenAt(task, userId) {
  const r = (task?.commentReads || []).find((x) => ref(x.user) === userId);
  return r ? new Date(r.at) : null;
}

export function newComments(task, me) {
  if (!followsTask(task, me)) return 0;
  const seen = lastSeenAt(task, me.userId);
  const since = seen && seen > COMMENT_BADGES_SINCE ? seen : COMMENT_BADGES_SINCE;
  return (task.comments || []).filter((c) => ref(c.author) !== me.userId && c.createdAt && new Date(c.createdAt) > since).length;
}
