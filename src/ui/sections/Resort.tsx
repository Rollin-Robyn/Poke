import React, { useState } from 'react';
import { useGame } from '../store';
import { Bar, Modal, Panel } from '../components';
import {
  ACHIEVEMENTS, DIAMOND_UPGRADES, ITEMS, ITEM_BY_ID, UPGRADES, canRebirth, diamondLevel, fmt,
  fmtTime, globalCoinMultiplier, rebirthGain, upgradeLevel,
} from './shared';

export function Resort() {
  const { state, dispatch, hardReset } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);
  const gain = rebirthGain(state);
  const nextAt = (() => {
    // lifetime earnings needed for one more rebirth coin
    const target = state.rebirthCoins + 1;
    return Math.pow(target, 1 / 0.55) * 1e6;
  })();

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid g2">
        <Panel title="Resort upgrades" right={<span className="tag">⛁ {fmt(state.coins)}</span>}>
          <div className="stack" style={{ gap: 9 }}>
            {UPGRADES.map((u) => {
              const lvl = upgradeLevel(state, u.id);
              const cost = u.cost(lvl);
              const maxed = lvl >= u.max;
              return (
                <div key={u.id} className="row between" style={{ gap: 10 }}>
                  <div className="row" style={{ gap: 10, flex: 1 }}>
                    <div className="hab-icon" style={{ background: 'rgba(255,255,255,.06)' }}>{u.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{u.name} <span className="dim tiny">Lv.{lvl}/{u.max}</span></div>
                      <div className="tiny dim">{u.blurb(lvl)}</div>
                    </div>
                  </div>
                  <button
                    className="btn sm"
                    disabled={maxed || state.coins < cost}
                    onClick={() => dispatch({ type: 'BUY_UPGRADE', id: u.id })}
                  >
                    {maxed ? 'Max' : `⛁ ${fmt(cost)}`}
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Diamond shop" right={<span className="tag" style={{ color: 'var(--diamond)' }}>💎 {state.diamonds}</span>}>
            <div className="stack" style={{ gap: 9 }}>
              {DIAMOND_UPGRADES.map((u) => {
                const lvl = diamondLevel(state, u.id);
                const maxed = lvl >= u.max;
                return (
                  <div key={u.id} className="row between" style={{ gap: 10 }}>
                    <div className="row" style={{ gap: 10, flex: 1 }}>
                      <div className="hab-icon" style={{ background: 'rgba(103,212,245,.12)' }}>{u.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{u.name} <span className="dim tiny">Lv.{lvl}/{u.max}</span></div>
                        <div className="tiny dim">{u.blurb(lvl)}</div>
                      </div>
                    </div>
                    <button
                      className="btn sm"
                      disabled={maxed || state.diamonds < u.cost}
                      onClick={() => dispatch({ type: 'BUY_DIAMOND_UPGRADE', id: u.id })}
                    >
                      {maxed ? 'Max' : `💎 ${u.cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Rebirth">
            <div className="row between">
              <div>
                <div className="tiny muted">REBIRTH COINS</div>
                <div className="big" style={{ color: '#c9a6ff' }}>{state.rebirthCoins}</div>
                <div className="small muted">+{state.rebirthCoins * 5}% permanent coins · {state.rebirths} rebirths</div>
              </div>
              <div className="center">
                <div className="tiny muted">ON REBIRTH</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: gain > 0 ? 'var(--good)' : 'var(--dim)' }}>
                  +{gain}
                </div>
              </div>
            </div>
            <Bar value={state.stats.coinsEarned} max={nextAt} tone="linear-gradient(90deg,#c9a6ff,#8a5cf0)" />
            <div className="tiny dim" style={{ marginTop: 6 }}>
              Lifetime earnings {fmt(state.stats.coinsEarned)} · next coin at {fmt(nextAt)}
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              Rebirth resets coins, monsters, habitats, upgrades and bags — you keep the Pokédex, achievements, gallery,
              event forms, diamonds and every rebirth coin.
            </div>
            <button
              className="btn primary"
              style={{ marginTop: 10, width: '100%' }}
              disabled={!canRebirth(state)}
              onClick={() => setConfirmReset(true)}
            >
              {canRebirth(state) ? `Rebirth for +${gain} coins` : 'Not enough lifetime earnings yet'}
            </button>
          </Panel>
        </div>
      </div>

      <Panel title="Bag" right={<span className="tag">{Object.values(state.itemBag).reduce((a, b) => a + b, 0)} items</span>}>
        {Object.keys(state.itemBag).length === 0 ? (
          <div className="muted small">Empty. Battles drop berries, stones and held items.</div>
        ) : (
          <div className="grid g3">
            {ITEMS.filter((i) => (state.itemBag[i.id] ?? 0) > 0).map((i) => (
              <div key={i.id} className="row between panel" style={{ padding: 10 }}>
                <div className="row" style={{ gap: 9 }}>
                  <img src={`sprites/items/flat/${i.sprite}.png`} alt="" style={{ width: 26, height: 26, imageRendering: 'pixelated' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{i.name} <span className="dim">×{state.itemBag[i.id]}</span></div>
                    <div className="tiny dim">{i.blurb}</div>
                  </div>
                </div>
                <button
                  className="btn xs"
                  onClick={() => dispatch({ type: 'SELL_ITEM', itemId: i.id, qty: 1 })}
                  title={`Sell one for ${i.value} coins`}
                >
                  Sell ⛁{fmt(i.value)}
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Achievements — ${state.achievements.length} / ${ACHIEVEMENTS.length}`}>
        <div className="grid g3">
          {ACHIEVEMENTS.map((a) => {
            const done = state.achievements.includes(a.id);
            return (
              <div
                key={a.id}
                className="row"
                style={{ gap: 10, padding: 10, borderRadius: 11, border: '1px solid var(--line)', opacity: done ? 1 : 0.55 }}
              >
                <div className="hab-icon" style={{ background: done ? 'rgba(125,220,148,.15)' : 'rgba(255,255,255,.05)' }}>
                  {a.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="tiny dim">{a.blurb}</div>
                </div>
                <span className="tag" style={{ color: 'var(--diamond)', borderColor: 'var(--diamond)' }}>
                  {done ? '✓' : `💎${a.diamonds}`}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Where the money comes from"
        right={<span className="tag">no output multipliers</span>}
      >
        <div className="small muted">
          Coins are earned by monsters actually living in habitats. There are no "+% coins" upgrades: what raises your
          income is <b>more monsters</b> (capacity upgrades and more habitats) and <b>rarer monsters</b> (better eggs,
          breeding, events). A habitat's capacity upgrades also raise the rarest tier it will accept.
          <br />
          Save management — export, import and a full reset — lives in the <b>⚙️ Settings</b> menu in the header.
        </div>
      </Panel>

      <Panel title="Danger zone">
        <div className="row between">
          <div className="small muted">
            Global multiplier right now: <b>{globalCoinMultiplier(state).toFixed(2)}×</b>. Export your save before
            wiping if you want a backup.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn sm"
              onClick={() => {
                const data = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
                navigator.clipboard?.writeText(data);
              }}
            >
              Copy save to clipboard
            </button>
            <button className="btn sm danger" onClick={() => setConfirmReset(true)}>Hard reset</button>
          </div>
        </div>
      </Panel>

      {confirmReset && (
        <Modal title="Are you sure?" onClose={() => setConfirmReset(false)}>
          <div className="stack">
            <div className="small muted">
              This is permanent. {gain > 0
                ? `You will gain ${gain} rebirth coin(s) and keep your Pokédex, achievements, gallery and diamonds.`
                : 'You have nothing to gain from a rebirth yet — this would simply wipe your progress.'}
            </div>
            <div className="row">
              {gain > 0 && (
                <button
                  className="btn primary"
                  onClick={() => {
                    dispatch({ type: 'REBIRTH' });
                    setConfirmReset(false);
                  }}
                >
                  Rebirth for +{gain}
                </button>
              )}
              <button
                className="btn danger"
                onClick={() => {
                  // wipes the stored save as well, so a reload cannot bring it back
                  hardReset();
                  setConfirmReset(false);
                }}
              >
                Wipe everything
              </button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
