import type { ControlGroup } from '../settings/keybindings';
import type { SquadViewModel } from './model';

/** Squads the player saved under a number key. A ship may sit in several groups. */
export type ControlGroups = Partial<Record<ControlGroup, string[]>>;

const alive = (squad: SquadViewModel) => squad.owner === 'blue' && squad.healthPercent > 0 && squad.status !== 'destroyed';

/** Ctrl+N: the group becomes exactly the current selection (an empty selection clears it). */
export function setGroup(groups: ControlGroups, group: ControlGroup, squadIds: readonly string[]): ControlGroups {
  const next = { ...groups };
  if (squadIds.length) next[group] = [...new Set(squadIds)];
  else delete next[group];
  return next;
}

/** Shift+N: the selection joins the group, keeping the ships already in it. */
export function addToGroup(groups: ControlGroups, group: ControlGroup, squadIds: readonly string[]): ControlGroups {
  if (!squadIds.length) return groups;
  return { ...groups, [group]: [...new Set([...(groups[group] ?? []), ...squadIds])] };
}

/** The group's ships that are still flying, in the order they were saved. */
export function groupMembers(groups: ControlGroups, group: ControlGroup, squads: readonly SquadViewModel[]): SquadViewModel[] {
  const byId = new Map(squads.filter(alive).map((squad) => [squad.id, squad]));
  return (groups[group] ?? []).flatMap((id) => byId.get(id) ?? []);
}

/** Destroyed or disbanded ships leave every group; a group left empty disappears. */
export function pruneGroups(groups: ControlGroups, squads: readonly SquadViewModel[]): ControlGroups {
  const living = new Set(squads.filter(alive).map((squad) => squad.id));
  let changed = false;
  const next: ControlGroups = {};
  for (const [key, ids] of Object.entries(groups) as Array<[string, string[]]>) {
    const kept = ids.filter((id) => living.has(id));
    if (kept.length !== ids.length) changed = true;
    if (kept.length) next[Number(key) as ControlGroup] = kept;
  }
  return changed ? next : groups;
}

/** The cell to centre the camera on: the middle of the ships, snapped to the one closest to it
 * so a spread-out group never centres on empty space or a wall between them. */
export function focusCell(squads: readonly SquadViewModel[]): { x: number; y: number } | null {
  if (!squads.length) return null;
  const middle = {
    x: squads.reduce((sum, squad) => sum + squad.gridX, 0) / squads.length,
    y: squads.reduce((sum, squad) => sum + squad.gridY, 0) / squads.length,
  };
  if (squads.length <= 2) return { x: Math.round(middle.x), y: Math.round(middle.y) };
  const nearest = squads.reduce((best, squad) =>
    Math.hypot(squad.gridX - middle.x, squad.gridY - middle.y) < Math.hypot(best.gridX - middle.x, best.gridY - middle.y) ? squad : best);
  return { x: Math.round(nearest.gridX), y: Math.round(nearest.gridY) };
}
