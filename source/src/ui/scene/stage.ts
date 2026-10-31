// Scène de combat façon Slay : décor d'Amakna, personnage animé, effets de sorts.
// Un seul canvas, fixé derrière l'interface (il survit aux re-rendus du DOM). Les monstres sont dans le DOM :
// la scène lit leur position à l'écran pour y poser projectiles et impacts.
import SPELLFX from '../../data/spellfx.json' with { type: 'json' };
import { ENCOUNTERS } from '../../data/monsters.ts';
import { ALL_CARDS } from '../../data/cards.ts';
import type { CardDef, ClassId, Element } from '../../core/types.ts';
import { animLength, animOf, buildCharacter, buildSpells, drawAnim, shotTime, type Appearance, type Character } from './rt.js';

/** Géométrie commune au canvas et au DOM (fractions de la fenêtre). */
export const STAGE = { horizon: 0.5, ground: 0.66, playerX: 0.22, playerH: 0.3 };
/** Disposition de la scène. Le sol est placé pour que tout ce qui est sous les combattants (nom, PV, statuts)
 *  reste au-dessus de la main de cartes : on réserve en bas la hauteur de la main, puis celle de ces infos. */
export function layoutStage(): void {
  const W = window.innerWidth, H = window.innerHeight;
  const portrait = W < H * 0.85;
  const narrow = W <= 720;
  const hand = narrow ? 215 : 300;      // hauteur visible de la main (cartes et leur léger soulèvement)
  const info = narrow ? 80 : 128;        // nom, mécaniques, PV et statuts sous un monstre
  const groundPx = Math.min(H * (portrait ? 0.56 : 0.66), H - hand - info);
  const ground = Math.max(0.42, groundPx / H);
  const room = Math.max(0.12, ground - 110 / H); // hauteur disponible au-dessus du sol, sous la barre du haut
  Object.assign(STAGE, portrait
    ? { horizon: ground - 0.14, ground, playerX: 0.2, playerH: Math.min(0.24, (0.42 * W) / H, room) }
    : { horizon: ground - 0.16, ground, playerX: 0.22, playerH: Math.min(0.3, (0.24 * W) / H, room) });
}
layoutStage();

type FxEntry = [string, number, number]; // [type, gfx, sous les pieds]
const FX = SPELLFX as unknown as { buckets: number; spells: Record<string, [string | null, FxEntry[]]> };
const BREED: Record<string, number> = { iop: 8, cra: 9 };

// ───────────── chargement de scripts (packs de cartes, effets) ─────────────

export interface Sheet { meta: { [k: string]: any }; img: HTMLImageElement; ready: boolean }
const packs: Record<number, Sheet> = {};
const packWait: Record<number, ((s: Sheet | null) => void)[]> = {};
const fxReg: Record<number, Sheet> = {};
const bucketsAsked = new Set<number>();

declare global {
  interface Window {
    DSV_MAP_REG: (id: number, meta: object, url: string) => void;
    DSV_FX_REG: (id: number, meta: object, url: string) => void;
  }
}

window.DSV_MAP_REG = (id, meta, url) => {
  const img = new Image();
  const s: Sheet = { meta, img, ready: false };
  img.onload = () => { s.ready = true; (packWait[id] ?? []).forEach((f) => f(s)); packWait[id] = []; };
  img.onerror = () => { (packWait[id] ?? []).forEach((f) => f(null)); packWait[id] = []; };
  img.src = url;
  packs[id] = s;
};
window.DSV_FX_REG = (id, meta, url) => {
  const img = new Image();
  const s: Sheet = { meta, img, ready: false };
  img.onload = () => { s.ready = true; };
  img.src = url;
  fxReg[id] = s;
};

function addScript(src: string, onerror?: () => void): void {
  const sc = document.createElement('script');
  sc.src = src;
  if (onerror) sc.onerror = onerror;
  document.head.appendChild(sc);
}

export function loadPack(id: number): Promise<Sheet | null> {
  const p = packs[id];
  if (p?.ready) return Promise.resolve(p);
  return new Promise((res) => {
    (packWait[id] ??= []).push(res);
    if (!document.querySelector(`script[data-map="${id}"]`)) {
      const sc = document.createElement('script');
      sc.src = `game/maps/${id}.js`;
      sc.dataset.map = String(id);
      sc.onerror = () => res(null);
      document.head.appendChild(sc);
    }
  });
}

