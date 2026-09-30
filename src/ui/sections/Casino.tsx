import React, { useState } from 'react';
import { useGame } from '../store';
import { ItemSprite, Panel } from '../components';
import { TYPE_COLORS, TYPE_GLYPH, TYPES } from '../../game/typechart';
import { CASINO_GAMES, SLOT_SYMBOLS, fmt, highLowOdds } from './shared';
import type { CasinoGameId } from '../../game/actions';

type Currency = 'coins' | 'diamonds';

const CARD_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function Casino() {
  const { state, dispatch } = useGame();
  const [currency, setCurrency] = useState<Currency>('coins');
  const [bet, setBet] = useState(1000);
  const [choice, setChoice] = useState('heads');
  const [rouletteMode, setRouletteMode] = useState<'colour' | 'parity' | 'type'>('colour');
  const result = state.casinoResult;

  const balance = currency === 'coins' ? state.coins : state.diamonds;
  const symbol = currency === 'coins' ? '⛁' : '💎';
  // the stake is clamped to what the player actually has, but never forced to
  // "all in" - it is only a ceiling
  const stake = Math.max(0, Math.min(Math.floor(bet), Math.floor(balance)));

  const stakeInput = (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button className="btn sm" onClick={() => setBet((v) => Math.max(1, Math.floor(v / 2)))}>½</button>
      <button className="btn sm" onClick={() => setBet((v) => Math.max(1, Math.floor(v * 2)))}>×2</button>
      <input
        type="number"
        min={1}
        value={Math.floor(bet)}
        onChange={(e) => setBet(Math.max(0, Number(e.target.value)))}
        style={{ width: 130 }}
      />
      <span className="small muted">stake {symbol} {fmt(stake)}</span>
      {[1000, 10_000, 100_000].map((v) => (
        <button key={v} className={`btn xs ${bet === v ? 'primary' : 'ghost'}`} onClick={() => setBet(v)}>
          {fmt(v)}
        </button>
      ))}
      <button className="btn xs ghost" onClick={() => setBet(Math.floor(balance / 4))} title="A quarter of your balance">
        ¼ balance
      </button>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title="Casino"
        right={
          <div className="row" style={{ gap: 14 }}>
            <span className="small muted">
              coin result:{' '}
              <b style={{ color: state.stats.casinoNet >= 0 ? 'var(--good)' : 'var(--danger)' }}>
                {state.stats.casinoNet >= 0 ? '+' : ''}{fmt(state.stats.casinoNet)} ⛁
              </b>
            </span>
            <span className="small muted">
              diamonds won: <b style={{ color: 'var(--diamond)' }}>{fmt(state.stats.diamondsWon)} 💎</b>
            </span>
          </div>
        }
      >
        <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="small muted">Gamble with</span>
            {(['coins', 'diamonds'] as Currency[]).map((c) => (
              <button
                key={c}
                className={`btn sm ${currency === c ? 'primary' : 'ghost'}`}
                onClick={() => {
                  setCurrency(c);
                  setBet(c === 'coins' ? 1000 : 1);
                }}
              >
                {c === 'coins' ? `⛁ coins (${fmt(state.coins)})` : `💎 diamonds (${state.diamonds})`}
              </button>
            ))}
          </div>
          {stakeInput}
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>
          Every table keeps a small house edge. Diamond tables pay out in diamonds — mostly a way to turn spare coins
          into a few diamonds, and to gamble them back.
        </div>
      </Panel>

      <div className="grid g3">
        {CASINO_GAMES.map((game) => (
          <Panel key={game.id} title={`${game.icon} ${game.name}`}>
            <div className="small muted" style={{ minHeight: 52 }}>{game.blurb}</div>
            <GameBody
              game={game.id}
              currency={currency}
              stake={stake}
              symbol={symbol}
              choice={choice}
              setChoice={setChoice}
              rouletteMode={rouletteMode}
              setRouletteMode={setRouletteMode}
              result={result?.game === game.id ? result : null}
              dispatch={dispatch}
            />
          </Panel>
        ))}
      </div>

      {result && (
        <Panel
          title="Last round"
          right={<button className="btn xs ghost" onClick={() => dispatch({ type: 'CLEAR_CASINO' })}>clear</button>}
        >
          <div className="row between">
            <div>
              <div
                style={{
                  fontWeight: 700,
                  color: result.payout > result.bet ? 'var(--good)'
                    : result.payout === result.bet ? 'var(--muted)' : 'var(--danger)',
                }}
              >
                {result.label}
              </div>
              <div className="small muted">{result.detail}</div>
            </div>
            <div className="center">
              <div className="tiny muted">PAYOUT</div>
              <div
                className="mono big"
                style={{ fontSize: 20, color: result.payout > result.bet ? 'var(--good)' : 'var(--danger)' }}
              >
                {result.payout > result.bet ? '+' : ''}
                {fmt(result.payout - result.bet)} {result.currency === 'coins' ? '⛁' : '💎'}
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

interface GameBodyProps {
  game: CasinoGameId;
  currency: Currency;
  stake: number;
  symbol: string;
  choice: string;
  setChoice: (v: string) => void;
  rouletteMode: 'colour' | 'parity' | 'type';
  setRouletteMode: (v: 'colour' | 'parity' | 'type') => void;
  result: {
    detail: string;
    label: string;
    payout: number;
    cards?: { current: number; next: number; push: boolean };
  } | null;
  dispatch: ReturnType<typeof useGame>['dispatch'];
}

function GameBody({
  game, currency, stake, symbol, choice, setChoice, rouletteMode, setRouletteMode, result, dispatch,
}: GameBodyProps) {
  const disabled = stake <= 0;
  const bet = (extra: Record<string, unknown> = {}) =>
    dispatch({ type: 'CASINO', game, bet: stake, currency, choice, ...extra } as never);

  if (game === 'slots') {
    const reels = result?.detail?.split(' · ') ?? ['poke', 'poke', 'poke'];
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          {reels.map((sym, i) => {
            const s = SLOT_SYMBOLS.find((x) => x.id === sym) ?? SLOT_SYMBOLS[0];
            return (
              <div key={i} className="slot filled" style={{ width: 56, height: 56, cursor: 'default' }}>
                <ItemSprite slug={s.sprite} size={32} />
              </div>
            );
          })}
        </div>
        <div className="row" style={{ gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
          {SLOT_SYMBOLS.map((s) => (
            <span key={s.id} className="tag tiny" title={`×${s.payout} on three`}>
              <ItemSprite slug={s.sprite} size={13} /> {s.payout}×
            </span>
          ))}
        </div>
        <button className="btn primary" disabled={disabled} onClick={() => bet()}>
          Spin · {symbol} {fmt(stake)}
        </button>
      </div>
    );
  }

  if (game === 'coinflip') {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          {['heads', 'tails'].map((side) => (
            <button key={side} className={`btn ${choice === side ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setChoice(side)}>
              🪙 {side}
            </button>
          ))}
        </div>
        <button className="btn primary" disabled={disabled} onClick={() => bet()}>
          Flip · {symbol} {fmt(stake)}
        </button>
        <div className="tiny dim center">Pays 1.92× on a win.</div>
      </div>
    );
  }

  if (game === 'dice') {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
          {(result?.detail?.split(' · ') ?? ['You –', 'House –']).map((line, i) => (
            <span key={i} className="tag mono">{line}</span>
          ))}
        </div>
        <button className="btn primary" disabled={disabled} onClick={() => bet()}>
          Roll · {symbol} {fmt(stake)}
        </button>
        <div className="tiny dim center">Higher total wins 1.85×; ties return the stake.</div>
      </div>
    );
  }

  if (game === 'roulette') {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 5 }}>
          {(['colour', 'parity', 'type'] as const).map((mode) => (
            <button key={mode} className={`btn xs ${rouletteMode === mode ? 'primary' : 'ghost'}`} onClick={() => setRouletteMode(mode)}>
              {mode}
            </button>
          ))}
        </div>
        {rouletteMode === 'colour' && (
          <div className="row" style={{ gap: 6 }}>
            {(['warm', 'cool'] as const).map((c) => (
              <button key={c} className={`btn sm ${choice === c ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setChoice(c)}>
                {c === 'warm' ? '🔥 warm (1.9×)' : '❄ cool (1.9×)'}
              </button>
            ))}
          </div>
        )}
        {rouletteMode === 'parity' && (
          <div className="row" style={{ gap: 6 }}>
            {(['even', 'odd'] as const).map((p) => (
              <button key={p} className={`btn sm ${choice === p ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setChoice(p)}>
                {p} (1.9×)
              </button>
            ))}
          </div>
        )}
        {rouletteMode === 'type' && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))', gap: 4 }}>
            {TYPES.map((t) => (
              <button
                key={t}
                className="btn xs"
                style={{
                  background: choice === t ? TYPE_COLORS[t] : 'rgba(255,255,255,.05)',
                  color: choice === t ? '#111' : undefined,
                  fontSize: 10,
                }}
                title={`${t} pays 17×`}
                onClick={() => setChoice(t)}
              >
                {TYPE_GLYPH[t]}
              </button>
            ))}
          </div>
        )}
        <button className="btn primary" disabled={disabled} onClick={() => bet()}>
          Spin · {symbol} {fmt(stake)}
        </button>
        {result && <div className="tiny center mono">{result.label}</div>}
      </div>
    );
  }

  if (game === 'highlow') {
    const cards = result?.cards;
    const current = cards ? cards.current : null;
    const odds = current === null ? null : highLowOdds(current);
    const shown = (i: number | null) => (i === null ? '?' : CARD_NAMES[i]);
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="row center" style={{ justifyContent: 'center', gap: 8 }}>
          <div className="slot filled" style={{ width: 56, height: 72, cursor: 'default', fontSize: 18, fontWeight: 800 }}>
            {shown(current)}
          </div>
          <span className="dim">→</span>
          <div className={`slot filled ${cards?.push ? 'selected' : ''}`} style={{ width: 56, height: 72, cursor: 'default', fontSize: 18, fontWeight: 800 }}>
            {cards ? shown(cards.next) : '?'}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {(['higher', 'lower'] as const).map((k) => {
            const mult = odds ? odds[k] : 1.9;
            const dead = odds ? mult === 0 : false;
            return (
              <button
                key={k}
                className={`btn sm ${choice === k ? 'primary' : 'ghost'}`}
                style={{ flex: 1, opacity: dead ? 0.4 : 1 }}
                disabled={dead}
                onClick={() => setChoice(k)}
              >
                {k === 'higher' ? '⬆ Higher' : '⬇ Lower'} · {dead ? '—' : `×${mult.toFixed(2)}`}
              </button>
            );
          })}
        </div>
        <button className="btn primary" disabled={disabled} onClick={() => bet()}>
          Draw · {symbol} {fmt(stake)}
        </button>
        <div className="tiny dim center">
          13 ranks, exact match is a push. Payouts follow the real odds, so a long shot pays far more than a safe call.
        </div>
      </div>
    );
  }

  // lucky boxes
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const selected = Number(choice) === i;
          return (
            <button
              key={i}
              className={`slot filled ${selected ? 'selected' : ''}`}
              style={{
                aspectRatio: '1/1', cursor: 'pointer', padding: 0,
                borderColor: selected ? 'var(--gold)' : undefined,
                boxShadow: selected ? '0 0 0 1px var(--gold)' : undefined,
              }}
              onClick={() => setChoice(String(i))}
              title={`Box ${i + 1}`}
            >
              🎁
            </button>
          );
        })}
      </div>
      <button className="btn primary" disabled={disabled} onClick={() => bet()}>
        Open box {Number(choice) + 1} · {symbol} {fmt(stake)}
      </button>
      {result && <div className="tiny center">{result.label}</div>}
    </div>
  );
}
