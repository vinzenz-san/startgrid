import { useEditMode } from '../../../contexts/EditModeContext';
import './SpacerWidget.css';

export default function SpacerWidget() {
  const { isEditMode } = useEditMode();
  if (!isEditMode) return <div className="sg-spacer" />;
  return (
    <div className="sg-spacer sg-spacer--edit">
      <span className="sg-spacer-icon">▫️</span>
      <span className="sg-spacer-label">Invisible Spacer (holds grid position)</span>
    </div>
  );
}
