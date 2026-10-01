import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { Bar, ItemSprite, Panel, RarityTag, Sprite, TypeTag } from '../components';
import {
  TEST_ROUTE, TILE_PX, advanceWalker, createWalker, type Dir, type Walker,
} from '../../game/explore';
import { VIEW_H, VIEW_W, drawFrame, loadAssets, type Assets } from '../exploreDraw';
import type { Action } from '../../game/actions';
import { MAX_TEAM } from '../../game/state';
import {
  BALLS, BIOME_BY_ID, biomeLevelRange, entry, fmt, movesForMon, statsAt, typeMultiplier,
} from './shared';

const ZOOMS = [2, 3, 4];

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

interface Live {
  dispatch: (a: Action) => void;
  zoom: number;
  follower: { species: string; shiny: boolean; form: string | null | undefined } | null;
  canEncounter: boolean;
  fighting: boolean;
}

// ---------------------------------------------------------------- the world --
// The walker lives outside React so leaving the tab and coming back finds the
// player where they stopped. It is not saved: a reload starts at the road.
let walker: Walker | null = null;
function getWalker(): Walker {
  if (!walker) walker = createWalker(TEST_ROUTE);
  return walker;
}

// -------------------------------------------------------------------- screen --
export function Explore({ go }: { go?: (tab: string) => void }) {
  const { state, dispatch } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const assetsRef = useRef<Assets | null>(null);
  const input = useRef<{ held: Dir[]; run: boolean }>({ held: [], run: false });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(3);
  const [runToggle, setRunToggle] = useState(false);

  const b = state.battle;
  const zone = TEST_ROUTE;
  const team = b.team.map((u) => state.mons.find((m) => m.uid === u)).filter((m): m is NonNullable<typeof m> => !!m);
  const leader = team[0];
  const lead =
    (b.activeUid ? b.players.find((p) => p.uid === b.activeUid && p.hp > 0) : null) ??
    b.players.find((p) => p.hp > 0) ?? null;
  const fighting = !!b.enemy && !!b.enemySpec && b.via === 'explore';
  const biome = BIOME_BY_ID[zone.biomeId];
  const [lo, hi] = biomeLevelRange(biome, b.biomesPassed);

  // everything the animation loop needs from this render, without restarting it
  const live = useRef<Live>({ dispatch, zoom, follower: null, canEncounter: false, fighting: false });
  live.current = {
    dispatch,
    zoom,
    follower: leader ? { species: leader.species, shiny: leader.shiny, form: leader.form } : null,
    canEncounter: !!lead && !fighting,
    fighting,
  };
  const runRef = useRef(runToggle);
  runRef.current = runToggle;

  useEffect(() => {
    let alive = true;
    loadAssets()
      .then((a) => {
        if (!alive) return;
        assetsRef.current = a;
        setReady(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // keyboard: arrows or WASD to walk, Shift to run
  useEffect(() => {
    const held = input.current.held;
    const press = (dir: Dir) => {
      const i = held.indexOf(dir);
      if (i >= 0) held.splice(i, 1);
      held.push(dir);
    };
    const release = (dir: Dir) => {
      const i = held.indexOf(dir);
      if (i >= 0) held.splice(i, 1);
    };
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    };
    const onDown = (e: KeyboardEvent) => {
      input.current.run = e.shiftKey;
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      press(dir);
    };
    const onUp = (e: KeyboardEvent) => {
      input.current.run = e.shiftKey;
      const dir = KEY_DIR[e.key];
      if (dir) release(dir);
    };
    const clear = () => {
      held.length = 0;
      input.current.run = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, []);

  // the loop: step the walker, then draw
  useEffect(() => {
    if (!ready) return undefined;
    const canvas = canvasRef.current;
    const assets = assetsRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !assets || !ctx) return undefined;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const w = getWalker();
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const cfg = live.current;
      const size = [VIEW_W * TILE_PX * cfg.zoom, VIEW_H * TILE_PX * cfg.zoom];
      if (canvas.width !== size[0] || canvas.height !== size[1]) {
        canvas.width = size[0];
        canvas.height = size[1];
      }
      const modalOpen = !!document.querySelector('.modal-backdrop');
      const held = input.current.held;
      const res = advanceWalker(TEST_ROUTE, w, dt, {
        dir: held.length ? held[held.length - 1] : null,
        run: input.current.run || runRef.current,
        frozen: cfg.fighting || modalOpen,
        canEncounter: cfg.canEncounter,
      });
      if (res.encounter) cfg.dispatch({ type: 'EXPLORE_ENCOUNTER', biomeId: TEST_ROUTE.biomeId });
      drawFrame(ctx, assets, w, { zoom: cfg.zoom, follower: cfg.follower, now });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  const w = getWalker();
  const hold = (dir: Dir) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      const held = input.current.held;
      const i = held.indexOf(dir);
      if (i >= 0) held.splice(i, 1);
      held.push(dir);
    },
    onPointerUp: () => {
      const held = input.current.held;
      const i = held.indexOf(dir);
      if (i >= 0) held.splice(i, 1);
    },
    onPointerLeave: () => {
      const held = input.current.held;
      const i = held.indexOf(dir);
      if (i >= 0) held.splice(i, 1);
    },
    onPointerCancel: () => {
      const held = input.current.held;
      const i = held.indexOf(dir);
      if (i >= 0) held.splice(i, 1);
    },
  });

  const strongestSix = () =>
    [...state.mons].sort((a, c) => c.level - a.level).slice(0, MAX_TEAM).map((m) => m.uid);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="tag" style={{ background: 'rgba(111,191,115,.2)', borderColor: 'rgba(111,191,115,.55)' }}>
            🧭 {zone.name}
          </span>
          <span className="small muted">
            Tall grass uses the {biome.name} table · Lv.{lo}–{hi} wild · {fmt(w.steps)} steps · {fmt(w.encounters)} encounters
          </span>
        </div>
        <span className="tag" title="This screen is an early prototype">test</span>
      </div>

      <Panel>
        <div className="explore-wrap">
          {failed ? (
            <div className="center muted" style={{ padding: '60px 0' }}>
              The tileset could not be loaded, so there is no map to walk on.
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className={`explore-canvas ${fighting ? 'dim' : ''}`}
              width={VIEW_W * TILE_PX * zoom}
              height={VIEW_H * TILE_PX * zoom}
              aria-label="Exploration map"
            />
          )}
          {!ready && !failed && <div className="explore-loading muted small">Loading the map…</div>}
        </div>

        <div className="row between" style={{ marginTop: 12, flexWrap: 'wrap', gap: 12 }}>
          <div className="small muted" style={{ maxWidth: 520 }}>
            <b>Arrow keys</b> or <b>WASD</b> to walk, hold <b>Shift</b> to run. Walking through the tall grass can turn up a wild monster;
            {leader
              ? <> <b>{entry(leader.species).name}</b>, the first on your team, follows you.</>
              : ' pick a team and its first member follows you.'}
          </div>
          <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="dpad" aria-label="Walk buttons">
              <button className="btn sm up" {...hold('up')} aria-label="Up">▲</button>
              <button className="btn sm left" {...hold('left')} aria-label="Left">◀</button>
              <button className="btn sm right" {...hold('right')} aria-label="Right">▶</button>
              <button className="btn sm down" {...hold('down')} aria-label="Down">▼</button>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={runToggle} onChange={(e) => setRunToggle(e.target.checked)} /> Run
              </label>
              <label className="row small" style={{ gap: 6 }}>
                Zoom
                <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                  {ZOOMS.map((z) => <option key={z} value={z}>{z}×</option>)}
                </select>
              </label>
              <button
                className="btn xs ghost"
                onClick={() => {
                  walker = createWalker(TEST_ROUTE);
                }}
                title="Walk back to the start of the road"
              >
                Back to start
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {fighting && b.enemySpec && b.enemy && (
        <EncounterPanel />
      )}

      <div className="grid g2">
        <Panel
          title={`Your team (${team.length}/${MAX_TEAM})`}
          right={
            <button className="btn xs" onClick={() => dispatch({ type: 'HEAL_TEAM' })}>Heal</button>
          }
        >
          {team.length === 0 ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="muted small">
                No team yet. Wild monsters only turn up for a team that can fight, and its first member walks behind you.
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn sm good"
                  disabled={state.mons.length === 0}
                  title="Team members leave their habitats while they train, so they stop earning coins"
                  onClick={() => dispatch({ type: 'SET_TEAM', uids: strongestSix() })}
                >
                  Use my strongest six
                </button>
                {go && <button className="btn sm" onClick={() => go('battle')}>Choose in Battle</button>}
              </div>
              <div className="tiny dim">Team members leave their habitats while they train, so they stop earning coins.</div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {team.map((m, i) => {
                const p = b.players.find((x) => x.uid === m.uid);
                const max = statsAt(m.species, m.level, m.nature, m.iv).hp;
                const hp = p?.hp ?? max;
                return (
                  <div key={m.uid} className="row between" style={{ opacity: hp <= 0 ? 0.45 : 1 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Sprite species={m.species} form={m.form} shiny={m.shiny} size="sm" />
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {entry(m.species).name}{' '}
                          {i === 0 && <span className="tiny" style={{ color: 'var(--good)' }}>● follows you</span>}
                          {hp <= 0 && <span className="tiny dim"> · fainted</span>}
                        </div>
                        <div className="tiny dim">Lv.{m.level} · {entry(m.species).types.join('/')}</div>
                      </div>
                    </div>
                    <div style={{ width: 110 }}>
                      <Bar value={Math.max(0, hp)} max={max} className={`hp ${hp / max < 0.25 ? 'low' : ''}`} />
                      <div className="tiny mono dim" style={{ textAlign: 'right' }}>{Math.max(0, Math.round(hp))}/{max}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Route notes">
          <div className="stack small" style={{ gap: 6 }}>
            <div className="muted">
              This is a test map built from the FireRed/LeafGreen outdoor tileset. The road, the pond and the trees are
              solid or open ground; the dark green plants are tall grass.
            </div>
            <div className="muted">
              A wild monster from the grass is the same fight as on the Battle screen: the same moves, balls, rewards and
              level-ups. Fleeing is only possible here, not on a route.
            </div>
            <div className="tiny dim">
              Tall grass tiles: {fmt(TEST_ROUTE.grass.filter(Boolean).length)} · evolved forms and legendaries follow the
              same spawn rules as the Battle routes.
            </div>
          </div>
          <div className="log" style={{ marginTop: 10, maxHeight: 130 }}>
            {b.log.length === 0 ? (
              <div className="muted small">Nothing has happened yet.</div>
            ) : (
              b.log.slice(0, 6).map((l) => <div key={l.id} className={`t-${l.tone}`}>{l.text}</div>)
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- the fight HUD --
/** The wild monster from the grass, fought with the same moves and balls as a route. */
function EncounterPanel() {
  const { state, dispatch } = useGame();
  const b = state.battle;
  if (!b.enemy || !b.enemySpec) return null;
  const team = b.team.map((u) => state.mons.find((m) => m.uid === u)).filter((m): m is NonNullable<typeof m> => !!m);
  const lead =
    (b.activeUid ? b.players.find((p) => p.uid === b.activeUid && p.hp > 0) : null) ??
    b.players.find((p) => p.hp > 0) ?? null;
  const leadMon = lead ? state.mons.find((m) => m.uid === lead.uid) : undefined;
  const e = entry(b.enemySpec);
  const moves = leadMon ? movesForMon(leadMon) : [];
  const enemyFrac = Math.max(0, b.enemy.hp) / b.enemy.maxHp;
  const owned = BALLS.filter((ball) => (state.balls[ball.id] ?? 0) > 0);
  const resting = !lead;

  return (
    <Panel
      title={`⚔️ A wild ${e.name} jumps out of the tall grass!`}
      right={<button className="btn sm" onClick={() => dispatch({ type: 'FLEE_BATTLE' })}>🏃 Run</button>}
      className="explore-fight"
    >
      <div className="arena">
        <div className="side">
          {leadMon && lead ? (
            <>
              <Sprite species={leadMon.species} form={leadMon.form} shiny={leadMon.shiny} size="lg" className="sprite-battle" back />
              <div style={{ fontWeight: 700 }}>
                {entry(leadMon.species).name} <span className="dim">Lv.{leadMon.level}</span>
              </div>
              <div className="hpwrap">
                <Bar value={lead.hp} max={lead.maxHp} className={`hp ${lead.hp / lead.maxHp < 0.25 ? 'low' : lead.hp / lead.maxHp < 0.55 ? 'mid' : ''}`} />
                <div className="tiny mono dim">{Math.max(0, Math.round(lead.hp))} / {lead.maxHp} HP</div>
              </div>
            </>
          ) : (
            <div className="muted small">Your team is beaten. They rest, then carry on.</div>
          )}
        </div>
        <div className="vssign">VS</div>
        <div className="side enemy">
          <Sprite species={b.enemySpec} shiny={b.enemyShiny} size="lg" className="sprite-battle enemy" />
          <div style={{ fontWeight: 700 }}>
            {e.name} <span className="dim">Lv.{b.enemyLevel}</span>{b.enemyShiny && ' ✨'}
          </div>
          <div className="hpwrap">
            <Bar value={Math.max(0, b.enemy.hp)} max={b.enemy.maxHp} className={`hp ${enemyFrac < 0.25 ? 'low' : enemyFrac < 0.55 ? 'mid' : ''}`} />
            <div className="row between tiny mono">
              <span>{Math.max(0, Math.round(b.enemy.hp))} / {b.enemy.maxHp} HP</span>
              <RarityTag rarity={e.rarity} />
            </div>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {e.types.map((t) => <TypeTag key={t} type={t} />)}
          </div>
        </div>
      </div>

      {leadMon && (
        <div className="grid g4" style={{ marginTop: 12 }}>
          {moves.map((m) => {
            const eff = typeMultiplier(m.type, e.types);
            return (
              <button
                key={m.id}
                className="panel"
                style={{ padding: 10, textAlign: 'left', cursor: 'pointer' }}
                onClick={() => dispatch({ type: 'USE_MOVE', uid: leadMon.uid, moveId: m.id })}
              >
                <div className="row between">
                  <span style={{ fontWeight: 700 }}>{m.name}</span>
                  <TypeTag type={m.type} />
                </div>
                <div className="row between tiny" style={{ marginTop: 4 }}>
                  <span className="muted">{m.power} power · {m.accuracy}%</span>
                  <span style={{ color: eff > 1.5 ? 'var(--good)' : eff < 0.95 ? 'var(--danger)' : undefined }}>
                    {eff > 1.5 ? 'super effective' : eff < 0.95 ? 'resisted' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="tiny muted">BALLS</span>
        {owned.length === 0 && <span className="tiny dim">none left</span>}
        {owned.map((ball) => (
          <button
            key={ball.id}
            className="btn xs good"
            disabled={resting}
            onClick={() => dispatch({ type: 'THROW_BALL', ballId: ball.id })}
          >
            <ItemSprite slug={ball.sprite} size={16} /> {ball.name} ×{state.balls[ball.id]}
          </button>
        ))}
        {team.length > 1 && (
          <>
            <span className="tiny muted" style={{ marginLeft: 10 }}>SWITCH</span>
            {team.filter((m) => m.uid !== lead?.uid && (b.players.find((p) => p.uid === m.uid)?.hp ?? 0) > 0).map((m) => (
              <button
                key={m.uid}
                className="btn xs"
                title={`Send out ${entry(m.species).name}`}
                onClick={() => dispatch({ type: 'SWITCH_POKEMON', uid: m.uid })}
              >
                <Sprite species={m.species} form={m.form} shiny={m.shiny} size="tiny" />
              </button>
            ))}
          </>
        )}
      </div>

      <div className="log" style={{ marginTop: 10, maxHeight: 120 }}>
        {b.log.slice(0, 5).map((l) => <div key={l.id} className={`t-${l.tone}`}>{l.text}</div>)}
      </div>
    </Panel>
  );
}
