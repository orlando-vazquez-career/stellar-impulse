import type { PickedBase } from './structure-pick';

/** What a left click (or a drag) on the battlefield selects. */
export type ClickSelection =
  /** The drag box: own ships inside it, never a base. */
  | { kind: 'box' }
  /** A double click on a ship: every own ship of its class on screen. */
  | { kind: 'class'; shipId: string }
  | { kind: 'ship'; shipId: string }
  | { kind: 'base'; base: PickedBase }
  | { kind: 'clear' };

/**
 * On pointer up: a drag selects ships in its box and never a base; a ship under the cursor wins over a base under
 * it; otherwise the base under the cursor (`baseAt`, only asked then) is selected, and open ground clears.
 */
export function clickSelection(input: { dragged: boolean; clickedId: string | null; doubleClick: boolean; baseAt(): PickedBase | null }): ClickSelection {
  if (input.dragged) return { kind: 'box' };
  if (input.clickedId) return input.doubleClick ? { kind: 'class', shipId: input.clickedId } : { kind: 'ship', shipId: input.clickedId };
  const base = input.baseAt();
  return base ? { kind: 'base', base } : { kind: 'clear' };
}
