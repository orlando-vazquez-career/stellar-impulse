import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import {
  assignBinding, CAMERA_SLOTS, comboFromEvent, CONTROL_GROUPS, DEFAULT_KEYBINDINGS, formatCombo, freshKeybindings, isPanAction,
  type Keybindings, type ShortcutAction,
} from './keybindings';

type Translate = ReturnType<typeof useI18n>['t'];

const SIMPLE: Partial<Record<ShortcutAction, Parameters<Translate>[0]>> = {
  hold: 'kbHold', stop: 'kbStop', formation: 'kbFormation', disband: 'kbDisband',
  'produce-interceptor': 'kbProduceInterceptor', 'produce-frigate': 'kbProduceFrigate', 'produce-bomber': 'kbProduceBomber', 'produce-explorer': 'kbProduceExplorer',
  'camera-up': 'kbCameraUp', 'camera-down': 'kbCameraDown', 'camera-left': 'kbCameraLeft', 'camera-right': 'kbCameraRight',
  'camera-selection': 'kbCameraSelection', 'camera-base': 'kbCameraBase', 'select-all': 'kbSelectAll',
};

export function shortcutLabel(action: ShortcutAction, t: Translate): string {
  const simple = SIMPLE[action];
  if (simple) return t(simple);
  const slot = /^camera-(save|go)-(\d)$/.exec(action);
  if (slot) return t(slot[1] === 'save' ? 'kbCameraSave' : 'kbCameraGo', { slot: slot[2]! });
  const group = /^group-(select|set|add)-(\d)$/.exec(action)!;
  return t(group[1] === 'select' ? 'kbGroupSelect' : group[1] === 'set' ? 'kbGroupSet' : 'kbGroupAdd', { group: group[2]! });
}

const ROWS: Array<{ title: Parameters<Translate>[0]; actions: ShortcutAction[] }> = [
  { title: 'kbCategoryOrders', actions: ['hold', 'stop', 'formation', 'disband'] },
  { title: 'kbCategoryProduction', actions: ['produce-interceptor', 'produce-frigate', 'produce-bomber', 'produce-explorer'] },
  { title: 'kbCategoryCamera', actions: ['camera-selection', 'camera-base', 'camera-up', 'camera-down', 'camera-left', 'camera-right'] },
  { title: 'kbCategorySelection', actions: ['select-all'] },
];

/** Settings → Controls: click a key, press the new one. A key already in use trades places. */
export function KeybindingsPanel({ value, onChange }: { value: Keybindings; onChange(next: Keybindings): void }) {
  const { t, locale } = useI18n();
  const [listening, setListening] = useState<ShortcutAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const key = (combo: string) => formatCombo(combo, locale);

  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) { setListening(null); return; }
      const combo = comboFromEvent(event);
      if (!combo) return; // A lone Ctrl, Shift or Alt: wait for the key that goes with it.
      const { bindings, swapped } = assignBinding(value, listening, combo);
      onChange(bindings);
      setMessage(swapped ? t('kbSwapped', { key: key(bindings[listening]), other: shortcutLabel(swapped, t), old: key(bindings[swapped]) }) : null);
      setListening(null);
    };
    const cancel = () => setListening(null);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('blur', cancel);
    };
  }, [listening, value]);

  const binding = (action: ShortcutAction) => {
    const active = listening === action;
    const changed = value[action] !== DEFAULT_KEYBINDINGS[action];
    return <span className="vi-keybinding">
      <button type="button" className={`vi-keybinding__key${active ? ' is-listening' : ''}${changed ? ' is-changed' : ''}`}
        aria-label={`${shortcutLabel(action, t)}: ${key(value[action])}`} aria-pressed={active}
        onClick={() => { setMessage(null); setListening(active ? null : action); }}>
        {active ? t('kbListening') : key(value[action])}
      </button>
      {changed && !active && <button type="button" className="vi-keybinding__reset" title={t('kbReset')} aria-label={`${t('kbReset')}: ${shortcutLabel(action, t)}`}
        onClick={() => onChange(assignBinding(value, action, DEFAULT_KEYBINDINGS[action]).bindings)}>↺</button>}
    </span>;
  };

  return <div className="vi-settings-panel__body vi-control-settings">
    <p className="vi-control-settings__status" role="status">{listening ? t('kbListeningHelp', { action: shortcutLabel(listening, t) }) : message ?? t('kbIntro')}</p>
    {ROWS.map(({ title, actions }) => <section key={title} className="vi-control-settings__group">
      <h3>{t(title)}</h3>
      {actions.map((action) => <div key={action} className="vi-control-settings__row">
        <strong>{shortcutLabel(action, t)}{isPanAction(action) && <small>{t('kbPanNote')}</small>}</strong>{binding(action)}
      </div>)}
    </section>)}
    <section className="vi-control-settings__group">
      <h3>{t('kbCategoryViews')}</h3>
      <p>{t('kbViewsNote')}</p>
      <div className="vi-control-settings__table vi-control-settings__table--views">
        <div className="vi-control-settings__table-row is-head"><span /><span>{t('kbSave')}</span><span>{t('kbGo')}</span></div>
        {CAMERA_SLOTS.map((slot) => <div key={slot} className="vi-control-settings__table-row">
          <strong>{t('kbCameraSlot', { slot })}</strong>{binding(`camera-save-${slot}`)}{binding(`camera-go-${slot}`)}
        </div>)}
      </div>
    </section>
    <section className="vi-control-settings__group">
      <h3>{t('kbCategoryGroups')}</h3>
      <p>{t('kbGroupsNote')}</p>
      <div className="vi-control-settings__table">
        <div className="vi-control-settings__table-row is-head"><span /><span>{t('kbSelect')}</span><span>{t('kbSave')}</span><span>{t('kbAdd')}</span></div>
        {CONTROL_GROUPS.map((group) => <div key={group} className="vi-control-settings__table-row">
          <strong>{t('kbGroup', { group })}</strong>{binding(`group-select-${group}`)}{binding(`group-set-${group}`)}{binding(`group-add-${group}`)}
        </div>)}
      </div>
    </section>
    <button type="button" className="vi-settings__restore vi-control-settings__reset-all" onClick={() => { setListening(null); setMessage(null); onChange(freshKeybindings()); }}>{t('kbResetAll')}</button>
  </div>;
}
