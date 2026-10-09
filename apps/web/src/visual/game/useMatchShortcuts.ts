import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useI18n } from '../i18n';
import { actionForCombo, comboFromEvent, formatCombo, type CameraSlot, type ControlGroup, type Keybindings, type ShortcutAction } from '../settings/keybindings';
import { addToGroup, focusCell, groupMembers, pruneGroups, setGroup, type ControlGroups } from './control-groups';
import { nextFormation } from './formation';
import type { GameplayPresentationAdapter, GameplayViewModel, SquadType } from './model';
import type { CameraState } from './phaser/MainScene';
import type { PhaserBattlefieldHandle } from './phaser/PhaserBattlefield';

/** Two presses of a group key closer than this centre the camera on the group. */
export const DOUBLE_TAP_MS = 350;
const TOAST_MS = 1600;
const PRODUCTION: Partial<Record<ShortcutAction, SquadType>> = {
  'produce-interceptor': 'interceptor', 'produce-frigate': 'frigate', 'produce-bomber': 'bomber', 'produce-explorer': 'explorer',
};

const typing = (event: KeyboardEvent) => event.target instanceof HTMLElement
  && Boolean(event.target.closest('input, select, textarea, [contenteditable="true"]'));
const ownSelected = (view: GameplayViewModel) => view.squads.filter((squad) => squad.selected && squad.owner === 'blue' && squad.healthPercent > 0);

/**
 * Keyboard control of a match: orders, production, camera jumps and squads saved under number keys.
 * Squads and saved views live only as long as the match.
 */
export function useMatchShortcuts({ adapter, view, bindings, battlefield }: {
  adapter: GameplayPresentationAdapter;
  view: GameplayViewModel;
  bindings: Keybindings;
  battlefield: RefObject<PhaserBattlefieldHandle | null>;
}) {
  const { t, locale } = useI18n();
  const [groups, setGroups] = useState<ControlGroups>({});
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const views = useRef<Partial<Record<CameraSlot, CameraState>>>({});
  const lastTap = useRef<{ group: ControlGroup; at: number } | null>(null);

  // Lost ships leave their squads.
  useEffect(() => { setGroups((current) => pruneGroups(current, view.squads)); }, [view.squads]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const say = useCallback((text: string) => setToast((current) => ({ text, id: (current?.id ?? 0) + 1 })), []);

  const centerOn = useCallback((squads: GameplayViewModel['squads']) => {
    const cell = focusCell(squads);
    if (cell) battlefield.current?.centerOnCell(cell.x, cell.y);
  }, [battlefield]);

  /** Select a saved squad; a second press (or `center`) also brings the camera to it. */
  const selectGroup = useCallback((group: ControlGroup, center = false) => {
    const members = groupMembers(groupsRef.current, group, viewRef.current.squads);
    if (!members.length) return;
    adapter.dispatch({ type: 'select-squads', squadIds: members.map((squad) => squad.id) });
    const now = performance.now();
    const again = lastTap.current?.group === group && now - lastTap.current.at < DOUBLE_TAP_MS;
    lastTap.current = again ? null : { group, at: now };
    if (center || again) centerOn(members);
  }, [adapter, centerOn]);

  const run = useCallback((action: ShortcutAction) => {
    const current = viewRef.current;
    const production = PRODUCTION[action];
    if (production) {
      if (current.canProduce !== false) adapter.dispatch({ type: 'produce', kind: production });
      return;
    }
    const slot = /^camera-(save|go)-(\d)$/.exec(action);
    if (slot) {
      const index = Number(slot[2]) as CameraSlot;
      if (slot[1] === 'save') {
        const state = battlefield.current?.cameraState();
        if (state) { views.current[index] = state; say(t('shortcutViewSaved', { slot: index })); }
      } else if (views.current[index]) battlefield.current?.restoreCamera(views.current[index]!);
      else say(t('shortcutViewEmpty', { slot: index, key: formatCombo(bindings[`camera-save-${index}`], locale) }));
      return;
    }
    const squad = /^group-(select|set|add)-(\d)$/.exec(action);
    if (squad) {
      const group = Number(squad[2]) as ControlGroup;
      if (squad[1] === 'select') { selectGroup(group); return; }
      const ids = ownSelected(current).map((ship) => ship.id);
      if (!ids.length) return;
      const next = squad[1] === 'set' ? setGroup(groupsRef.current, group, ids) : addToGroup(groupsRef.current, group, ids);
      groupsRef.current = next;
      setGroups(next);
      const count = next[group]?.length ?? 0;
      say(t(count === 1 ? 'shortcutGroupSavedOne' : 'shortcutGroupSaved', { group, count }));
      return;
    }
    switch (action) {
      case 'hold': adapter.dispatch({ type: 'set-action', action: 'hold' }); return;
      case 'stop': adapter.dispatch({ type: 'stop-selected' }); return;
      case 'disband': adapter.dispatch({ type: 'disband-selected' }); return;
      case 'formation':
        if (current.formation && current.selectedSquadIds.length > 1) adapter.dispatch({ type: 'set-formation', formation: nextFormation(current.formation) });
        return;
      case 'select-all': {
        const ids = current.squads.filter((ship) => ship.owner === 'blue' && ship.visible && ship.healthPercent > 0).map((ship) => ship.id);
        if (ids.length) adapter.dispatch({ type: 'select-squads', squadIds: ids });
        return;
      }
      case 'camera-selection': centerOn(ownSelected(current)); return;
      case 'camera-base': {
        const base = current.base?.position;
        if (base) battlefield.current?.centerOnCell(base.x, base.y);
        else battlefield.current?.resetCamera();
        return;
      }
      default:
    }
  }, [adapter, battlefield, bindings, centerOn, locale, say, selectGroup, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (typing(event)) return;
      const combo = comboFromEvent(event);
      const action = combo ? actionForCombo(bindings, combo) : null;
      if (!action) return;
      // Ctrl+1 would switch browser tabs and Ctrl+A select the page; the game owns its keys.
      event.preventDefault();
      if (!event.repeat) run(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings, run]);

  return { groups, selectGroup, toast };
}
