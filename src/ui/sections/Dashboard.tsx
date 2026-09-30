import React from 'react';
import { useGame } from '../store';
import { ItemSprite, Panel, Sprite, Stat } from '../components';
import {
  HABITAT_BY_ID, DIAMOND_EXCHANGE_GAIN, currentEvent, diamondExchangeCost, entry,
  globalCoinMultiplier, habitatPendingCoins, habitatProduction, habitatSlots, housedCount,
  monsInHabitat, productionPerMinute, storageCap, totalHabitatSlots, totalPendingHabitatCoins,
} from './shared';
import { fmt, fmtTime } from '../../game/rng';

export function Dashboard({ go }: { go: (tab: string) => void }) {
  const { state, dispatch } = useGame();
  const exchangeCost = diamondExchangeCost(state);
  const canExchange = state.coins >= exchangeCost;
  const ppm = productionPerMinute(state);
  const pending = totalPendingHabitatCoins(state);
  const event = currentEvent();
  const housed = housedCount(state);
  const slots = totalHabitatSlots(state);
  const asleep = state.mons.filter((m) => m.habitatId && m.energy <= 0).length;
  const evolved = state.mons.filter((m) => entry(m.species).stage > 0).length;
  const legendaries = state.mons.filter((m) => entry(m.species).rarity === 'legendary').length;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid g2">
        <Panel title="Reserve output" right={<span className="tag">{globalCoinMultiplier(state).toFixed(2)}× global</span>}>
          <div className="row" style={{ gap: 26, flexWrap: 'wrap' }}>
            <div>
              <div className="tiny muted">CURRENT PER HOUR</div>
              <div className="big">⛁ {fmt(ppm * 60)}</div>
            </div>
            <div>
              <div className="tiny muted">CURRENT PER DAY</div>
              <div className="big">⛁ {fmt(ppm * 1440)}</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Stat label="Output per minute" value={`${fmt(ppm)} ⛁`} hint="Income is deposited into each habitat, not the balance." />
          </div>
        </Panel>

        <Panel
          title="Biome cash & coin exchange"
          right={<span className="tag" style={{ color: pending > 0 ? 'var(--gold)' : undefined }}>{fmt(pending)} waiting</span>}
        >
          <div className="stack" style={{ gap: 10 }}>
            <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div className="small muted">Your habitats are holding <b style={{ color: 'var(--gold)' }}>⛁ {fmt(pending)}</b>.</div>
              <button className="btn primary sm" disabled={pending <= 0} onClick={() => dispatch({ type: 'COLLECT_ALL_HABITAT_CASH' })}>
                Collect all habitat cash
              </button>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn sm"
                disabled={!canExchange}
                onClick={() => dispatch({ type: 'CONVERT_COINS_TO_DIAMONDS' })}
                title="Trade a very large pile of collected coins for one diamond"
              >
                💠 Coin exchange
              </button>
              <span className="small muted">
                ⛁ {fmt(exchangeCost)} → {DIAMOND_EXCHANGE_GAIN} 💎 · {state.diamondExchanges} traded
                {canExchange ? '' : ' · not enough collected coins'}
              </span>
            </div>
            <div className="tiny dim">
              Habitat cash is never collected automatically. Offline time is simulated through each Pokémon’s awake and
              rest periods, then the result is left in the habitat that earned it.
            </div>
          </div>
        </Panel>

        <Panel title="Reserve status">
          <div className="row" style={{ gap: 22, flexWrap: 'wrap' }}>
            <Stat label="Monsters" value={`${state.mons.length} / ${storageCap(state)}`} hint="Storage is expanded by habitats" />
            <Stat label="Housed" value={`${housed} / ${slots}`} hint="Slots come from capacity upgrades" />
            <Stat label="Asleep" value={asleep} hint="Resting monsters produce 30%" />
            <Stat label="Species" value={`${state.dexCaught.length} / 649`} />
          </div>
          <div className="row" style={{ gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
            <Stat label="Evolved" value={evolved} />
            <Stat label="Legendary" value={legendaries} />
            <Stat label="Battles won" value={fmt(state.stats.battlesWon)} />
            <Stat label="Playtime" value={fmtTime(state.playtime)} />
          </div>
        </Panel>
      </div>

      <Panel
        title="Habitats"
        right={
          <div className="row" style={{ gap: 6 }}>
            <span className="tiny dim">{state.habitats.length} built · {housed}/{slots} slots used</span>
            <button className="btn sm" onClick={() => go('habitats')}>Manage →</button>
          </div>
        }
      >
        {state.habitats.length === 0 ? (
          <div className="row between">
            <div className="muted small">No habitats yet. Buy one and your monsters will start earning.</div>
            <button className="btn sm primary" onClick={() => go('habitats')}>Buy a habitat</button>
          </div>
        ) : (
          <div className="grid g3">
            {state.habitats.slice(0, 6).map((h) => {
              const def = HABITAT_BY_ID[h.defId];
              if (!def) return null;
              const mons = monsInHabitat(state, h.id);
              const cap = habitatSlots(h);
              const waiting = habitatPendingCoins(state, h.id);
              return (
                <div key={h.id} className="panel" style={{ padding: 12 }}>
                  <div className="row between">
                    <div className="row" style={{ gap: 8 }}>
                      <div className="hab-icon" style={{ background: `${def.accent}22`, borderColor: `${def.accent}66` }}>
                        {def.cls === 'multi' ? '🏛️' : '🏡'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{h.name || def.name}</div>
                        <div className="tiny dim">
                          {def.types.slice(0, 3).join(' / ')}{def.types.length > 3 ? ' +' : ''} · {mons.length}/{cap} slots
                        </div>
                      </div>
                    </div>
                    <div className="center">
                      <div className="tiny muted">PER HOUR</div>
                      <div className="mono" style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(habitatProduction(state, h.id) * 60)}</div>
                    </div>
                  </div>
                  <div className="row between" style={{ marginTop: 9 }}>
                    <span className="small" style={{ color: waiting > 0 ? 'var(--gold)' : 'var(--muted)' }}>⛁ {fmt(waiting)} waiting</span>
                    <button className="btn xs primary" disabled={waiting <= 0} onClick={() => dispatch({ type: 'COLLECT_HABITAT_CASH', instanceId: h.id })}>Collect</button>
                  </div>
                  <div className="slots" style={{ marginTop: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))' }}>
                    {mons.slice(0, 8).map((m) => (
                      <div key={m.uid} className="slot filled" title={`${entry(m.species).name} Lv.${m.level}`}>
                        <Sprite species={m.species} form={m.form} shiny={m.shiny} size="sm" />
                        <span className="lvl">{m.level}</span>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, Math.min(8, cap) - mons.length) }).map((_, i) => <div key={i} className="slot empty" />)}
                  </div>
                </div>
              );
            })}
            {state.habitats.length > 6 && (
              <button className="panel" style={{ padding: 12, cursor: 'pointer' }} onClick={() => go('habitats')}>
                <div className="center muted">+{state.habitats.length - 6} more →</div>
              </button>
            )}
          </div>
        )}
      </Panel>

      <div className="grid g2">
        <Panel title="Current event" right={<button className="btn sm" onClick={() => go('events')}>Open →</button>}>
          <div className="row between">
            <div>
              <div style={{ fontWeight: 700, color: event.accent }}>{event.name}</div>
              <div className="small muted" style={{ marginTop: 4, maxWidth: 420 }}>{event.blurb}</div>
            </div>
            <div className="center">
              <div className="tiny muted">TOKENS</div>
              <div className="mono" style={{ fontWeight: 700, color: 'var(--token)' }}>{fmt(state.eventTokens)}</div>
            </div>
          </div>
        </Panel>

        <Panel title="Bag" right={<button className="btn sm" onClick={() => go('roster')}>Monsters →</button>}>
          {Object.keys(state.itemBag).length === 0 ? (
            <div className="muted small">No items yet — wins in battle drop berries and held items.</div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              {Object.entries(state.itemBag).filter(([, qty]) => qty > 0).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([id, qty]) => (
                <div key={id} className="row" style={{ gap: 5, background: 'rgba(0,0,0,.25)', padding: '4px 9px', borderRadius: 999, border: '1px solid var(--line)' }}>
                  <ItemSprite slug={id} size={18} /><span className="mono small">{qty}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Recent activity">
        {state.log.length === 0 ? <div className="muted small">Nothing has happened yet.</div> : (
          <div className="stack" style={{ gap: 3 }}>
            {state.log.slice(0, 8).map((l) => <div key={l.id} className="small" style={{ color: l.tone === 'good' ? 'var(--good)' : l.tone === 'bad' ? 'var(--danger)' : 'var(--muted)' }}>{l.text}</div>)}
          </div>
        )}
      </Panel>
    </div>
  );
}
