import React from 'react';
import { DEX, GENDER_ICON, RARITY_META, entry, eggSpriteUrl, itemUrl, monOutputWithHabitat, spriteUrl } from '../game/exports';
import type { GameState, Mon } from '../game/state';
import { happinessTier, natureBlurb } from '../game/state';
import { TYPE_COLORS } from '../game/typechart';
import { fmt, fmtPct, fmtTime } from '../game/rng';

export function Panel({
  title, right, children, className = '', style,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      {(title || right) && (
        <div className="row between" style={{ marginBottom: 12 }}>
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Bar({ value, max, className = '', tone }: { value: number; max: number; className?: string; tone?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar ${className}`}>
      <i style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

export function TypeTag({ type }: { type: string }) {
  return (
    <span className="tag type" style={{ background: TYPE_COLORS[type as keyof typeof TYPE_COLORS] ?? '#888' }}>
      {type}
    </span>
  );
}

export function RarityTag({ rarity }: { rarity: keyof typeof RARITY_META }) {
  const meta = RARITY_META[rarity];
  return (
    <span className="tag rarity" style={{ color: meta.color }}>
      {meta.label}
    </span>
  );
}

export function Sprite({
  species, size = 'md', shiny, back, female, form, className = '',
}: {
  species: string;
  size?: 'tiny' | 'sm' | 'md' | 'lg' | 'xl';
  shiny?: boolean;
  back?: boolean;
  female?: boolean;
  form?: string | null;
  className?: string;
}) {
  const [errored, setErrored] = React.useState(false);
  const src = errored ? spriteUrl(species, { shiny, back: back && !female }) : spriteUrl(species, { shiny, back, female, form });
  return (
    <img
      className={`sprite ${size} ${className}`}
      src={src}
      alt={DEX[species]?.name ?? species}
      loading="lazy"
      onError={() => setErrored(true)}
      draggable={false}
    />
  );
}

export function ItemSprite({ slug, size = 22 }: { slug: string; size?: number }) {
  return <img className="sprite" style={{ width: size, height: size }} src={itemUrl(slug)} alt={slug} />;
}

export function EggSprite({ size = 64, glow }: { size?: number; glow?: string }) {
  return (
    <img
      className="sprite"
      style={{ width: size, height: size, filter: glow ? `drop-shadow(0 0 10px ${glow})` : undefined }}
      src={eggSpriteUrl('default')}
      alt="egg"
    />
  );
}

/** Type-tinted square art area used by every monster card. */
export function MonArt({ mon, size = 78 }: { mon: Mon; size?: number }) {
  const e = entry(mon.species);
  const c1 = TYPE_COLORS[e.types[0] as keyof typeof TYPE_COLORS] ?? '#666';
  const c2 = e.types[1] ? TYPE_COLORS[e.types[1] as keyof typeof TYPE_COLORS] ?? c1 : c1;
  return (
    <div
      className="art"
      style={{ background: `radial-gradient(120% 100% at 50% -10%, ${c1}55, transparent 60%), radial-gradient(90% 80% at 80% 110%, ${c2}44, transparent 60%), rgba(0,0,0,.25)` }}
    >
      <Sprite species={mon.species} form={mon.form} shiny={mon.shiny} size={size >= 78 ? 'lg' : 'md'} />
      <span className="lv">Lv.{mon.level}</span>
      {mon.shiny && <span className="shiny-star">✨</span>}
      <span className="gender" style={{ color: mon.gender === 'M' ? '#7fb3ff' : mon.gender === 'F' ? '#ff9ecb' : '#aaa' }}>
        {GENDER_ICON[mon.gender]}
      </span>
      {mon.heldItem && (
        <img className="held" src={itemUrl(mon.heldItem)} alt="held item" title="Held item" />
      )}
    </div>
  );
}

export function MonCard({
  mon, state, selected, onClick, compact, footer,
}: {
  mon: Mon;
  state: GameState;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  footer?: React.ReactNode;
}) {
  const e = entry(mon.species);
  const out = monOutputWithHabitat(state, mon);
  const sleepLeft = mon.energy;
  return (
    <div className={`mon-card ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}>
      <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
        <MonArt mon={mon} />
        <div className="body">
          <div className="name">
            <span>{e.name}</span>
            {mon.form && <span className="tiny dim">({mon.form})</span>}
          </div>
          <div className="row" style={{ gap: 4 }}>
            {e.types.map((t) => (
              <TypeTag key={t} type={t} />
            ))}
            <span className="tag" title="Nature">{mon.nature}</span>
          </div>
          <div className="meta">
            <span title="Coins produced per minute">⛁ <b className="out">{fmt(out)}</b>/min</span>
            <span title="IV quality">{mon.iv}/31 IV</span>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <div className="row between tiny">
              <span className="muted">💗 {happinessTier(mon.happiness)}</span>
              <span className={mon.energy <= 0 ? 'dim' : 'muted'}>
                {mon.energy <= 0 ? '😴 asleep' : `☀ ${fmtTime(sleepLeft)}`}
              </span>
            </div>
            <Bar value={mon.happiness} max={100} className="thin" tone="linear-gradient(90deg,#ff9ecb,#f06292)" />
            <Bar
              value={mon.energy}
              max={4 * 3600}
              className="thin"
              tone={mon.energy <= 0 ? '#555' : 'linear-gradient(90deg,#f7d066,#e0a52c)'}
            />
          </div>
          {!compact && (
            <div className="tiny dim" title={natureBlurb(mon.nature)}>
              {natureBlurb(mon.nature)} · {mon.habitatId ? '🏡 housed' : '📦 storage'}
            </div>
          )}
        </div>
      </div>
      {footer && <div className="actions">{footer}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(1000px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2>
          <button className="btn sm ghost" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="stack" style={{ gap: 2 }} title={hint}>
      <span className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '.7px' }}>{label}</span>
      <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{value}</span>
    </div>
  );
}

export { fmt, fmtPct, fmtTime };
