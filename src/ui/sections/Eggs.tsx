import React, { useState } from 'react';
import { useGame } from '../store';
import { Bar, EggSprite, Modal, Panel } from '../components';
import {
  EGG_HATCH_LEVEL, EGG_TIERS, EVENT_EGG, INCUBATORS, INCUBATOR_BY_ID, RARITY_HATCH_TIME,
  RARITY_META, currentEvent, eggStorageCap, fmt, fmtTime, incubationMultiplier, storageCap, totalIncubatorSlots,
} from './shared';

export function Eggs() {
  const { state, dispatch } = useGame();
  const [buyQty, setBuyQty] = useState(1);
  const [placing, setPlacing] = useState<string | null>(null);
  const event = currentEvent();

  const cap = eggStorageCap(state);
  const ownedIncubators = INCUBATORS.filter((i) => state.shopUnlocked.includes(`inc:${i.id}`));
  const totalSlots = totalIncubatorSlots(state);
  const speed = incubationMultiplier(state);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid g2">
        <Panel title="Egg storage" right={<span className="tag">{state.eggs.length} / {cap}</span>}>
          <Bar value={state.eggs.length} max={cap} tone="linear-gradient(90deg,#8fdc8a,#4fae4a)" />
          <div className="small muted" style={{ marginTop: 8 }}>
            Eggs wait here until an incubator is free. Every egg hatches at <b>level {EGG_HATCH_LEVEL}</b> — the reward
            is a rarer monster, not a higher level. When the timer reaches zero, the completed egg stays here until
            you click <b>Hatch</b>; rarity changes species odds, not IVs or battle stats.
          </div>
          <div className="slots" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))' }}>
            {state.eggs.map((e) => {
              const meta = RARITY_META[e.tier];
              return (
                <div
                  key={e.id}
                  className="slot filled"
                  title={`${meta.label} egg${e.event ? ` · ${event.name}` : ''} — click to incubate`}
                  style={{ borderColor: meta.color, boxShadow: e.shiny ? `0 0 12px ${meta.glow}` : undefined, cursor: 'pointer' }}
                  onClick={() => setPlacing(e.id)}
                >
                  <EggSprite size={38} glow={e.shiny ? 'rgba(255,220,120,.8)' : meta.glow} />
                  {e.event && <span className="tiny" style={{ position: 'absolute', top: 2, right: 3 }}>🎉</span>}
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, Math.min(cap, 40) - state.eggs.length) }).map((_, i) => (
              <div key={i} className="slot" />
            ))}
          </div>
        </Panel>

        <Panel title="Incubators" right={<span className="tag">{state.hatches.length} / {totalSlots} occupied</span>}>
          {ownedIncubators.length === 0 && (
            <div className="muted small">No incubators installed — buy one below to start hatching.</div>
          )}
          <div className="stack" style={{ gap: 10 }}>
            {ownedIncubators.map((inc) => {
              const slots = inc.slots + (state.shardUpgrades.extraIncubator ?? 0);
              const busy = state.hatches.filter((h) => h.incubatorId === inc.id);
              return (
                <div key={inc.id} className="panel" style={{ padding: 11 }}>
                  <div className="row between">
                    <div>
                      <div style={{ fontWeight: 700 }}>{inc.name}</div>
                      <div className="tiny dim">{slots} slots · {inc.speed}× speed · camp bonus ×{speed.toFixed(2)}</div>
                    </div>
                    <span className="tag">{busy.length}/{slots}</span>
                  </div>
                  <div className="slots" style={{ marginTop: 9, gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
                    {busy.map((h) => {
                      const meta = RARITY_META[h.tier];
                      const complete = h.remaining <= 0;
                      const remaining = Math.max(0, h.remaining);
                      return (
                        <div key={h.id} className="slot filled" style={{ flexDirection: 'column', gap: 2, padding: 4, cursor: 'default', borderColor: complete ? 'var(--good)' : meta.color }}>
                          <EggSprite size={26} glow={complete ? 'rgba(125,220,148,.75)' : meta.glow} />
                          <div className="tiny mono" style={{ color: complete ? 'var(--good)' : meta.color }}>
                            {complete ? 'Ready' : fmtTime(remaining)}
                          </div>
                          {complete ? (
                            <button
                              className="btn xs good"
                              disabled={state.mons.length >= storageCap(state)}
                              onClick={() => dispatch({ type: 'HATCH_EGG', hatchId: h.id })}
                              title="Claim this completed egg"
                            >
                              Hatch
                            </button>
                          ) : (
                            <button
                              className="btn xs"
                              onClick={() => dispatch({ type: 'INSTANT_HATCH', hatchId: h.id })}
                              title={`Rush for ${Math.max(1, Math.ceil(remaining / 600))} diamonds`}
                            >
                              💎 {Math.max(1, Math.ceil(remaining / 600))}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {Array.from({ length: Math.max(0, slots - busy.length) }).map((_, i) => (
                      <div
                        key={i}
                        className={`slot ${state.eggs.length ? 'empty' : ''}`}
                        style={{ cursor: state.eggs.length ? 'pointer' : 'default' }}
                        onClick={() => state.eggs[0] && setPlacing(state.eggs[0].id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Buy eggs">
        <div className="row between" style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="small muted">Quantity</span>
            {[1, 5, 10].map((q) => (
              <button key={q} className={`btn sm ${buyQty === q ? 'primary' : 'ghost'}`} onClick={() => setBuyQty(q)}>
                ×{q}
              </button>
            ))}
          </div>
          <span className="tiny dim">Starter tiers cost coins; premium tiers cost diamonds · storage starts at only 3 slots and expands with upgrades</span>
        </div>
        <div className="grid g3">
          {EGG_TIERS.map((t) => {
            const meta = RARITY_META[t.rarity];
            const total = t.cost * buyQty;
            const space = state.eggs.length + buyQty <= cap;
            const diamonds = t.currency === 'diamonds';
            const affordable = diamonds ? state.diamonds >= total : state.coins >= total;
            const incubateTime = (t.minutes * 60) / Math.max(0.01, speed);
            return (
              <div key={t.id} className="panel" style={{ padding: 13, borderColor: `${meta.color}55` }}>
                <div className="row between">
                  <div className="row" style={{ gap: 10 }}>
                    <EggSprite size={42} glow={meta.glow} />
                    <div>
                      <div style={{ fontWeight: 700, color: meta.color }}>{t.name}</div>
                      <div className="tiny dim">
                        {meta.label} pool · hatches at level {EGG_HATCH_LEVEL}
                      </div>
                    </div>
                  </div>
                  {diamonds && <span className="tag" style={{ color: 'var(--diamond)', borderColor: 'var(--diamond)' }}>💎 only</span>}
                </div>
                <div className="small muted" style={{ marginTop: 9, minHeight: 34 }}>{t.blurb}</div>
                <div className="tiny dim">Base incubation {fmtTime(incubateTime)} before incubator speed</div>
                <button
                  className="btn sm primary"
                  style={{ marginTop: 10, width: '100%' }}
                  disabled={!space || !affordable}
                  onClick={() => dispatch({ type: 'BUY_EGG', tier: t.id, qty: buyQty })}
                >
                  {!space
                    ? 'Not enough egg storage'
                    : `Buy ×${buyQty} · ${diamonds ? '💎' : '⛁'} ${fmt(total)}`}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={`${EVENT_EGG.name} — ${event.name}`} right={<span className="tag" style={{ color: event.accent, borderColor: event.accent }}>{event.season}</span>}>
        <div className="grid g2">
          <div className="stack">
            <div className="small muted">{EVENT_EGG.blurb}</div>
            <div className="stack small" style={{ gap: 4, marginTop: 8 }}>
              {EVENT_EGG.odds.map((o) => (
                <div key={o.rarity} className="row between">
                  <span style={{ color: RARITY_META[o.rarity].color }}>{RARITY_META[o.rarity].label}</span>
                  <span className="mono">{o.weight}%</span>
                </div>
              ))}
            </div>
            <div className="tiny dim">
              Legendary and mythical monsters are only obtainable from these eggs, event rewards, or very deep biomes.
            </div>
          </div>
          <div className="stack">
            <div className="panel center" style={{ padding: 16, background: 'rgba(0,0,0,.25)' }}>
              <EggSprite size={64} glow="rgba(246,224,94,.6)" />
              <div style={{ fontWeight: 700, marginTop: 8 }}>{EVENT_EGG.name}</div>
              <div className="tiny dim">~{EVENT_EGG.minutes} min base incubation</div>
            </div>
            <button
              className="btn primary"
              disabled={state.eventTokens < EVENT_EGG.tokenCost * buyQty || state.eggs.length + buyQty > cap}
              onClick={() => dispatch({ type: 'BUY_EVENT_EGG', qty: buyQty, currency: 'tokens' })}
            >
              Buy ×{buyQty} · 🎟 {EVENT_EGG.tokenCost * buyQty} tokens
            </button>
            <button
              className="btn"
              disabled={state.diamonds < EVENT_EGG.diamondCost * buyQty || state.eggs.length + buyQty > cap}
              onClick={() => dispatch({ type: 'BUY_EVENT_EGG', qty: buyQty, currency: 'diamonds' })}
            >
              Buy ×{buyQty} · 💎 {EVENT_EGG.diamondCost * buyQty} diamonds
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Incubator shop">
        <div className="grid g3">
          {INCUBATORS.map((inc) => {
            const owned = state.shopUnlocked.includes(`inc:${inc.id}`);
            return (
              <div key={inc.id} className="panel" style={{ padding: 13, opacity: owned ? 0.7 : 1 }}>
                <div style={{ fontWeight: 700 }}>{inc.name}</div>
                <div className="tiny dim">{inc.slots} slots · {inc.speed}× speed</div>
                <div className="small muted" style={{ margin: '8px 0', minHeight: 30 }}>{inc.blurb}</div>
                <button
                  className="btn sm"
                  style={{ width: '100%' }}
                  disabled={owned || state.coins < inc.cost}
                  onClick={() => dispatch({ type: 'BUY_INCUBATOR', id: inc.id })}
                >
                  {owned ? 'Installed' : `Install · ⛁ ${fmt(inc.cost)}`}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      {placing && (
        <Modal title="Choose an incubator" onClose={() => setPlacing(null)}>
          <div className="stack">
            {ownedIncubators.map((inc) => {
              const busy = state.hatches.filter((h) => h.incubatorId === inc.id).length;
              const slots = inc.slots + (state.shardUpgrades.extraIncubator ?? 0);
              const egg = state.eggs.find((e) => e.id === placing);
              const product = egg ? EGG_TIERS.find((t) => t.id === egg.eggTierId) : null;
              const time = egg ? ((product?.minutes ?? RARITY_HATCH_TIME[egg.tier]) * 60) / (inc.speed * speed) : 0;
              return (
                <button
                  key={inc.id}
                  className="btn"
                  style={{ justifyContent: 'space-between', display: 'flex' }}
                  disabled={busy >= slots}
                  onClick={() => {
                    dispatch({ type: 'START_HATCH', eggId: placing, incubatorId: inc.id });
                    setPlacing(null);
                  }}
                >
                  <span>{inc.name} ({busy}/{slots})</span>
                  <span className="mono">≈ {fmtTime(time)}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
