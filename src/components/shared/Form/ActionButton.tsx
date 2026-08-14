import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../../contexts/SettingsContext';
import './Form.css';

interface Props {
  onClick:       () => void;
  children:      React.ReactNode;
  cooldownTime?: number;
  className?:    string;
  variant?:      'default' | 'danger' | 'ghost';
  disabled?:     boolean;
  /** Toggle-style highlighted state — only meaningful for variant="ghost". */
  active?:       boolean;
  /** Full-width (default, matches Import/Export/Reset) or auto-width inline usage. */
  fullWidth?:    boolean;
  /** Native tooltip — for icon-only buttons where children alone doesn't label the action. */
  title?:        string;
  /** Keep the arm→confirm two-click flow but skip the cooldown timer between
   *  them — for a user-configurable "delete protection" toggle where the
   *  confirm step itself should stay, just not the wait. Ignored for ghost. */
  skipCooldown?: boolean;
}

export default function ActionButton({
  onClick,
  children,
  cooldownTime = 1,
  className = '',
  variant = 'default',
  disabled = false,
  active = false,
  fullWidth = true,
  title,
  skipCooldown = false,
}: Props) {
  const { developerOptionsEnabled } = useSettings();
  const [pending,   setPending]   = useState(false);
  const [cooldown,  setCooldown]  = useState(false);
  const [countdown, setCountdown] = useState(cooldownTime);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cooldown) return;
    setCountdown(cooldownTime);
    const tick = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { clearInterval(tick); setCooldown(false); return cooldownTime; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [cooldown, cooldownTime]);

  // Auto-cancel if user ignores the armed state after cooldown expires
  useEffect(() => {
    if (pending && !cooldown) {
      cancelTimer.current = setTimeout(() => setPending(false), 4000);
    }
    return () => { if (cancelTimer.current) clearTimeout(cancelTimer.current); };
  }, [pending, cooldown]);

  function handleClick() {
    if (disabled) return;

    // Ghost buttons are instant, non-destructive actions (toggles, one-shot
    // triggers like "Match Background") — they skip the arm/confirm/cooldown
    // flow entirely and just fire.
    if (variant === 'ghost') {
      onClick();
      return;
    }

    if (!pending) {
      setPending(true);
      // Dev mode / skipCooldown: arm instantly with no cooldown; normal mode: arm + start timer
      if (!developerOptionsEnabled && !skipCooldown) setCooldown(true);
      return;
    }
    if (cooldown) return;
    setPending(false);
    onClick();
  }

  const cls = [
    'sg-action-btn',
    variant === 'danger' ? 'sg-action-btn--danger'  : '',
    variant === 'ghost'  ? 'sg-action-btn--ghost'    : '',
    active               ? 'active'                  : '',
    !fullWidth           ? 'sg-action-btn--auto'     : '',
    pending              ? 'sg-action-btn--confirm'  : '',
    cooldown             ? 'sg-action-btn--cooldown' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} onClick={handleClick} disabled={disabled} title={title}>
      {variant !== 'ghost' && pending && !cooldown
        ? 'Confirm?'
        : <>{children}{variant !== 'ghost' && cooldown && <span className="sg-action-btn-countdown">({countdown}s)</span>}</>
      }
    </button>
  );
}
