import { useAuth } from '../context/AuthContext';
import { newComments } from '../utils/comments';
import Icon from './Icon';

// Comment count on a task card / row; highlighted when there are comments
// I haven't seen yet.
export default function CommentBadge({ task }) {
  const { userId, isHead, departmentId } = useAuth();
  const total = task.comments?.length || 0;
  if (!total) return null;
  const fresh = newComments(task, { userId, isHead, departmentId });
  if (fresh) {
    return (
      <span className="comment-badge comment-badge-new" title={`${fresh} new comment${fresh === 1 ? '' : 's'}`}>
        <Icon name="message" size={12} /> {fresh} new
      </span>
    );
  }
  return (
    <span className="comment-badge" title={`${total} comment${total === 1 ? '' : 's'}`}>
      <Icon name="message" size={12} /> {total}
    </span>
  );
}
