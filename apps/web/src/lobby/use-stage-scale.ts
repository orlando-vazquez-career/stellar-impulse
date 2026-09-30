import { useEffect, useState } from 'react';

const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 900;

function fitScale(): number {
  return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
}

export function useStageScale(): number {
  const [scale, setScale] = useState(fitScale);
  useEffect(() => {
    const fit = () => setScale(fitScale());
    fit();
    window.addEventListener('resize', fit);
    const observer = new ResizeObserver(fit);
    observer.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', fit);
      observer.disconnect();
    };
  }, []);
  return scale;
}

export const STAGE = { width: STAGE_WIDTH, height: STAGE_HEIGHT };
