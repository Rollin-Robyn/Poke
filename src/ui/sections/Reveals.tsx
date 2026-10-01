import React, { useEffect } from 'react';
import { useGame } from '../store';
import { Modal, MoveInfo, RarityTag, Sprite, TypeTag } from '../components';
import { GENDER_ICON } from '../../game/state';
import { MOVES, RARITY_META, eggSpriteUrl, entry, movesForMon } from './shared';

/**
 * The small popup that follows every hatch: the egg wobbles, cracks, and the
 * monster that came out takes its place. The queue lives in the game state, so
 * a hatch is never lost even if two land back to back.
 */
export function HatchReveal() {
  const { state, dispatch } = useGame();
  const uid = state.hatchQueue[0];
  const mon = uid ? state.mons.find((m) => m.uid === uid) : undefined;

  // an entry whose monster has gone (released, rebirth) clears itself quietly
  useEffect(() => {
    if (uid && !mon) dispatch({ type: 'DISMISS_HATCH' });
  }, [uid, mon, dispatch]);

  if (!mon) return null;
  const e = entry(mon.species);
  const meta = RARITY_META[e.rarity];
  const waiting = state.hatchQueue.length - 1;
  const dismiss = () => dispatch({ type: 'DISMISS_HATCH' });

  return (
    <Modal title="🥚 Your egg hatched!" onClose={dismiss} small>
      <div className="hatch" style={{ ['--rar' as string]: meta.color, ['--glow' as string]: meta.glow }}>
        <div className="hatch-stage" key={mon.uid}>
          <img className="hatch-egg sprite" src={eggSpriteUrl('default')} alt="" draggable={false} />
          <span className="hatch-flash" />
          <Sprite species={mon.species} form={mon.form} shiny={mon.shiny} size="xl" className="hatch-mon" />
          {mon.shiny && (
            <>
              <span className="hatch-spark s1">✨</span>
              <span className="hatch-spark s2">✨</span>
              <span className="hatch-spark s3">✨</span>
            </>
          )}
        </div>

        <div className="hatch-info center" key={`${mon.uid}-info`}>
          <div className="hatch-name">
            {e.name}
            {mon.shiny && ' ✨'}
            <span style={{ marginLeft: 8, color: mon.gender === 'M' ? '#7fb3ff' : mon.gender === 'F' ? '#ff9ecb' : '#aaa' }}>
              {GENDER_ICON[mon.gender]}
            </span>
          </div>
          <div className="row" style={{ gap: 6, justifyContent: 'center', margin: '8px 0' }}>
            {e.types.map((t) => <TypeTag key={t} type={t} />)}
            <RarityTag rarity={e.rarity} />
          </div>
          <div className="small muted">
            {mon.shiny ? 'A shiny! ' : ''}Lv.{mon.level} · {mon.nature} nature · {mon.iv}/31 IV
          </div>
        </div>

        <div className="row between" style={{ marginTop: 16, gap: 10 }}>
          <span className="tiny dim">{waiting > 0 ? `${waiting} more hatched` : ' '}</span>
          <button className="btn primary" autoFocus onClick={dismiss}>
            {waiting > 0 ? 'Next' : 'Nice!'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Charmander wants to learn Flamethrower, but it already knows four moves."
 * The player picks which move to forget or skips learning altogether. It is a
 * locked prompt: it comes back until it has been answered, and every other
 * prompt waits behind it.
 */
export function MoveLearnPrompt() {
  const { state, dispatch } = useGame();
  const prompt = state.pendingMoves[0];
  const mon = prompt ? state.mons.find((m) => m.uid === prompt.uid) : undefined;
  const move = prompt ? MOVES[prompt.moveId] : undefined;

  // a prompt for a monster or move that no longer exists is simply dropped
  useEffect(() => {
    if (prompt && (!mon || !move)) dispatch({ type: 'SKIP_MOVE', uid: prompt.uid, moveId: prompt.moveId });
  }, [prompt, mon, move, dispatch]);

  if (!prompt || !mon || !move) return null;
  const name = entry(mon.species).name;
  const known = movesForMon(mon);
  const waiting = state.pendingMoves.length - 1;

  return (
    <Modal title={`${name} wants to learn ${move.name}`} onClose={() => {}} locked>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 14, alignItems: 'center' }}>
          <Sprite species={mon.species} form={mon.form} shiny={mon.shiny} size="lg" className="sprite-battle" />
          <div className="stack" style={{ gap: 6 }}>
            <div className="small">
              <b>{name}</b> <span className="dim">Lv.{mon.level}</span> can learn a new move, but it already knows
              four. Pick one to forget, or skip learning it.
            </div>
            <div className="panel" style={{ padding: '8px 10px', borderColor: 'var(--gold)' }}>
              <div className="tiny muted" style={{ marginBottom: 2 }}>NEW MOVE</div>
              <MoveInfo move={move} />
            </div>
          </div>
        </div>

        <div className="tiny muted">FORGET ONE TO MAKE ROOM</div>
        <div className="grid g2" style={{ gap: 8 }}>
          {known.map((m) => (
            <button
              key={m.id}
              className="panel"
              style={{ padding: 10, textAlign: 'left', cursor: 'pointer' }}
              title={`Forget ${m.name} and learn ${move.name}`}
              onClick={() => dispatch({ type: 'LEARN_MOVE', uid: mon.uid, moveId: move.id, forget: m.id })}
            >
              <MoveInfo move={m} />
              <div className="tiny" style={{ color: 'var(--danger)', marginTop: 4 }}>Forget this move</div>
            </button>
          ))}
        </div>

        <div className="row between" style={{ gap: 10 }}>
          <span className="tiny dim">
            Skipped and forgotten moves can be taught again from <b>My Pokémon</b> for coins.
            {waiting > 0 ? ` ${waiting} more waiting.` : ''}
          </span>
          <button
            className="btn"
            onClick={() => dispatch({ type: 'SKIP_MOVE', uid: mon.uid, moveId: move.id })}
          >
            Don&apos;t learn {move.name}
          </button>
        </div>
      </div>
    </Modal>
  );
}
