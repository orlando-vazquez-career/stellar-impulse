import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemById } from './catalog';
import { sharedPreviewPlayer, usePreviewAudio } from './preview-audio';

const runtime = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], ducks: [] as boolean[] }));

/** Just enough of React to mount the hook once, run its effects and unmount it, without a DOM. */
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: <T>(callback: T) => callback,
  useRef: <T>(current: T) => ({ current }),
  useSyncExternalStore: <T>(_subscribe: unknown, snapshot: () => T) => snapshot(),
  useEffect: (effect: () => void | (() => void)) => { runtime.effects.push(effect); },
}));
/** The menu music, as the preview sees it: only whether it is lowered. */
vi.mock('../music', () => ({ getMusicPlayer: () => ({ duck: (active: boolean) => { runtime.ducks.push(active); } }) }));

class FakeAudio {
  static made: FakeAudio[] = [];
  src = '';
  volume = 1;
  currentTime = 0;
  paused = true;
  constructor() { FakeAudio.made.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
}

const manifest = { voicePacks: { 'voz-analista': { es: { start: ['voice/analista/es/start-1.mp3'] } } } };

/** One panel using the hook: a detail or a hangar card. */
function mountPanel() {
  runtime.effects = [];
  const preview = usePreviewAudio('es');
  const cleanups = runtime.effects.splice(0).map((effect) => effect());
  return { preview, unmount: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

describe('preview audio in a panel', () => {
  const analyst = itemById('voz-analista')!;
  const track = itemById('musica-gravity-final-path')!;
  const player = sharedPreviewPlayer();

  beforeEach(() => {
    runtime.ducks = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(manifest))));
  });
  afterEach(() => {
    player.stop();
    vi.unstubAllGlobals();
  });

  it('stops what it was playing when it unmounts, and the music comes back up', async () => {
    const detail = mountPanel();
    await detail.preview.toggle(analyst);
    expect(player.current).toBe('voz-analista');
    expect(FakeAudio.made.at(-1)).toMatchObject({ src: '/audio/voice/analista/es/start-1.mp3', paused: false });
    expect(runtime.ducks).toEqual([true]);

    detail.unmount();
    expect(player.current).toBeNull();
    expect(FakeAudio.made.at(-1)!.paused).toBe(true);
    expect(runtime.ducks).toEqual([true, false]);
  });

  it('leaves a preview another panel started playing', async () => {
    const detail = mountPanel();
    const shop = mountPanel();
    await detail.preview.toggle(analyst);
    await shop.preview.toggle(track);

    detail.unmount();
    expect(player.current).toBe('musica-gravity-final-path');
    expect(runtime.ducks).toEqual([true]);

    shop.unmount();
    expect(player.current).toBeNull();
    expect(runtime.ducks).toEqual([true, false]);
  });

  it('toggles between listening and stopped', async () => {
    const detail = mountPanel();
    await detail.preview.toggle(track);
    expect(player.current).toBe('musica-gravity-final-path');
    await detail.preview.toggle(track);
    expect(player.current).toBeNull();
    expect(runtime.ducks).toEqual([true, false]);
    detail.unmount();
    expect(runtime.ducks).toEqual([true, false]);
  });
});
