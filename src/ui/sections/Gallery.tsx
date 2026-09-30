import React, { useMemo, useState } from 'react';
import { useGame } from '../store';
import { Modal, Panel, Sprite, TypeTag } from '../components';
import { DEX, entry } from './shared';
import {
  GALLERY, GALLERY_SPECIES, galleryLockReason, galleryProgress, galleryUnlocked, galleryUrl,
  type GalleryPiece,
} from '../../game/gallery';

type Filter = 'all' | 'open' | 'locked' | 'shiny';

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
  const [view, setView] = useState<GalleryPiece | null>(null);

  const progress = galleryProgress(state);

  const shown = useMemo(() => {
    return GALLERY.filter((p) => {
      const open = galleryUnlocked(state, p.species, p.variant);
      if (filter === 'open' && !open) return false;
      if (filter === 'locked' && open) return false;
      if (filter === 'shiny' && p.variant !== 'shiny') return false;
      if (!query) return true;
      const name = entry(p.species)?.name ?? p.species;
      return open && name.toLowerCase().includes(query.toLowerCase());
    });
  }, [filter, query, state.dexCaught, state.dexShiny]);

  const openPiece = view ? galleryUnlocked(state, view.species, view.variant) : false;
  const opened = view && openPiece ? DEX[view.species] : null;
  const yours = view ? state.mons.filter((m) => m.species === view.species) : [];
  const shinyYours = yours.filter((m) => m.shiny);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Panel
        title={`Gallery — ${progress.unlocked} / ${progress.total} frames open`}
        right={
          <div className="row" style={{ gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`btn xs ${filter === f.id ? 'primary' : 'ghost'}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="row between">
          <div className="row" style={{ gap: 14 }}>
            <span className="small muted">🖼️ {GALLERY.length} frame{GALLERY.length === 1 ? '' : 's'} hung</span>
            <span className="small muted">✅ {progress.unlocked} open</span>
            <span className="small muted">✨ {progress.shiny} shiny</span>
            <span className="small muted">🔒 {progress.locked} locked</span>
            <span className="small muted">🐾 {GALLERY_SPECIES.length} species with art</span>
          </div>
          <input
            type="text"
            placeholder="Search open frames…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            style={{ width: 200 }}
          />
        </div>
      </Panel>

      {GALLERY.length === 0 ? (
        <Panel title="No artwork yet">
          <div className="stack" style={{ gap: 10 }}>
            <div className="small muted">
              The gallery is empty because no artwork has been added yet — and that is the point. These frames are
              for pictures, not for the battle sprites: a species earns a frame the moment you catch it, but the
              frame only has something to show once its art exists.
            </div>
            <div className="small">
              <b>Add artwork:</b> drop an image into <code>public/gallery/</code> named after the species, then run{' '}
              <code>npm run gallery</code>.
            </div>
            <div className="tiny dim">
              <div><code>public/gallery/bulbasaur.png</code> — Bulbasaur’s frame</div>
              <div><code>public/gallery/bulbasaur-shiny.png</code> — its shiny frame, opened only by a shiny catch</div>
              <div><code>public/gallery/001.png</code> — the same thing by dex number</div>
            </div>
            <div className="small muted">
              <b>How a frame opens:</b> catch the species and its frame opens; catch one <i>shiny</i> and the shiny
              frame opens on its own. The two are tracked separately, and both stay open through rebirth.
            </div>
          </div>
        </Panel>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {shown.map((p) => {
            const open = galleryUnlocked(state, p.species, p.variant);
            const key = `${p.species}:${p.variant}`;
            return (
              <div
                key={key}
                className={`gallery-frame ${open ? '' : 'locked'} ${p.variant === 'shiny' ? 'shiny' : ''}`}
                onClick={() => open && setView(p)}
                title={open ? `${entry(p.species).name} — ${p.variant}` : galleryLockReason(state, p)}
              >
                <div className="art">
                  {open ? (
                    <img src={galleryUrl(p)} alt={`${entry(p.species).name} ${p.variant}`} loading="lazy" />
                  ) : (
                    <span className="lock">🔒</span>
                  )}
                </div>
                <div className="cap">
                  <div style={{ fontWeight: 600 }}>
                    {open ? entry(p.species).name : '???'}
                    {p.variant === 'shiny' && <span style={{ color: 'var(--gold)' }}> ✨</span>}
                  </div>
                  <div className="tiny dim">
                    {open
                      ? `#${String(DEX[p.species].num).padStart(3, '0')} · ${p.variant === 'shiny' ? 'shiny frame' : 'frame'}`
                      : galleryLockReason(state, p)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shown.length === 0 && GALLERY.length > 0 && (
        <div className="muted small">Nothing here with that filter.</div>
      )}

      {view && (
        <Modal
          title={
            openPiece
              ? `${entry(view.species).name} — ${view.variant === 'shiny' ? 'shiny frame ✨' : 'frame'}`
              : 'Locked frame'
          }
          onClose={() => setView(null)}
          wide
        >
          {openPiece && opened ? (
            <div className="grid g2">
              <div className="panel center" style={{ padding: 14, background: 'rgba(0,0,0,.25)' }}>
                <img
                  src={galleryUrl(view)}
                  alt={`${entry(view.species).name} ${view.variant}`}
                  style={{ width: '100%', borderRadius: 12, display: 'block' }}
                />
                <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 10 }}>
                  {opened.types.map((t) => <TypeTag key={t} type={t} />)}
                </div>
              </div>
              <div className="stack">
                <Panel title="The piece">
                  <div className="stack small">
                    <div className="row between">
                      <span className="muted">Species</span>
                      <span>#{String(opened.num).padStart(3, '0')} {entry(view.species).name}</span>
                    </div>
                    <div className="row between">
                      <span className="muted">Frame</span>
                      <span>{view.variant === 'shiny' ? 'Shiny — opened by a shiny catch' : 'Opened by catching it'}</span>
                    </div>
                    <div className="row between">
                      <span className="muted">File</span>
                      <span className="mono dim">{view.file}</span>
                    </div>
                  </div>
                </Panel>
                <Panel title="Your catches">
                  {yours.length === 0 ? (
                    <div className="small muted">
                      You have none right now — the frame stays open, the record is part of your Pokédex.
                    </div>
                  ) : (
                    <div className="stack small">
                      <div className="row" style={{ gap: 10 }}>
                        <Sprite species={view.species} shiny={view.variant === 'shiny'} size="sm" />
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {yours.length} caught · {shinyYours.length} shiny
                          </div>
                          <div className="tiny dim">
                            best Lv.{Math.max(...yours.map((m) => m.level))}
                          </div>
                        </div>
                      </div>
                      {yours.slice(0, 6).map((m) => (
                        <div key={m.uid} className="row between">
                          <span>Lv.{m.level} · {m.nature}{m.shiny ? ' ✨' : ''}</span>
                          <span className="dim">{m.habitatId ? 'housed' : 'storage'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          ) : (
            <div className="stack">
              <div className="small muted">{galleryLockReason(state, view)}.</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
