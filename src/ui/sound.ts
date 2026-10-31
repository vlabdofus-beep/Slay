// Son du jeu, coupé par défaut (réglage gardé dans le navigateur).
//  - Musiques de Dofus 3 (via Dofus Survivors) : accueil, carte de chaque acte, combats, boss, victoire, défaite.
//  - Voix du héros (coups reçus, mort, cri de joie) : fichiers de Dofus 3, selon la classe et le sexe.
//  - Bruitages courts synthétisés à la volée (Web Audio) : carte jouée, coup, armure, soin, ennemi vaincu, clic, kamas.
//    Aucun fichier à charger, et chaque bruit suit l'élément du sort (grave pour la Terre, clair pour l'Air…).

const KEY = 'slay.sound';
/** Réglages : son actif, et trois volumes de 0 à 1 (musique, bruitages, voix du héros). */
interface Settings { on: boolean; music: number; fx: number; voice: number }
const DEFAULTS: Settings = { on: false, music: 0.45, fx: 0.7, voice: 0.6 };
const settings: Settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* navigation privée */ } };

export const soundOn = () => settings.on;

// ───────────── musique ─────────────

let music: HTMLAudioElement | null = null;
let musicKey = '';
let wanted = '';
let fadeT = 0;

function fadeTo(el: HTMLAudioElement, to: number, ms: number, done?: () => void): void {
  const from = el.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step); else done?.();
  };
  requestAnimationFrame(step);
}

/** Musique d'ambiance (en boucle), avec un fondu. `track` : nom de fichier dans game/music, '' pour silence. */
export function playMusic(track: string): void {
  wanted = track;
  if (!settings.on) return;
  if (track === musicKey) return;
  const old = music;
  musicKey = track;
  if (old) fadeTo(old, 0, 600, () => old.pause());
  if (!track) { music = null; return; }
  const el = new Audio(`game/music/${track}.ogg`);
  el.loop = !['victoire', 'defaite'].includes(track);
  el.volume = 0;
  music = el;
  clearTimeout(fadeT);
  fadeT = window.setTimeout(() => {
    void el.play().then(() => fadeTo(el, settings.music, 900)).catch(() => { /* le navigateur attend un geste */ });
  }, old ? 350 : 0);
}

// ───────────── voix du héros ─────────────

const voices = new Map<string, HTMLAudioElement>();
export function voice(breed: number, gender: 'm' | 'f', kind: 'hit' | 'mort' | 'joie'): void {
  if (!settings.on) return;
  const file = kind === 'hit' ? `hit${1 + Math.floor(Math.random() * 3)}` : kind === 'mort' ? 'mort1' : 'crijoie1';
  const key = `${breed}${gender}_${file}`;
  let el = voices.get(key);
  if (!el) { el = new Audio(`game/sfx/${key}.ogg`); voices.set(key, el); }
  el.volume = settings.voice;
  el.currentTime = 0;
  void el.play().catch(() => {});
}

// ───────────── bruitages synthétisés ─────────────

let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new AudioContext());

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0): void {
  const c = ac(), t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * settings.fx, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, from: number, to: number, delay = 0): void {
  const c = ac(), t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol * settings.fx, t);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

/** Hauteur selon l'élément du sort. */
const EL_PITCH: Record<string, number> = { terre: 0.7, feu: 1.1, eau: 0.9, air: 1.35, neutre: 1 };

export type Sfx = 'card' | 'hit' | 'hurt' | 'block' | 'heal' | 'kill' | 'click' | 'coin' | 'god' | 'turn' | 'buff';
export function sfx(kind: Sfx, element = 'neutre'): void {
  if (!settings.on) return;
  const p = EL_PITCH[element] ?? 1;
  try {
    switch (kind) {
      case 'card': noise(0.22, 0.25, 900 * p, 2600 * p); break;
      case 'hit': tone(170 * p, 0.16, 'triangle', 0.32, 0.45); noise(0.09, 0.22, 1400 * p, 400); break;
      case 'hurt': tone(120, 0.22, 'sawtooth', 0.12, 0.5); noise(0.12, 0.2, 700, 200); break;
      case 'block': tone(880, 0.12, 'triangle', 0.16, 1.02); tone(1320, 0.1, 'sine', 0.08, 1, 0.03); break;
      case 'heal': tone(660, 0.18, 'sine', 0.14, 1.5); tone(990, 0.22, 'sine', 0.1, 1.33, 0.08); break;
      case 'kill': tone(300, 0.3, 'square', 0.08, 0.3); noise(0.25, 0.18, 2000, 300, 0.02); break;
      case 'click': tone(1200, 0.04, 'square', 0.05, 0.8); break;
      case 'coin': tone(1568, 0.09, 'square', 0.06, 1); tone(2093, 0.18, 'square', 0.05, 1, 0.07); break;
      case 'turn': tone(392, 0.12, 'triangle', 0.1, 1); tone(523, 0.16, 'triangle', 0.1, 1, 0.09); break;
      case 'buff': tone(523, 0.12, 'sine', 0.1, 1.25); tone(784, 0.18, 'sine', 0.08, 1.2, 0.06); break;
      case 'god': [523, 659, 784, 1047].forEach((f, i) => tone(f, 1.2, 'sine', 0.07, 1, i * 0.09)); break;
    }
  } catch { /* Web Audio indisponible */ }
}

