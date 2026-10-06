import { useEffect, useReducer, useRef, useState } from 'react';
import { GlitchPanel } from './GlitchPanel';
import { LoginForm } from './LoginForm';
import { initialLoginUi, reduceLoginUi } from './login-state';
import { createLoginScene } from './scene';
import { Brand } from '../visual/shared/Brand';
import { LanguageToggle } from '../visual/shared/LanguageToggle';
import loginCss from './login.css?inline';

export interface LoginScreenProps {
  alias: string;
  onAliasChange?: (alias: string) => void;
  onContinueGuest?: (alias: string) => void;
  onLogin?: (email: string, password: string) => Promise<void>;
  busy?: boolean;
  notice?: string;
  onCreateTraining?: (alias: string) => void;
  onJoinRoom?: (code: string, alias: string) => void;
  onConnectWallet?: () => void;
  chainStatus?: string;
  chainBusy?: boolean;
  /** Si existe, muestra el acceso al centro de mando debajo del panel. */
  onOpenAtlas?: () => void;
}

/**
 * Puerta de entrada principal del juego: la nave ardiendo en primer plano,
 * asteroides detrás, y el panel-holograma cyberpunk del login a la derecha.
 * Ocupa el viewport completo e inicia toda la experiencia de Impulso Stellar.
 */
export function LoginScreen(props: LoginScreenProps) {
  const {
    alias,
    onAliasChange,
    onContinueGuest,
    onLogin,
    busy = false,
    notice = '',
    onCreateTraining = () => {},
    onJoinRoom = () => {},
    onConnectWallet = () => {},
    chainStatus = 'Stellar Testnet',
    chainBusy = false,
    onOpenAtlas,
  } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ui, dispatch] = useReducer(reduceLoginUi, undefined, initialLoginUi);
  const [glitchTrigger, setGlitchTrigger] = useState(0);

  const triggerGlitch = () => setGlitchTrigger((count) => count + 1);

  // Si notice cambia a un mensaje de error (fallo de contraseña o red), hacer vibrar el panel
  const prevNoticeRef = useRef(notice);
  useEffect(() => {
    if (notice && notice !== prevNoticeRef.current) {
      triggerGlitch();
    }
    prevNoticeRef.current = notice;
  }, [notice]);

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
  }, [busy, notice]);

  useEffect(() => {
    if (!chainBusy) dispatch({ type: 'settle' });
  }, [chainBusy]);

  return (
    <div className="li-viewport">
      <style>{loginCss}</style>
      <canvas ref={canvas} className="li-canvas" aria-hidden="true" />
      <header className="li-topbar">
        <Brand />
        <LanguageToggle />
      </header>
      <div className="li-panel-wrap">
        <GlitchPanel trigger={glitchTrigger}>
          <LoginForm
            alias={alias}
            onAliasChange={onAliasChange}
            onContinueGuest={onContinueGuest}
            onLogin={onLogin}
            onLoginError={triggerGlitch}
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
