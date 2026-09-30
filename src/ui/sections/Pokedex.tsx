import React, { useMemo, useState } from 'react';
import { useGame } from '../store';
import { Modal, Panel, RarityTag, Sprite, TypeTag } from '../components';
import { DEX, DEX_IDS, RARITIES, entry, fmt, learnsetOf, spriteUrl, statsAt } from './shared';
import { NATURES } from '../../game/natures';

type Filter = 'all' | 'caught' | 'seen' | 'missing' | 'shiny';

export function Pokedex() {
  const { state } = useGame();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const caught = new Set(state.dexCaught);
  const seen = new Set(state.dexSeen);

  const list = useMemo(() => {
    return DEX_IDS.filter((id) => {
      if (query && !DEX[id].name.toLowerCase().includes(query.toLowerCase())) return false;
      if (filter === 'caught') return caught.has(id);
      if (filter === 'seen') return seen.has(id) && !caught.has(id);
      if (filter === 'missing') return !caught.has(id);
      return true;
    });
  }, [query, filter, state.dexCaught, state.dexSeen]);

  const e = open ? DEX[open] : null;
  const owned = open ? state.mons.filter((m) => m.species === open) : [];
  const formsForSpecies = open ? state.formsUnlocked.filter((f) => f.startsWith(`${open}:`)) : [];

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title={`Pokédex — ${caught.size} / ${DEX_IDS.length} caught`}
        right={
          <div className="row" style={{ gap: 6 }}>
            {(['all', 'caught', 'seen', 'missing'] as Filter[]).map((f) => (
              <button key={f} className={`btn xs ${filter === f ? 'primary' : 'ghost'}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        }
      >
        <div className="row between">
          <div className="row" style={{ gap: 14 }}>
            <span className="small muted">👁 seen {seen.size}</span>
            <span className="small muted">✅ caught {caught.size}</span>
            <span className="small muted">✨ shiny registered {state.dexShiny.length}</span>
            <span className="small muted">🎭 forms {state.formsUnlocked.length}</span>
          </div>
          <input
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            style={{ width: 200 }}
          />
        </div>
      </Panel>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
        {list.map((id) => {
          const isCaught = caught.has(id);
          const isSeen = seen.has(id);
          return (
            <div
              key={id}
              className={`dex-cell ${!isCaught && !isSeen ? 'unknown' : ''}`}
              onClick={() => (isCaught || isSeen) && setOpen(id)}
              title={isCaught || isSeen ? DEX[id].name : '???'}
            >
              <span className="num">#{String(DEX[id].num).padStart(3, '0')}</span>
              {isCaught ? (
                <>
                  <Sprite species={id} size="md" />
                  <span className="state">✅</span>
                </>
              ) : isSeen ? (
                <>
                  <Sprite species={id} size="md" className="dimmed" />
                  <span className="state">👁</span>
                </>
              ) : (
                <span className="q">?</span>
              )}
            </div>
          );
        })}
      </div>

      {e && (
        <Modal title={`#${String(e.num).padStart(3, '0')} ${e.name}`} onClose={() => setOpen(null)} wide>
          <div className="grid g2">
            <div className="panel center" style={{ background: 'rgba(0,0,0,.25)' }}>
              <Sprite species={open!} size="xl" className="sprite-battle" />
              <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
                {e.types.map((t) => <TypeTag key={t} type={t} />)}
                <RarityTag rarity={e.rarity} />
              </div>
              <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 10 }}>
                <Sprite species={open!} size="sm" shiny />
                <Sprite species={open!} size="sm" back />
                {e.hasFemale && <Sprite species={open!} size="sm" female />}
              </div>
              <div className="tiny dim" style={{ marginTop: 6 }}>normal · shiny · back · female</div>
            </div>

            <div className="stack">
              <Panel title="Base stats">
                <div className="stack small">
                  {Object.entries(e.base).map(([k, v]) => (
                    <div key={k} className="row between">
                      <span className="muted" style={{ width: 60 }}>{k.toUpperCase()}</span>
                      <div className="bar" style={{ flex: 1, maxWidth: 200 }}><i style={{ width: `${Math.min(100, (v / 180) * 100)}%`, background: 'linear-gradient(90deg,#67d4f5,#4a80d0)' }} /></div>
                      <span className="mono" style={{ width: 34, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
                  <div className="row between" style={{ marginTop: 4 }}>
                    <span className="muted">TOTAL</span>
                    <span className="mono"><b>{e.bst}</b></span>
                  </div>
                </div>
              </Panel>

              <Panel title="Data">
                <div className="stack small">
                  <div className="row between"><span className="muted">Stage</span><span>{e.stage === 0 ? 'Base' : e.stage === 1 ? 'Stage 1' : 'Stage 2'}</span></div>
                  <div className="row between"><span className="muted">Egg groups</span><span>{e.eggGroups.join(', ')}</span></div>
                  <div className="row between"><span className="muted">Gender</span><span>{e.gender.lock === 'N' ? 'Genderless' : e.gender.lock === 'M' ? 'Male only' : e.gender.lock === 'F' ? 'Female only' : `${(e.gender.M * 100).toFixed(0)}% ♂ / ${(e.gender.F * 100).toFixed(0)}% ♀`}</span></div>
                  <div className="row between"><span className="muted">Height / weight</span><span>{e.heightm}m · {e.weightkg}kg</span></div>
                  {e.evoTo?.length ? (
                    <div className="row between"><span className="muted">Evolves into</span><span>{e.evoTo.map((x) => `${DEX[x.id]?.name} (${x.method})`).join(', ')}</span></div>
                  ) : null}
                  {e.evoFrom ? (
                    <div className="row between"><span className="muted">Evolves from</span><span>{DEX[e.evoFrom]?.name}</span></div>
                  ) : null}
                  {e.tags?.length ? (
                    <div className="row between"><span className="muted">Tags</span><span>{e.tags.join(', ')}</span></div>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Moves by level">
                <div className="small muted" style={{ marginBottom: 8 }}>
                  A monster knows the four moves it learned most recently — older ones are forgotten.
                </div>
                <div className="stack small">
                  {learnsetOf(open!).map(({ move, level }) => (
                    <div key={move.id} className="row between">
                      <span className="row" style={{ gap: 8 }}>
                        <TypeTag type={move.type} />
                        {move.name}
                      </span>
                      <span className="dim mono">
                        Lv.{level} · {move.power} power
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              {owned.length > 0 && (
                <Panel title={`Your ${e.name} (${owned.length})`}>
                  <div className="stack small">
                    {owned.slice(0, 6).map((m) => (
                      <div key={m.uid} className="row between">
                        <span>Lv.{m.level} · {m.nature}{m.shiny ? ' ✨' : ''}</span>
                        <span className="dim">{m.habitatId ? 'housed' : 'storage'}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel title="Gallery">
                <div className="small muted" style={{ marginBottom: 10 }}>
                  Artwork frames live in their own screen. Catching this species opens its frame there; a shiny
                  catch opens the shiny frame as well.
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="tag">{caught.has(open!) ? '✅ frame open' : '🔒 frame locked'}</span>
                  <span className="tag" style={{ color: 'var(--gold)', borderColor: 'rgba(246,224,94,.45)' }}>
                    {state.dexShiny.includes(open!) ? '✨ shiny frame open' : '🔒 shiny frame locked'}
                  </span>
                </div>
              </Panel>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
