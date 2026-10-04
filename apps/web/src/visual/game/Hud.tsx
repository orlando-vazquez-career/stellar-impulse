import { useEffect, useState } from 'react';
import { SHIP_COUNTERS, UNIT_COSTS } from '@impulso/sim';
import { useI18n } from '../i18n';
import { LanguageToggle } from '../shared/LanguageToggle';
import { formatStat } from './format-stat';
import { Panel } from '../shared/Panel';
import type { VisualPreferences } from '../settings/preferences';
import type { CameraView, CoreState, GameplayAction, GameplayPresentationAdapter, GameplayViewModel } from './model';
import { activeMapId, sectorMap, sectorSurface } from '../map/sector-map';
import { cellToIso, isoToPoint, ISO_WORLD_HEIGHT, ISO_WORLD_WIDTH, TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from './phaser/isometric';

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
    {view.suddenDeath && <strong role="status" className="vi-sudden-death">{t('suddenDeath')}</strong>}
    <div className={`vi-core-state vi-core-state--${view.core.state}`}><span aria-hidden="true" />
      <strong>{coreLabel(view.core.state, t)}</strong>
      {view.core.state === 'locked' && <small>{t('opensIn', { time: formatTime(view.core.opensInSeconds) })}</small>}
    </div>
  </Panel>;
}

function TopControls({ onResetCamera, onDevelopment, onLeave, multiplayer }: { onResetCamera(): void; onDevelopment(): void; onLeave(): void; multiplayer?: boolean }) {
  const { t } = useI18n();
  return <div className="vi-top-controls">
    <button title={t('cameraReset')} onClick={onResetCamera}><span aria-hidden="true">◎</span></button>
    {!multiplayer && <button title={t('preferences')} onClick={onDevelopment}><span aria-hidden="true">⚙</span></button>}
    <LanguageToggle />
    <button className="vi-leave" onClick={onLeave}>{multiplayer ? t('leaveMatch') : t('leaveSimulation')}</button>
  </div>;
}

const MINIMAP_SIZE = 172;
const OWNER_FILL = { blue: '#36a9ff', red: '#ff4f64', neutral: '#f2b84b' } as const;

/** Minimap scale and floor cells for the active map, rebuilt only when the map changes. */
let layout: { mapId: string; scale: number; offset: { x: number; y: number }; floor: { x: number; y: number; path: string }[]; terrainPath: string } | null = null;
function minimapLayout() {
  if (layout?.mapId === activeMapId) return layout;
  const scale = MINIMAP_SIZE / ISO_WORLD_WIDTH;
  const offset = { x: 4, y: 4 + (MINIMAP_SIZE - ISO_WORLD_HEIGHT * scale) / 2 };
  layout = { mapId: activeMapId, scale, offset, floor: [], terrainPath: '' };
  layout.floor = sectorSurface.walkable.flatMap((walkable, index) => {
    if (!walkable) return [];
    const x = index % sectorMap.width;
    const y = Math.floor(index / sectorMap.width);
    return [{ x, y, path: miniDiamond(x, y) }];
  });
  layout.terrainPath = layout.floor.map((cell) => cell.path).join(' ');
  return layout;
}

/** Same isometric projection as the battlefield, shrunk to the minimap. */
function miniPoint(gridX: number, gridY: number) {
  const { scale, offset } = minimapLayout();
  const iso = cellToIso(gridX, gridY);
  return { x: offset.x + iso.x * scale, y: offset.y + iso.y * scale };
}

function miniDiamond(x: number, y: number) {
  const center = miniPoint(x, y);
  const { scale } = minimapLayout();
  const hw = TILE_HALF_WIDTH * scale + 0.15;
  const hh = TILE_HALF_HEIGHT * scale + 0.15;
  return `M${center.x},${center.y - hh} L${center.x + hw},${center.y} L${center.x},${center.y + hh} L${center.x - hw},${center.y} Z`;
}

