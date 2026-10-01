import {
  TEST_ROUTE, TILES, TILE_PX, isTallGrass, sheetRect, type Dir, type ExploreMap, type Walker,
} from '../game/explore';
import { entry, spriteUrl } from '../game/exports';

/**
 * Everything that paints the exploration map onto a canvas. It is kept apart
 * from the React screen so it can be exercised with a fake canvas context.
 */

// The camera shows 15 x 10 tiles, the same window as a Game Boy Advance.
export const VIEW_W = 15;
export const VIEW_H = 10;
export const PLAYER_CELL = 32;

// ------------------------------------------------------------------- assets --
export interface Assets {
  tileset: HTMLImageElement;
  player: HTMLImageElement;
  /** the whole map drawn once at native size: every frame just crops it */
  map: HTMLCanvasElement;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

export function paintMap(map: ExploreMap, tileset: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map.width * TILE_PX;
  canvas.height = map.height * TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      for (const tile of [map.ground[i], map.over[i]]) {
        if (!tile) continue;
        const r = sheetRect(tile);
        ctx.drawImage(tileset, r.sx, r.sy, r.size, r.size, x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
      }
    }
  }
  return canvas;
}

let assetsPromise: Promise<Assets> | null = null;
export function loadAssets(): Promise<Assets> {
  if (!assetsPromise) {
    assetsPromise = Promise.all([loadImage('explore/tileset.png'), loadImage('explore/player.png')])
      .then(([tileset, player]) => ({ tileset, player, map: paintMap(TEST_ROUTE, tileset) }))
      .catch((err) => {
        assetsPromise = null;
        throw err;
      });
  }
  return assetsPromise;
}

// Gen 5 sprites are 96 x 96 with a lot of empty space around the monster, so
// find the part that is actually drawn and scale that to the size of the map.
export interface Art {
  img: HTMLImageElement;
  box: { x: number; y: number; w: number; h: number };
}
const artCache = new Map<string, Art | 'loading' | 'failed'>();

export function artFor(url: string): Art | null {
  const hit = artCache.get(url);
  if (hit && hit !== 'loading' && hit !== 'failed') return hit;
  if (hit) return null;
  artCache.set(url, 'loading');
  loadImage(url)
    .then((img) => {
      let box = { x: 0, y: 0, w: img.width, h: img.height };
      try {
        const probe = document.createElement('canvas');
        probe.width = img.width;
        probe.height = img.height;
        const pctx = probe.getContext('2d');
        if (pctx) {
          pctx.drawImage(img, 0, 0);
          const data = pctx.getImageData(0, 0, img.width, img.height).data;
          let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
          for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
              if (data[(y * img.width + x) * 4 + 3] > 24) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
            }
          }
          if (x1 >= x0 && y1 >= y0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        }
      } catch {
        /* keep the whole image */
      }
      artCache.set(url, { img, box });
    })
    .catch(() => artCache.set(url, 'failed'));
  return null;
}

/** How big a follower is drawn on the map, in map pixels: small monsters are small. */
export function followerSize(heightM: number): number {
  return 17 + 12 * Math.min(1, heightM / 2.5);
}

const ROW: Record<Dir, number> = { up: 0, down: 1, left: 2, right: 3 };
/** How much of a tile's lower edge the grass covers, in map pixels. */
const GRASS_COVER = 5;

export interface DrawOptions {
  /** map pixels are drawn this many screen pixels wide */
  zoom: number;
  /** the first team member, drawn one tile behind the player */
  follower: { species: string; shiny: boolean; form: string | null | undefined } | null;
  now: number;
  /** finds the artwork for a url once it has loaded; null while it has not */
  art?: (url: string) => Art | null;
}

