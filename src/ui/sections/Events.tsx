import React from 'react';
import { useGame } from '../store';
import { Panel, RarityTag, Sprite } from '../components';
import { DEX, EVENTS, RARITY_META, currentEvent, entry, fmt } from './shared';
import { EVENT_EGG_FORMS } from '../../game/content';

export function Events() {
  const { state, dispatch } = useGame();
  const active = currentEvent();

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title={active.name}
        right={<span className="tag" style={{ color: active.accent, borderColor: active.accent }}>{active.season}</span>}
      >
        <div className="row between">
          <div className="small muted" style={{ maxWidth: 640 }}>{active.blurb}</div>
          <div className="center">
            <div className="tiny muted">EVENT TOKENS</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--token)' }}>{fmt(state.eventTokens)}</div>
          </div>
        </div>
        <div className="grid g3" style={{ marginTop: 14 }}>
          {active.rewards.map((r, i) => {
            const key = `${active.id}:${r.species}:${r.form}`;
            const claimed = state.eventClaimed.includes(key);
            const canAfford = state.eventTokens >= r.cost;
            return (
              <div key={key} className="panel" style={{ padding: 13, borderColor: claimed ? 'var(--line)' : active.accent }}>
                <div className="center">
                  <Sprite species={r.species} form={r.form || null} size="lg" />
                </div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{r.label}</div>
                <div className="row" style={{ gap: 5, marginTop: 4 }}>
                  {DEX[r.species] && <RarityTag rarity={DEX[r.species].rarity} />}
                </div>
                <div className="tiny dim" style={{ marginTop: 5 }}>
                  {DEX[r.species]?.types.join(' / ')} · #{String(DEX[r.species]?.num ?? 0).padStart(3, '0')}
                </div>
                <button
                  className={`btn sm ${claimed ? '' : 'primary'}`}
                  style={{ marginTop: 10, width: '100%' }}
                  disabled={claimed || !canAfford}
                  onClick={() => dispatch({ type: 'CLAIM_EVENT', rewardIndex: i })}
                >
                  {claimed ? 'Claimed' : `Claim · ${r.cost} tokens`}
                </button>
              </div>
            );
          })}
        </div>
        <div className="tiny dim" style={{ marginTop: 12 }}>
          Event forms are unlocked permanently, survive rebirth, and can be shown off in the Pokédex gallery.
        </div>
      </Panel>

      <Panel title="How to earn tokens">
        <div className="small muted">
          Tokens drop from battles during the event season, so keep a team training while you build. The bonus on the
          active event is <b style={{ color: active.accent }}>×{active.bonus} habitat output</b> — an event is the best
          time to stockpile coins.
        </div>
      </Panel>

      <Panel title="Festival eggs — the only way to a legendary">
        <div className="small muted">
          Direct token rewards stop at <b>epic</b> rarity. <b>Legendary and mythical monsters</b> come out of festival
          eggs, which are bought with tokens or diamonds in the Eggs tab. On a high roll the egg also hands over a
          limited form — Kyurem White, Landorus Therian, Meloetta Pirouette, Shaymin Sky and friends.
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {EVENT_EGG_FORMS.map((f) => (
            <div key={f.label} className="center" title={`${f.label} · ${f.rarity}`}>
              <Sprite species={f.species} form={f.form} size="sm" />
              <div className="tiny dim" style={{ maxWidth: 84 }}>{entry(f.species).name}</div>
              <div className="tiny" style={{ color: RARITY_META[f.rarity].color }}>{f.rarity}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Event calendar">
        <div className="grid g2">
          {EVENTS.map((ev) => (
            <div
              key={ev.id}
              className="panel"
              style={{ padding: 13, borderColor: ev.id === active.id ? ev.accent : undefined, opacity: ev.id === active.id ? 1 : 0.72 }}
            >
              <div className="row between">
                <div>
                  <div style={{ fontWeight: 700, color: ev.accent }}>{ev.name}</div>
                  <div className="tiny dim">{ev.season} · ×{ev.bonus} output</div>
                </div>
                {ev.id === active.id && <span className="tag" style={{ color: ev.accent, borderColor: ev.accent }}>active now</span>}
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>{ev.blurb}</div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {ev.rewards.map((r) => (
                  <div key={r.label} className="center">
                    <Sprite species={r.species} form={r.form || null} size="sm" />
                    <div className="tiny dim" style={{ maxWidth: 74 }}>{entry(r.species).name}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
