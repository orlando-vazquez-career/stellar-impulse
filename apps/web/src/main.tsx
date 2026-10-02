import { lazy, StrictMode, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client, type Room } from '@colyseus/sdk';
import type { PlayerView } from '@impulso/state';
import { drawArena, pickCell } from '@impulso/render-2d';
import { Status } from '@impulso/ui';
import { LobbyScreen } from './lobby/LobbyScreen';
import { readPilotAlias } from './lobby/pilot-alias';
import { LoginScreen } from './login/LoginScreen';
import './style.css';

const VisualPrototypeApp = lazy(() => import('./visual/VisualPrototypeApp'));

type LoginEntry = { type: 'create' } | { type: 'join'; code: string } | null;

interface TrainingAppProps {
  entry: LoginEntry;
  onEntryDone: () => void;
  onOpenAtlas: () => void;
}

function TrainingApp({ entry, onEntryDone, onOpenAtlas }: TrainingAppProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const room = useRef<Room | null>(null);
  const sequence = useRef(0);
  const connecting = useRef(false);
  const mounted = useRef(true);
  const [view, setView] = useState<PlayerView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Entra como invitado. Tu primera misión: tomar el Núcleo.');
  const [chainStatus, setChainStatus] = useState('Testnet · ');
  const [wallet, setWallet] = useState('');
  const [chainBusy, setChainBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; void room.current?.leave(); }; }, []);
  // Entrada solicitada desde la pantalla de login: conectar apenas se monta.
  useEffect(() => {
    if (!entry) return;
    onEntryDone();
    if (entry.type === 'join') void enter(true, entry.code);
    else void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (canvas.current) drawArena(canvas.current, view, selected); }, [view, selected]);
  const squad = view?.squads.find(unit => unit.id === selected);
  async function enter(join = false, code?: string) {
    if (connecting.current) return;
    connecting.current = true;
    setBusy(true); setNotice('Conectando con la sala…');
    try {
      await room.current?.leave();
      const client = new Client(import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:2567');
      const connected = join ? await client.joinById(code?.trim() ?? '') : await client.create('training');
      if (!mounted.current) { await connected.leave(); return; }
      room.current = connected; sequence.current = 0; setRoomId(connected.roomId);
      connected.onMessage('view', (next: PlayerView) => {
        if (room.current !== connected) return;
        setView(next);
        setSelected(current => current ?? next.squads.find(unit => unit.ownerId === next.playerId)?.id ?? null);
      });
      connected.onMessage('rejected', () => setNotice('Orden rechazada. Revisa el destino y el estado del escuadrón.'));
      connected.onLeave(() => {
        if (room.current !== connected) return;
        room.current = null; setRoomId(''); setView(null); setSelected(null);
        setNotice('Sesión cerrada. Crea una nueva sala para volver a entrenar.');
      });
      connected.onError(() => setNotice('La conexión tuvo un error. Sal y crea otra sala.'));
      setNotice('Selecciona con clic izquierdo. Clic derecho en suelo para mover o en un enemigo visible para atacar.');
    } catch { setNotice('No se pudo entrar. Verifica que el servidor esté activo y el código sea correcto.'); }
    finally { connecting.current = false; setBusy(false); }
  }
  function move(x: number, y: number) {
    if (!room.current || !selected || !view || view.winner) return;
    if (x < 0 || x >= view.width || y < 0 || y >= view.height) return;
    room.current.send('command', { seq: ++sequence.current, type: 'move', squadId: selected, x, y });
    setNotice(`Orden enviada: moverse a ${x}, ${y}.`);
  }
  function attack(targetId: string) {
    if (!room.current || !selected || !view || view.winner) return;
    room.current.send('command', { seq: ++sequence.current, type: 'attack', squadId: selected, targetId });
    setNotice(`Orden enviada: atacar ${targetId}.`);
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
  const elapsed = view ? Math.floor(view.tick / 10) : 0;
  const remaining = view ? Math.max(0, (view.rules.coreOpenTick - view.tick) / 10) : 20;
  return <div className="shell">
    <header className="masthead"><a className="brand" href="/" aria-label="Impulso Stellar, inicio"><span className="brand-mark" aria-hidden="true">⟐</span><span>IMPULSO<small>STELLAR</small></span></a><div className="header-note">La estrategia se gana.<br /><strong>El poder no se compra.</strong></div><Status tone={roomId ? 'good' : 'neutral'}>{roomId ? 'Sala activa' : 'Prototipo inicial'}</Status></header>
    <main>
      <section className="intro"><div><p className="eyebrow">Simulador de entrenamiento</p><h1>Tu flota. Tu decisión.</h1><p>Explora el sector, vence a sus guardianes y toma el Núcleo.</p></div><div className="sector-badge"><span>00</span><div>Sector de práctica<small>Un escenario · sin fondos reales</small></div></div></section>
      <div className="command-bar"><span className="coordinate">Sector 00 / Órbita de preparación</span><div className="resources"><span>Metal <b>{view?.players[view.playerId].metal ?? 0}</b></span><span>Tiempo <b>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</b></span></div></div>
      <div className="battle-layout">
        <section className="arena" aria-label="Mapa del sector">
          <canvas ref={canvas} aria-label="Mapa isométrico. Clic izquierdo para seleccionar; clic derecho para mover o atacar." tabIndex={view ? 0 : -1}
            onClick={event => { const cell = pickCell(event.currentTarget, event.clientX, event.clientY, view?.width, view?.height); if (!cell || !view) return; const unit = view.squads.find(u => u.ownerId === view.playerId && u.x === cell.x && u.y === cell.y); if (unit) setSelected(unit.id); }}
            onContextMenu={event => { event.preventDefault(); const cell = pickCell(event.currentTarget, event.clientX, event.clientY, view?.width, view?.height); if (!cell || !view) return; const enemy = view.squads.find(u => u.ownerId !== view.playerId && u.hp > 0 && u.x === cell.x && u.y === cell.y) ?? view.guardians.find(u => u.hp > 0 && u.x === cell.x && u.y === cell.y); if (enemy) attack(enemy.id); else move(cell.x, cell.y); }}
            onKeyDown={event => { if (!squad) return; const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }; const d = dirs[event.key]; if (d) { event.preventDefault(); move(squad.x + d[0], squad.y + d[1]); } }} />
          {view?.winner && <div className="result-overlay" role="status"><h2>{view.winner === view.playerId ? 'Núcleo asegurado' : 'El rival tomó el Núcleo'}</h2><p>Entrenamiento completado. La campaña de tres sectores está en desarrollo.</p><button className="primary" disabled={busy} onClick={() => void enter()}>Nuevo entrenamiento</button></div>}
          <div className="map-legend"><span><i className="ally" />Tu flota</span><span><i className="enemy" />Rival / guardianes</span><span><i className="objective" />Objetivo</span></div>
        </section>
        <aside className="tactical-panel"><div className="panel-title"><h2>Plan de vuelo</h2><span>Entrenamiento</span></div>
          <ol className="objectives"><li><span>01</span><div><strong>Explora y toma Metal</strong><p>Acércate al nodo y derrota al guardián.</p></div></li><li><span>02</span><div><strong>Prepara la captura</strong><p>{view?.core.open ? 'El escudo está abierto. Elimina al guardián central.' : `El escudo se abre ${view ? 'en ' : 'a los '}${Math.ceil(remaining)} segundos.`}</p></div></li><li><span>03</span><div><strong>Defiende el Núcleo</strong><p>Mantén presencia exclusiva durante 8 segundos.</p></div></li></ol>
          <div className="squad-panel"><h3>Escuadrón seleccionado</h3><strong>{squad ? { explorer: 'Explorador', interceptor: 'Interceptor', frigate: 'Fragata', bomber: 'Bombardero' }[squad.kind] : 'Esperando despliegue'}</strong><p>{squad ? `Integridad ${squad.hp}/${squad.maxHp} · Posición ${squad.x}, ${squad.y}` : 'Una flota pequeña. Una decisión a la vez.'}</p><div className="order-buttons"><button disabled={!squad || squad.hp <= 0 || !!view?.winner} onClick={() => move(4, 4)}>Ir al nodo</button><button disabled={!squad || squad.hp <= 0 || !!view?.winner} onClick={() => { if (view) move(view.core.x, view.core.y); }}>Ir al Núcleo</button></div></div>
          {view && <div className="capture"><label htmlFor="capture">Control del Núcleo</label><progress id="capture" value={view.core.progress[view.playerId]} max={view.rules.coreCaptureTicks} /></div>}
          <p className="notice" role="status">{notice}</p>
        </aside>
      </div>
      <section className="bottom-grid"><div className="session"><h2>Vuela acompañado</h2>{roomId ? <><p>Código de sala: <strong data-testid="room-code">{roomId}</strong></p><button onClick={() => void room.current?.leave()}>Salir de la sala</button></> : <p className="fineprint">Crea una sala o únete con un código desde la consola de acceso.</p>}<p className="fineprint">Entrenamiento efímero. Bot, reconexión y campaña completa están en desarrollo.</p></div>
        <div className="network"><h2>Conexión Stellar</h2><p className="chain-message" role="status">{chainStatus}</p>{wallet && <p className="wallet-address" title={wallet}>{wallet.slice(0, 8)}…{wallet.slice(-8)} <button onClick={() => { setWallet(''); setChainStatus('Wallet desconectada de esta vista'); }}>Desconectar</button></p>}<div className="order-buttons"><button disabled={chainBusy} onClick={() => void queryChain()}>Comprobar red</button><button disabled={chainBusy} onClick={() => void queryChain(true)}>Conectar Freighter</button></div><p className="fineprint">Opcional para jugar. Conectar comparte tu dirección; no firma compras ni inicia sesión.</p></div></section>
    </main><footer><span>Impulso Stellar · Base inicial v0.1</span><span>Cosméticos sin ventajas. Estrategia sin atajos.</span></footer>
    {!view && <LoginScreen
      alias={readPilotAlias() || 'INVITADO'}
      busy={busy}
      notice={notice}
      onCreateTraining={() => void enter()}
      onJoinRoom={(code) => void enter(true, code)}
      onConnectWallet={() => void queryChain(true)}
      chainStatus={chainStatus}
      chainBusy={chainBusy}
      onOpenAtlas={onOpenAtlas}
    />}
  </div>;
}
const visualRoute = window.location.pathname === '/visual' || window.location.pathname.startsWith('/visual/');

