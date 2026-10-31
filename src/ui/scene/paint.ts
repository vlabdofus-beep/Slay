// Peintures de décor hors combat, faites avec les vraies pièces des cartes de Dofus 3 (packs de Dofus Survivors) :
//  - le paysage de l'accueil : le chemin d'une run au crépuscule, d'Amakna à Brâkmar ;
//  - le plateau de la carte d'un acte : le sol du lieu vu d'au-dessus, semé de ses décors, chemins et cases dégagés.
import { loadPack, mulberry, type Sheet } from './stage.ts';

type Pre = { r: number[]; f: number[][] };

/** Dallage du lieu répété en miroir (raccords invisibles). */
function groundPattern(x: CanvasRenderingContext2D, pk: Sheet, scale: number): CanvasPattern {
  const [tx, ty, tw, th] = pk.meta.tile as number[];
  const t2 = document.createElement('canvas');
  t2.width = tw * 2; t2.height = th * 2;
  const tc = t2.getContext('2d')!;
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    tc.save(); tc.translate(fx ? tw * 2 : 0, fy ? th * 2 : 0); tc.scale(fx ? -1 : 1, fy ? -1 : 1);
    tc.drawImage(pk.img, tx, ty, tw, th, 0, 0, tw, th); tc.restore();
  }
  const pat = x.createPattern(t2, 'repeat')!;
  pat.setTransform(new DOMMatrix().scale(scale, scale));
  return pat;
}

function decors(pk: Sheet, maxW = 900): Pre[] {
  return (pk.meta.pre as Pre[])
    .filter((p) => p.f?.length && p.r[2] * p.r[3] > 3000 && p.r[2] < maxW)
    .sort((a, b) => b.r[2] * b.r[3] - a.r[2] * a.r[3]);
}

function stamp(x: CanvasRenderingContext2D, pk: Sheet, p: Pre, cx: number, base: number, sc: number, filter = 'none', flip = false): void {
  const [rx, ry, rw, rh] = p.r;
  const fy = Math.max(...p.f.map((f) => f[1]));
  x.save(); x.filter = filter;
  x.translate(cx, base); if (flip) x.scale(-1, 1);
  x.drawImage(pk.img, rx, ry, rw, rh, (-rw * sc) / 2, -fy * sc, rw * sc, rh * sc);
  x.restore();
}

const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

// ───────────── Accueil : le chemin d'une run, au crépuscule ─────────────
// D'Amakna aux landes de Brâkmar : les héros se tiennent dans la prairie au soleil couchant ; un chemin part vers
// l'horizon, longe la forêt des Abraknydes, passe sous les glaces de Frigost et finit dans la lueur rouge de Brâkmar.
// Les silhouettes sont les vraies pièces des cartes de Dofus 3, teintes à plat selon leur distance.

/** Palette du crépuscule (voir docs/DESIGN.md, « Accueil »). */
const DUSK = {
  zenith: '#1f2b52', mauve: '#6b6a8f', amber: '#e9b47c', gold: '#f7d98c',
  frigost: '#8b8fb8', brakmar: '#c23a3f', citadel: '#3a2232',
  forest: '#26393a', hill: '#3d5649', meadowLit: '#b9b45e', meadow: '#6a8838', meadowDeep: '#26401f',
  path: '#d4b072', pathEdge: '#8a6a3c', frame: '#141f1b',
};
/** Pièces utilisées : arbres des Abraknydes (9) et de la jungle (46), glaces de Frigost (55). */
const TITLE_PACKS = { forest: 9, jungle: 46, ice: 55 } as const;
const TALL_TREES: [number, number[]][] = [[9, [0, 2, 3, 7, 0]], [46, [1, 2, 1]]];

/** Paysage de l'accueil : peint une fois par taille d'écran (horizon = fraction de la hauteur). */
export function paintTitle(W: number, H: number, seed: number, horizon = 0.5): Promise<HTMLCanvasElement | null> {
  const key = `title|${W}x${H}|${seed}|${horizon}`;
  if (!cache.has(key)) {
    cache.set(key, Promise.all(Object.values(TITLE_PACKS).map((id) => loadPack(id))).then((list) => {
      const pk: Record<number, Sheet | null> = {};
      Object.values(TITLE_PACKS).forEach((id, k) => { pk[id] = list[k]; });
      return dusk(pk, W, H, seed, horizon);
    }));
  }
  return cache.get(key)!;
}

