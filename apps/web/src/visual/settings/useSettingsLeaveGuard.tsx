import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ConfirmLeaveDialog } from '../shared/ConfirmLeaveDialog';
import type { SettingsPanelHandle } from './SettingsScreen';

/**
 * Wraps every way out of an open SettingsPanel. Pass `panelRef` to the panel and route each exit
 * through `guard(next)`: with nothing to save `next` runs at once; otherwise `dialog` asks first
 * whether to save, discard or keep editing. Render `dialog` anywhere in the screen.
 */
export function useSettingsLeaveGuard(): {
  panelRef: RefObject<SettingsPanelHandle | null>;
  guard(next: () => void): void;
  dialog: ReactNode;
} {
  const panelRef = useRef<SettingsPanelHandle | null>(null);
  const [pending, setPending] = useState<{ next: () => void } | null>(null);

  const guard = useCallback((next: () => void) => {
    if (panelRef.current?.isDirty()) setPending({ next });
    else next();
  }, []);

  const leave = (keep: boolean) => {
    const target = pending;
    setPending(null);
    if (keep) panelRef.current?.save();
    else panelRef.current?.discard();
    target?.next();
  };

  const dialog = pending
    ? <ConfirmLeaveDialog onSaveAndLeave={() => leave(true)} onDiscard={() => leave(false)} onKeepEditing={() => setPending(null)} />
    : null;
  return { panelRef, guard, dialog };
}