function App() {
  const [screen, setScreen] = useState<'login' | 'lobby' | 'training'>('login');
  const [entry, setEntry] = useState<LoginEntry>(null);
  const [gateChainStatus, setGateChainStatus] = useState('Testnet - Stellar');
  const [gateChainBusy, setGateChainBusy] = useState(false);

  async function gateWallet() {
    setGateChainBusy(true);
    try {
      const chain = await import('@impulso/chain');
      const result = await chain.connectFreighterTestnet();
      setGateChainStatus(`Wallet conectada · ${result.address.slice(0, 8)}…${result.address.slice(-8)}`);
    } catch (error) {
      setGateChainStatus(error instanceof Error ? error.message : 'No se pudo consultar la red.');
    } finally { setGateChainBusy(false); }
  }

  if (visualRoute) {
    return <Suspense fallback={<div className="visual-loading">Preparando centro de mando…</div>}><VisualPrototypeApp /></Suspense>;
  }
  if (screen === 'training') return <TrainingApp entry={entry} onEntryDone={() => setEntry(null)} onOpenAtlas={() => setScreen('lobby')} />;
  if (screen === 'lobby') return <LobbyScreen onOpenArena={() => setScreen('training')} />;
  return <LoginScreen
    alias={readPilotAlias() || 'INVITADO'}
    busy={false}
    notice=""
    onCreateTraining={() => { setEntry({ type: 'create' }); setScreen('training'); }}
    onJoinRoom={(code) => { setEntry({ type: 'join', code }); setScreen('training'); }}
    onConnectWallet={() => void gateWallet()}
    chainStatus={gateChainStatus}
    chainBusy={gateChainBusy}
    onOpenAtlas={() => setScreen('lobby')}
  />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
