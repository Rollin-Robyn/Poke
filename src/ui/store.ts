import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { reduce, type Action } from '../game/actions';
import { clearSave, loadGame, saveGame, SAVE_KEY } from '../game/save';
import { createInitialState } from '../game/reducer';
import type { GameState } from '../game/state';

interface Ctx {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  offline: { seconds: number; coins: number } | null;
  dismissOffline: () => void;
  /** Delete the stored save and start a brand new reserve. */
  hardReset: () => void;
  /** Load a state built from an imported save blob. */
  applySave: (state: GameState) => void;
}

const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const initial = useRef(loadGame());
  const [offline, setOffline] = useState(initial.current.offline);
  const [state, dispatch] = useReducer(reduce, initial.current.state);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Simulation runs at ~8 Hz rather than every frame: plenty smooth for the
  // coin counter, and it keeps big screens (the 649-cell dex) cheap to render.
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(30, (now - last) / 1000);
      last = now;
      if (dt >= 0.125) {
        // a backgrounded tab can jump forward a long way; simulate it in slices
        let remaining = dt;
        while (remaining > 2) {
          dispatch({ type: 'TICK', dt: 2 });
          remaining -= 2;
        }
        dispatch({ type: 'TICK', dt: remaining });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // autosave
  useEffect(() => {
    const id = setInterval(() => saveGame(stateRef.current), 15000);
    const onHide = () => saveGame(stateRef.current);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
      saveGame(stateRef.current);
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      dispatch,
      offline,
      dismissOffline: () => {
        setOffline(null);
        dispatch({ type: 'CLEAR_OFFLINE' });
      },
      hardReset: () => {
        // wipe storage *first* so a quick reload cannot bring the old save back
        clearSave();
        try {
          localStorage.removeItem(SAVE_KEY);
        } catch {
          /* ignore */
        }
        setOffline(null);
        dispatch({ type: 'HARD_RESET' });
        // and write the empty save straight away, so an immediate refresh is clean
        saveGame(createInitialState());
      },
      applySave: (next: GameState) => {
        clearSave();
        saveGame(next);
        setOffline(null);
        dispatch({ type: 'LOAD', state: next });
      },
    }),
    [state, offline],
  );

  return React.createElement(GameCtx.Provider, { value }, children);
}

export function useGame(): Ctx {
  const ctx = useContext(GameCtx);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}

export { saveGame, loadGame };
