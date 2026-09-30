import { describe, expect, it } from 'vitest';
import { controlDigit, emptyGroups, recallGroup, sameKindOnScreen, storeGroup, DOUBLE_TAP_MS } from './selection';

describe('selección moldeable', () => {
  it('guarda y recupera un grupo con Ctrl y el número', () => {
    const stored = storeGroup(emptyGroups(), 2, ['p1-interceptor', 'p1-wing']);
    const recalled = recallGroup(stored, 2, 1_000);
    expect(recalled.ids).toEqual(['p1-interceptor', 'p1-wing']);
    expect(recalled.center).toBe(false);
  });

  it('centra solo al repetir el mismo número dentro de la ventana', () => {
    const stored = storeGroup(emptyGroups(), 1, ['p1-interceptor']);
    const first = recallGroup(stored, 1, 1_000);
    const second = recallGroup(first.groups, 1, 1_000 + DOUBLE_TAP_MS);
    const late = recallGroup(first.groups, 1, 1_000 + DOUBLE_TAP_MS + 1);
    expect(second.center).toBe(true);
    expect(late.center).toBe(false);
  });

  it('ignora teclas que no son un grupo', () => {
    expect(controlDigit('0')).toBeNull();
    expect(controlDigit('a')).toBeNull();
    expect(controlDigit('4')).toBe(4);
  });

  it('elige el mismo tipo solo en celdas visibles', () => {
    const units = [
      { id: 'near', ownerId: 'p1', kind: 'interceptor', x: 2, y: 2 },
      { id: 'far', ownerId: 'p1', kind: 'interceptor', x: 9, y: 9 },
      { id: 'other', ownerId: 'p1', kind: 'frigate', x: 2, y: 3 },
    ];
    const visible = new Set(['2,2', '2,3']);
    expect(sameKindOnScreen(units, { ownerId: 'p1', kind: 'interceptor', visible })).toEqual(['near']);
  });

  it('devuelve lista vacía si no hay nadie de ese tipo a la vista', () => {
    expect(sameKindOnScreen([], { ownerId: 'p1', kind: 'interceptor', visible: new Set() })).toEqual([]);
  });
});
