import React, { useState } from 'react';
import { useGame } from '../store';
import { Bar, ItemSprite, Modal, Panel, Sprite, TypeTag } from '../components';
import { TYPE_COLORS, typeMultiplier } from '../../game/typechart';
import {
  BALLS, BALL_BY_ID, BIOMES, BIOME_BY_ID, DEX, ballContextFor, entry, fmt, movesFor, statsAt,
} from './shared';

const MAX_TEAM = 6;

export function Battle() {
  const { state, dispatch } = useGame();
  const [pickTeam, setPickTeam] = useState(false);
  const [pickBiome, setPickBiome] = useState(false);
  const [ballInfo, setBallInfo] = useState<string | null>(null);

  const b = state.battle;
  const biome = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  const team = b.team.map((u) => state.mons.find((m) => m.uid === u)).filter(Boolean);
  const lead = b.players.find((p) => p.hp > 0);
  const leadMon = lead ? state.mons.find((m) => m.uid === lead.uid) : null;

  const enemyRarity = b.enemySpec ? entry(b.enemySpec).rarity : 'common';
  const caught = b.enemySpec ? state.dexCaught.includes(b.enemySpec) : false;
  const enemyTypes = b.enemySpec ? entry(b.enemySpec).types : [];
  const leadMoves = leadMon ? movesFor(leadMon.species) : [];
  const cooldowns = lead?.moveCooldowns ?? {};

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <span className="tag" style={{ background: `${biome.accent}33`, borderColor: `${biome.accent}88` }}>
            🧭 {biome.name}
          </span>
          <span className="small muted">
            {b.progress}/{b.rotateAt} encounters until the area changes · turn {Math.floor(b.turn)} of this fight
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setPickBiome(true)}>Biome</button>
          <button className="btn sm" onClick={() => setPickTeam(true)}>Team ({b.team.length}/{MAX_TEAM})</button>
          <button className={`btn sm ${b.auto ? 'good' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_BATTLE_AUTO' })}>
            {b.auto ? '⏸ Auto-battle on' : '▶ Auto-battle off'}
          </button>
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
        <Panel title={`${entry(leadMon.species).name}'s moves`} right={<span className="tiny dim">click a move to use it now · auto-battle picks the best one</span>}>
          <div className="grid g4">
            {leadMoves.map((m) => {
              const cd = cooldowns[m.id] ?? 0;
              const eff = typeMultiplier(m.type, enemyTypes);
              return (
                <button
                  key={m.id}
                  className="panel"
                  style={{
                    padding: 11, textAlign: 'left', cursor: cd > 0 ? 'not-allowed' : 'pointer',
                    opacity: cd > 0 ? 0.45 : 1,
                    borderColor: `${TYPE_COLORS[m.type as keyof typeof TYPE_COLORS] ?? '#888'}66`,
                  }}
                  disabled={cd > 0}
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
                    <span className={eff > 1 ? '' : 'dim'} style={{ color: eff > 1.5 ? 'var(--good)' : eff < 0.7 ? 'var(--danger)' : undefined }}>
                      {eff > 1.5 ? 'super effective ×' + eff : eff < 0.7 ? 'resisted ×' + eff.toFixed(2) : 'neutral'}
                    </span>
                    <span className="mono">{cd > 0 ? `recharge ${cd.toFixed(1)}s` : 'ready'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      <div className="grid g2">
        <Panel title="Battle log" right={<span className="tiny dim">{fmt(state.stats.battlesWon)} wins</span>}>
          <div className="log">
            {b.log.length === 0 ? (
              <div className="muted small">The battle log fills up once fights start.</div>
            ) : (
              b.log.map((l) => <div key={l.id} className={`t-${l.tone}`}>{l.text}</div>)
            )}
          </div>
        </Panel>

        <div className="stack">
          <Panel title={`Your team (${team.length}/${MAX_TEAM})`}>
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
                      <div style={{ width: 130 }}>
                        <Bar value={Math.max(0, hp)} max={max} className={`hp ${hp / max < 0.25 ? 'low' : ''}`} />
                        <div className="tiny mono dim" style={{ textAlign: 'right' }}>{Math.max(0, Math.round(hp))}/{max}</div>
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

          <Panel title="Fight settings">
            <label className="row between small" style={{ cursor: 'pointer' }}>
              <span>Auto-catch weakened monsters</span>
              <input
                type="checkbox"
                checked={state.options.autoCatch}
                onChange={(e) => dispatch({ type: 'SET_OPTION', key: 'autoCatch', value: e.target.checked })}
              />
            </label>
            <label className="row between small" style={{ cursor: 'pointer', marginTop: 8 }}>
              <span>Auto-assign idle monsters to habitats</span>
              <input
                type="checkbox"
                checked={state.options.autoAssign}
                onChange={(e) => dispatch({ type: 'SET_OPTION', key: 'autoAssign', value: e.target.checked })}
              />
            </label>
            <div className="tiny dim" style={{ marginTop: 8 }}>
              Auto-battle always uses the move with the best expected damage, and switches to the next monster when the
              lead faints.
            </div>
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
        <Modal title={`Choose your battle team (up to ${MAX_TEAM})`} onClose={() => setPickTeam(false)} wide>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Monsters in the team leave their habitat while they train. Sorted strongest first.
          </div>
          <div className="grid g4">
            {[...state.mons]
              .sort((a, c) => c.level - a.level)
              .slice(0, 80)
              .map((m) => {
                const selected = b.team.includes(m.uid);
                return (
                  <div
                    key={m.uid}
                    className={`mon-card ${selected ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const next = selected
                        ? b.team.filter((u) => u !== m.uid)
                        : [...b.team, m.uid].slice(0, MAX_TEAM);
                      dispatch({ type: 'SET_TEAM', uids: next });
                    }}
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
        <Modal title="Where should they train?" onClose={() => setPickBiome(false)}>
          <div className="stack">
            {BIOMES.map((def) => {
              const locked = state.mons.reduce((max, m) => Math.max(max, m.level), 0) < def.unlockLevel;
              return (
                <button
                  key={def.id}
                  className="btn"
                  style={{ display: 'flex', justifyContent: 'space-between', opacity: locked ? 0.5 : 1 }}
                  disabled={locked}
                  onClick={() => {
                    dispatch({ type: 'SET_BIOME', biomeId: def.id });
                    setPickBiome(false);
                  }}
                >
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ color: def.accent }}>●</span>
                    {def.name}
                    <span className="tiny dim">{def.types.join(' / ')}</span>
                  </span>
                  <span className="tiny mono dim">
                    {locked ? `needs a Lv.${def.unlockLevel} monster` : `Lv.${def.levelRange[0]}–${def.levelRange[1]}`}
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