/** Une pièce de décor peinte à plat d'une seule couleur, avec un liseré de lumière sur son côté soleil. */
function silhouette(pk: Sheet, p: Pre, sc: number, color: string, rim: string | null, flip: boolean): { c: HTMLCanvasElement; foot: number } {
  const [rx, ry, rw, rh] = p.r;
  const w = Math.max(1, Math.round(rw * sc)), h = Math.max(1, Math.round(rh * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.save(); if (flip) { x.translate(w, 0); x.scale(-1, 1); }
  x.drawImage(pk.img, rx, ry, rw, rh, 0, 0, w, h); x.restore();
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, w, h);
  if (rim) {
    // Le soleil est bas, à gauche : le haut et le flanc gauche des formes s'éclairent
    const g = x.createLinearGradient(0, 0, w * 0.6, h * 0.5);
    g.addColorStop(0, rim); g.addColorStop(0.35, 'rgba(0,0,0,0)');
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  const fy = Math.max(...p.f.map((f) => f[1]));
  return { c, foot: fy * sc };
}

function place(x: CanvasRenderingContext2D, s: { c: HTMLCanvasElement; foot: number }, cx: number, base: number): void {
  x.drawImage(s.c, cx - s.c.width / 2, base - s.foot);
}

/** Crête irrégulière (somme de sinus) entre deux hauteurs. */
function ridge(x: CanvasRenderingContext2D, W: number, base: number, amp: number, rnd: () => number, fill: string | CanvasGradient, jag = 1): void {
  const a = rnd() * 10, b = rnd() * 10, c = rnd() * 10;
  x.fillStyle = fill;
  x.beginPath(); x.moveTo(-10, base + amp * 2);
  for (let px = -10; px <= W + 10; px += 6) {
    const u = px / W;
    const y = 0.5 + 0.28 * Math.sin(u * 3.1 + a) + 0.14 * Math.sin(u * 9.7 + b) + 0.08 * jag * Math.abs(Math.sin(u * 31 + c));
    x.lineTo(px, base - amp * y);
  }
  x.lineTo(W + 10, base + amp * 2); x.closePath(); x.fill();
}

function dusk(pk: Record<number, Sheet | null>, W: number, H: number, seed: number, horizon: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  const rnd = mulberry(seed);
  const hz = H * horizon;
  const k = Math.min(W / 1440, H / 900) * 1.05;
  const narrow = W < H;
  /** Point où le chemin rejoint l'horizon : Brâkmar. */
  const vx = W * (narrow ? 0.62 : 0.64);

  // Ciel : indigo au zénith, mauve, ambre, or à l'horizon
  const sky = x.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, DUSK.zenith); sky.addColorStop(0.42, DUSK.mauve); sky.addColorStop(0.78, DUSK.amber); sky.addColorStop(1, DUSK.gold);
  x.fillStyle = sky; x.fillRect(0, 0, W, hz + 2);
  // Premières étoiles, seulement tout en haut
  for (let i = 0; i < 70; i++) {
    const sy = Math.pow(rnd(), 1.8) * hz * 0.32;
    x.fillStyle = `rgba(255,246,220,${(0.15 + rnd() * 0.45) * (1 - sy / (hz * 0.32))})`;
    x.beginPath(); x.arc(rnd() * W, sy, 0.5 + rnd() * 0.9, 0, Math.PI * 2); x.fill();
  }
  // Soleil couchant, à gauche, posé sur les glaces
  const sx = W * (narrow ? 0.3 : 0.4), sy = hz - H * 0.045;
  const glow = x.createRadialGradient(sx, sy, 0, sx, sy, W * 0.55);
  glow.addColorStop(0, 'rgba(255,236,170,.9)'); glow.addColorStop(0.12, 'rgba(255,214,140,.45)'); glow.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, hz);
  x.fillStyle = 'rgba(255,244,205,.95)';
  x.beginPath(); x.arc(sx, sy, H * 0.035, 0, Math.PI * 2); x.fill();
  // Nuages : quelques longs voiles flous, le dessous doré par le soleil
  x.save(); x.filter = `blur(${Math.max(2, Math.round(5 * k))}px)`;
  for (let i = 0; i < 4; i++) {
    const cy = hz * (0.45 + rnd() * 0.32), cx = W * (0.1 + rnd() * 0.8), w = W * (0.22 + rnd() * 0.2), h = H * (0.004 + rnd() * 0.005);
    const g = x.createLinearGradient(0, cy - h, 0, cy + h);
    g.addColorStop(0, 'rgba(130,118,160,.35)'); g.addColorStop(1, 'rgba(255,214,160,.55)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(cx, cy, w / 2, h, 0, 0, Math.PI * 2); x.fill();
  }
  x.restore();
  // Brâkmar : lueur rouge derrière la citadelle, au bout du chemin
  const red = x.createRadialGradient(vx, hz, 0, vx, hz, W * 0.16);
  red.addColorStop(0, 'rgba(226,78,58,.9)'); red.addColorStop(0.35, 'rgba(194,58,63,.4)'); red.addColorStop(1, 'rgba(194,58,63,0)');
  x.fillStyle = red; x.fillRect(0, hz - W * 0.2, W, W * 0.2 + 4);

  // Frigost : crête lointaine, lavande, dentelée de glaces
  const ice = pk[TITLE_PACKS.ice];
  const far = x.createLinearGradient(0, hz - H * 0.16, 0, hz);
  far.addColorStop(0, '#a2a5c8'); far.addColorStop(1, '#c9b7b4');
  ridge(x, W, hz - H * 0.015, H * 0.13, rnd, far, 1.6);
  if (ice) {
    const spires = [2, 3, 5, 8].map((i) => ice.meta.pre[i] as Pre).filter(Boolean);
    for (let i = 0; i < (narrow ? 4 : 7); i++) {
      const p = spires[i % spires.length];
      const px = W * (0.04 + i * (narrow ? 0.12 : 0.075) + rnd() * 0.03);
      if (Math.abs(px - vx) < W * 0.06) continue;
      place(x, silhouette(ice, p, (0.16 + rnd() * 0.1) * k, '#9599c0', 'rgba(255,236,200,.55)', rnd() < 0.5), px, hz - H * 0.06 + rnd() * H * 0.03);
    }
  }
  // La citadelle de Brâkmar : tours pointues serrées sur l'horizon, quelques fenêtres rouges, une fumée qui monte
  {
    // Silhouette irrégulière : une haute tour centrale, des flèches plus basses et inégales autour
    const n = narrow ? 5 : 7, unit = W * 0.0065 * (narrow ? 1.5 : 1);
    const towers = Array.from({ length: n }, (_, i) => {
      const off = (i - (n - 1) / 2) * unit * (1.3 + rnd() * 0.6);
      const mid = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 + 0.5);
      const hgt = Math.min(H, W * 0.75) * (0.018 + mid * mid * 0.05 + rnd() * 0.015);
      return { cx: vx + off, w: unit * (0.7 + rnd() * 0.6), hgt };
    });
    x.fillStyle = DUSK.citadel;
    // Le rocher qui porte la ville
    x.beginPath(); x.moveTo(vx - unit * n, hz + 2);
    for (let i = 0; i <= 12; i++) x.lineTo(vx - unit * n + (i / 12) * unit * n * 2, hz - H * (0.006 + 0.01 * Math.sin((i / 12) * Math.PI)) - rnd() * H * 0.004);
    x.lineTo(vx + unit * n, hz + 2); x.closePath(); x.fill();
    for (const t of towers) {
      x.beginPath();
      x.moveTo(t.cx - t.w / 2, hz + 2); x.lineTo(t.cx - t.w / 2, hz - t.hgt * 0.72);
      x.lineTo(t.cx - t.w * 0.8, hz - t.hgt * 0.74); x.lineTo(t.cx, hz - t.hgt);
      x.lineTo(t.cx + t.w * 0.8, hz - t.hgt * 0.74); x.lineTo(t.cx + t.w / 2, hz - t.hgt * 0.72);
      x.lineTo(t.cx + t.w / 2, hz + 2); x.closePath(); x.fill();
    }
    for (const t of towers) for (let w = 0; w < 2; w++) {
      if (rnd() < 0.35) continue;
      x.fillStyle = `rgba(255,${90 + Math.round(rnd() * 60)},60,.85)`;
      x.fillRect(t.cx - 0.6, hz - t.hgt * (0.2 + rnd() * 0.4), 1.2, 1.6);
    }
    x.save(); x.filter = `blur(${Math.max(3, Math.round(8 * k))}px)`;
    for (let i = 0; i < 6; i++) {
      x.fillStyle = `rgba(70,46,62,${0.2 - i * 0.028})`;
      x.beginPath(); x.ellipse(vx + i * W * 0.014, hz - H * (0.12 + i * 0.035), W * (0.01 + i * 0.006), H * 0.018, -0.35, 0, Math.PI * 2); x.fill();
    }
    x.restore();
  }
  // Brume dorée posée sur l'horizon
  const mist = x.createLinearGradient(0, hz - H * 0.05, 0, hz + H * 0.02);
  mist.addColorStop(0, 'rgba(247,217,140,0)'); mist.addColorStop(0.7, 'rgba(247,217,140,.35)'); mist.addColorStop(1, 'rgba(247,217,140,0)');
  x.fillStyle = mist; x.fillRect(0, hz - H * 0.05, W, H * 0.07);

  // Collines des Abraknydes et leur forêt, en contre-jour ; une trouée là où passe le chemin
  const hillG = x.createLinearGradient(0, hz - H * 0.05, 0, hz + H * 0.06);
  hillG.addColorStop(0, '#4f6458'); hillG.addColorStop(1, DUSK.hill);
  ridge(x, W, hz + H * 0.035, H * 0.06, rnd, hillG, 0.4);
  const trees: { pk: Sheet; p: Pre }[] = [];
  for (const [id, idx] of TALL_TREES) { const s = pk[id]; if (s) for (const i of idx) if (s.meta.pre[i]) trees.push({ pk: s, p: s.meta.pre[i] as Pre }); }
  if (trees.length) {
    const rows: [number, number, string, string][] = [[0.02, 0.15, '#33473f', 'rgba(255,200,130,.35)'], [0.045, 0.21, DUSK.forest, 'rgba(255,190,120,.28)']];
    for (const [dy, size, col, rim] of rows) {
      for (let px = -W * 0.02; px < W * 1.02; px += W * (0.014 + rnd() * 0.012)) {
        if (Math.abs(px - vx) < W * (0.04 + dy * 0.8)) continue;
        const t = trees[Math.floor(rnd() * trees.length)];
        place(x, silhouette(t.pk, t.p, (size + rnd() * 0.08) * k, col, rim, rnd() < 0.5), px, hz + H * dy + rnd() * H * 0.012);
      }
    }
  }

  // Prairie d'Amakna : le haut éclairé par le couchant, le premier plan dans l'ombre
  const top = hz + H * 0.06;
  const meadow = x.createLinearGradient(0, top, 0, H);
  meadow.addColorStop(0, DUSK.meadowLit); meadow.addColorStop(0.3, DUSK.meadow); meadow.addColorStop(1, DUSK.meadowDeep);
  x.fillStyle = meadow;
  x.beginPath(); x.moveTo(0, top + H * 0.012);
  for (let px = 0; px <= W; px += 8) x.lineTo(px, top + H * 0.012 * Math.sin(px / W * 5 + 1) - H * 0.006);
  x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
  // L'ombre de la forêt sur le haut de la prairie, puis de larges ondulations du terrain
  const shade = x.createLinearGradient(0, top - H * 0.01, 0, top + H * 0.05);
  shade.addColorStop(0, 'rgba(40,56,52,.45)'); shade.addColorStop(1, 'rgba(40,56,52,0)');
  x.fillStyle = shade; x.fillRect(0, top - H * 0.01, W, H * 0.06);
  for (let i = 0; i < 4; i++) {
    const y0 = top + (H - top) * (0.22 + i * 0.2), amp = H * 0.02, ph = rnd() * 6;
    const g = x.createLinearGradient(0, y0 - amp, 0, y0 + H * 0.09);
    g.addColorStop(0, 'rgba(255,228,150,.10)'); g.addColorStop(0.25, 'rgba(20,40,20,0)'); g.addColorStop(1, 'rgba(20,40,20,.16)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W; px += 10) x.lineTo(px, y0 + amp * Math.sin(px / W * (3 + i) + ph));
    x.lineTo(W, H); x.closePath(); x.fill();
  }
  // Herbes : petites touches en tirets, plus grandes et plus sombres vers l'avant
  for (let i = 0; i < (narrow ? 260 : 520); i++) {
    const u = rnd(), py = top + Math.pow(u, 1.4) * (H - top);
    const d = (py - top) / (H - top);
    const len = (2 + d * 9) * k, px = rnd() * W;
    x.strokeStyle = rnd() < 0.35 ? `rgba(230,226,140,${0.12 + 0.2 * (1 - d)})` : `rgba(28,52,20,${0.1 + 0.25 * d})`;
    x.lineWidth = 0.8 + d * 1.6;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.4) * len * 0.5, py - len); x.stroke();
  }
  // Le chemin : large au premier plan, il serpente jusqu'à Brâkmar
  const path = (w0: number, col: string) => {
    x.fillStyle = col;
    x.beginPath();
    const pts: [number, number, number][] = [];
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const py = H + 4 - (H + 4 - (hz + H * 0.03)) * t;
      const px = W * 0.5 + (vx - W * 0.5) * Math.pow(t, 0.8) + Math.sin(t * Math.PI * 1.6) * W * 0.07 * (1 - t);
      const half = w0 * Math.pow(1 - t, 1.6) + 1.5;
      pts.push([px, py, half]);
    }
    pts.forEach(([px, py, h], i) => (i ? x.lineTo(px - h, py) : x.moveTo(px - h, py)));
    for (let i = pts.length - 1; i >= 0; i--) x.lineTo(pts[i][0] + pts[i][2], pts[i][1]);
    x.closePath(); x.fill();
  };
  path(W * 0.11, 'rgba(96,74,42,.55)');
  const pathG = x.createLinearGradient(0, hz, 0, H);
  pathG.addColorStop(0, 'rgba(240,206,140,.85)'); pathG.addColorStop(0.35, DUSK.path); pathG.addColorStop(1, '#8f7246');
  path(W * 0.095, pathG as unknown as string);
  // Vignette : bords et bas plus sombres, le centre garde la lumière
  const vig = x.createRadialGradient(W * 0.5, hz, Math.min(W, H) * 0.3, W * 0.5, hz, Math.max(W, H) * 0.85);
  vig.addColorStop(0, 'rgba(20,16,30,0)'); vig.addColorStop(1, 'rgba(20,16,30,.55)');
  x.fillStyle = vig; x.fillRect(0, 0, W, H);
  return c;
}