function Minimap({ view, cameraView, onPanMap }: { view: GameplayViewModel; cameraView: CameraView | null; onPanMap(x: number, y: number): void }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const route = view.moveOrder?.squadId === view.selectedSquadId ? view.moveOrder : null;
  const { scale: MINIMAP_SCALE, offset: MINIMAP_OFFSET, floor, terrainPath } = minimapLayout();
  const core = sectorSurface.core;
  const bases = { blue: sectorSurface.bases.p1, red: sectorSurface.bases.p2 };
  const seen = (cell: { x: number; y: number }) => !view.visibleCells || view.visibleCells[cell.y * sectorMap.width + cell.x] === true;
  return <Panel className={`vi-minimap ${collapsed ? 'is-collapsed' : ''}`}>
    <header><strong>{t('minimap')}</strong><button onClick={() => setCollapsed(!collapsed)}>{collapsed ? t('expand') : t('collapse')}</button></header>
    {!collapsed && <button className="vi-minimap__pan" aria-label={t('minimapPan')} onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const svgX = (event.clientX - bounds.left) / bounds.width * 180;
      const svgY = (event.clientY - bounds.top) / bounds.height * 180;
      const cell = isoToPoint((svgX - MINIMAP_OFFSET.x) / MINIMAP_SCALE, (svgY - MINIMAP_OFFSET.y) / MINIMAP_SCALE);
      if (cell) onPanMap(Math.round(cell.x), Math.round(cell.y));
    }}><svg viewBox="0 0 180 180" role="img" aria-label={t('minimap')}>
      <rect className="map-boundary" x="4" y="4" width="172" height="172" />
      {/* Batch terrain into two paths so every server view does not reconcile thousands of SVG elements. */}
      <path d={terrainPath} fill="#34587a" />
      <path d={view.visibleCells ? floor.filter(seen).map((cell) => cell.path).join(' ') : terrainPath} fill="#5b95c4" />
      {[...(view.chart?.nodes??[]),...(view.chart?.guardians??[])].map((cell,index)=>{
        const point=miniPoint(cell.x,cell.y);return <circle key={`chart-${index}`} className="map-chart-marker" cx={point.x} cy={point.y} r="2.4" fill="none" stroke="#b5c4d1" opacity=".65"/>;
      })}
      {view.nodes.map((node) => { const point = miniPoint(node.x, node.y); return <rect key={node.id} x={point.x - 2.2} y={point.y - 2.2} width="4.4" height="4.4"
        transform={`rotate(45 ${point.x} ${point.y})`} fill={node.owner ? OWNER_FILL[node.owner] : '#8aa0b8'} />; })}
      <circle className="map-core" cx={miniPoint(core.x, core.y).x} cy={miniPoint(core.x, core.y).y} r="4" />
      {Object.entries(bases).map(([owner, cell]) => { const point = miniPoint(cell.x, cell.y); return <rect key={owner}
        x={point.x - 5} y={point.y - 3.5} width="10" height="7" fill={owner === 'blue' ? OWNER_FILL.blue : OWNER_FILL.red} />; })}
      {route && <polyline className="map-move-route" points={route.route.map((cell) => { const point = miniPoint(cell.x, cell.y); return `${point.x},${point.y}`; }).join(' ')} />}
      {view.squads.filter((squad) => squad.visible).map((squad) => {
        const point = miniPoint(squad.gridX, squad.gridY);
        return <circle key={squad.id} className={squad.owner === 'blue' ? 'map-ally' : 'map-enemy'} cx={point.x} cy={point.y} r={squad.selected ? 3.2 : 2.4}
          fill={squad.owner === 'neutral' ? OWNER_FILL.neutral : undefined} />;
      })}
      {route && <circle className="map-destination" cx={miniPoint(route.destination.x, route.destination.y).x} cy={miniPoint(route.destination.x, route.destination.y).y} r="3" />}
      {cameraView && <rect className="map-camera" data-iso-width={ISO_WORLD_WIDTH} data-iso-height={ISO_WORLD_HEIGHT} data-world-x={cameraView.worldX} data-world-y={cameraView.worldY} data-zoom={cameraView.zoom}
        x={MINIMAP_OFFSET.x + cameraView.worldX * MINIMAP_SCALE} y={MINIMAP_OFFSET.y + cameraView.worldY * MINIMAP_SCALE}
        width={cameraView.width * ISO_WORLD_WIDTH * MINIMAP_SCALE} height={cameraView.height * ISO_WORLD_HEIGHT * MINIMAP_SCALE} />}
    </svg></button>}
  </Panel>;
}

