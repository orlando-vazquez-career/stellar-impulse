import { useState } from 'react';
import { UNIT_STATS } from '@impulso/state';
import { useI18n } from '../i18n';
import { LanguageToggle } from '../shared/LanguageToggle';
import { Panel } from '../shared/Panel';
import type { VisualPreferences } from '../settings/preferences';
import type { CameraView, CoreState, GameplayAction, GameplayPresentationAdapter, GameplayViewModel } from './model';
import { CORE_CELL, GRID_COLUMNS, GRID_ROWS } from './phaser/grid';
import { ASTEROIDS, BASE_CELLS } from './phaser/asteroids';

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function coreLabel(state: CoreState, t: ReturnType<typeof useI18n>['t']) {
  if (state === 'available') return t('coreAvailable');
  if (state === 'blue-capturing') return t('coreCapturingBlue');
  if (state === 'red-capturing') return t('coreCapturingRed');
  if (state === 'contested') return t('coreContested');
  if (state === 'blue-controlled') return t('coreBlueControlled');
  if (state === 'red-controlled') return t('coreRedControlled');
  return t('coreLocked');
}

function ResourceHud({ view }: { view: GameplayViewModel }) {
  const { t } = useI18n();
  const resources = [
    { key: 'metal', label: t('metal'), value: view.resources.metal, rate: view.resources.metalRate },
    { key: 'energy', label: t('energy'), value: view.resources.energy, rate: view.resources.energyRate },
  ];
  return <Panel className="vi-resources">
    {resources.map((resource) => <div className={`vi-resource vi-resource--${resource.key}`} key={resource.key}>
      <span>{resource.label}</span><strong>{resource.value}</strong><small>+{resource.rate}/s</small>
    </div>)}
    <div className="vi-resource vi-resource--fleet"><span>{t('fleet')}</span><strong>{view.resources.fleet}/{view.resources.fleetCap}</strong></div>
  </Panel>;
}

function SectorHud({ view }: { view: GameplayViewModel }) {
  const { t } = useI18n();
  return <Panel className="vi-sector-status">
    <div><span>{t('sector')}</span><strong>{String(view.sector).padStart(2, '0')}</strong></div>
    <time>{formatTime(view.elapsedSeconds)}</time>
    <div className={`vi-core-state vi-core-state--${view.core.state}`}><span aria-hidden="true" />
      <strong>{coreLabel(view.core.state, t)}</strong>
      {view.core.state === 'locked' && <small>{t('opensIn', { time: formatTime(view.core.opensInSeconds) })}</small>}
    </div>
  </Panel>;
}

function TopControls({ onResetCamera, onDevelopment, onLeave }: { onResetCamera(): void; onDevelopment(): void; onLeave(): void }) {
  const { t } = useI18n();
  return <div className="vi-top-controls">
    <button title={t('cameraReset')} onClick={onResetCamera}><span aria-hidden="true">◎</span></button>
    <button title={t('preferences')} onClick={onDevelopment}><span aria-hidden="true">⚙</span></button>
    <LanguageToggle />
    <button className="vi-leave" onClick={onLeave}>{t('leaveSimulation')}</button>
  </div>;
}

