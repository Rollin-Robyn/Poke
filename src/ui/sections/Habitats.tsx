import React, { useState } from 'react';
import { useGame } from '../store';
import { Bar, Modal, MonCard, Panel, Sprite, TypeTag } from '../components';
import {
  DEX, HABITAT_BY_ID, MONO_HABITATS, MULTI_HABITATS, RARITY_META, capacityUpgradeCost,
  countHabitatClass, entry, fmt, habitatCapacityLevel, habitatFreeSlots, habitatPendingCoins,
  habitatProduction, habitatRarityCap, habitatRarityLevel, habitatSlots, monsInHabitat,
  nextHabitatCost, rarityUpgradeCost, canEnterHabitat,
} from './shared';
import type { OwnedHabitat } from '../../game/state';

type BuyTab = 'mono' | 'multi';

export function Habitats() {
  const { state, dispatch } = useGame();
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [buying, setBuying] = useState<BuyTab | null>(null);

  const assignHab = assignTo ? state.habitats.find((h) => h.id === assignTo) : null;
  const assignDef = assignHab ? HABITAT_BY_ID[assignHab.defId] : null;
  const free = assignHab ? habitatFreeSlots(state, assignHab) : 0;
  const rarityLevel = assignHab ? habitatRarityLevel(assignHab) : 0;
  const blockedByRarity = assignDef && assignHab
    ? state.mons.filter((m) => !m.habitatId && !state.battle.team.includes(m.uid)
      && DEX[m.species].types.some((t) => assignDef.types.includes(t))
      && !canEnterHabitat(m, assignHab, assignDef)).length
    : 0;
  const eligible = assignDef && assignHab
    ? state.mons.filter((m) => !m.habitatId && !state.battle.team.includes(m.uid) && canEnterHabitat(m, assignHab, assignDef))
    : [];
  const inTeam = state.mons.filter((m) => !m.habitatId && state.battle.team.includes(m.uid));
  const wrongType = assignDef
    ? state.mons.filter((m) => !m.habitatId && !state.battle.team.includes(m.uid) && !DEX[m.species].types.some((t) => assignDef.types.includes(t)))
    : [];

  const monoOwned = countHabitatClass(state, 'mono');
  const multiOwned = countHabitatClass(state, 'multi');
  const monoCost = nextHabitatCost('mono', monoOwned);
  const multiCost = nextHabitatCost('multi', multiOwned);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel title="My habitats" right={<div className="row" style={{ gap: 6 }}>
        <button className="btn sm" onClick={() => dispatch({ type: 'AUTO_ASSIGN' })}>⚡ Auto-assign</button>
        <button className="btn sm primary" onClick={() => setBuying('mono')}>🏗️ Buy habitats</button>
      </div>}>
        <div className="row small muted" style={{ gap: 18, flexWrap: 'wrap' }}>
          <span>{state.habitats.length} habitats built ({monoOwned} monotype, {multiOwned} multitype)</span>
          <span>Every habitat has separate <b>capacity</b> and <b>rarity</b> upgrades</span>
          <span>Cash waits here until you collect it</span>
          <span>Matching types are preferred, but battle-team monsters cannot be housed</span>
        </div>
      </Panel>

      {state.habitats.length === 0 && <Panel><div className="muted">No habitats yet — buy your first one to start earning.</div></Panel>}

      <div className="grid g2">
        {state.habitats.map((h) => {
          const def = HABITAT_BY_ID[h.defId];
          if (!def) return null;
          const mons = monsInHabitat(state, h.id);
          const capacityLevel = habitatCapacityLevel(h);
          const rarityLevel = habitatRarityLevel(h);
          const perHour = habitatProduction(state, h.id) * 60;
          const slots = habitatSlots(h);
          const room = habitatFreeSlots(state, h);
          const waiting = habitatPendingCoins(state, h.id);
          const capacityCost = capacityUpgradeCost(def, capacityLevel);
          const rarityCost = rarityUpgradeCost(def, rarityLevel);
          const maxRarity = rarityLevel >= 3;
          return (
            <Panel key={h.id} className="hab-card" style={{ padding: 0 }}>
              <div className="hab-head" style={{ background: `linear-gradient(90deg, ${def.accent}22, transparent)` }}>
                <div className="hab-icon" style={{ background: `${def.accent}22`, borderColor: `${def.accent}77` }}>{def.cls === 'multi' ? '🏛️' : '🏡'}</div>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}><span style={{ fontWeight: 700 }}>{h.name || def.name}</span><span className="tag" style={{ color: def.accent, borderColor: `${def.accent}88` }}>{def.cls === 'multi' ? 'multitype' : 'monotype'}</span></div>
                  <div className="row" style={{ gap: 4, marginTop: 4 }}>{def.types.map((t) => <TypeTag key={t} type={t} />)}</div>
                </div>
                <div className="center"><div className="tiny muted">PER HOUR</div><div className="mono" style={{ color: 'var(--gold)', fontWeight: 800, fontSize: 17 }}>{fmt(perHour)}</div></div>
              </div>

              <div className="hab-body">
                <div className="row between small"><span className="muted">{mons.length}/{slots} capacity</span><span>rarity up to <b style={{ color: RARITY_META[habitatRarityCap(rarityLevel)].color }}>{habitatRarityCap(rarityLevel)}</b></span></div>
                <Bar value={mons.length} max={slots} tone={`linear-gradient(90deg, ${def.accent}, ${def.accent}aa)`} />
                <div className="row between" style={{ marginTop: 8, gap: 8 }}>
                  <span className="small" style={{ color: waiting > 0 ? 'var(--gold)' : 'var(--muted)' }}>⛁ {fmt(waiting)} waiting</span>
                  <button className="btn xs primary" disabled={waiting <= 0} onClick={() => dispatch({ type: 'COLLECT_HABITAT_CASH', instanceId: h.id })}>Collect cash</button>
                </div>

                <div className="slots" style={{ marginTop: 10 }}>
                  {mons.map((m) => <div key={m.uid} className="slot filled" title={`${entry(m.species).name} Lv.${m.level} — click to move out`} onClick={() => dispatch({ type: 'ASSIGN_MON', uid: m.uid, habitatId: null })}><Sprite species={m.species} form={m.form} shiny={m.shiny} size="sm" /><span className="lvl">{m.level}</span></div>)}
                  {Array.from({ length: Math.max(0, Math.min(slots, 24) - mons.length) }).map((_, i) => <div key={`e${i}`} className={`slot ${room > 0 ? 'empty' : ''}`} style={{ cursor: room > 0 ? 'pointer' : 'default' }} onClick={() => room > 0 && setAssignTo(h.id)} />)}
                </div>

                <div className="grid g2" style={{ marginTop: 10 }}>
                  <button className="btn sm" disabled={state.coins < capacityCost} onClick={() => dispatch({ type: 'BUY_HABITAT_CAPACITY', instanceId: h.id })}>
                    + Capacity · ⛁ {fmt(capacityCost)}<span className="tiny dim">{slots} → {slots + 1} slots</span>
                  </button>
                  <button className="btn sm" disabled={maxRarity || state.coins < rarityCost} onClick={() => dispatch({ type: 'BUY_HABITAT_RARITY', instanceId: h.id })}>
                    {maxRarity ? 'Legendary unlocked' : `+ Rarity · ⛁ ${fmt(rarityCost)}`}<span className="tiny dim">{habitatRarityCap(rarityLevel)} → {maxRarity ? 'legendary' : habitatRarityCap(rarityLevel + 1)}</span>
                  </button>
                </div>
                <button className="btn sm primary" style={{ width: '100%', marginTop: 8 }} disabled={room <= 0} onClick={() => setAssignTo(h.id)}>+ Add monster ({room} free)</button>
              </div>
            </Panel>
          );
        })}
      </div>

      {buying && (
        <Modal title="Buy habitats" onClose={() => setBuying(null)} wide>
          <div className="row" style={{ gap: 8, marginBottom: 14 }}>
            {(['mono', 'multi'] as BuyTab[]).map((tab) => <button key={tab} className={`btn ${buying === tab ? 'primary' : 'ghost'}`} onClick={() => setBuying(tab)}>{tab === 'mono' ? `Monotype · ⛁ ${fmt(monoCost)}` : `Multitype · ⛁ ${fmt(multiCost)}`}</button>)}
          </div>
          <div className="small muted" style={{ marginBottom: 12 }}>{buying === 'mono' ? 'Monotype habitats accept one type and are the affordable early expansion.' : 'Multitype habitats accept several preferred types and are intentionally very expensive.'}</div>
          <div className="grid g3">
            {(buying === 'mono' ? MONO_HABITATS : MULTI_HABITATS).map((def) => {
              const ownedCount = state.habitats.filter((h) => h.defId === def.id).length;
              const cost = nextHabitatCost(def.cls, buying === 'mono' ? monoOwned : multiOwned);
              return <div key={def.id} className="panel" style={{ padding: 13, borderColor: ownedCount ? `${def.accent}66` : undefined }}>
                <div className="row" style={{ gap: 9 }}><div className="hab-icon" style={{ background: `${def.accent}22`, borderColor: `${def.accent}66` }}>{def.cls === 'multi' ? '🏛️' : '🏡'}</div><div><div style={{ fontWeight: 700 }}>{def.name}</div><div className="tiny dim">{def.types.length} types · {ownedCount ? `own ${ownedCount}` : 'new'}</div></div></div>
                <div className="row" style={{ gap: 4, margin: '9px 0' }}>{def.types.map((t) => <TypeTag key={t} type={t} />)}</div>
                <div className="small muted" style={{ minHeight: 32 }}>{def.blurb}</div>
                <button className="btn sm" style={{ marginTop: 9, width: '100%' }} disabled={state.coins < cost} onClick={() => dispatch({ type: 'BUY_HABITAT', defId: def.id })}>Build · ⛁ {fmt(cost)}</button>
              </div>;
            })}
          </div>
        </Modal>
      )}

      {assignTo && assignDef && assignHab && (
        <Modal title={`Move a monster into ${assignDef.name}`} onClose={() => setAssignTo(null)} wide>
          <div className="small muted" style={{ marginBottom: 12 }}>{free} free slot{free === 1 ? '' : 's'} · local types are {assignDef.types.join(', ')} · rarity up to <b>{habitatRarityCap(rarityLevel)}</b>{blockedByRarity ? ` · ${blockedByRarity} matching monster(s) need a rarity upgrade` : ''}.</div>
          {eligible.length === 0 ? <div className="stack" style={{ gap: 8 }}>
            <div className="muted">No eligible monsters in storage.</div>
            {blockedByRarity > 0 && <div className="small"><b style={{ color: 'var(--gold)' }}>{blockedByRarity} match a local type but are too rare.</b> Upgrade rarity, not capacity, to house them.</div>}
            {inTeam.length > 0 && <div className="small"><b style={{ color: 'var(--gold)' }}>{inTeam.length} are on the battle team.</b> <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{inTeam.slice(0, 12).map((m) => <button key={m.uid} className="btn xs" onClick={() => dispatch({ type: 'TOGGLE_TEAM_MEMBER', uid: m.uid })}>⚔️ {entry(m.species).name} · take off team</button>)}</div></div>}
            {wrongType.length > 0 && <div className="small dim">{wrongType.length} more in storage are not a preferred type for this habitat, but route-style housing can still be used in another habitat.</div>}
          </div> : <div className="grid g4">{eligible.map((m) => <MonCard key={m.uid} mon={m} state={state} compact footer={<button className="btn xs good" style={{ width: '100%' }} onClick={() => { dispatch({ type: 'ASSIGN_MON', uid: m.uid, habitatId: assignTo }); setAssignTo(null); }}>Move in</button>} />)}</div>}
        </Modal>
      )}
    </div>
  );
}
