import { useI18n } from '../i18n';
import { coreLabel } from './Hud';
import type { CoreState, GameplayPresentationAdapter, GameplayViewModel } from './model';

const coreStates: CoreState[] = ['locked', 'available', 'blue-capturing', 'red-capturing', 'contested', 'blue-controlled', 'red-controlled'];

export function DevelopmentControls({ view, adapter, onClose }: { view: GameplayViewModel; adapter: GameplayPresentationAdapter; onClose(): void }) {
  const { t } = useI18n();
  const selected = view.squads.find((squad) => squad.id === view.selectedSquadId);
  return <aside className="vi-development" aria-label={t('developmentControls')}>
    <header><div><strong>{t('developmentControls')}</strong><span>{t('developmentOnly')}</span></div><button onClick={onClose}>{t('close')}</button></header>
    <label>{t('coreState')}<select value={view.core.state} onChange={(event) => adapter.dispatch({ type: 'set-core-state', state: event.target.value as CoreState })}>{coreStates.map((state) => <option key={state} value={state}>{coreLabel(state, t)}</option>)}</select></label>
    <label>{t('captureProgress')} <output>{view.core.progress}%</output><input type="range" min="0" max="100" value={view.core.progress} onChange={(event) => adapter.dispatch({ type: 'set-core-progress', progress: Number(event.target.value) })} /></label>
    <label>{t('squad')}<select value={view.selectedSquadId ?? ''} onChange={(event) => adapter.dispatch({ type: 'select-squad', squadId: event.target.value })}>{view.squads.filter((squad) => squad.owner === 'blue').map((squad) => <option value={squad.id} key={squad.id}>{squad.callSign}</option>)}</select></label>
    <label>{t('squadHealth')} <output>{selected?.healthPercent ?? 0}%</output><input type="range" min="0" max="100" value={selected?.healthPercent ?? 0} onChange={(event) => adapter.dispatch({ type: 'set-selected-health', healthPercent: Number(event.target.value) })} /></label>
    <label>{t('metal')}<input type="number" min="0" value={view.resources.metal} onChange={(event) => adapter.dispatch({ type: 'set-resource', resource: 'metal', value: Number(event.target.value) })} /></label>
    <label>{t('energy')}<input type="number" min="0" value={view.resources.energy} onChange={(event) => adapter.dispatch({ type: 'set-resource', resource: 'energy', value: Number(event.target.value) })} /></label>
    <label className="vi-check"><input type="checkbox" checked={view.enemiesVisible} onChange={(event) => adapter.dispatch({ type: 'set-enemy-visibility', visible: event.target.checked })} />{t('enemyVisibility')}</label>
    <label className="vi-check"><input type="checkbox" checked={view.clockRunning} onChange={(event) => adapter.dispatch({ type: 'set-clock-running', running: event.target.checked })} />{t('clock')}</label>
  </aside>;
}
