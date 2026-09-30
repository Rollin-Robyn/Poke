import React, { useMemo, useState } from 'react';
import { useGame } from '../store';
import { Modal, Panel, Sprite, TypeTag } from '../components';
import { DEX, entry } from './shared';
import {
  GALLERY, galleryLockReason, galleryPieceFor, galleryProgress, galleryUnlocked, galleryUrl,
  type GalleryPiece, type GalleryVariant,
} from '../../game/gallery';

type Filter = 'all' | 'open' | 'locked' | 'shiny';
type GalleryPage = { species: string; variant: GalleryVariant; piece: GalleryPiece | null };

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'open', label: 'open' },
  { id: 'locked', label: 'locked' },
  { id: 'shiny', label: 'shiny' },
];

export function Gallery() {
  const { state } = useGame();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<GalleryPage | null>(null);

  const progress = galleryProgress(state);
  const pages = useMemo(() => {
    const keys = new Set<string>();
    // A caught species always gets a page, even before artwork is imported.
    for (const species of state.dexCaught) keys.add(`${species}:normal`);
    for (const species of state.dexShiny) keys.add(`${species}:shiny`);
    // Imported artwork also creates a locked page for a species not caught yet.
    for (const piece of GALLERY) keys.add(`${piece.species}:${piece.variant}`);
    return [...keys].map((key) => {
      const [species, variant] = key.split(':') as [string, GalleryVariant];
      return { species, variant, piece: galleryPieceFor(species, variant) };
    }).sort((a, b) => DEX[a.species].num - DEX[b.species].num || (a.variant === 'normal' ? -1 : 1));
  }, [state.dexCaught, state.dexShiny]);

  const shown = useMemo(() => pages.filter((p) => {
    const open = galleryUnlocked(state, p.species, p.variant);
    if (filter === 'open' && !open) return false;
    if (filter === 'locked' && open) return false;
    if (filter === 'shiny' && p.variant !== 'shiny') return false;
    if (query && !entry(p.species).name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [filter, pages, query, state.dexCaught, state.dexShiny]);

  const openPiece = view ? galleryUnlocked(state, view.species, view.variant) : false;
  const opened = view ? DEX[view.species] : null;
  const yours = view ? state.mons.filter((m) => m.species === view.species) : [];
  const shinyYours = yours.filter((m) => m.shiny);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title={`Gallery — ${progress.unlocked} / ${progress.total} artwork frames open`}
        right={<div className="row" style={{ gap: 6 }}>{FILTERS.map((f) => <button key={f.id} className={`btn xs ${filter === f.id ? 'primary' : 'ghost'}`} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>}
      >
        <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <span className="small muted">📖 {pages.length} individual pages</span>
            <span className="small muted">🖼️ {GALLERY.length} imported frames</span>
            <span className="small muted">✅ {progress.unlocked} frames open</span>
            <span className="small muted">✨ {state.dexShiny.length} shiny pages</span>
          </div>
          <input type="text" placeholder="Search species…" value={query} onChange={(ev) => setQuery(ev.target.value)} style={{ width: 190 }} />
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>
          Caught Pokémon receive their own page immediately. Artwork is optional: imported art appears on that page when available, while unearned art remains locked.
        </div>
      </Panel>

      {pages.length === 0 ? (
        <Panel title="Your gallery is waiting">
          <div className="stack" style={{ gap: 10 }}>
            <div className="small muted">Catch a Pokémon to create its first individual gallery page.</div>
            <div className="small"><b>Import artwork separately:</b> put an image in <code>public/gallery/</code> and run <code>npm run gallery</code>. The importer writes the manifest without touching battle sprites.</div>
          </div>
        </Panel>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {shown.map((p) => {
            const open = galleryUnlocked(state, p.species, p.variant);
            const name = entry(p.species).name;
            return (
              <button key={`${p.species}:${p.variant}`} className={`gallery-frame ${open ? '' : 'locked'} ${p.variant === 'shiny' ? 'shiny' : ''}`} onClick={() => setView(p)} title={open ? `${name} page` : p.piece ? galleryLockReason(state, p.piece) : 'Catch this species to open its page'}>
                <div className="art">
                  {open && p.piece ? <img src={galleryUrl(p.piece)} alt={`${name} ${p.variant}`} loading="lazy" /> : open ? <Sprite species={p.species} shiny={p.variant === 'shiny'} size="lg" /> : <span className="lock">🔒</span>}
                </div>
                <div className="cap">
                  <div style={{ fontWeight: 600 }}>{open ? name : '???'}{p.variant === 'shiny' && <span style={{ color: 'var(--gold)' }}> ✨</span>}</div>
                  <div className="tiny dim">{open ? `#${String(DEX[p.species].num).padStart(3, '0')} · ${p.piece ? 'artwork page' : 'species page'}` : (p.piece ? galleryLockReason(state, p.piece) : 'Catch this species')}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 && pages.length > 0 && <div className="muted small">Nothing here with that filter.</div>}

      {view && opened && (
        <Modal title={`${opened.name} — ${view.variant === 'shiny' ? 'shiny page ✨' : 'species page'}`} onClose={() => setView(null)} wide>
          {openPiece ? (
            <div className="grid g2">
              <div className="panel center" style={{ padding: 14, background: 'rgba(0,0,0,.25)' }}>
                {view.piece ? <img src={galleryUrl(view.piece)} alt={`${opened.name} ${view.variant}`} style={{ width: '100%', borderRadius: 12, display: 'block' }} /> : <Sprite species={view.species} shiny={view.variant === 'shiny'} size="xl" />}
                <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 10 }}>{opened.types.map((t) => <TypeTag key={t} type={t} />)}</div>
              </div>
              <div className="stack">
                <Panel title="The page">
                  <div className="stack small">
                    <div className="row between"><span className="muted">Species</span><span>#{String(opened.num).padStart(3, '0')} {opened.name}</span></div>
                    <div className="row between"><span className="muted">Status</span><span>{view.piece ? 'Artwork imported' : 'Waiting for artwork'}</span></div>
                    <div className="row between"><span className="muted">Variant</span><span>{view.variant === 'shiny' ? 'Shiny' : 'Normal'}</span></div>
                    {view.piece && <div className="row between"><span className="muted">File</span><span className="mono dim">{view.piece.file}</span></div>}
                  </div>
                </Panel>
                <Panel title="Your catches">
                  {yours.length === 0 ? <div className="small muted">The page stays open in your Pokédex even though no individual is currently in the reserve.</div> : <div className="stack small">
                    <div className="row" style={{ gap: 10 }}><Sprite species={view.species} shiny={view.variant === 'shiny'} size="sm" /><div><div style={{ fontWeight: 600 }}>{yours.length} caught · {shinyYours.length} shiny</div><div className="tiny dim">best Lv.{Math.max(...yours.map((m) => m.level))}</div></div></div>
                    {yours.slice(0, 8).map((m) => <div key={m.uid} className="row between"><span>Lv.{m.level} · {m.nature}{m.shiny ? ' ✨' : ''}</span><span className="dim">{m.habitatId ? 'housed' : 'storage'}</span></div>)}
                  </div>}
                </Panel>
              </div>
            </div>
          ) : (
            <div className="small muted">{view.piece ? galleryLockReason(state, view.piece) : 'Catch this species to open its page'}.</div>
          )}
        </Modal>
      )}
    </div>
  );
}