const bucketOf = (s: number) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % FX.buckets; };
function loadFx(gfx: number): void {
  if (fxReg[gfx]) return;
  const b = bucketOf(gfx);
  if (bucketsAsked.has(b)) return;
  bucketsAsked.add(b);
  addScript(`game/fx/p${b}.js`);
}

// ───────────── sorts → animation de lancer et effets ─────────────

const cardsOf = (classe: string) => ALL_CARDS.filter((c) => c.classe === classe && c.spellId);
const entryOf = (c: CardDef) => (c.spellId ? FX.spells[String(c.spellId)] : undefined);

/** Animation de lancer la plus fréquente de la classe (repli pour les sorts sans animation propre). */
function classDefaultAnim(classe: string): string {
  const count: Record<string, number> = {};
  for (const c of cardsOf(classe)) { const n = entryOf(c)?.[0]; if (n) count[n] = (count[n] ?? 0) + 1; }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cast';
}

export function spellAnimsFor(classe: string): string[] {
  return [...new Set(cardsOf(classe).map((c) => entryOf(c)?.[0]).filter((n): n is string => !!n))];
}

/** Animation et effets à jouer pour une carte. Sans effet d'impact propre, emprunte celui d'une carte du même élément. */
export function castPlan(card: CardDef): { anim: string; fx: FxEntry[] } {
  if (card.status || card.classe === 'neutre') return { anim: 'cast', fx: [] };
  const classe = card.classe as string;
  const e = entryOf(card);
  let anim = e?.[0] ?? (card.spellId ? classDefaultAnim(classe) : classe === 'iop' ? 'strike' : classDefaultAnim(classe));
  if (card.type !== 'attaque' && !e?.[0]) anim = 'cast';
  let fx = e?.[1] ?? [];
  if (!fx.some((f) => f[0] === 'target') && card.type === 'attaque') {
    const donor = cardsOf(classe).find((c) => c.element === card.element && entryOf(c)?.[1].some((f) => f[0] === 'target'))
      ?? cardsOf(classe).find((c) => entryOf(c)?.[1].some((f) => f[0] === 'target'));
    const borrowed = donor ? (entryOf(donor)?.[1] ?? []).filter((f) => f[0] === 'target') : [];
    fx = [...fx.filter((f) => f[0] !== 'target'), ...borrowed];
  }
  return { anim, fx };
}

// ───────────── décor ─────────────

/** Lieu de chaque rencontre (packs de cartes de Dofus 3). */
export const ENCOUNTER_PACK: Record<string, number> = {
  bouftou_seul: 1, bouftous: 1, chef_guerre: 1, bouftou_royal: 1,
  tofus: 32, prespic_tofus: 32, lisiere: 41,
  larve_moskito: 18, arakne_moskito: 18, foret: 9,
  rose_seule: 8, champs: 8, tournesol: 8,
  // Acte 2
  chafers: 98, wabbits: 46, kwaks: 22, sous_bois: 9, abraknydes: 59, bworks: 117, craqueleurs: 89, marais: 125,
  clairiere: 9, abraknyde_sombre: 59, craqueleur_legendaire: 89, wa_wabbit: 46, bworkette: 117, abraknyde_ancestral: 22,
  // Acte 3
  egouts: 111, kolerats: 66, kanigrous: 169, craqueboules: 60, corbacs: 133, mulous: 55, piralaks: 84, frigost: 58,
  kaskargo: 177, maitre_corbac: 133, dragon_cochon: 97, koulosse: 89, minotoror: 94,
};

