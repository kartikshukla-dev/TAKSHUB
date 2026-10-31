import { useEffect } from 'react';
import Icon from './Icon';
import { STATUS_LABEL, PRIORITY_LABEL, initials, avatarTone } from '../utils/format';

export function Avatar({ user, size = 'md' }) {
  const name = user?.name || '?';
  return (
    <span className={`avatar avatar-${size} avatar-${avatarTone(name)}`} title={name}>
      {initials(name)}
    </span>
  );
}

export function StatusPill({ status }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <span className={`priority-badge priority-${priority}`}>
      <span className="priority-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {PRIORITY_LABEL[priority] || priority}
    </span>
  );
}

export function Chip({ children, tone = 'default' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="page-head">
      <div>
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'listChecks', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={18} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

// Overlay + card; closes on Escape and on backdrop click.
export function Modal({ title, icon, onClose, children, wide = false, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={`modal-card ${wide ? 'modal-card-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          {icon && (
            <span className="modal-icon">
              <Icon name={icon} size={16} />
            </span>
          )}
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