export interface BoardSpec { W: number; H: number; nodes: { x: number; y: number; r: number }[]; segs: [number, number, number, number][] }

/** Plateau d'un acte : le sol du lieu, ses décors posés partout où ils ne gênent ni les cases ni les chemins. */
export function paintBoard(packId: number, spec: BoardSpec, seed: number): Promise<HTMLCanvasElement | null> {
  const key = `board|${packId}|${spec.W}x${spec.H}|${seed}|${spec.nodes.length}`;
  if (!cache.has(key)) cache.set(key, loadPack(packId).then((pk) => (pk ? board(pk, spec, seed) : null)));
  return cache.get(key)!;
}

function segDist(px: number, py: number, [ax, ay, bx, by]: [number, number, number, number]): number {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function board(pk: Sheet, spec: BoardSpec, seed: number): HTMLCanvasElement {
  const { W, H } = spec;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  const rnd = mulberry(seed);
  x.fillStyle = groundPattern(x, pk, 0.5);
  x.fillRect(0, 0, W, H);
  // Décors : tirés sur une grille irrégulière, gardés loin des cases et des chemins
  const pres = decors(pk, 520).slice(0, 24);
  const spots: { x: number; y: number; p: Pre; sc: number; flip: boolean }[] = [];
  for (let y = 10; y < H + 40; y += 46) {
    for (let px = -20; px < W + 20; px += 52) {
      if (rnd() < 0.2) continue;
      const cx = px + (rnd() - 0.5) * 40, cy = y + (rnd() - 0.5) * 30;
      const p = pres[Math.floor(Math.pow(rnd(), 0.7) * pres.length)];
      if (!p) continue;
      const sc = 0.34 + rnd() * 0.2;
      const half = (p.r[2] * sc) / 2;
      const room = Math.max(26, half * 0.75);
      if (spec.nodes.some((n) => Math.hypot(n.x - cx, n.y - cy) < n.r + room)) continue;
      if (spec.segs.some((s) => segDist(cx, cy, s) < room)) continue;
      // Le haut d'un grand décor ne doit pas masquer une case placée juste au-dessus
      const top = cy - p.r[3] * sc;
      if (spec.nodes.some((n) => n.y < cy && n.y > top - n.r && Math.abs(n.x - cx) < half + n.r)) continue;
      spots.push({ x: cx, y: cy, p, sc, flip: rnd() < 0.5 });
    }
  }
  spots.sort((a, b) => a.y - b.y);
  for (const s of spots) {
    // Ombre portée douce sous chaque décor
    x.fillStyle = 'rgba(20,30,10,.18)';
    x.beginPath(); x.ellipse(s.x, s.y, (s.p.r[2] * s.sc) / 2.6, (s.p.r[2] * s.sc) / 9, 0, 0, Math.PI * 2); x.fill();
    stamp(x, pk, s.p, s.x, s.y, s.sc, 'none', s.flip);
  }
  // Lumière : un peu plus clair au centre, bords assombris pour cadrer
  const vig = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(255,248,220,.06)'); vig.addColorStop(1, 'rgba(10,22,14,.42)');
  x.fillStyle = vig; x.fillRect(0, 0, W, H);
  return c;
}
