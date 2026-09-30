import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { Bar, ItemSprite, Modal, Panel, Sprite, TypeTag } from '../components';
import { TYPE_COLORS, typeMultiplier } from '../../game/typechart';
import { MAX_TEAM } from '../../game/state';
import {
  BALLS, BALL_BY_ID, BIOMES, BIOME_BY_ID, BIOME_TIERS, DEX, SPECIAL_BIOME_AFTER, SPECIAL_BIOME_CHANCE, ballContextFor, biomeLevelRange, entry, fmt,
  movesFor, movesForMon, statsAt, tierOf, effectiveSpeed, type BiomeTierDef,
} from './shared';

export function Battle() {
  const { state, dispatch } = useGame();
  const [pickTeam, setPickTeam] = useState(false);
  const [pickBiome, setPickBiome] = useState(false);
  const [ballInfo, setBallInfo] = useState<string | null>(null);

  const b = state.battle;
  const biome = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  // the newest line is the one you want to read, so follow the fight downwards
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [b.log.length]);
  const team = b.team.map((u) => state.mons.find((m) => m.uid === u)).filter(Boolean);
  const lead = (b.activeUid ? b.players.find((p) => p.uid === b.activeUid && p.hp > 0) : null) ?? b.players.find((p) => p.hp > 0);
  const leadMon = lead ? state.mons.find((m) => m.uid === lead.uid) : null;

  const teamFull = b.team.length >= MAX_TEAM;
  const enemyRarity = b.enemySpec ? entry(b.enemySpec).rarity : 'common';
  const caught = b.enemySpec ? state.dexCaught.includes(b.enemySpec) : false;
  const enemyTypes = b.enemySpec ? entry(b.enemySpec).types : [];
  const leadMoves = leadMon ? movesForMon(leadMon) : [];
  const enemyMoves = b.enemySpec ? movesFor(b.enemySpec, b.enemyLevel) : [];
  const tier = tierOf(biome);
  const [lo, hi] = biomeLevelRange(biome, b.biomesPassed);
  const bestLevel = state.mons.reduce((max, m) => Math.max(max, m.level), 0);
  // who would move first this turn - priority and speed, jittered like the games
  const leadSpeed = leadMon
    ? effectiveSpeed({ species: leadMon.species, level: leadMon.level, nature: leadMon.nature, iv: leadMon.iv }, leadMon.heldItem)
    : 0;
  const enemySpeed = b.enemySpec && b.enemy
    ? effectiveSpeed({ species: b.enemySpec, level: b.enemyLevel, nature: 'hardy', iv: 15 })
    : 0;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <span className="tag" style={{ background: `${biome.accent}33`, borderColor: `${biome.accent}88` }}>
            🧭 {biome.name}
          </span>
          <span className="tag" style={{ background: `${tier.accent}22`, borderColor: `${tier.accent}66` }}>
            {tier.name} · tier {tier.tier}
          </span>
          <span className="small muted">
            {b.progress}/{b.rotateAt} encounters until the trail moves on · {fmt(b.biomesPassed)} biomes passed this run · Lv.{lo}–{hi} wild
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setPickBiome(true)}>Biome</button>
          <button className="btn sm" onClick={() => setPickTeam(true)}>Team ({b.team.length}/{MAX_TEAM})</button>
          <button className="btn sm" onClick={() => dispatch({ type: 'HEAL_TEAM' })}>Heal</button>
        </div>
      </div>

      <Panel>
        {!b.enemy || !b.enemySpec ? (
          <div className="center muted" style={{ padding: '40px 0' }}>
            {team.length === 0 ? 'Pick a team to start battling.' : 'Looking for a wild monster…'}
          </div>
        ) : (
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
                    <div className="row between tiny mono">
                      <span>{Math.max(0, Math.round(lead.hp))} / {lead.maxHp} HP</span>
                      <span className="dim">{leadMon.nature}</span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {entry(leadMon.species).types.map((t) => <TypeTag key={t} type={t} />)}
                  </div>
                </>
              ) : (
                <div className="muted small">No monster able to fight.</div>
              )}
            </div>

            <div className="vssign">VS</div>

            <div className="side enemy">
              <Sprite species={b.enemySpec} shiny={b.enemyShiny} size="lg" className="sprite-battle enemy" />
              <div style={{ fontWeight: 700 }}>
                {entry(b.enemySpec).name} <span className="dim">Lv.{b.enemyLevel}</span>{b.enemyShiny && ' ✨'}
              </div>
              <div className="hpwrap">
                <Bar value={Math.max(0, b.enemy.hp)} max={b.enemy.maxHp} className={`hp ${b.enemy.hp / b.enemy.maxHp < 0.25 ? 'low' : b.enemy.hp / b.enemy.maxHp < 0.55 ? 'mid' : ''}`} />
                <div className="row between tiny mono">
                  <span>{Math.max(0, Math.round(b.enemy.hp))} / {b.enemy.maxHp} HP</span>
                  <span className="dim">{enemyRarity}</span>
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {enemyTypes.map((t) => <TypeTag key={t} type={t} />)}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {b.enemySpec && leadMon && (
        <Panel
          title={`${entry(leadMon.species).name}'s turn — pick a move`}
          right={
            <span className="tiny dim">
              turn {b.turn} · {leadSpeed > enemySpeed ? 'you move first' : leadSpeed < enemySpeed ? 'the wild monster moves first' : 'too close to call'}
            </span>
          }
        >
          <div className="grid g4">
            {leadMoves.map((m) => {
              const eff = typeMultiplier(m.type, enemyTypes);
              const stab = entry(leadMon.species).types.includes(m.type);
              return (
                <button
                  key={m.id}
                  className="panel"
                  style={{
                    padding: 11, textAlign: 'left', cursor: 'pointer',
                    borderColor: `${TYPE_COLORS[m.type as keyof typeof TYPE_COLORS] ?? '#888'}66`,
                  }}
                  onClick={() => dispatch({ type: 'USE_MOVE', uid: leadMon.uid, moveId: m.id })}
                >
                  <div className="row between">
                    <span style={{ fontWeight: 700 }}>{m.name}</span>
                    <TypeTag type={m.type} />
                  </div>
                  <div className="row between tiny" style={{ marginTop: 6 }}>
                    <span className="muted">{m.category} · {m.power} power</span>
                    <span className="mono">{m.accuracy}% acc</span>
                  </div>
                  <div className="row between tiny" style={{ marginTop: 4 }}>
                    <span style={{ color: eff > 1.5 ? 'var(--good)' : eff < 0.95 ? 'var(--danger)' : undefined }}>
                      {eff > 1.5 ? 'super effective ×' + eff : eff < 0.95 ? 'resisted ×' + eff.toFixed(2) : 'neutral'}
                      {stab ? ' · STAB' : ''}
                    </span>
                    <span className="mono">{m.priority > 0 ? `+${m.priority} priority` : m.priority < 0 ? `${m.priority} priority` : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="tiny dim" style={{ marginTop: 10 }}>
            The wild {entry(b.enemySpec).name} knows {enemyMoves.length} move{enemyMoves.length === 1 ? '' : 's'}:{' '}
            {enemyMoves.map((m) => m.name).join(', ') || '—'}
          </div>
        </Panel>
      )}

      <div className="grid g2">
        <Panel className="fill" title="Battle log" right={<span className="tiny dim">{fmt(state.stats.battlesWon)} wins</span>}>
          <div className="log" ref={logRef}>
            {b.log.length === 0 ? (
              <div className="muted small">The battle log fills up once fights start.</div>
            ) : (
              b.log.map((l) => <div key={l.id} className={`t-${l.tone}`}>{l.text}</div>)
            )}
          </div>
        </Panel>

        <div className="stack">
          <Panel title={`Your team (${team.length}/${MAX_TEAM})`}>
            {b.enemy && team.length > 1 && <div className="tiny dim" style={{ marginBottom: 8 }}>Switch is a turn action. The wild move selected for the current target still lands on the Pokémon you deploy.</div>}
            {team.length === 0 ? (
              <div className="muted small">No monsters assigned. Press “Team” to choose up to six.</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {team.map((m) => {
                  const p = b.players.find((x) => x.uid === m!.uid);
                  const max = statsAt(m!.species, m!.level, m!.nature, m!.iv).hp;
                  const hp = p?.hp ?? max;
                  const fighting = lead && p && p.uid === lead.uid;
                  return (
                    <div key={m!.uid} className="row between" style={{ opacity: hp <= 0 ? 0.45 : 1 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <Sprite species={m!.species} form={m!.form} shiny={m!.shiny} size="sm" />
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {entry(m!.species).name} {fighting && <span className="tiny" style={{ color: 'var(--good)' }}>● fighting</span>}
                            {hp <= 0 && <span className="tiny dim"> · fainted</span>}
                          </div>
                          <div className="tiny dim">Lv.{m!.level} · {m!.nature} · {entry(m!.species).types.join('/')}</div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <div style={{ width: 110 }}>
                          <Bar value={Math.max(0, hp)} max={max} className={`hp ${hp / max < 0.25 ? 'low' : ''}`} />
                          <div className="tiny mono dim" style={{ textAlign: 'right' }}>{Math.max(0, Math.round(hp))}/{max}</div>
                        </div>
                        {b.enemy && hp > 0 && !fighting && <button className="btn xs" onClick={() => dispatch({ type: 'SWITCH_POKEMON', uid: m!.uid })}>Switch</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Ball pouch"
            right={<span className="tiny dim">situational balls show their bonus below</span>}
          >
            <div className="stack" style={{ gap: 8 }}>
              {BALLS.filter((ball) => ball.price > 0 || (state.balls[ball.id] ?? 0) > 0).map((ball) => {
                const ctx = ballContextFor(state, ball.id, enemyTypes, b.enemyLevel, enemyRarity, caught);
                return (
                  <div key={ball.id} className="panel" style={{ padding: 9 }}>
                    <div className="row between">
                      <div className="row" style={{ gap: 8 }}>
                        <ItemSprite slug={ball.sprite} size={22} />
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {ball.name} <span className="dim">×{state.balls[ball.id] ?? 0}</span>
                          </div>
                          <div className="tiny dim">
                            base ×{ball.multiplier}
                            {ctx && ctx.mult > 1 && (
                              <b style={{ color: 'var(--good)' }}> · ×{ctx.mult} {ctx.label}</b>
                            )}
                            {ball.bonus && !ctx && <span className="dim"> · bonus inactive</span>}
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 5 }}>
                        <button className="btn xs good" disabled={(state.balls[ball.id] ?? 0) <= 0} onClick={() => dispatch({ type: 'THROW_BALL', ballId: ball.id })}>
                          Throw
                        </button>
                        {ball.price > 0 && (
                          <button className="btn xs" disabled={state.coins < ball.price * 5} onClick={() => dispatch({ type: 'BUY_BALLS', ballId: ball.id, qty: 5 })}>
                            Buy 5 · ⛁{fmt(ball.price * 5)}
                          </button>
                        )}
                        <button className="btn xs ghost" onClick={() => setBallInfo(ball.id)}>?</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Fight rules">
            <div className="tiny dim">
              Battles are played by hand: your monsters only act when you click one of their moves, and the ball is
              yours to throw whenever you like. The wild monster fights back on its own timer, so a slow turn costs HP.
            </div>
            <label className="row between small" style={{ cursor: 'pointer', marginTop: 8 }}>
              <span>Auto-assign idle monsters to habitats</span>
              <input
                type="checkbox"
                checked={state.options.autoAssign}
                onChange={(e) => dispatch({ type: 'SET_OPTION', key: 'autoAssign', value: e.target.checked })}
              />
            </label>
          </Panel>
        </div>
      </div>

      {ballInfo && BALL_BY_ID[ballInfo] && (
        <Modal title={BALL_BY_ID[ballInfo].name} onClose={() => setBallInfo(null)}>
          <div className="stack">
            <div className="row" style={{ gap: 10 }}>
              <ItemSprite slug={BALL_BY_ID[ballInfo].sprite} size={40} />
              <div className="small muted">{BALL_BY_ID[ballInfo].blurb}</div>
            </div>
            <div className="row between small">
              <span className="muted">Base multiplier</span>
              <span className="mono">×{BALL_BY_ID[ballInfo].multiplier}</span>
            </div>
            <div className="row between small">
              <span className="muted">Price</span>
              <span className="mono">{BALL_BY_ID[ballInfo].price ? `⛁ ${fmt(BALL_BY_ID[ballInfo].price)}` : 'not sold'}</span>
            </div>
            {ballInfo === 'master-ball' && (
              <div className="small" style={{ color: 'var(--gold)' }}>
                Master Balls never fail. They are only given out by events and the deepest biomes.
              </div>
            )}
          </div>
        </Modal>
      )}

      {pickTeam && (
        <Modal title={`Choose your battle team (${b.team.length}/${MAX_TEAM})`} onClose={() => setPickTeam(false)} wide>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Monsters in the team leave their habitat while they train. Sorted strongest first.
            {teamFull && <b style={{ color: 'var(--gold)' }}> The team is full — drop one to swap it out.</b>}
          </div>
          <div className="grid g4">
            {[...state.mons]
              .sort((a, c) => c.level - a.level)
              .slice(0, 80)
              .map((m) => {
                const selected = b.team.includes(m.uid);
                const blocked = !selected && teamFull;
                return (
                  <div
                    key={m.uid}
                    className={`mon-card ${selected ? 'selected' : ''}`}
                    style={{ cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.45 : 1 }}
                    title={blocked ? `A team holds ${MAX_TEAM} monsters` : undefined}
                    onClick={() => dispatch({ type: 'TOGGLE_TEAM_MEMBER', uid: m.uid })}
                  >
                    <div className="art" style={{ background: 'rgba(0,0,0,.3)' }}>
                      <Sprite species={m.species} form={m.form} shiny={m.shiny} size="lg" />
                      <span className="lv">Lv.{m.level}</span>
                    </div>
                    <div className="body">
                      <div className="name">{entry(m.species).name}</div>
                      <div className="row" style={{ gap: 4 }}>
                        {entry(m.species).types.map((t) => <TypeTag key={t} type={t} />)}
                      </div>
                      <div className="tiny dim">{selected ? 'In team' : m.habitatId ? 'Housed' : 'Storage'}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </Modal>
      )}

      {pickBiome && (
        <Modal title="Where should they go?" onClose={() => setPickBiome(false)} wide>
          <div className="small muted" style={{ marginBottom: 12 }}>
            Areas are grouped by how rare the monsters living there are. Rarer ground needs a stronger team
            and more encounters cleared before it turns up on its own.
          </div>
          <div className="stack" style={{ gap: 14 }}>
            {BIOME_TIERS.map((t: BiomeTierDef) => {
              const locked = bestLevel < t.unlockLevel || b.cleared < t.unlockCleared;
              const areas = BIOMES.filter((x) => x.tier === t.tier && !x.special);
              const specialAreas = BIOMES.filter((x) => x.tier === t.tier && x.special);
              return (
                <div key={t.tier}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: t.accent }}>
                      Tier {t.tier} — {t.name}
                    </span>
                    <span className="tiny dim mono">
                      {locked
                        ? `needs a Lv.${t.unlockLevel} monster and ${t.unlockCleared} encounters cleared`
                        : `Lv.${t.levelRange[0]}–${t.levelRange[1]} wild`}
                    </span>
                  </div>
                  <div className="grid g3">
                    {areas.map((def) => (
                      <button
                        key={def.id}
                        className="btn"
                        style={{ display: 'flex', justifyContent: 'space-between', opacity: locked ? 0.45 : 1 }}
                        disabled={locked}
                        onClick={() => {
                          dispatch({ type: 'SET_BIOME', biomeId: def.id });
                          setPickBiome(false);
                        }}
                      >
                        <span className="row" style={{ gap: 8 }}>
                          <span style={{ color: def.accent }}>●</span>
                          {def.name}
                        </span>
                        <span className="tiny dim">{def.types.join(' / ')}</span>
                      </button>
                    ))}
                  </div>
                  {specialAreas.length > 0 && <div className="tiny dim" style={{ marginTop: 6 }}>
                    ✨ Special routes ({specialAreas.map((x) => x.name).join(', ')}) are not selected manually. After {SPECIAL_BIOME_AFTER} passed biomes, this run has a {Math.round(SPECIAL_BIOME_CHANCE * 100)}% chance to reach one on rotation.
                  </div>}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

    </div>
  );
}
