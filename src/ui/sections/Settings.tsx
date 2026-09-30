import React, { useState } from 'react';
import { useGame } from '../store';
import { Modal, Panel } from '../components';
import { decodeSaveText, toBase64 } from '../../game/save';
import { fmt, fmtTime } from '../../game/rng';

/**
 * Settings: the options that are easy to hide, plus save management.
 *
 * The reset here is a *real* reset: it wipes the localStorage key before the
 * fresh state is put in place, so a reload can never resurrect the old save.
 */
export function Settings() {
  const { state, dispatch, hardReset, applySave } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);
  const [dump, setDump] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const exportNow = () => {
    setDump(toBase64(JSON.stringify(state)));
    setCopied(false);
  };

  const copyDump = () => {
    try {
      void navigator.clipboard?.writeText(dump);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const doImport = () => {
    setImportError(null);
    try {
      const next = decodeSaveText(importText.trim());
      applySave(next);
    } catch (err) {
      setImportError(String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel title="Game options">
        <div className="stack" style={{ gap: 12 }}>
          <label className="row between" style={{ gap: 12, cursor: 'pointer' }}>
            <span>
              <b>Auto-assign monsters</b>
              <div className="tiny dim">Move newly hatched monsters into a free habitat slot automatically.</div>
            </span>
            <input
              type="checkbox"
              checked={state.options.autoAssign}
              onChange={(e) => dispatch({ type: 'SET_OPTION', key: 'autoAssign', value: e.target.checked })}
            />
          </label>

          <label className="row between" style={{ gap: 12, cursor: 'pointer' }}>
            <span>
              <b>Auto-catch weakened monsters</b>
              <div className="tiny dim">Throw a ball automatically once a wild monster is under 25% HP.</div>
            </span>
            <input
              type="checkbox"
              checked={state.options.autoCatch}
              onChange={(e) => dispatch({ type: 'SET_OPTION', key: 'autoCatch', value: e.target.checked })}
            />
          </label>

          <label className="row between" style={{ gap: 12, cursor: 'pointer' }}>
            <span>
              <b>Show back sprites</b>
              <div className="tiny dim">Use the back-view artwork in the Pokédex gallery.</div>
            </span>
            <input
              type="checkbox"
              checked={state.options.showBackSprites}
              onChange={(e) => dispatch({ type: 'SET_OPTION', key: 'showBackSprites', value: e.target.checked })}
            />
          </label>

          <div className="row between" style={{ gap: 12 }}>
            <span>
              <b>Default roster sort</b>
              <div className="tiny dim">How My Pokémon is ordered when you open it.</div>
            </span>
            <select
              value={state.options.sort}
              onChange={(e) => dispatch({ type: 'SET_OPTION', key: 'sort', value: e.target.value as never })}
            >
              {(['recent', 'level', 'output', 'rarity', 'dex'] as const).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      <Panel title="Save data">
        <div className="small muted" style={{ marginBottom: 12 }}>
          Playing for <b>{fmtTime(state.playtime)}</b> · {state.mons.length} monsters ·{' '}
          {state.dexCaught.length}/649 species · ⛁ {fmt(state.coins)} · 💎 {state.diamonds}
          <br />
          The game autosaves every 15 seconds to this browser. Export a copy before you reset if you might want it back.
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={exportNow}>
            Export save
          </button>
          {dump && (
            <button className="btn sm good" onClick={copyDump}>
              {copied ? 'Copied ✓' : 'Copy to clipboard'}
            </button>
          )}
        </div>
        {dump && (
          <textarea
            readOnly
            value={dump}
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: '100%', height: 90, marginTop: 10, fontFamily: 'monospace', fontSize: 11 }}
          />
        )}

        <div style={{ marginTop: 16 }}>
          <div className="small" style={{ marginBottom: 6 }}>
            <b>Import a save</b>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste an exported save here…"
            style={{ width: '100%', height: 70, fontFamily: 'monospace', fontSize: 11 }}
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn sm" disabled={!importText.trim()} onClick={doImport}>
              Load this save
            </button>
            {importError && <span className="small" style={{ color: 'var(--danger)' }}>{importError}</span>}
          </div>
        </div>
      </Panel>

      <Panel title="Danger zone">
        <div className="small muted" style={{ marginBottom: 12 }}>
          Starting over wipes coins, monsters, habitats, eggs, items, upgrades, achievements and the Pokédex. The save
          in this browser is deleted first, so nothing comes back on reload.
        </div>
        <button className="btn danger" onClick={() => setConfirmReset(true)}>
          Reset save data
        </button>
      </Panel>

      {confirmReset && (
        <Modal title="Reset save data?" onClose={() => setConfirmReset(false)}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="small muted">
              This deletes your reserve permanently — {state.mons.length} monsters, {state.habitats.length} habitats and{' '}
              {state.dexCaught.length} registered species. You will start again by choosing a starter.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn danger"
                onClick={() => {
                  setConfirmReset(false);
                  hardReset();
                }}
              >
                Yes, wipe everything
              </button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
