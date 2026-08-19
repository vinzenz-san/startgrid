import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { storage } from '../lib/storage';

interface EditModeContextType {
  isEditMode: boolean;
  toggleEditMode: () => void;
}

const EditModeContext = createContext<EditModeContextType | null>(null);

/**
 * Tracks whether the grid is in edit mode (drag/resize/settings enabled),
 * toggleable via Ctrl/Cmd+E. Persists only a `locked` flag to storage.sync —
 * edit mode itself always starts off on load, but a session left locked
 * stays locked across a reload.
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [isEditMode, setIsEditMode] = useState(false);

  // Persist lock state via storage.sync
  useEffect(() => {
    storage.get('editModeLocked').then((locked) => {
      if (locked === true) setIsEditMode(false);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        setIsEditMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleEditMode = () => {
    setIsEditMode(prev => {
      const next = !prev;
      storage.set('editModeLocked', !next);
      return next;
    });
  };

  return (
    <EditModeContext.Provider value={{ isEditMode, toggleEditMode }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error('useEditMode must be used within EditModeProvider');
  return ctx;
}