/** Active ou coupe le son. Le clic sur le bouton est le geste qui autorise le navigateur à jouer. */
export function toggleSound(): boolean {
  settings.on = !settings.on;
  save();
  if (settings.on) {
    void ac().resume();
    const w = wanted;
    musicKey = '';
    playMusic(w);
    sfx('click');
  } else {
    if (music) { const m = music; fadeTo(m, 0, 300, () => m.pause()); }
    music = null;
    musicKey = '';
  }
  return settings.on;
}

// ───────────── réglages ─────────────

export type Channel = 'music' | 'fx' | 'voice';
const LABEL: Record<Channel, string> = { music: 'Musique', fx: 'Bruitages', voice: 'Voix' };

/** Change un volume (0 à 1) ; la musique suit tout de suite. */
export function setVolume(ch: Channel, v: number): void {
  settings[ch] = Math.max(0, Math.min(1, v));
  save();
  if (ch === 'music' && music) music.volume = settings.music;
}

/** Panneau des volumes : ouvert par le bouton haut-parleur quand le son est actif. */
let panelOpen = false;

/** Clic sur le haut-parleur : son coupé → on l'active ; son actif → on ouvre ou ferme les réglages. */
export function soundClick(): void {
  if (!settings.on) { toggleSound(); return; }
  panelOpen = !panelOpen;
}

/** Coupe le son depuis le panneau (ou la touche M). */
export function mute(): void {
  panelOpen = false;
  if (settings.on) toggleSound();
}

/** Bouton haut-parleur, pour toutes les barres, avec son panneau de volumes. */
export function soundButton(cls = ''): string {
  const on = settings.on;
  const level = on ? Math.max(settings.music, settings.fx, settings.voice) : 0;
  const wave = !on ? '<path d="m16 9 5 6M21 9l-5 6"/>'
    : level === 0 ? '<path d="m16 9 5 6M21 9l-5 6"/>'
    : level < 0.5 ? '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>'
    : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';
  const label = on ? 'Réglages du son' : 'Activer le son';
  const panel = on && panelOpen ? `<div class="snd-panel" role="group" aria-label="Volumes">
      ${(['music', 'fx', 'voice'] as Channel[]).map((ch) => {
        const pct = Math.round(settings[ch] * 100);
        return `<label class="snd-row"><span>${LABEL[ch]}</span><input type="range" min="0" max="100" step="5" value="${pct}" data-snd="${ch}" aria-label="Volume ${LABEL[ch].toLowerCase()}"><output>${pct}</output></label>`;
      }).join('')}
      <button class="snd-mute" data-act="sound-mute">Couper le son</button>
      <p class="snd-hint">Touche M : couper ou remettre le son.</p>
    </div>` : '';
  return `<span class="snd-wrap"><button class="sound-btn ${cls}" data-act="sound" aria-pressed="${on}" aria-expanded="${on ? panelOpen : false}" aria-label="${label}" title="${label}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${wave}</svg><span>${on ? 'Son' : 'Son coupé'}</span></button>${panel}</span>`;
}

// Glisser un curseur de volume : le réglage s'applique tout de suite (un petit bruit pour les bruitages et la voix).
let probeT = 0;
document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  const ch = el?.dataset?.snd as Channel | undefined;
  if (!ch) return;
  setVolume(ch, Number(el.value) / 100);
  const out = el.parentElement?.querySelector('output');
  if (out) out.textContent = el.value;
  clearTimeout(probeT);
  if (ch !== 'music') probeT = window.setTimeout(() => sfx(ch === 'fx' ? 'coin' : 'click'), 120);
});
// Un clic hors du panneau le ferme.
document.addEventListener('pointerdown', (ev) => {
  if (!panelOpen || (ev.target as HTMLElement)?.closest?.('.snd-wrap')) return;
  panelOpen = false;
  document.querySelectorAll('.snd-panel').forEach((n) => n.remove());
  document.querySelectorAll('.sound-btn[aria-expanded="true"]').forEach((n) => n.setAttribute('aria-expanded', 'false'));
});
// Onglet caché : la musique se met en pause, et reprend au retour.
document.addEventListener('visibilitychange', () => {
  if (!music || !settings.on) return;
  if (document.hidden) music.pause();
  else void music.play().catch(() => { /* le navigateur attend un geste */ });
});
