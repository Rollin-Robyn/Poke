import React, { useMemo, useState } from 'react';
import { useGame } from '../store';
import { Bar, ItemSprite, Modal, MonCard, Panel, RarityTag, Sprite, TypeTag } from '../components';
import {
  DEX, HABITAT_BY_ID, ITEMS, ITEM_BY_ID, RARITIES, entry, fmt, fmtTime, happinessTier,
  monOutputWithHabitat, natureBlurb, storageCap,
} from './shared';
import { EGG_HATCH_LEVEL } from '../../game/content';
import type { Mon } from '../../game/state';

const SORTS: { id: 'level' | 'output' | 'rarity' | 'dex' | 'recent'; label: string }[] = [
  { id: 'level', label: 'Level' },
  { id: 'output', label: 'Output' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'dex', label: 'Dex no.' },
  { id: 'recent', label: 'Recent' },
];

export function Roster() {
  const { state, dispatch } = useGame();
  const [detail, setDetail] = useState<string | null>(null);
  const [itemPick, setItemPick] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const PER_PAGE = 48;

  const sorted = useMemo(() => {
    const list = [...state.mons];
    const rar = (m: Mon) => RARITIES.indexOf(entry(m.species).rarity);
    switch (state.options.sort) {
      case 'output': return list.sort((a, b) => monOutputWithHabitat(state, b) - monOutputWithHabitat(state, a));
      case 'rarity': return list.sort((a, b) => rar(b) - rar(a) || b.level - a.level);
      case 'dex': return list.sort((a, b) => DEX[a.species].num - DEX[b.species].num);
      case 'recent': return list.reverse();
      default: return list.sort((a, b) => b.level - a.level);
    }
  }, [state]);

  const shown = sorted.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const mon = detail ? state.mons.find((m) => m.uid === detail) : null;
  const heldItems = Object.entries(state.itemBag).filter(([id, q]) => q > 0 && (ITEM_BY_ID[id]?.kind === 'held'));

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title={`My monsters — ${state.mons.length} / ${storageCap(state)}`}
        right={
          <div className="row" style={{ gap: 6 }}>
            <span className="tiny muted">Sort</span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                className={`btn xs ${state.options.sort === s.id ? 'primary' : 'ghost'}`}
                onClick={() => dispatch({ type: 'SET_OPTION', key: 'sort', value: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="row small muted" style={{ gap: 16 }}>
          <span>🏡 {state.mons.filter((m) => m.habitatId).length} housed</span>
          <span>📦 {state.mons.filter((m) => !m.habitatId).length} in storage</span>
          <span>😴 {state.mons.filter((m) => m.energy <= 0).length} asleep</span>
          <span>✨ {state.mons.filter((m) => m.shiny).length} shiny</span>
        </div>
      </Panel>

      <div className="grid g4">
        {shown.map((m) => (
          <MonCard
            key={m.uid}
            mon={m}
            state={state}
            footer={
              <>
                <button className="btn xs" style={{ flex: 1 }} onClick={() => setDetail(m.uid)}>Details</button>
                {m.habitatId && (
                  <button className="btn xs ghost" onClick={() => dispatch({ type: 'ASSIGN_MON', uid: m.uid, habitatId: null })}>
                    Move out
                  </button>
                )}
              </>
            }
          />
        ))}
      </div>

      {pages > 1 && (
        <div className="row center" style={{ justifyContent: 'center', gap: 8 }}>
          <button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="small muted">Page {page + 1} / {pages}</span>
          <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {mon && (
        <Modal title={`${entry(mon.species).name}${mon.shiny ? ' ✨' : ''}`} onClose={() => setDetail(null)} wide>
          <div className="grid g2">
            <div className="stack">
              <div
                className="panel center"
                style={{ padding: 16, background: 'rgba(0,0,0,.25)' }}
              >
                <Sprite species={mon.species} form={mon.form} shiny={mon.shiny} size="xl" className="sprite-battle" />
                <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
                  {entry(mon.species).types.map((t) => <TypeTag key={t} type={t} />)}
                  <RarityTag rarity={entry(mon.species).rarity} />
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  Dex #{String(DEX[mon.species].num).padStart(3, '0')} · {entry(mon.species).heightm}m ·{' '}
                  {entry(mon.species).weightkg}kg · {mon.gender === 'M' ? '♂ male' : mon.gender === 'F' ? '♀ female' : '⚲ genderless'}
                </div>
              </div>
              <Panel title="Held item">
                {mon.heldItem ? (
                  <div className="row between">
                    <div className="row" style={{ gap: 8 }}>
                      <ItemSprite slug={mon.heldItem} size={24} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{ITEM_BY_ID[mon.heldItem]?.name}</div>
                        <div className="tiny dim">{ITEM_BY_ID[mon.heldItem]?.blurb}</div>
                      </div>
                    </div>
                    <button className="btn sm" onClick={() => dispatch({ type: 'EQUIP_ITEM', uid: mon.uid, itemId: null })}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="stack">
                    <div className="muted small">No held item.</div>
                    <div className="row" style={{ gap: 6 }}>
                      {heldItems.length === 0 && <span className="tiny dim">No held items in the bag.</span>}
                      {heldItems.map(([id, qty]) => (
                        <button
                          key={id}
                          className="btn sm"
                          title={ITEM_BY_ID[id]?.blurb}
                          onClick={() => dispatch({ type: 'EQUIP_ITEM', uid: mon.uid, itemId: id })}
                        >
                          <ItemSprite slug={id} size={16} /> {ITEM_BY_ID[id]?.name} ({qty})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            <div className="stack">
              <Panel title="Performance">
                <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
                  <div>
                    <div className="tiny muted">OUTPUT</div>
                    <div className="big" style={{ fontSize: 20 }}>{fmt(monOutputWithHabitat(state, mon))}/min</div>
                  </div>
                  <div>
                    <div className="tiny muted">LEVEL</div>
                    <div className="big" style={{ fontSize: 20 }}>{mon.level}</div>
                  </div>
                  <div>
                    <div className="tiny muted">IV</div>
                    <div className="big" style={{ fontSize: 20 }}>{mon.iv}/31</div>
                  </div>
                </div>
                <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                  <div className="row between small">
                    <span className="muted">Happiness — {happinessTier(mon.happiness)}</span>
                    <span className="mono">{Math.floor(mon.happiness)}/100</span>
                  </div>
                  <Bar value={mon.happiness} max={100} tone="linear-gradient(90deg,#ff9ecb,#f06292)" />
                  <div className="row between small" style={{ marginTop: 6 }}>
                    <span className="muted">Awake time left</span>
                    <span className="mono">{mon.energy <= 0 ? 'asleep 😴' : fmtTime(mon.energy)}</span>
                  </div>
                  <Bar value={mon.energy} max={4 * 3600} tone={mon.energy <= 0 ? '#555' : 'linear-gradient(90deg,#f7d066,#e0a52c)'} />
                </div>
              </Panel>

              <Panel title="Details">
                <div className="stack small">
                  <div className="row between"><span className="muted">Nature</span><span>{mon.nature} · {natureBlurb(mon.nature)}</span></div>
                  <div className="row between"><span className="muted">Habitat</span><span>{mon.habitatId ? HABITAT_BY_ID[mon.habitatId].name : 'Storage'}</span></div>
                  <div className="row between"><span className="muted">Sleeps after</span><span>{fmtTime(mon.energy)}</span></div>
                  <div className="row between"><span className="muted">Breeding</span>
                    <span>{mon.breedReadyAt && mon.breedReadyAt > Date.now() ? `resting ${fmtTime((mon.breedReadyAt - Date.now()) / 1000)}` : 'ready'}</span>
                  </div>
                  <div className="row between"><span className="muted">Egg groups</span><span>{entry(mon.species).eggGroups.join(', ')}</span></div>
                </div>
              </Panel>

              <Panel title="Actions">
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="btn sm"
                    disabled={!mon.habitatId}
                    onClick={() => dispatch({ type: 'ASSIGN_MON', uid: mon.uid, habitatId: null })}
                  >
                    Move to storage
                  </button>
                  <button className="btn sm ghost" onClick={() => setItemPick(mon.uid)}>
                    Use an item
                  </button>
                  {entry(mon.species).evoTo?.length ? (
                    <button className="btn sm good" onClick={() => dispatch({ type: 'EVOLVE', uid: mon.uid })} title={entry(mon.species).evoTo![0].method}>
                      Evolve → {entry(entry(mon.species).evoTo![0].id).name}
                    </button>
                  ) : (
                    <span className="tiny dim" style={{ alignSelf: 'center' }}>Final evolution</span>
                  )}
                  <button
                    className="btn sm danger"
                    disabled={state.mons.length <= 1}
                    onClick={() => {
                      dispatch({ type: 'RELEASE', uid: mon.uid });
                      setDetail(null);
                    }}
                  >
                    Release
                  </button>
                </div>
                {entry(mon.species).evoTo?.length ? (
                  <div className="tiny dim" style={{ marginTop: 6 }}>
                    Evolution requirement: {entry(mon.species).evoTo![0].method}
                  </div>
                ) : null}
              </Panel>
            </div>
          </div>
        </Modal>
      )}

      {itemPick && (
        <Modal title="Use an item" onClose={() => setItemPick(null)}>
          <div className="stack">
            {ITEMS.filter((i) => (state.itemBag[i.id] ?? 0) > 0 && (i.kind === 'berry' || i.kind === 'boost')).map((i) => (
              <button
                key={i.id}
                className="btn"
                style={{ display: 'flex', justifyContent: 'space-between' }}
                onClick={() => {
                  dispatch({ type: 'USE_ITEM', itemId: i.id, uid: itemPick, });
                  setItemPick(null);
                }}
              >
                <span className="row" style={{ gap: 8 }}>
                  <ItemSprite slug={i.id} size={20} /> {i.name} ×{state.itemBag[i.id]}
                </span>
                <span className="tiny muted">{i.blurb}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
