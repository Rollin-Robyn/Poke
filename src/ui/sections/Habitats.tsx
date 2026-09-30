import React, { useState } from 'react';
import { useGame } from '../store';
import { Bar, Modal, MonCard, Panel, TypeTag } from '../components';
import {
  DEX, HABITATS, HABITAT_BY_ID, MONO_HABITATS, MULTI_HABITATS, RARITY_META, canEnterHabitat, countHabitatClass,
  entry, fmt, habitatFreeSlots, habitatProduction, habitatRarityCap, habitatSlots, monsInHabitat,
  nextHabitatCost, slotUpgradeCost,
} from './shared';
import type { OwnedHabitat } from '../../game/state';

type BuyTab = 'mono' | 'multi';

export function Habitats() {
  const { state, dispatch } = useGame();
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [buying, setBuying] = useState<BuyTab | null>(null);
  const [confirmSlot, setConfirmSlot] = useState<string | null>(null);

  const assignHab = assignTo ? state.habitats.find((h) => h.id === assignTo) : null;
  const assignDef = assignHab ? HABITAT_BY_ID[assignHab.defId] : null;
  const free = assignHab ? habitatFreeSlots(state, assignHab) : 0;
  // monsters that match the type but are too rare for the current capacity
  const blockedByRarity = assignDef
    ? state.mons.filter(
        (m) =>
          !m.habitatId &&
          !state.battle.team.includes(m.uid) &&
          DEX[m.species].types.some((t) => assignDef.types.includes(t)) &&
          !canEnterHabitat(m, assignHab!, assignDef),
      ).length
    : 0;
  const eligible = assignDef
    ? state.mons.filter(
        (m) => !m.habitatId && !state.battle.team.includes(m.uid) && canEnterHabitat(m, assignHab!, assignDef),
      )
    : [];

  const monoOwned = countHabitatClass(state, 'mono');
  const multiOwned = countHabitatClass(state, 'multi');
  const monoCost = nextHabitatCost('mono', monoOwned);
  const multiCost = nextHabitatCost('multi', multiOwned);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title="My habitats"
        right={
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn sm"
              onClick={() => dispatch({ type: 'AUTO_ASSIGN' })}
              title="Move idle monsters into any habitat that accepts their type"
            >
              ⚡ Auto-assign
            </button>
            <button className="btn sm primary" onClick={() => setBuying('mono')}>
              🏗️ Buy habitats
            </button>
          </div>
        }
      >
        <div className="row small muted" style={{ gap: 18, flexWrap: 'wrap' }}>
          <span>{state.habitats.length} habitats built ({monoOwned} monotype, {multiOwned} multitype)</span>
          <span>Every habitat holds <b>1 monster</b>, +1 per capacity upgrade you buy on that habitat</span>
          <span>Monsters only move into habitats that accept their type</span>
        </div>
      </Panel>

      {state.habitats.length === 0 && (
        <Panel>
          <div className="muted">No habitats yet — buy your first one to start earning.</div>
        </Panel>
      )}

      <div className="grid g2">
        {state.habitats.map((h) => {
          const def = HABITAT_BY_ID[h.defId];
          if (!def) return null;
          const mons = monsInHabitat(state, h.id);
          const perHour = habitatProduction(state, h.id) * 60;
          const slots = habitatSlots(h);
          const nextCost = slotUpgradeCost(def, h.slotLevel);
          const asleep = mons.filter((m) => m.energy <= 0).length;
          const isMulti = def.cls === 'multi';
          return (
            <Panel key={h.id} className="hab-card" style={{ padding: 0 }}>
              <div className="hab-head" style={{ background: `linear-gradient(90deg, ${def.accent}22, transparent)` }}>
                <div className="hab-icon" style={{ background: `${def.accent}22`, borderColor: `${def.accent}77` }}>
                  {isMulti ? '🏛️' : '🏡'}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>{def.name}</span>
                    <span className="tag" style={{ color: def.accent, borderColor: `${def.accent}88` }}>
                      {isMulti ? 'multitype' : 'monotype'}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 4, marginTop: 4 }}>
                    {def.types.map((t) => (
                      <TypeTag key={t} type={t} />
                    ))}
                  </div>
                </div>
                <div className="center">
                  <div className="tiny muted">PER HOUR</div>
                  <div className="mono" style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 17 }}>
                    {fmt(perHour)}
                  </div>
                  <div className="tiny dim">{def.bonus.toFixed(2)}× bonus</div>
                </div>
              </div>

              <div className="hab-body">
                <div className="row between small">
                  <span className="muted">
                    {mons.length}/{slots} slots used{asleep ? ` · 😴 ${asleep}` : ''}
                  </span>
                  <span className="tiny">
                    accepts up to{' '}
                    <b style={{ color: RARITY_META[habitatRarityCap(h.slotLevel)].color }}>
                      {habitatRarityCap(h.slotLevel)}
                    </b>
                  </span>
                </div>
                <Bar value={mons.length} max={slots} tone={`linear-gradient(90deg, ${def.accent}, ${def.accent}aa)`} />

                <div className="slots">
                  {mons.map((m) => (
                    <div
                      key={m.uid}
                      className="slot filled"
                      title={`${entry(m.species).name} Lv.${m.level} — click to move out`}
                      onClick={() => dispatch({ type: 'ASSIGN_MON', uid: m.uid, habitatId: null })}
                    >
                      <img src={`sprites/gen5/${String(DEX[m.species].num).padStart(4, '0')}.png`} alt="" />
                      <span className="lvl">{m.level}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, Math.min(slots, 24) - mons.length) }).map((_, i) => (
                    <div
                      key={`e${i}`}
                      className={`slot ${free > 0 ? 'empty' : ''}`}
                      style={{ cursor: free > 0 ? 'pointer' : 'default' }}
                      onClick={() => free > 0 && setAssignTo(h.id)}
                    />
                  ))}
                </div>

                <div className="row between">
                  <button className="btn sm primary" disabled={free <= 0} onClick={() => setAssignTo(h.id)}>
                    + Add monster
                  </button>
                  <button
                    className="btn sm"
                    disabled={state.coins < nextCost}
                    onClick={() => setConfirmSlot(h.id)}
                    title="Add one more slot to this specific habitat"
                  >
                    + Capacity · ⛁ {fmt(nextCost)}
                  </button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {buying && (
        <Modal title="Buy habitats" onClose={() => setBuying(null)} wide>
          <div className="row" style={{ gap: 8, marginBottom: 14 }}>
            {(['mono', 'multi'] as BuyTab[]).map((tab) => (
              <button
                key={tab}
                className={`btn ${buying === tab ? 'primary' : 'ghost'}`}
                onClick={() => setBuying(tab)}
              >
                {tab === 'mono' ? `Monotype · ⛁ ${fmt(monoCost)}` : `Multitype · ⛁ ${fmt(multiCost)}`}
              </button>
            ))}
          </div>

          <div className="small muted" style={{ marginBottom: 12 }}>
            {buying === 'mono'
              ? 'Monotype habitats accept a single type. They all cost the same, and the price creeps up by 7% with each one you buy. A new habitat holds one monster.'
              : 'Multitype habitats accept several types and pay a large bonus that grows with the number of types. They are far more expensive, and you can own as many as you like.'}
          </div>

          <div className="grid g3">
            {(buying === 'mono' ? MONO_HABITATS : MULTI_HABITATS).map((def) => {
              const ownedCount = state.habitats.filter((h) => h.defId === def.id).length;
              const cost = nextHabitatCost(def.cls, buying === 'mono' ? monoOwned : multiOwned);
              const affordable = state.coins >= cost;
              return (
                <div key={def.id} className="panel" style={{ padding: 13, borderColor: ownedCount ? `${def.accent}66` : undefined }}>
                  <div className="row between">
                    <div className="row" style={{ gap: 9 }}>
                      <div className="hab-icon" style={{ background: `${def.accent}22`, borderColor: `${def.accent}66` }}>
                        {def.cls === 'multi' ? '🏛️' : '🏡'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{def.name}</div>
                        <div className="tiny dim">
                          {def.types.length} type{def.types.length > 1 ? 's' : ''} · {def.bonus.toFixed(2)}× bonus
                          {ownedCount > 0 && ` · own ${ownedCount}`}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4, margin: '9px 0' }}>
                    {def.types.map((t) => (
                      <TypeTag key={t} type={t} />
                    ))}
                  </div>
                  <div className="small muted" style={{ minHeight: 32 }}>{def.blurb}</div>
                  <button
                    className="btn sm"
                    style={{ marginTop: 9, width: '100%' }}
                    disabled={!affordable}
                    onClick={() => dispatch({ type: 'BUY_HABITAT', defId: def.id })}
                  >
                    Build · ⛁ {fmt(cost)}
                  </button>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {assignTo && assignDef && assignHab && (
        <Modal title={`Move a monster into ${assignDef.name}`} onClose={() => setAssignTo(null)} wide>
          <div className="small muted" style={{ marginBottom: 12 }}>
            {free} free slot{free === 1 ? '' : 's'} · this habitat accepts {assignDef.types.join(', ')} monsters up to{' '}
            <b>{habitatRarityCap(assignHab.slotLevel)}</b> rarity
            {blockedByRarity > 0 ? ` — ${blockedByRarity} monster(s) in storage are too rare for it` : ''}.
          </div>
          {eligible.length === 0 ? (
            <div className="muted">
              No eligible monsters in storage.{' '}
              {blockedByRarity > 0
                ? 'Everything that matches the type is too rare — upgrade this habitat\'s capacity to accept them.'
                : 'Hatch, catch or breed a monster with a matching type.'}
            </div>
          ) : (
            <div className="grid g4">
              {eligible.map((m) => (
                <MonCard
                  key={m.uid}
                  mon={m}
                  state={state}
                  compact
                  footer={
                    <button
                      className="btn xs good"
                      style={{ width: '100%' }}
                      onClick={() => {
                        dispatch({ type: 'ASSIGN_MON', uid: m.uid, habitatId: assignTo });
                        setAssignTo(null);
                      }}
                    >
                      Move in
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </Modal>
      )}

      {confirmSlot && (
        <Modal title="Upgrade capacity" onClose={() => setConfirmSlot(null)}>
          {(() => {
            const hab = state.habitats.find((x) => x.id === confirmSlot) as OwnedHabitat;
            const def = HABITAT_BY_ID[hab.defId];
            const cost = slotUpgradeCost(def, hab.slotLevel);
            return (
              <div className="stack">
                <div className="small muted">
                  {def.name} currently holds <b>{habitatSlots(hab)}</b> monster{habitatSlots(hab) === 1 ? '' : 's'} and
                  accepts up to <b>{habitatRarityCap(hab.slotLevel)}</b> monsters. For ⛁ {fmt(cost)} it becomes{' '}
                  <b>{habitatSlots(hab) + 1} slots</b> and accepts up to{' '}
                  <b>{habitatRarityCap(hab.slotLevel + 1)}</b>. Each further upgrade on this habitat costs more.
                </div>
                <div className="row">
                  <button
                    className="btn primary"
                    disabled={state.coins < cost}
                    onClick={() => {
                      dispatch({ type: 'BUY_HABITAT_SLOT', instanceId: confirmSlot });
                      setConfirmSlot(null);
                    }}
                  >
                    Upgrade · ⛁ {fmt(cost)}
                  </button>
                  <button className="btn ghost" onClick={() => setConfirmSlot(null)}>Cancel</button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
