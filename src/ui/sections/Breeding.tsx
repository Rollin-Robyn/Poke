import React, { useState } from 'react';
import { useGame } from '../store';
import { Bar, EggSprite, Modal, Panel, RarityTag, Sprite, TypeTag } from '../components';
import { DEX, breedingCompatible, breedingTime, eggStorageCap, entry, fmt, fmtTime } from './shared';
import type { Mon } from '../../game/state';

export function Breeding() {
  const { state, dispatch } = useGame();
  const [slot, setSlot] = useState<0 | 1 | null>(null);
  const [pick, setPick] = useState<{ a?: string; b?: string }>({});

  const pairs = state.breedingPairs;
  const free = Math.max(0, state.breedingZones - pairs.length);
  const now = Date.now();
  const resting = state.mons.filter((m) => (m.breedReadyAt ?? 0) > now);

  const candidates = state.mons.filter((m) => (m.breedReadyAt ?? 0) <= now && !state.battle.team.includes(m.uid));
  const chosenA = pick.a ? state.mons.find((m) => m.uid === pick.a) ?? null : null;
  const chosenB = pick.b ? state.mons.find((m) => m.uid === pick.b) ?? null : null;
  const check = chosenA && chosenB ? breedingCompatible(chosenA, chosenB) : null;
  const femaleParent = chosenA?.gender === 'F' ? chosenA : chosenB?.gender === 'F' ? chosenB : null;
  const maleParent = chosenA?.gender === 'M' ? chosenA : chosenB?.gender === 'M' ? chosenB : null;
  const maleHasDestinyKnot = maleParent?.heldItem === 'destiny-knot';

  const eligible = (mon: Mon, other: Mon | null) => {
    if (!other) return true;
    if (mon.uid === other.uid) return false;
    return true;
  };

  const zoneCost = (() => {
    const lvl = state.upgrades.breedZones ?? 0;
    return Math.ceil(150_000 * Math.pow(3.2, lvl));
  })();

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid g2">
        <Panel
          title={`Breeding zones — ${pairs.length} / ${state.breedingZones}`}
          right={
            <button
              className="btn sm"
              disabled={state.coins < zoneCost || (state.upgrades.breedZones ?? 0) >= 8}
              onClick={() => dispatch({ type: 'BUY_BREED_ZONE' })}
            >
              + Zone · ⛁ {fmt(zoneCost)}
            </button>
          }
        >
          <div className="small muted" style={{ marginBottom: 10 }}>
            One male and one female that share an egg group. The female parent determines the offspring species;
            the male supplies inherited stats and moves. Parents rest for 20 minutes afterwards.
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {Array.from({ length: state.breedingZones }).map((_, i) => {
              const pair = pairs[i];
              const a = pair ? state.mons.find((m) => m.uid === pair.a) : null;
              const bMon = pair ? state.mons.find((m) => m.uid === pair.b) : null;
              return (
                <div key={i} className="panel" style={{ padding: 11, borderStyle: pair ? 'solid' : 'dashed' }}>
                  {pair && a && bMon ? (
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="row between">
                        <div className="row" style={{ gap: 10 }}>
                          <Sprite species={a.species} shiny={a.shiny} size="sm" />
                          <span className="dim">＋</span>
                          <Sprite species={bMon.species} shiny={bMon.shiny} size="sm" />
                        </div>
                        <span className="mono small">{fmtTime(pair.remaining)}</span>
                      </div>
                      <Bar value={pair.total - pair.remaining} max={pair.total} tone="linear-gradient(90deg,#ff9ecb,#f06292)" />
                      <div className="tiny dim">
                        {entry(a.species).name} × {entry(bMon.species).name} → egg of the female parent’s species
                      </div>
                    </div>
                  ) : (
                    <div className="row between">
                      <span className="muted small">Zone {i + 1} — empty</span>
                      <button
                        className="btn sm primary"
                        disabled={state.eggs.length >= eggStorageCap(state)}
                        onClick={() => {
                          setSlot(0);
                          setPick({});
                        }}
                      >
                        Start breeding
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {free === 0 && pairs.length > 0 && (
            <div className="tiny dim" style={{ marginTop: 8 }}>All zones are busy. Eggs appear in the Eggs tab when ready.</div>
          )}
        </Panel>

        <Panel title="Nursery notes">
          <div className="stack small">
            <div className="row between"><span className="muted">Egg storage used</span><span>{state.eggs.length}</span></div>
            <div className="row between"><span className="muted">Eggs bred so far</span><span>{state.stats.bred}</span></div>
            <div className="row between"><span className="muted">Parents resting</span><span>{resting.length}</span></div>
            <div className="row between"><span className="muted">Breeding speed bonus</span>
              <span>+{((state.shardUpgrades.breedSpeed ?? 0) * 12).toFixed(0)}%</span>
            </div>
          </div>
          <div className="small muted" style={{ marginTop: 12 }}>
            Eggs inherit the female species. Three random IV stats come from the male; holding a Destiny Knot on
            either parent selects five of the male’s strongest IVs instead. The male’s egg moves and both parents’
            inherited TM moves are carried into the hatchling.
          </div>
          {state.breedingPairs.length > 0 && (
            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              <h3>In progress</h3>
              {state.breedingPairs.map((p) => {
                const a = state.mons.find((m) => m.uid === p.a);
                const bMon = state.mons.find((m) => m.uid === p.b);
                if (!a || !bMon) return null;
                return (
                  <div key={p.id} className="row between small">
                    <span>{entry(a.species).name} × {entry(bMon.species).name}</span>
                    <span className="mono dim">{fmtTime(p.remaining)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Available monsters">
        <div className="grid g4">
          {candidates.slice(0, 32).map((m) => (
            <div key={m.uid} className="mon-card">
              <div className="art" style={{ background: 'rgba(0,0,0,.28)' }}>
                <Sprite species={m.species} form={m.form} shiny={m.shiny} size="lg" />
                <span className="lv">Lv.{m.level}</span>
                <span className="gender" style={{ color: m.gender === 'M' ? '#7fb3ff' : m.gender === 'F' ? '#ff9ecb' : '#aaa' }}>
                  {m.gender === 'M' ? '♂' : m.gender === 'F' ? '♀' : '⚲'}
                </span>
              </div>
              <div className="body">
                <div className="name">{entry(m.species).name}</div>
                <div className="row" style={{ gap: 6 }}><RarityTag rarity={entry(m.species).rarity} /><span className="tiny dim">{m.gender === 'F' ? 'female parent' : m.gender === 'M' ? 'male parent' : 'genderless'}</span></div>
                <div className="row" style={{ gap: 4 }}>
                  {entry(m.species).types.map((t) => <TypeTag key={t} type={t} />)}
                </div>
                <div className="tiny dim">{entry(m.species).eggGroups.join(', ')}</div>
                <button
                  className="btn xs"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    setSlot(0);
                    setPick({ a: m.uid });
                  }}
                >
                  Use as parent
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {slot !== null && (
        <Modal title="Pick two parents" onClose={() => setSlot(null)} wide>
          <div className="grid g2">
            <div className="stack">
              <h3>Parent A {chosenA ? `— ${entry(chosenA.species).name} (${chosenA.gender === 'F' ? 'female' : chosenA.gender === 'M' ? 'male' : 'genderless'})` : ''}</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
                {candidates.filter((m) => eligible(m, chosenB)).map((m) => (
                  <div
                    key={m.uid}
                    className={`dex-cell ${pick.a === m.uid ? 'selected' : ''}`}
                    style={{ borderColor: pick.a === m.uid ? 'var(--gold)' : undefined }}
                    onClick={() => setPick((p) => ({ ...p, a: m.uid }))}
                    title={`${entry(m.species).name} Lv.${m.level} ${m.gender}`}
                  >
                    <Sprite species={m.species} shiny={m.shiny} size="sm" />
                    <span className="state">{m.gender === 'M' ? '♂' : m.gender === 'F' ? '♀' : '⚲'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="stack">
              <h3>Parent B {chosenB ? `— ${entry(chosenB.species).name}` : ''}</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
                {candidates.filter((m) => m.uid !== pick.a).filter((m) => eligible(m, chosenA)).map((m) => (
                  <div
                    key={m.uid}
                    className={`dex-cell ${pick.b === m.uid ? 'selected' : ''}`}
                    style={{ borderColor: pick.b === m.uid ? 'var(--gold)' : undefined }}
                    onClick={() => setPick((p) => ({ ...p, b: m.uid }))}
                    title={`${entry(m.species).name} Lv.${m.level} ${m.gender}`}
                  >
                    <Sprite species={m.species} shiny={m.shiny} size="sm" />
                    <span className="state">{m.gender === 'M' ? '♂' : m.gender === 'F' ? '♀' : '⚲'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {chosenA && chosenB && (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="row between">
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {entry(chosenA.species).name} × {entry(chosenB.species).name}
                  </div>
                  <div className="small muted">
                    {check?.ok
                      ? `Compatible — breeding takes about ${fmtTime(breedingTime(chosenA, chosenB, state))}.`
                      : check?.reason}
                  </div>
                  {check?.ok && femaleParent && maleParent && <div className="tiny dim" style={{ marginTop: 5 }}>
                    Offspring: <b>{entry(femaleParent.species).name}</b> · male inheritance: {maleHasDestinyKnot ? '5 strongest IVs with Destiny Knot' : '3 selected IVs'} · {maleParent.eggMoves?.length ? `${maleParent.eggMoves.length} egg move${maleParent.eggMoves.length === 1 ? '' : 's'}` : 'learnset moves'} carried
                  </div>}
                </div>
                <button
                  className="btn primary"
                  disabled={!check?.ok}
                  onClick={() => {
                    dispatch({ type: 'BREED', a: chosenA.uid, b: chosenB.uid });
                    setSlot(null);
                    setPick({});
                  }}
                >
                  Start breeding
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
