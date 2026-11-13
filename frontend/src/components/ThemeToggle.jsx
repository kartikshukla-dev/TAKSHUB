import { useTheme } from '../context/ThemeContext';
import Icon from './Icon';

const NEXT = { system: 'light', light: 'dark', dark: 'system' };
const LABEL = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };
const ICON = { system: 'monitor', light: 'sun', dark: 'moon' };

// Topbar button: cycles System -> Light -> Dark.
export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const label = `${LABEL[mode]} (click for ${LABEL[NEXT[mode]].toLowerCase()})`;
  return (
    <button type="button" className="icon-btn" onClick={() => setMode(NEXT[mode])} aria-label={label} title={label}>
      <Icon name={ICON[mode]} size={17} />
    </button>
  );
}

// Settings: three-way segmented control.
export function ThemePicker() {
  const { mode, setMode } = useTheme();
  return (
    <div className="segmented" role="radiogroup" aria-label="Theme">
      {['system', 'light', 'dark'].map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
          <Icon name={ICON[m]} size={14} /> {m[0].toUpperCase() + m.slice(1)}
        </button>
      ))}
    </div>
  );
}
