/**
 * The gallery is the artwork collection: one frame per picture dropped into
 * public/gallery, opened by owning the monster in the picture.
 *
 * These are not the battle sprites. A frame stays shut until the species is in
 * your Pokédex, and the shiny frame needs a shiny catch of its own — catching
 * the plain version opens the plain frame only.
 */
import rawGallery from '../data/gallery.json';
import { DEX, entry } from './dex';
import type { GameState } from './state';

export type GalleryVariant = 'normal' | 'shiny';

export interface GalleryPiece {
  species: string;
  variant: GalleryVariant;
  /** path relative to the site root, mirroring public/ */
  file: string;
}

interface GalleryFile {
  generated: string;
  count: number;
  pieces: GalleryPiece[];
}

const file = rawGallery as unknown as GalleryFile;

/** Every piece of artwork the build found, ordered by dex number. */
export const GALLERY: GalleryPiece[] = file.pieces ?? [];

/** The species that have at least one frame, dex order. */
export const GALLERY_SPECIES: string[] = [...new Set(GALLERY.map((p) => p.species))].sort(
  (a, b) => (DEX[a]?.num ?? 0) - (DEX[b]?.num ?? 0),
);

export function galleryUrl(piece: GalleryPiece): string {
  return piece.file;
}

export function galleryPieceFor(species: string, variant: GalleryVariant): GalleryPiece | null {
  return GALLERY.find((p) => p.species === species && p.variant === variant) ?? null;
}

/**
 * A frame is open when the monster behind it is in the Pokédex; the shiny
 * frame needs a shiny entry, which the dex records separately.
 */
export function galleryUnlocked(s: GameState, species: string, variant: GalleryVariant): boolean {
  return variant === 'shiny' ? s.dexShiny.includes(species) : s.dexCaught.includes(species);
}

export interface GalleryProgress {
  total: number;
  unlocked: number;
  shiny: number;
  /** species with a frame whose normal art is still locked */
  locked: number;
}

export function galleryProgress(s: GameState): GalleryProgress {
  let unlocked = 0;
  let shiny = 0;
  for (const p of GALLERY) {
    if (!galleryUnlocked(s, p.species, p.variant)) continue;
    unlocked += 1;
    if (p.variant === 'shiny') shiny += 1;
  }
  return { total: GALLERY.length, unlocked, shiny, locked: GALLERY.length - unlocked };
}

/**
 * Why a frame is still shut. A locked frame keeps the species to itself, so
 * the wording never names what is hanging behind the glass.
 */
export function galleryLockReason(s: GameState, piece: GalleryPiece): string {
  if (piece.variant === 'shiny') {
    return s.dexCaught.includes(piece.species)
      ? 'Catch it shiny to open this frame'
      : 'Catch it, then catch it shiny';
  }
  return 'Catch this species to open this frame';
}