// ------------------------------------------------------------------ drawing --
export function drawFrame(ctx: CanvasRenderingContext2D, assets: Assets, w: Walker, opts: DrawOptions): void {
  const S = opts.zoom;
  const now = opts.now;
  const artOf = opts.art ?? artFor;
  const vw = VIEW_W * TILE_PX;
  const vh = VIEW_H * TILE_PX;
  const map = TEST_ROUTE;

  // where the player is, in map pixels, part way through a step
  const px = (w.to ? w.x + (w.to.x - w.x) * w.t : w.x) * TILE_PX;
  const py = (w.to ? w.y + (w.to.y - w.y) * w.t : w.y) * TILE_PX;
  const f = w.follower;
  const fpx = (f.from ? f.from.x + (w.x - f.from.x) * w.t : f.x) * TILE_PX;
  const fpy = (f.from ? f.from.y + (w.y - f.from.y) * w.t : f.y) * TILE_PX;

  const maxX = Math.max(0, map.width * TILE_PX - vw);
  const maxY = Math.max(0, map.height * TILE_PX - vh);
  const camX = Math.min(maxX, Math.max(0, Math.round(px + TILE_PX / 2 - vw / 2)));
  const camY = Math.min(maxY, Math.max(0, Math.round(py + TILE_PX / 2 - vh / 2)));

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0f16';
  ctx.fillRect(0, 0, vw * S, vh * S);
  ctx.drawImage(assets.map, camX, camY, vw, vh, 0, 0, vw * S, vh * S);

  const shadow = (cx: number, cy: number, rx: number) => {
    ctx.fillStyle = 'rgba(0, 0, 0, .22)';
    ctx.beginPath();
    ctx.ellipse(cx * S, cy * S, rx * S, rx * 0.42 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawFollower = () => {
    if (!opts.follower) return;
    const facing = f.facing;
    // both views are requested every frame so the one that turns up next is
    // already loaded; until the wanted one has, the other stands in for it
    const front = artOf(spriteUrl(opts.follower.species, { shiny: opts.follower.shiny, form: opts.follower.form }));
    const back = artOf(spriteUrl(opts.follower.species, { shiny: opts.follower.shiny, back: true, form: opts.follower.form }));
    const art = facing === 'up' ? back ?? front : front ?? back;
    if (!art) return;
    const size = followerSize(entry(opts.follower.species).heightm);
    const k = size / Math.max(art.box.w, art.box.h);
    const dw = art.box.w * k;
    const dh = art.box.h * k;
    // a small hop in time with the step
    const hop = f.from || w.to ? Math.abs(Math.sin(w.t * Math.PI)) * 1.6 : 0;
    const footX = Math.round(fpx) + TILE_PX / 2 - camX;
    const footY = Math.round(fpy) + TILE_PX - 1 - camY;
    shadow(footX, footY, Math.max(4, dw * 0.38));
    const dx = (footX - dw / 2) * S;
    const dy = (footY - dh - hop) * S;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (facing === 'right') {
      ctx.save();
      ctx.translate(dx + dw * S, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(art.img, art.box.x, art.box.y, art.box.w, art.box.h, 0, 0, dw * S, dh * S);
      ctx.restore();
    } else {
      ctx.drawImage(art.img, art.box.x, art.box.y, art.box.w, art.box.h, dx, dy, dw * S, dh * S);
    }
    ctx.imageSmoothingEnabled = false;
  };

  const drawPlayer = () => {
    // step, stand, step with the other foot, stand
    const frame = w.to ? (w.t < 0.5 ? (w.parity ? 1 : 2) : 0) : 0;
    const footX = Math.round(px) + TILE_PX / 2 - camX;
    const footY = Math.round(py) + TILE_PX - camY;
    shadow(footX, footY - 1, 6);
    ctx.drawImage(
      assets.player,
      frame * PLAYER_CELL, ROW[w.facing] * PLAYER_CELL, PLAYER_CELL, PLAYER_CELL,
      (footX - PLAYER_CELL / 2) * S, (footY - 31) * S, PLAYER_CELL * S, PLAYER_CELL * S,
    );
  };

  // whoever is further down the screen stands in front
  if (fpy < py) {
    drawFollower();
    drawPlayer();
  } else {
    drawPlayer();
    drawFollower();
  }

  // Tall grass grows over the legs of anything standing in it. Only the tile
  // under a sprite's feet counts, so a step into the grass hides the feet
  // gradually instead of cutting the sprite in two.
  const blades = sheetRect(TILES.tallGrass);
  const cover = (footX: number, footY: number) => {
    const cx = Math.floor(footX / TILE_PX);
    const cy = Math.floor((footY - 1) / TILE_PX);
    if (!isTallGrass(map, cx, cy)) return;
    ctx.drawImage(
      assets.tileset,
      blades.sx, blades.sy + (TILE_PX - GRASS_COVER), blades.size, GRASS_COVER,
      (cx * TILE_PX - camX) * S, (cy * TILE_PX - camY + TILE_PX - GRASS_COVER) * S, TILE_PX * S, GRASS_COVER * S,
    );
  };
  cover(Math.round(px) + TILE_PX / 2, Math.round(py) + TILE_PX);
  if (opts.follower) cover(Math.round(fpx) + TILE_PX / 2, Math.round(fpy) + TILE_PX);

  // the exclamation mark over the player's head when something is rustling
  if (w.alert > 0) {
    const bx = (Math.round(px) + TILE_PX / 2 - camX) * S;
    const by = (Math.round(py) - 26 - camY) * S;
    const bounce = Math.sin(now / 55) * 1.5 * S;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#1a1f2e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by + bounce, 9 * S * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d6333b';
    ctx.font = `bold ${14 * S * 0.9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', bx, by + bounce + 1);
  }
}

