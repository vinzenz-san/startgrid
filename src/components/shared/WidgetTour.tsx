import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { useEditMode } from '../../contexts/EditModeContext';
import { APP_VERSION } from '../../lib/appVersion';
import type { TranslationKey } from '../../i18n';
import './WidgetTour.css';

interface Props {
  open:          boolean;
  onClose:       () => void;
  /** Opens the Settings Sidebar — Grid.tsx owns that state locally (it isn't
   *  in a context), so the tour needs it threaded in to actually perform the
   *  "click Next to open it" step rather than just describing it. */
  onOpenSettings: () => void;
  /** Fired only when the last step's "Got it" is clicked — i.e. a real
   *  completion, not "Skip tour". Grid.tsx uses this to follow up with the
   *  layout preset picker. */
  onComplete?: () => void;
}

interface Step {
  titleKey: TranslationKey;
  bodyKey:  TranslationKey;
  /** CSS selector of the live element this step talks about, so it can be
   *  spotlighted instead of making the user hunt for it while reading. Left
   *  undefined for steps that aren't about a specific on-screen control. */
  target?: string;
  /** Side effect fired when the user clicks Next FROM this step (i.e. on the
   *  way to the next one) — the step's own copy promises "click Next to
   *  open/unlock X", so the action happens exactly then rather than being
   *  pre-applied on arrival. */
  onAdvance?: 'openSettings' | 'enableEditMode';
}

const STEPS: Step[] = [
  { titleKey: 'tour.step1.title',           bodyKey: 'tour.step1.body' },
  { titleKey: 'tour.stepSettings.title',    bodyKey: 'tour.stepSettings.body', target: '.sg-idle-icons button:nth-child(1)', onAdvance: 'openSettings' },
  { titleKey: 'tour.settingsOpened.title',  bodyKey: 'tour.settingsOpened.body' },
  // Edit mode must be entered before Add Widget exists to point at — it
  // only renders inside the bottom bar, which only appears while editing.
  { titleKey: 'tour.step3.title',           bodyKey: 'tour.step3.body', target: '.sg-idle-icons button:nth-child(2)', onAdvance: 'enableEditMode' },
  { titleKey: 'tour.editModeEnabled.title', bodyKey: 'tour.editModeEnabled.body' },
  { titleKey: 'tour.step2.title',           bodyKey: 'tour.step2.body', target: '.sg-controls-add-widget' },
  { titleKey: 'tour.step4.title',           bodyKey: 'tour.step4.body', target: '.sg-widget' },
  { titleKey: 'tour.step5.title',           bodyKey: 'tour.step5.body', target: '.sg-widget' },
  { titleKey: 'tour.step6.title',           bodyKey: 'tour.step6.body' },
];

const HIGHLIGHT_PADDING = 6;

// Tracks the live bounding rect of `selector`, so the spotlight ring follows
// the real element rather than a stale snapshot — re-polled on a short
// interval (not just resize/scroll) because opening the sidebar or entering
// edit mode a moment ago can still be animating the target into its final
// position/opacity.
function useHighlightRect(selector: string | undefined) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) { setRect(null); return; }
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const id = window.setInterval(update, 200);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearInterval(id);
    };
  }, [selector]);

  return rect;
}

export default function WidgetTour({ open, onClose, onOpenSettings, onComplete }: Props) {
  const { t, updateSettings } = useSettings();
  const { isEditMode, toggleEditMode } = useEditMode();
  const [step, setStep] = useState(0);
  const [skipNoticeOpen, setSkipNoticeOpen] = useState(false);
  const rect = useHighlightRect(open && !skipNoticeOpen ? STEPS[step]?.target : undefined);

  // The component stays mounted while closed (`open` just skips the render
  // below), so `step`/`skipNoticeOpen` would otherwise still hold whatever
  // they were at when the tour last closed — restarting via "Show tutorial
  // again" would silently resume mid-tour, or land straight on the skip
  // notice if that's how it was last dismissed. Reset on every open.
  useEffect(() => {
    if (open) { setStep(0); setSkipNoticeOpen(false); }
  }, [open]);

  if (!open) return null;

  // Ends the tour proper (mark seen) without closing the whole flow — used
  // by both "skip" (which then shows the one-off restart-location notice)
  // and the final step's "Got it" (which closes immediately, no notice).
  const markSeen = () => updateSettings({ widgetTourSeen: true, widgetTourSeenVersion: APP_VERSION });

  const advance = (next: number) => {
    switch (STEPS[step].onAdvance) {
      case 'openSettings':    onOpenSettings(); break;
      case 'enableEditMode':  if (!isEditMode) toggleEditMode(); break;
    }
    setStep(next);
  };

  if (skipNoticeOpen) {
    return createPortal(
      <div className="sg-tour-backdrop sg-tour-backdrop--dim">
        <div className="sg-tour-dialog">
          <div className="sg-tour-title">{t('tour.skipNotice.title')}</div>
          <p className="sg-tour-body">{t('tour.skipNotice.body')}</p>
          <div className="sg-tour-actions sg-tour-actions--single">
            <button className="sg-tour-btn sg-tour-btn--next" onClick={onClose}>{t('tour.done')}</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const isLast = step === STEPS.length - 1;
  const { titleKey, bodyKey } = STEPS[step];

  return createPortal(
    <div className={`sg-tour-backdrop${rect ? '' : ' sg-tour-backdrop--dim'}`}>
      {/* Spotlight: a single element sized to the target's rect whose own
          box-shadow dims the entire viewport except that box — cheaper and
          simpler than a clip-path cutout, and it's what supplies the dimming
          when a target exists (the plain backdrop above stays undimmed). */}
      {rect && (
        <div
          className="sg-tour-highlight"
          style={{
            top:    rect.top    - HIGHLIGHT_PADDING,
            left:   rect.left   - HIGHLIGHT_PADDING,
            width:  rect.width  + HIGHLIGHT_PADDING * 2,
            height: rect.height + HIGHLIGHT_PADDING * 2,
          }}
        />
      )}
      <div className="sg-tour-dialog">
        <div className="sg-tour-content">
          <div className="sg-tour-progress">{t('tour.stepCounter', { current: step + 1, total: STEPS.length })}</div>
          <div className="sg-tour-title">{t(titleKey)}</div>
          <p className="sg-tour-body">{t(bodyKey)}</p>
        </div>
        <div className="sg-tour-dots">
          {STEPS.map((_, i) => <span key={i} className={`sg-tour-dot${i === step ? ' active' : ''}`} />)}
        </div>
        <div className="sg-tour-actions">
          <button className="sg-tour-btn sg-tour-btn--skip" onClick={() => { markSeen(); setSkipNoticeOpen(true); }}>
            {t('tour.skip')}
          </button>
          <div className="sg-tour-actions-right">
            {step > 0 && (
              <button className="sg-tour-btn sg-tour-btn--back" onClick={() => setStep(step - 1)}>{t('tour.back')}</button>
            )}
            <button className="sg-tour-btn sg-tour-btn--next" onClick={() => isLast ? (markSeen(), onClose(), onComplete?.()) : advance(step + 1)}>
              {isLast ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
