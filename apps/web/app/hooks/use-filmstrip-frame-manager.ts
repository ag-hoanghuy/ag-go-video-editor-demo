'use client';

import { useEffect, useState } from 'react';
import { FilmstripFrameManager } from '../lib/filmstrip-frame-manager';

export function useFilmstripFrameManager(): FilmstripFrameManager {
  const [manager] = useState(() => new FilmstripFrameManager());

  useEffect(() => {
    return () => manager.dispose();
  }, [manager]);

  return manager;
}
