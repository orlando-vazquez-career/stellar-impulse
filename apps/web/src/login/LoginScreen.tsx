import { useEffect, useReducer, useRef } from 'react';
import { GlitchPanel } from './GlitchPanel';
import { LoginForm } from './LoginForm';
import { initialLoginUi, reduceLoginUi } from './login-state';
import { createLoginScene } from './scene';
import loginCss from './login.css?inline';

interface LoginScreenProps {
  alias: string;
  busy: boolean;
  notice: string;
  onCreateTraining: () => void;
  onJoinRoom: (code: string) => void;
  onConnectWallet: () => void;
  chainStatus: string;
  chainBusy: boolean;
  /** Si existe, muestra el acceso al atlas de mando debajo del panel. */
  onOpenAtlas?: () => void;
}

/**
 * Puerta de entrada del juego: la nave ardiendo en primer plano, asteroides
 * detrás, y el panel-holograma del login a la derecha. Ocupa el viewport
 * completo y desaparece cuando llega la vista del juego.
 */
export function LoginScreen(props: LoginScreenProps) {
  const { alias, busy, notice, onCreateTraining, onJoinRoom, onConnectWallet, chainStatus, chainBusy, onOpenAtlas } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ui, dispatch] = useReducer(reduceLoginUi, undefined, initialLoginUi);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const scene = createLoginScene(element);
    scene.start();

    const onResize = () => scene.resize();
    const onPointer = (event: PointerEvent) => {
      scene.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointer);
    return () => {
      scene.stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  // Cuando la conexión del padre termina (éxito o error), liberar los botones.
  useEffect(() => {
    if (!busy) dispatch({ type: 'settle' });
  }, [busy]);

  useEffect(() => {
    if (!chainBusy) dispatch({ type: 'settle' });
  }, [chainBusy]);

  return (
    <div className="li-viewport">
      <style>{loginCss}</style>
      <canvas ref={canvas} className="li-canvas" aria-hidden="true" />
      <div className="li-panel-wrap">
        <GlitchPanel>
          <LoginForm
            alias={alias}
            busy={busy}
            notice={notice}
            ui={ui}
            dispatch={dispatch}
            onCreateTraining={onCreateTraining}
            onJoinRoom={onJoinRoom}
            onConnectWallet={onConnectWallet}
            chainStatus={chainStatus}
            chainBusy={chainBusy}
            onOpenAtlas={onOpenAtlas}
          />
        </GlitchPanel>
      </div>
    </div>
  );
}
