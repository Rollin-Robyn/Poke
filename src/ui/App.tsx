import React, { useEffect, useState } from 'react';
import { useGame } from './store';
import { Modal, Sprite } from './components';
import { Dashboard } from './sections/Dashboard';
import { Habitats } from './sections/Habitats';
import { Eggs } from './sections/Eggs';
import { Roster } from './sections/Roster';
import { Pokedex } from './sections/Pokedex';
import { Gallery } from './sections/Gallery';
import { Breeding } from './sections/Breeding';
import { Battle } from './sections/Battle';
import { Events } from './sections/Events';
import { Casino } from './sections/Casino';
import { Resort } from './sections/Resort';
import { Settings } from './sections/Settings';
import { currentEvent, entry, fmt, fmtTime, productionPerMinute } from './sections/shared';

const TABS: { id: string; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'habitats', label: 'My Habitats', icon: '🏡' },
  { id: 'eggs', label: 'Eggs', icon: '🥚' },
  { id: 'roster', label: 'My Pokémon', icon: '🐾' },
  { id: 'dex', label: 'Pokédex', icon: '📖' },
  { id: 'gallery', label: 'Gallery', icon: '🖼️' },
  { id: 'breeding', label: 'Breeding', icon: '💞' },
  { id: 'battle', label: 'Battle', icon: '⚔️' },
  { id: 'events', label: 'Events', icon: '🎉' },
  { id: 'casino', label: 'Casino', icon: '🎰' },
  { id: 'resort', label: 'Resort', icon: '🏗️' },
];

const STARTERS = ['bulbasaur', 'charmander', 'squirtle'];

export function App() {
  const { state, dispatch, offline, dismissOffline } = useGame();
  const [tab, setTab] = useState('dashboard');
  const [settings, setSettings] = useState(false);
  const event = currentEvent();

  // auto-assign newly hatched monsters if the player enabled it
  useEffect(() => {
    if (state.options.autoAssign) dispatch({ type: 'AUTO_ASSIGN' });
  }, [state.mons.length, state.habitats.length, state.options.autoAssign, dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'Escape') {
        setSettings(false);
        return;
      }
      if (e.key < '1' || e.key > '9') return;
      const idx = Number(e.key) - 1;
      if (TABS[idx]) setTab(TABS[idx].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ppm = productionPerMinute(state);
  const eggsReady = state.hatches.filter((h) => h.remaining < 30).length;
  const canAffordAnything = state.coins > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="ball" />
          <span>
            Pocket Tycoon
            <small>a monster reserve incremental</small>
          </span>
        </div>

        <div className="rate-chip">
          <span>⛁ <b>{fmt(ppm * 60)}</b>/hr</span>
          <span>📈 <b>{fmt(ppm * 1440)}</b>/day</span>
          <span>⏱ <b>{fmtTime(state.playtime)}</b></span>
        </div>

        <div className="currencies">
          <div className="cur gold">
            <span className="ico">⛁</span>
            <span className="val">{fmt(state.coins)}</span>
          </div>
          <div className="cur diamond" title="Diamonds — from achievements and events">
            <span className="ico">💎</span>
            <span className="val">{state.diamonds}</span>
          </div>
          <div className="cur reb" title="Rebirth coins — permanent multipliers">
            <span className="ico">🌀</span>
            <span className="val">{state.rebirthCoins}</span>
          </div>
          <div className="cur token" title={`${event.season} event tokens`}>
            <span className="ico">🎟</span>
            <span className="val">{fmt(state.eventTokens)}</span>
          </div>
          <button
            className="cur gear"
            title="Settings, save data and reset"
            onClick={() => setSettings(true)}
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      <nav className="nav">
        {TABS.map((t, i) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} title={`Shortcut: ${i + 1}`}>
            <span>{t.icon}</span>
            {t.label}
            {t.id === 'eggs' && eggsReady > 0 && <span className="badge">{eggsReady}</span>}
            {t.id === 'events' && state.eventTokens >= 25 && <span className="badge">!</span>}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'dashboard' && <Dashboard go={setTab} />}
        {tab === 'habitats' && <Habitats />}
        {tab === 'eggs' && <Eggs />}
        {tab === 'roster' && <Roster />}
        {tab === 'dex' && <Pokedex />}
        {tab === 'gallery' && <Gallery />}
        {tab === 'breeding' && <Breeding />}
        {tab === 'battle' && <Battle />}
        {tab === 'events' && <Events />}
        {tab === 'casino' && <Casino />}
        {tab === 'resort' && <Resort />}

        {!canAffordAnything && state.mons.length === 0 && (
          <div className="muted small" style={{ marginTop: 20 }}>Loading reserve…</div>
        )}
      </main>

      {settings && (
        <Modal title="Settings" onClose={() => setSettings(false)} wide>
          <Settings />
        </Modal>
      )}

      {!state.started && !settings && (
        <StarterPicker
          onPick={(species) => dispatch({ type: 'CHOOSE_STARTER', species })}
          onSettings={() => setSettings(true)}
        />
      )}

      {offline && (
        <Modal title="Welcome back" onClose={dismissOffline}>
          <div className="stack">
            <div className="small muted">
              Your reserve kept working for <b>{fmtTime(offline.seconds)}</b> (capped at 12h).
            </div>
            <div className="row" style={{ gap: 22 }}>
              <div>
                <div className="tiny muted">PENDING IN HABITATS</div>
                <div className="big" style={{ fontSize: 22, color: 'var(--gold)' }}>⛁ {fmt(offline.coins)}</div>
              </div>
            </div>
            <div className="tiny dim">This cash has not entered your balance. Collect it from the habitat cards on Dashboard or My Habitats.</div>
            <button className="btn primary" onClick={() => { setTab('dashboard'); dismissOffline(); }}>Review habitat cash</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StarterPicker({ onPick, onSettings }: { onPick: (species: string) => void; onSettings: () => void }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <Modal title="Choose your first partner" onClose={() => {}} wide>
      <div className="small muted" style={{ marginBottom: 14 }}>
        This is your only monster to begin with — you get the starter you pick, in a habitat that suits it. Habitats
        earn coins, coins buy eggs, and eggs grow the reserve.
      </div>
      <div className="grid g3">
        {STARTERS.map((id) => (
          <div
            key={id}
            className="starter-card"
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick(id)}
          >
            <Sprite species={id} size="xl" className={hover === id ? 'sprite-battle' : ''} />
            <div style={{ fontWeight: 800, marginTop: 8 }}>{entry(id).name}</div>
            <div className="row" style={{ gap: 4, justifyContent: 'center', marginTop: 6 }}>
              {entry(id).types.map((t) => (
                <span key={t} className="tag type" style={{ background: 'rgba(255,255,255,.1)' }}>{t}</span>
              ))}
            </div>
            <div className="tiny dim" style={{ marginTop: 8 }}>
              Evolves at Lv.16 and again much later — a full three-stage line.
            </div>
          </div>
        ))}
      </div>
      <div className="row between" style={{ marginTop: 14, gap: 10 }}>
        <span className="tiny dim">
          Tip: keys 1–9 switch tabs, battles are played by hand, and the game saves itself every 15 seconds.
        </span>
        <button className="btn xs ghost" onClick={onSettings} title="Restore or reset the save in this browser">
          ⚙️ Old save giving you trouble? Reset it
        </button>
      </div>
    </Modal>
  );
}