export function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function renderBackdrop(pk: Sheet, W: number, H: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const [r, g, b] = (pk.meta.col as number[]) ?? [120, 140, 60];
  const tint = (k: number, a = 1) => `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;
  const hz = H * STAGE.horizon;

  // Ciel : encre de Dofusle vers une lueur de la couleur du lieu
  const sky = x.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#121b22');
  sky.addColorStop(0.55, '#1b2a2f');
  sky.addColorStop(1, tint(0.42));
  x.fillStyle = sky; x.fillRect(0, 0, W, hz + 2);
  const rs = mulberry(seed ^ 0x51ed);
  // Étoiles du Krosmoz, plus rares vers l'horizon
  for (let i = 0; i < Math.round(W / 9); i++) {
    const sy = Math.pow(rs(), 1.8) * hz * 0.8;
    x.fillStyle = `rgba(240,226,190,${(0.15 + rs() * 0.55) * (1 - sy / hz)})`;
    x.beginPath(); x.arc(rs() * W, sy, rs() < 0.08 ? 1.6 : 0.8, 0, Math.PI * 2); x.fill();
  }
  // Nuées : longues bandes floues teintées
  x.save(); x.filter = 'blur(18px)';
  for (let i = 0; i < 5; i++) {
    const cy = hz * (0.35 + rs() * 0.45);
    x.fillStyle = tint(0.55 + rs() * 0.3, 0.1 + rs() * 0.08);
    x.beginPath(); x.ellipse(rs() * W, cy, W * (0.18 + rs() * 0.2), H * (0.012 + rs() * 0.02), 0, 0, Math.PI * 2); x.fill();
  }
  x.restore();
  // Collines lointaines en deux plans, comme les reliefs d'Amakna
  const hills = (base: number, amp: number, k: number, a: number) => {
    const ph = rs() * 10, ph2 = rs() * 10;
    x.fillStyle = tint(k, a);
    x.beginPath(); x.moveTo(0, hz + 4);
    for (let px = 0; px <= W + 8; px += 8) {
      const u = px / W;
      x.lineTo(px, base - amp * (0.55 + 0.3 * Math.sin(u * 5.3 + ph) + 0.15 * Math.sin(u * 13.1 + ph2)));
    }
    x.lineTo(W, hz + 4); x.closePath(); x.fill();
  };
  hills(hz, H * 0.14, 0.22, 0.85);
  hills(hz, H * 0.07, 0.32, 0.95);

  // Sol : dallage du lieu répété en miroir (raccords invisibles)
  const [tx, ty, tw, th] = pk.meta.tile as number[];
  const t2 = document.createElement('canvas');
  t2.width = tw * 2; t2.height = th * 2;
  const tc = t2.getContext('2d')!;
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    tc.save(); tc.translate(fx ? tw * 2 : 0, fy ? th * 2 : 0); tc.scale(fx ? -1 : 1, fy ? -1 : 1);
    tc.drawImage(pk.img, tx, ty, tw, th, 0, 0, tw, th); tc.restore();
  }
  const scale = Math.max(0.55, W / 2200);
  const pat = x.createPattern(t2, 'repeat')!;
  pat.setTransform(new DOMMatrix().scale(scale, scale * 0.8));
  x.fillStyle = pat; x.fillRect(0, hz, W, H - hz);
  const shade = x.createLinearGradient(0, hz, 0, H);
  shade.addColorStop(0, 'rgba(10,16,20,.72)');
  shade.addColorStop(0.35, 'rgba(10,16,20,.25)');
  shade.addColorStop(1, 'rgba(10,16,20,.55)');
  x.fillStyle = shade; x.fillRect(0, hz, W, H - hz);

  // Décors : les plus grands éléments du lieu, en rangs de profondeur ; le centre de l'arène reste dégagé
  const rnd = mulberry(seed);
  const pres = (pk.meta.pre as { r: number[]; f: number[][] }[])
    .filter((p) => p.f?.length && p.r[2] * p.r[3] > 6000 && p.r[2] < 900)
    .sort((a, b) => b.r[2] * b.r[3] - a.r[2] * a.r[3]).slice(0, 16);
  const place = (p: (typeof pres)[number], cx: number, base: number, sc: number, filter: string) => {
    const [rx, ry, rw, rh] = p.r;
    const fy = Math.max(...p.f.map((f) => f[1]));
    x.save(); x.filter = filter;
    x.drawImage(pk.img, rx, ry, rw, rh, cx - (rw * sc) / 2, base - fy * sc, rw * sc, rh * sc);
    x.restore();
  };
  if (pres.length) {
    const k = H / 900;
    for (let px = -80; px < W + 80; px += 90 + rnd() * 80) place(pres[Math.floor(rnd() * pres.length)], px, hz + 6, 0.5 * k, 'brightness(.32) saturate(.7) blur(1.2px)');
    for (let px = -60; px < W + 60; px += 150 + rnd() * 120) {
      if (px > W * 0.3 && px < W * 0.82) continue;
      place(pres[Math.floor(rnd() * pres.length)], px, hz + H * 0.07, 0.78 * k, 'brightness(.6) saturate(.85)');
    }
    place(pres[0], W * 0.02, H * 1.02, 1.25 * k, 'brightness(.28) blur(3px)');
    place(pres[Math.min(1, pres.length - 1)], W * 0.98, H * 1.03, 1.2 * k, 'brightness(.28) blur(3px)');
  }

  // Brume d'horizon, lueur derrière les combattants, vignette
  const mist = x.createLinearGradient(0, hz - H * 0.08, 0, hz + H * 0.08);
  mist.addColorStop(0, 'rgba(0,0,0,0)'); mist.addColorStop(0.5, tint(0.35, 0.35)); mist.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = mist; x.fillRect(0, hz - H * 0.08, W, H * 0.16);
  const glow = x.createRadialGradient(W * 0.5, H * STAGE.ground, 0, W * 0.5, H * STAGE.ground, W * 0.5);
  glow.addColorStop(0, tint(0.6, 0.18)); glow.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  const vig = x.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vig.addColorStop(0, 'rgba(8,12,16,0)'); vig.addColorStop(1, 'rgba(8,12,16,.85)');
  x.fillStyle = vig; x.fillRect(0, 0, W, H);
  return c;
}

// ───────────── scène ─────────────

interface Spark { a: Sheet; x: number; y: number; t0: number; under: boolean; from?: { x: number; y: number; dur: number } }

class Stage {
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  W = 0; H = 0; dpr = 1;
  visible = false;
  packId = 0;
  backdrop: HTMLCanvasElement | null = null;
  char: Character | null = null;
  charKey = '';
  anim = { name: 'idle', t0: 0, hold: false, rate: 1 };
  /** Pose quittée : fondue courte pour éviter les sauts entre deux animations. */
  prev: { name: string; t: number; at: number } | null = null;
  sparks: Spark[] = [];
  private raf = 0;

  private mount(): void {
    if (this.canvas) return;
    const c = document.createElement('canvas');
    c.id = 'stage';
    c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    if (!this.canvas) return;
    layoutStage();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    this.backdrop = null;
    if (this.packId) void this.setPack(this.packId);
  }

  async setPack(id: number): Promise<void> {
    this.packId = id;
    const pk = await loadPack(id);
    if (!pk || this.packId !== id) return;
    this.backdrop = renderBackdrop(pk, this.W, this.H, id * 7919);
  }

  /** Affiche la scène pour une rencontre, avec le personnage du joueur. */
  show(encounter: string, classe: ClassId, gender: 'm' | 'f', app: Appearance = {}): void {
    this.mount();
    this.canvas!.classList.add('on');
    this.visible = true;
    const pack = ENCOUNTER_PACK[encounter] ?? ENCOUNTERS[encounter]?.pack ?? 18;
    if (pack !== this.packId || !this.backdrop) { this.backdrop = null; void this.setPack(pack); }
    const key = `${classe}${gender}|${(app.cols ?? []).join(',')}|${(app.accs ?? []).join(',')}`;
    if (key !== this.charKey) {
      this.charKey = key;
      // L'ancienne apparence reste affichée le temps de préparer la nouvelle (changement de coiffe).
      if (!this.char || !this.char.key.startsWith(`${BREED[classe]}${gender}|`)) this.char = null;
      void buildCharacter(BREED[classe], gender, app).then((c) => { if (this.charKey === key && c) this.char = c; });
      void buildSpells(BREED[classe], gender, spellAnimsFor(classe), app).then((c) => { if (this.charKey === key && c) this.char = c; });
    }
    for (const c of cardsOf(classe)) for (const f of castPlan(c).fx) loadFx(f[1]);
    this.anim = { name: 'idle', t0: performance.now(), hold: false, rate: 1 };
    if (!this.raf) this.loop();
  }

  hide(): void {
    this.visible = false;
    this.canvas?.classList.remove('on');
    this.sparks = [];
    cancelAnimationFrame(this.raf); this.raf = 0;
  }

  get player() {
    return { x: this.W * STAGE.playerX, y: this.H * STAGE.ground, h: this.H * STAGE.playerH };
  }

  /** Vitesse de lecture : les sorts sont joués un peu plus vite que dans Dofus, pour garder le rythme des cartes. */
  private rateOf(name: string): number {
    return name === 'idle' || name === 'death' ? 1 : name === 'hit' ? 1.15 : 1.3;
  }

  private play(name: string, hold = false): number {
    const n = animOf(this.char, name) ? name : name.startsWith('AnimAttaque') ? 'cast' : name;
    const now = performance.now();
    if (this.char) this.prev = { name: this.anim.name, t: ((now - this.anim.t0) / 1000) * this.anim.rate, at: now };
    const rate = this.rateOf(n);
    this.anim = { name: n, t0: now, hold, rate };
    return (animLength(this.char, n) || 0.6) / rate;
  }

  /** Lance une carte : animation, projectile, impacts. Renvoie le délai (ms) jusqu'à l'impact. */
  cast(card: CardDef, targets: { x: number; y: number }[], self: boolean): number {
    const plan = castPlan(card);
    this.play(plan.anim);
    const shot = this.char ? shotTime(this.char, this.anim.name) / this.anim.rate : 0.2;
    const now = performance.now();
    const p = this.player;
    const missile = plan.fx.find((f) => f[0] === 'projectile' || f[0] === 'missile');
    const flight = missile && !self ? 0.28 : 0;
    const spots = self || !targets.length ? [{ x: p.x, y: p.y }] : targets;
    if (missile && !self) {
      const a = fxReg[missile[1]];
      if (a?.ready) for (const t of spots) {
        this.sparks.push({ a, x: t.x, y: t.y - p.h * 0.45, t0: now + shot * 1000, under: false,
          from: { x: p.x + p.h * 0.18, y: p.y - p.h * 0.6, dur: flight } });
      }
    }
    for (const [type, gfx, under] of plan.fx) {
      if (type !== 'target') continue;
      const a = fxReg[gfx];
      if (!a?.ready) continue;
      for (const t of spots) this.sparks.push({ a, x: t.x, y: t.y, t0: now + (shot + flight) * 1000, under: !!under });
    }
    return Math.round((shot + flight) * 1000) + 60;
  }

  hurt(): void { this.play('hit'); }
  die(): void { this.play('death', true); }

  private scaleK(): number {
    return this.char ? this.player.h / this.char.meta.ref : this.player.h / 180;
  }

  private drawSpark(x: CanvasRenderingContext2D, s: Spark, now: number): boolean {
    const t = (now - s.t0) / 1000;
    if (t < 0) return true;
    const M = s.a.meta;
    let px = s.x, py = s.y, i: number;
    if (s.from) {
      const u = Math.min(1, t / s.from.dur);
      px = s.from.x + (s.x - s.from.x) * u; py = s.from.y + (s.y - s.from.y) * u - Math.sin(u * Math.PI) * 30;
      if (u >= 1) return false;
      i = Math.floor(t * M.fps) % M.n;
    } else {
      i = Math.floor(t * M.fps);
      if (i >= M.n) return false;
    }
    const k = (this.scaleK() * 1.08) / (M.sc || 1);
    const sx = (i % M.cols) * M.w, sy = Math.floor(i / M.cols) * M.h;
    x.save(); x.translate(px, py);
    if (s.from) x.rotate(Math.atan2(s.y - s.from.y, s.x - s.from.x));
    x.drawImage(s.a.img, sx, sy, M.w, M.h, -M.ax * k, -M.ay * k, M.w * k, M.h * k);
    x.restore();
    return true;
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const x = this.ctx;
    if (!x || !this.visible) return;
    const now = performance.now();
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, this.W, this.H);
    if (this.backdrop) x.drawImage(this.backdrop, 0, 0, this.W, this.H);
    else { x.fillStyle = '#152028'; x.fillRect(0, 0, this.W, this.H); }
    const p = this.player;
    // ombre au sol
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.beginPath(); x.ellipse(p.x, p.y + 2, p.h * 0.22, p.h * 0.05, 0, 0, Math.PI * 2); x.fill();
    this.sparks = this.sparks.filter((s) => !s.under || this.drawSpark(x, s, now));
    if (this.char) {
      const a = this.anim;
      const t = ((now - a.t0) / 1000) * a.rate;
      const len = animLength(this.char, a.name);
      if (a.name !== 'idle' && !a.hold && len && t > len) {
        this.prev = { name: a.name, t: len, at: now };
        this.anim = { name: 'idle', t0: now, hold: false, rate: 1 };
      }
      // Fondue de 110 ms depuis la pose quittée
      const fade = this.prev ? 1 - (now - this.prev.at) / 110 : 0;
      if (this.prev && fade > 0) {
        x.globalAlpha = fade;
        drawAnim(x, this.char, this.prev.name, this.prev.t, p.x, p.y, p.h);
        x.globalAlpha = 1 - fade * 0.5;
      } else this.prev = null;
      drawAnim(x, this.char, this.anim.name, ((now - this.anim.t0) / 1000) * this.anim.rate, p.x, p.y, p.h);
      x.globalAlpha = 1;
    }
    this.sparks = this.sparks.filter((s) => s.under || this.drawSpark(x, s, now));
  };
}

export const stage = new Stage();
export { BREED };
export type { Element };