function Minimap({ view, cameraView, onPanMap }: { view: GameplayViewModel; cameraView: CameraView | null; onPanMap(x: number, y: number): void }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const project = (gridX: number, gridY: number) => ({ x: 4 + (gridX + 0.5) * 172 / GRID_COLUMNS, y: 4 + (gridY + 0.5) * 172 / GRID_ROWS });
  const route = view.moveOrder?.squadId === view.selectedSquadId ? view.moveOrder : null;
  return <Panel className={`vi-minimap ${collapsed ? 'is-collapsed' : ''}`}>
    <header><strong>{t('minimap')}</strong><button onClick={() => setCollapsed(!collapsed)}>{collapsed ? t('expand') : t('collapse')}</button></header>
    {!collapsed && <button className="vi-minimap__pan" aria-label={t('minimapPan')} onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left - 4) / (bounds.width - 8)));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top - 4) / (bounds.height - 8)));
      onPanMap(Math.floor(x * GRID_COLUMNS), Math.floor(y * GRID_ROWS));
    }}><svg viewBox="0 0 180 180" role="img" aria-label={t('minimap')}>
      <rect className="map-boundary" x="4" y="4" width="172" height="172" />
      <path className="map-route" d="M4 90H176M90 4V176" />
      <circle className="map-core" cx={project(CORE_CELL.x, CORE_CELL.y).x} cy={project(CORE_CELL.x, CORE_CELL.y).y} r="4" />
      {Object.entries(BASE_CELLS).map(([owner, cell]) => { const point = project(cell.x, cell.y); const fill = owner === 'blue' ? '#36a9ff' : '#ff4f64'; return <g key={owner} fill={fill}>
        <rect x={point.x - 6} y={point.y - 4} width="12" height="8" />
        <circle cx={point.x - 4} cy={point.y - 5} r="2" /><circle cx={point.x + 4} cy={point.y - 5} r="2" />
      </g>; })}
      {ASTEROIDS.map((asteroid) => { const point = project(asteroid.x, asteroid.y); return <circle key={`${asteroid.x},${asteroid.y}`} cx={point.x} cy={point.y} r="2.2" fill="#8897a6" />; })}
      {route && <polyline className="map-move-route" points={route.route.map((cell) => { const point = project(cell.x, cell.y); return `${point.x},${point.y}`; }).join(' ')} />}
      {(() => { const selected = view.squads.find((squad) => squad.id === view.selectedSquadId); const target = view.squads.find((squad) => squad.id === selected?.attackTargetId); if (!selected || !target) return null; const from = project(selected.gridX, selected.gridY); const to = project(target.gridX, target.gridY); return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#ff4f64" strokeWidth="1.5" />; })()}
      {view.squads.filter((squad) => squad.visible).map((squad) => {
        const point = project(squad.gridX, squad.gridY);
        return <circle key={squad.id} className={squad.owner === 'blue' ? 'map-ally' : 'map-enemy'} cx={point.x} cy={point.y} r={squad.selected ? 4 : 3} />;
      })}
      {route && <circle className="map-destination" cx={project(route.destination.x, route.destination.y).x} cy={project(route.destination.x, route.destination.y).y} r="4" />}
      {cameraView && <rect className="map-camera" x={4 + cameraView.x * 172} y={4 + cameraView.y * 172} width={cameraView.width * 172} height={cameraView.height * 172} />}
    </svg></button>}
  </Panel>;
}

function SquadHud({ view }: { view: GameplayViewModel }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const selected = view.squads.filter((candidate) => view.selectedSquadIds.includes(candidate.id) && candidate.visible && candidate.healthPercent > 0);
  if (!selected.length) return null;
  const squad = view.squads.find((candidate) => candidate.id === view.selectedSquadId);
  if (!squad) return null;
  const status = squad.status === 'moving' ? t('moving') : squad.status === 'attacking' ? t('attacking') : squad.status === 'holding' ? t('holding') : squad.status === 'capturing' ? t('capturing') : t('idle');
  const stats = UNIT_STATS[squad.unitType];
  const unitNames = { explorer: t('unitExplorer'), interceptor: t('unitInterceptor'), frigate: t('unitFrigate'), bomber: t('unitBomber') };
  return <Panel className={`vi-squad ${collapsed ? 'is-collapsed' : ''}`}>
    <header><span>{selected.length > 1 ? t('selectedUnits', { count: selected.length }) : t('selectedSquad')}</span><button onClick={() => setCollapsed(!collapsed)}>{collapsed ? t('expand') : t('collapse')}</button></header>
    {!collapsed && selected.length > 1 ? <div className="vi-squad__group">{selected.map((unit) => <div className="vi-squad__group-unit" key={unit.id}>
      <strong>{unit.callSign}</strong><span>{unitNames[unit.unitType]}</span><progress aria-label={`${unit.callSign} HP`} value={unit.healthPercent} max="100" />
    </div>)}</div> : !collapsed && <div className="vi-squad__body">
      <div className="vi-squad__identity"><span aria-hidden="true">△</span><div><h2>{t('squad')} {squad.callSign}</h2><p>{status}</p></div></div>
      <div className="vi-squad__composition">
        <strong>{unitNames[squad.unitType]}</strong>
        <span>{t('unitStats', { hp: stats.maxHp, damage: stats.damage, speed: (4 / stats.moveIntervalFactor).toFixed(1) })}</span>
        {squad.composition.interceptors > 0 && <span>{t('interceptors', { count: squad.composition.interceptors })}</span>}
        {squad.composition.frigates > 0 && <span>{t('frigates', { count: squad.composition.frigates })}</span>}
        {squad.composition.bombers && <span>{t('bombers', { count: squad.composition.bombers })}</span>}
      </div>
      <div className="vi-health"><div><span>{t('totalHealth')}</span><strong>{squad.healthPercent}%</strong></div><progress value={squad.healthPercent} max="100" /></div>
    </div>}
  </Panel>;
}

const actionGlyphs: Record<Exclude<GameplayAction, null> | 'cancel', string> = { move: '↗', attack: '⌖', hold: 'Ⅱ', capture: '◇', cancel: '×' };

function ActionHud({ view, adapter, controls }: { view: GameplayViewModel; adapter: GameplayPresentationAdapter; controls: VisualPreferences['controls'] }) {
  const { t } = useI18n();
  const actions: Array<{ action: Exclude<GameplayAction, null>; label: string; key: string }> = [
    { action: 'move', label: t('move'), key: controls.move },
    { action: 'attack', label: t('attack'), key: controls.attack },
    { action: 'hold', label: t('hold'), key: controls.hold },
    { action: 'capture', label: t('capture'), key: controls.capture },
  ];
  return <Panel className="vi-actions"><span className="vi-actions__label">{t('actions')}</span>
    <div className="vi-actions__list">
      {actions.map(({ action, label, key }) => <button key={action} className={view.activeAction === action ? 'is-active' : ''} onClick={() => adapter.dispatch({ type: 'set-action', action })} aria-pressed={view.activeAction === action}>
        <span className="vi-action-glyph" aria-hidden="true">{actionGlyphs[action]}</span><span>{label}</span><kbd>{key}</kbd>
      </button>)}
      <button disabled={!view.activeAction} onClick={() => adapter.dispatch({ type: 'set-action', action: null })}><span className="vi-action-glyph" aria-hidden="true">{actionGlyphs.cancel}</span><span>{t('cancel')}</span><kbd>{controls.cancel}</kbd></button>
    </div>
  </Panel>;
}

export function Hud({ view, adapter, controls, cameraView, onPanMap, onResetCamera, onDevelopment, onLeave }: { view: GameplayViewModel; adapter: GameplayPresentationAdapter; controls: VisualPreferences['controls']; cameraView: CameraView | null; onPanMap(x: number, y: number): void; onResetCamera(): void; onDevelopment(): void; onLeave(): void }) {
  const { t } = useI18n();
  return <div className="vi-hud" aria-label={t('hud')}>
    <ResourceHud view={view} />
    <SectorHud view={view} />
    <TopControls onResetCamera={onResetCamera} onDevelopment={onDevelopment} onLeave={onLeave} />
    <Minimap view={view} cameraView={cameraView} onPanMap={onPanMap} />
    <SquadHud view={view} />
    <ActionHud view={view} adapter={adapter} controls={controls} />
  </div>;
}
