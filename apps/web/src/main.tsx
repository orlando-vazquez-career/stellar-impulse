import { lazy, StrictMode, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client, type Room } from '@colyseus/sdk';
import type { PlayerView } from '@impulso/state';
import { drawArena, pickCell } from '@impulso/render-2d';
import { Status } from '@impulso/ui';
import { LobbyScreen } from './lobby/LobbyScreen';
import { CommandCard, type CardStance } from './mecanicas/CommandCard';
import { controlDigit, emptyGroups, recallGroup, sameKindOnScreen, storeGroup } from './mecanicas/selection';
import './style.css';

const VisualPrototypeApp = lazy(() => import('./visual/VisualPrototypeApp'));

function TrainingApp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const room = useRef<Room | null>(null);
  const sequence = useRef(0);
  const connecting = useRef(false);
  const mounted = useRef(true);
  const [view, setView] = useState<PlayerView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [groups, setGroups] = useState(emptyGroups);
  const [roomId, setRoomId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Entra como invitado. Tu primera misión: tomar el Núcleo.');
  const [chainStatus, setChainStatus] = useState('Testnet · sin consultar');
  const [wallet, setWallet] = useState('');
  const [chainBusy, setChainBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; void room.current?.leave(); }; }, []);
  useEffect(() => { if (canvas.current) drawArena(canvas.current, view, selected); }, [view, selected]);
  const squad = selected.length === 1 ? view?.squads.find(unit => unit.id === selected[0]) : undefined;
  const cardStance = sharedStance(view, selected);
  async function enter(join = false) {
    if (connecting.current) return;
    connecting.current = true;
    setBusy(true); setNotice('Conectando con la sala…');
    try {
      await room.current?.leave();
      const client = new Client(import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567');
      const connected = join ? await client.joinById(joinCode.trim()) : await client.create('training');
      if (!mounted.current) { await connected.leave(); return; }
      room.current = connected; sequence.current = 0; setRoomId(connected.roomId);
      connected.onMessage('view', (next: PlayerView) => {
        if (room.current !== connected) return;
        setView(next);
        setSelected(current => current.length > 0 ? current : ownedIds(next).slice(0, 1));
      });
      connected.onMessage('rejected', () => setNotice('Orden rechazada. Revisa el destino y el estado del escuadrón.'));
      connected.onLeave(() => {
        if (room.current !== connected) return;
        room.current = null; setRoomId(''); setView(null); setSelected([]);
        setNotice('Sesión cerrada. Crea una nueva sala para volver a entrenar.');
      });
      connected.onError(() => setNotice('La conexión tuvo un error. Sal y crea otra sala.'));
      setNotice('Clic izquierdo selecciona. Mayús + clic encola la ruta y se detiene al final. El recuadro elige guardia, patrulla o ataque.');
    } catch { setNotice('No se pudo entrar. Verifica que el servidor esté activo y el código sea correcto.'); }
    finally { connecting.current = false; setBusy(false); }
  }
  function sendEach(build: (squadId: string, seq: number) => object) {
    if (!room.current || selected.length === 0 || !view || view.winner) return;
    for (const squadId of selected) room.current.send('command', build(squadId, ++sequence.current));
  }
  function move(x: number, y: number) {
    if (!view || x < 0 || x >= view.width || y < 0 || y >= view.height) return;
    sendEach((squadId, seq) => ({ seq, type: 'move', squadId, x, y }));
    setNotice(`Orden enviada: moverse a ${x}, ${y}.`);
  }
  function enqueue(x: number, y: number) {
    if (!view || x < 0 || x >= view.width || y < 0 || y >= view.height) return;
    sendEach((squadId, seq) => ({ seq, type: 'enqueue', squadId, x, y }));
    setNotice(`Ruta ampliada hacia ${x}, ${y}. Se detiene en el último punto.`);
  }
  function attack(targetId: string) {
    sendEach((squadId, seq) => ({ seq, type: 'attack', squadId, targetId }));
    setNotice(`Orden enviada: atacar ${targetId}.`);
  }
  function chooseStance(stance: CardStance) {
    sendEach((squadId, seq) => ({ seq, type: 'stance', squadId, stance }));
    const label = stance === 'guard' ? 'guardia' : stance === 'patrol' ? 'patrulla' : 'ataque';
    setNotice(`Orden enviada: ${label}.`);
  }
  async function queryChain(connect = false) {
    setChainBusy(true);
    try {
      const chain = await import('@impulso/chain');
      if (connect) {
        const result = await chain.connectFreighterTestnet();
        setWallet(result.address); setChainStatus('Wallet conectada a testnet');
      } else {
        const health = await chain.probeTestnet();
        setChainStatus(`Testnet activa · ledger ${health.latestLedger}`);
      }
    } catch (error) {
      setChainStatus(error instanceof Error ? error.message : 'No se pudo consultar la red.');
    } finally { setChainBusy(false); }
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const digit = controlDigit(event.key);
      if (digit === null) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setGroups(current => storeGroup(current, digit, selected));
        setNotice(`Grupo ${digit} guardado.`);
        return;
      }
      const recalled = recallGroup(groups, digit, Date.now());
      setGroups(recalled.groups);
      const ids = recalled.ids.filter(id => view?.squads.some(unit => unit.id === id));
      setSelected([...ids]);
      setNotice(recalled.center ? `Grupo ${digit} seleccionado. El mapa completo ya está a la vista.` : `Grupo ${digit} seleccionado.`);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groups, selected, view]);
  const elapsed = view ? Math.floor(view.tick / 10) : 0;
  const remaining = view ? Math.max(0, (view.rules.coreOpenTick - view.tick) / 10) : 20;
  return <div className="shell">
    <header className="masthead"><a className="brand" href="/" aria-label="Impulso Stellar, inicio"><span className="brand-mark" aria-hidden="true">⟐</span><span>IMPULSO<small>STELLAR</small></span></a><div className="header-note">La estrategia se gana.<br/><strong>El poder no se compra.</strong></div><Status tone={roomId ? 'good' : 'neutral'}>{roomId ? 'Sala activa' : 'Prototipo inicial'}</Status></header>
    <main>
      <section className="intro"><div><p className="eyebrow">Simulador de entrenamiento</p><h1>Tu flota. Tu decisión.</h1><p>Explora el sector, vence a sus guardianes y toma el Núcleo.</p></div><div className="sector-badge"><span>00</span><div>Sector de práctica<small>Un escenario · sin fondos reales</small></div></div></section>
      <div className="command-bar"><span className="coordinate">Sector 00 / Órbita de preparación</span><div className="resources"><span>Metal <b>{view?.players[view.playerId].metal ?? 0}</b></span><span>Tiempo <b>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</b></span></div></div>
      <div className="battle-layout">
        <section className="arena" aria-label="Mapa del sector">
          <canvas ref={canvas} aria-label="Mapa isométrico. Clic izquierdo para seleccionar; Mayús + clic para encolar; clic derecho para mover o atacar." tabIndex={view ? 0 : -1}
            onClick={event => { const cell = pickCell(event.currentTarget, event.clientX, event.clientY, view?.width, view?.height); if (!cell || !view) return; const unit = view.squads.find(u => u.ownerId === view.playerId && u.x === cell.x && u.y === cell.y); if (unit && event.shiftKey) { setSelected(current => current.includes(unit.id) ? current : [...current, unit.id]); return; } if (unit) { setSelected([unit.id]); return; } if (event.shiftKey) enqueue(cell.x, cell.y); }}
            onDoubleClick={event => { const cell = pickCell(event.currentTarget, event.clientX, event.clientY, view?.width, view?.height); if (!cell || !view) return; const unit = view.squads.find(u => u.ownerId === view.playerId && u.x === cell.x && u.y === cell.y); if (!unit) return; const visible = new Set(view.visibleCells.map(point => `${point.x},${point.y}`)); setSelected(sameKindOnScreen(view.squads, { ownerId: view.playerId, kind: unit.kind, visible })); }}
            onContextMenu={event => { event.preventDefault(); const cell = pickCell(event.currentTarget, event.clientX, event.clientY, view?.width, view?.height); if (!cell || !view) return; if (event.shiftKey) { enqueue(cell.x, cell.y); return; } const enemy = view.squads.find(u => u.ownerId !== view.playerId && u.hp > 0 && u.x === cell.x && u.y === cell.y) ?? view.guardians.find(u => u.hp > 0 && u.x === cell.x && u.y === cell.y); if (enemy) attack(enemy.id); else move(cell.x, cell.y); }}
            onKeyDown={event => { if (!squad) return; const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }; const d = dirs[event.key]; if (d) { event.preventDefault(); move(squad.x + d[0], squad.y + d[1]); } }} />
          {view && <CommandCard disabled={selected.length === 0 || !!view.winner} stance={cardStance} onStance={chooseStance} />}
          {!view && <div className="launch-overlay"><span className="launch-symbol" aria-hidden="true">⟐</span><h2>El centro espera.</h2><p>Entra sin wallet y dirige tu primer escuadrón.</p><button className="primary" disabled={busy} onClick={() => void enter()}>{busy ? 'Conectando…' : 'Crear entrenamiento'}</button><span>Servidor local · hasta dos asientos</span></div>}
          {view?.winner && <div className="result-overlay" role="status"><h2>{view.winner === view.playerId ? 'Núcleo asegurado' : 'El rival tomó el Núcleo'}</h2><p>Entrenamiento completado. La campaña de tres sectores está en desarrollo.</p><button className="primary" disabled={busy} onClick={() => void enter()}>Nuevo entrenamiento</button></div>}
          <div className="map-legend"><span><i className="ally" />Tu flota</span><span><i className="enemy" />Rival / guardianes</span><span><i className="objective" />Objetivo</span></div>
        </section>
        <aside className="tactical-panel"><div className="panel-title"><h2>Plan de vuelo</h2><span>Entrenamiento</span></div>
          <ol className="objectives"><li><span>01</span><div><strong>Explora y toma Metal</strong><p>Acércate al nodo y derrota al guardián.</p></div></li><li><span>02</span><div><strong>Prepara la captura</strong><p>{view?.core.open ? 'El escudo está abierto. Elimina al guardián central.' : `El escudo se abre ${view ? 'en ' : 'a los '}${Math.ceil(remaining)} segundos.`}</p></div></li><li><span>03</span><div><strong>Defiende el Núcleo</strong><p>Mantén presencia exclusiva durante 8 segundos.</p></div></li></ol>
          <div className="squad-panel"><h3>Escuadrón seleccionado</h3><strong>{squad ? { explorer: 'Explorador', interceptor: 'Interceptor', frigate: 'Fragata', bomber: 'Bombardero' }[squad.kind] : selected.length > 1 ? `${selected.length} escuadrones` : 'Esperando despliegue'}</strong><p>{squad ? `Integridad ${squad.hp}/${squad.maxHp} · Posición ${squad.x}, ${squad.y}` : 'Una flota pequeña. Una decisión a la vez.'}</p><div className="order-buttons"><button disabled={selected.length === 0 || !!view?.winner} onClick={() => move(4, 4)}>Ir al nodo</button><button disabled={selected.length === 0 || !!view?.winner} onClick={() => { if (view) move(view.core.x, view.core.y); }}>Ir al Núcleo</button></div></div>
          {view && <div className="capture"><label htmlFor="capture">Control del Núcleo</label><progress id="capture" value={view.core.progress[view.playerId]} max={view.rules.coreCaptureTicks}/></div>}
          <p className="notice" role="status">{notice}</p>
        </aside>
      </div>
      <section className="bottom-grid"><div className="session"><h2>Vuela acompañado</h2>{roomId ? <><p>Código de sala: <strong data-testid="room-code">{roomId}</strong></p><button onClick={() => void room.current?.leave()}>Salir de la sala</button></> : <form onSubmit={event => { event.preventDefault(); void enter(true); }}><label htmlFor="room-code">Código de sala</label><div className="join-row"><input id="room-code" value={joinCode} onChange={event => setJoinCode(event.target.value)} maxLength={64} placeholder="Ingresa un código" required/><button disabled={busy}>Entrar</button></div></form>}<p className="fineprint">Entrenamiento efímero. Si el segundo asiento está vacío, un rival automático patrulla su base. Reconexión y campaña completa están en desarrollo.</p></div>
      <div className="network"><h2>Conexión Stellar</h2><p className="chain-message" role="status">{chainStatus}</p>{wallet && <p className="wallet-address" title={wallet}>{wallet.slice(0, 8)}…{wallet.slice(-8)} <button onClick={() => { setWallet(''); setChainStatus('Wallet desconectada de esta vista'); }}>Desconectar</button></p>}<div className="order-buttons"><button disabled={chainBusy} onClick={() => void queryChain()}>Comprobar red</button><button disabled={chainBusy} onClick={() => void queryChain(true)}>Conectar Freighter</button></div><p className="fineprint">Opcional para jugar. Conectar comparte tu dirección; no firma compras ni inicia sesión.</p></div></section>
    </main><footer><span>Impulso Stellar · Base inicial v0.1</span><span>Cosméticos sin ventajas. Estrategia sin atajos.</span></footer>
  </div>;
}
function ownedIds(view: PlayerView): string[] {
  return view.squads.filter(unit => unit.ownerId === view.playerId).map(unit => unit.id);
}
function sharedStance(view: PlayerView | null, ids: readonly string[]): CardStance | null {
  if (!view || ids.length === 0) return null;
  const stances = ids.map(id => view.squads.find(unit => unit.id === id)?.stance);
  const first = stances[0];
  if (first !== 'guard' && first !== 'patrol' && first !== 'attack') return null;
  return stances.every(stance => stance === first) ? first : null;
}
const visualRoute = window.location.pathname === '/visual' || window.location.pathname.startsWith('/visual/');

function App() {
  const [training, setTraining] = useState(false);
  if (visualRoute) {
    return <Suspense fallback={<div className="visual-loading">Preparando centro de mando…</div>}><VisualPrototypeApp /></Suspense>;
  }
  if (training) return <TrainingApp />;
  return <LobbyScreen onOpenArena={() => setTraining(true)} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