function SquadHud({ view, adapter }: { view: GameplayViewModel; adapter: GameplayPresentationAdapter }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const selected = view.squads.filter((candidate) => view.selectedSquadIds.includes(candidate.id) && candidate.visible && candidate.healthPercent > 0);
  if (!selected.length) return null;
  const squad = view.squads.find((candidate) => candidate.id === view.selectedSquadId);
  if (!squad) return null;
  const status = squad.status === 'moving' ? t('moving') : squad.status === 'attacking' ? t('attacking') : squad.status === 'holding' ? t('holding') : squad.status === 'capturing' ? t('capturing') : t('idle');
  const stats = squad.stats ?? view.unitStats?.[squad.unitType];
  const unitNames = { explorer: t('unitExplorer'), interceptor: t('unitInterceptor'), frigate: t('unitFrigate'), bomber: t('unitBomber') };
  return <Panel className={`vi-squad ${collapsed ? 'is-collapsed' : ''}`}>
    <header><span>{selected.length > 1 ? t('selectedUnits', { count: selected.length }) : t('selectedSquad')}</span>
      <div className="vi-squad__tools"><button className="vi-retire" disabled={!!view.result}
        title={t('retireShipsHelp')} onClick={() => adapter.dispatch({ type: 'disband-selected' })}>{t('retireShips')}</button>
        <button onClick={() => setCollapsed(!collapsed)}>{collapsed ? t('expand') : t('collapse')}</button></div></header>
    {!collapsed && selected.length > 1 ? <div className="vi-squad__group">{(['explorer','interceptor','frigate','bomber'] as const).map(kind=>{
      const ships=selected.filter(s=>s.unitType===kind);if(!ships.length)return null;
      const hp=ships.reduce((n,s)=>n+(s.hp??s.healthPercent),0),maxHp=ships.reduce((n,s)=>n+(s.maxHp??100),0);
      return <div className="vi-squad__group-unit" key={kind}><strong>{ships.length} × {unitNames[kind]}</strong><span>{Math.round(hp)}/{maxHp} {t('totalHealth')}</span><progress aria-label={`${unitNames[kind]} HP`} value={hp} max={maxHp}/></div>;
    })}</div> : !collapsed && <div className="vi-squad__body">
      <div className="vi-squad__identity"><span aria-hidden="true">△</span><div><h2>{t('squad')} {squad.callSign}</h2><p>{status}</p></div></div>
      <div className="vi-squad__composition">
        <strong>{unitNames[squad.unitType]}</strong>
        <span>{t('shipNumbers', { hp: squad.hp?.toFixed(0) ?? '—', maxHp: formatStat(squad.maxHp ?? stats?.maxHp), damage: formatStat(stats?.damage), rhythm: stats?.attackTicks ? formatStat(stats.attackTicks / (view.tickRate ?? 10)) : '—', armor: formatStat(stats?.armor), range: formatStat(stats?.range), speed: formatStat(stats?.speed ?? squad.speedCellsPerSecond) })}</span>
        {squad.composition.interceptors > 0 && <span>{t('interceptors', { count: squad.composition.interceptors })}</span>}
        {squad.composition.frigates > 0 && <span>{t('frigates', { count: squad.composition.frigates })}</span>}
        {squad.composition.bombers && <span>{t('bombers', { count: squad.composition.bombers })}</span>}
      </div>
      <div className="vi-health"><div><span>{t('totalHealth')}</span><strong>{squad.hp?.toFixed(0) ?? '—'}/{squad.maxHp ?? '—'}</strong></div><progress value={squad.healthPercent} max="100" /></div>
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

const PRODUCTION_ORDER = [
  { kind: 'interceptor', key: '1' }, { kind: 'frigate', key: '2' }, { kind: 'bomber', key: '3' }, { kind: 'explorer', key: '4' },
] as const;

/** Base hangar: one ship at a time, paid in Metal. Hidden in the offline mock. */
function ProductionHud({ view, adapter,onBaseRange }: { view: GameplayViewModel; adapter: GameplayPresentationAdapter;onBaseRange?:(show:boolean)=>void }) {
  const { t,locale } = useI18n();
  const [tab, setTab] = useState<'hangar' | 'base'>('hangar');
  const [hovered,setHovered]=useState<keyof typeof UNIT_COSTS|null>(null);
  useEffect(()=>{onBaseRange?.(tab==='base');return ()=>onBaseRange?.(false);},[tab,onBaseRange]);
  if (view.connection === 'local' || view.canProduce === false) return null;
  const unitNames = { explorer: t('unitExplorer'), interceptor: t('unitInterceptor'), frigate: t('unitFrigate'), bomber: t('unitBomber') };
  const full = view.resources.fleet >= view.resources.fleetCap;
  return <Panel className="vi-production"><div className="vi-production__tabs" role="tablist" aria-label={t('baseTab')}>
    <button id="hangar-tab" role="tab" aria-selected={tab === 'hangar'} aria-controls="hangar-panel" onClick={() => setTab('hangar')}>{t('hangar')}</button>
    <button id="base-tab" role="tab" aria-selected={tab === 'base'} aria-controls="base-panel" disabled={!view.base} onClick={() => setTab('base')}>{t('baseTab')}</button>
  </div>
    {tab === 'base' && view.base ? <div role="tabpanel" id="base-panel" aria-labelledby="base-tab">
      <p className="vi-production__queue">{t('baseSummary', { damage: view.base.damage, fleet: view.resources.fleet, cap: view.resources.fleetCap })}</p>
      <p className="vi-base-range">{t('attackRange')}: <strong>{view.base.range} {t('cells')}</strong></p>
      <div className="vi-base-upgrades">{(['damage', 'capacity'] as const).map((upgrade) => {
        const cost = view.base!.upgradeCosts[upgrade];
        return <button key={upgrade} disabled={cost === null || view.resources.metal < cost || !!view.result || view.connection !== 'online'}
          title={t(upgrade === 'damage' ? 'baseDamageHelp' : 'baseCapacityHelp')}
          onClick={() => adapter.dispatch({ type: 'upgrade-base', upgrade })}>
          <strong>{t(upgrade === 'damage' ? 'baseDamage' : 'baseCapacity')}</strong>
          <span>{t('upgradeLevel', { level: view.base!.upgrades[upgrade] })}</span>
          <small>{cost === null ? t('upgradeMaxed') : `${cost} Metal`}</small>
        </button>;
      })}</div>
    </div> : <div role="tabpanel" id="hangar-panel" aria-labelledby="hangar-tab">
    {view.production
      ? <p className="vi-production__queue">{unitNames[view.production.kind]} · {view.production.remainingSeconds} s</p>
      : <p className="vi-production__queue">{full ? 'Flota completa' : 'Listo para construir'}</p>}
    <div className="vi-production__list">
      {PRODUCTION_ORDER.map(({ kind, key }) => {
        const cost = view.unitStats?.[kind]?.cost ?? UNIT_COSTS[kind];
        const disabled = !!view.production || !!view.productionForbidden?.includes(kind) || full || view.resources.metal < cost || !!view.result;
        const stats=view.unitStats?.[kind];
        const counters=Object.entries(SHIP_COUNTERS[kind]??{});
        const names=(strong:boolean)=>counters.filter(([,multiplier])=>strong?multiplier>1:multiplier<1).map(([target,multiplier])=>`${target==='guardian'?t('guardiansCore'):unitNames[target as keyof typeof unitNames]} ×${multiplier}`).join(', ');
        return <div className="vi-production__unit" key={kind} onMouseEnter={()=>setHovered(kind)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(kind)} onBlur={()=>setHovered(null)}>
          <button disabled={disabled} onClick={() => adapter.dispatch({ type: 'produce', kind })} aria-describedby={hovered===kind?`build-guide-${kind}`:undefined}>
            <span>{unitNames[kind]}</span><small>{cost} M · {t('attackRange')} {stats?.range??'—'}</small><kbd>{key}</kbd>
          </button>
          {hovered===kind&&stats&&<div className="vi-unit-guide" role="tooltip" id={`build-guide-${kind}`}>
            <header><strong>{unitNames[kind]}</strong><span>{cost} Metal · {stats.buildTicks/10} s</span></header>
            <dl><div><dt>{locale==='es'?'Vida':'Health'}</dt><dd>{formatStat(stats.maxHp)}</dd></div><div><dt>{locale==='es'?'Armadura':'Armor'}</dt><dd>{formatStat(stats.armor)}</dd></div><div><dt>{locale==='es'?'Daño / ritmo':'Damage / cadence'}</dt><dd>{formatStat(stats.damage)} / {stats.attackTicks?`${formatStat(stats.attackTicks/(view.tickRate ?? 10))} s`:'—'}</dd></div><div><dt>{t('attackRange')}</dt><dd>{formatStat(stats.range)} {t('cells')}</dd></div><div><dt>{locale==='es'?'Velocidad':'Speed'}</dt><dd>{formatStat(stats.speed)} c/s</dd></div><div><dt>{locale==='es'?'Visión':'Vision'}</dt><dd>{formatStat(stats.vision)} {t('cells')}</dd></div></dl>
            {names(true)&&<p className="vi-unit-guide__strong">{t('effectiveAgainst')}: {names(true)}</p>}
            {names(false)&&<p className="vi-unit-guide__weak">{t('weakAgainst')}: {names(false)}</p>}
            {!stats.canCapture&&<p>{locale==='es'?'Reconoce el mapa. No ataca ni captura.':'Scouts the map. Cannot attack or capture.'}</p>}
          </div>}
        </div>;
      })}
    </div></div>}
  </Panel>;
}

function NoticeHud({ view }: { view: GameplayViewModel }) {
  if (!view.notice) return null;
  return <div className={`vi-notice vi-notice--${view.connection}`} role="status">{view.notice}</div>;
}

export function Hud({ view, adapter, controls, cameraView, onPanMap, onResetCamera, onDevelopment, onLeave,onBaseRange, multiplayer }: { view: GameplayViewModel; adapter: GameplayPresentationAdapter; controls: VisualPreferences['controls']; cameraView: CameraView | null; onPanMap(x: number, y: number): void; onResetCamera(): void; onDevelopment(): void; onLeave(): void;onBaseRange?:(show:boolean)=>void; multiplayer?:boolean }) {
  const { t } = useI18n();
  return <div className="vi-hud" aria-label={t('hud')}>
    <ResourceHud view={view} />
    <SectorHud view={view} />
    <TopControls onResetCamera={onResetCamera} onDevelopment={onDevelopment} onLeave={onLeave} multiplayer={multiplayer} />
    <Minimap view={view} cameraView={cameraView} onPanMap={onPanMap} />
    <SquadHud view={view} adapter={adapter} />
    <ActionHud view={view} adapter={adapter} controls={controls} />
    <ProductionHud view={view} adapter={adapter} onBaseRange={onBaseRange}/>
    <NoticeHud view={view} />
  </div>;
}
