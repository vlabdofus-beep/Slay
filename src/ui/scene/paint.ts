// Peintures de décor hors combat, faites avec les vraies pièces des cartes de Dofus 3 (packs de Dofus Survivors) :
//  - le paysage de l'accueil, en plein jour ;
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

/**
 * Pièces écartées du paysage de l'accueil (repérées par leur position x,y dans la planche du pack) :
 * celles peintes sur leur propre dalle d'herbe (îlots aux bords visibles), l'arche coupée et l'échafaudage.
 * Faites pour être posées sur une carte vue de dessus, debout dans un paysage elles « dépassent ».
 * Le plateau de la carte, lui, les garde toutes.
 */
const LAND_SKIP: Record<number, string[]> = {
  8: ['0,0', '938,0', '717,0', '1356,0', '1647,0', '0,349', '1175,349'],
};

const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

/**
 * Paysage de l'accueil, en plein jour : ciel clair, collines bleutées, sol du lieu, décors en rangs.
 * clear = bandes horizontales (fractions de W) laissées libres au premier plan pour les personnages.
 */
export function paintLandscape(packId: number, W: number, H: number, seed: number, horizon = 0.5): Promise<HTMLCanvasElement | null> {
  const key = `land|${packId}|${W}x${H}|${seed}|${horizon}`;
  if (!cache.has(key)) cache.set(key, loadPack(packId).then((pk) => (pk ? landscape(pk, W, H, seed, horizon, LAND_SKIP[packId] ?? []) : null)));
  return cache.get(key)!;
}

function landscape(pk: Sheet, W: number, H: number, seed: number, horizon: number, skip: string[]): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const hz = H * horizon;
  const rnd = mulberry(seed);
  const [r, g, b] = (pk.meta.col as number[]) ?? [120, 160, 70];
  const mix = (k: number, sky: [number, number, number], a = 1) =>
    `rgba(${Math.round(r * (1 - k) + sky[0] * k)},${Math.round(g * (1 - k) + sky[1] * k)},${Math.round(b * (1 - k) + sky[2] * k)},${a})`;
  const SKY: [number, number, number] = [168, 214, 236];

  // Ciel d'Amakna : bleu franc en haut, voile doré à l'horizon
  const sky = x.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#5fb3e0'); sky.addColorStop(0.6, '#a8d6ec'); sky.addColorStop(1, '#fbe9bf');
  x.fillStyle = sky; x.fillRect(0, 0, W, hz + 2);
  const sun = x.createRadialGradient(W * 0.72, hz * 0.92, 0, W * 0.72, hz * 0.92, W * 0.45);
  sun.addColorStop(0, 'rgba(255,242,200,.85)'); sun.addColorStop(1, 'rgba(255,242,200,0)');
  x.fillStyle = sun; x.fillRect(0, 0, W, hz);
  // Nuages : longues nappes aplaties et floues, sous la ligne du titre
  x.save(); x.filter = `blur(${Math.round(W / 160)}px)`;
  for (let i = 0; i < 5; i++) {
    const cx = rnd() * W, cy = hz * (0.45 + rnd() * 0.35), w = W * (0.12 + rnd() * 0.12), h = w * 0.13;
    x.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.25})`;
    x.beginPath(); x.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(cx - w * 0.3, cy - h * 0.7, w * 0.45, h * 1.1, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(cx + w * 0.25, cy - h * 0.5, w * 0.35, h * 0.9, 0, 0, Math.PI * 2); x.fill();
  }
  x.restore();
  // Collines lointaines (perspective aérienne : plus c'est loin, plus c'est bleu)
  const hills = (amp: number, k: number, lift: number) => {
    const ph = rnd() * 10, ph2 = rnd() * 10;
    x.fillStyle = mix(k, SKY);
    x.beginPath(); x.moveTo(0, hz + 4);
    for (let px = 0; px <= W + 8; px += 8) {
      const u = px / W;
      x.lineTo(px, hz - lift - amp * (0.55 + 0.3 * Math.sin(u * 4.1 + ph) + 0.15 * Math.sin(u * 11.3 + ph2)));
    }
    x.lineTo(W, hz + 4); x.closePath(); x.fill();
  };
  hills(H * 0.13, 0.62, 0); hills(H * 0.08, 0.4, -H * 0.01);

  // Prairie peinte. La dalle du pack est un papier peint de médaillons : on ne la pose pas à l'accueil.
  const grass = x.createLinearGradient(0, hz, 0, H);
  grass.addColorStop(0, '#d5e7a4');
  grass.addColorStop(0.22, '#8fbf4e');
  grass.addColorStop(0.62, '#62a33a');
  grass.addColorStop(1, '#4a8628');
  x.fillStyle = grass;
  x.fillRect(0, hz, W, H - hz);
  for (let i = 0; i < 70; i++) {
    x.fillStyle = rnd() < 0.5 ? `rgba(255,248,210,${0.04 + rnd() * 0.05})` : `rgba(30,70,18,${0.04 + rnd() * 0.05})`;
    x.beginPath();
    x.ellipse(rnd() * W, hz + rnd() * (H - hz), 16 + rnd() * 48, 7 + rnd() * 16, 0, 0, Math.PI * 2);
    x.fill();
  }
  const haze = x.createLinearGradient(0, hz, 0, hz + H * 0.14);
  haze.addColorStop(0, 'rgba(251,233,191,.4)'); haze.addColorStop(1, 'rgba(251,233,191,0)');
  x.fillStyle = haze; x.fillRect(0, hz, W, H * 0.14);

  // Quelques décors, loin du centre où se tiennent les héros. Pas de masse floue dans les coins.
  const pres = decors(pk).filter((p) => !skip.includes(`${p.r[0]},${p.r[1]}`)).slice(0, 18);
  if (pres.length) {
    const k = H / 900;
    const pick = () => pres[Math.floor(rnd() * Math.min(8, pres.length))];
    for (let i = 0; i < 6; i++) {
      const px = ((i + 0.35 + rnd() * 0.3) / 6) * W;
      stamp(x, pk, pick(), px, hz + H * 0.012, 0.36 * k, 'saturate(.7) brightness(1.12) opacity(.7)', rnd() < 0.5);
    }
    // Sur un écran étroit les héros occupent presque toute la largeur : les décors restent dans les coins.
    const sides = W < 800 ? [0.02, 0.98] : [0.05, 0.12, 0.88, 0.95];
    for (const side of sides) {
      stamp(x, pk, pick(), W * side, hz + H * (W < 800 ? 0.22 : 0.14 + rnd() * 0.1), (W < 800 ? 0.42 : 0.62 + rnd() * 0.28) * k, 'none', side > 0.5);
    }
  }
  const side = x.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(18, 36, 22, .22)');
  side.addColorStop(0.16, 'rgba(18, 36, 22, 0)');
  side.addColorStop(0.84, 'rgba(18, 36, 22, 0)');
  side.addColorStop(1, 'rgba(18, 36, 22, .22)');
  x.fillStyle = side;
  x.fillRect(0, hz, W, H - hz);
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
