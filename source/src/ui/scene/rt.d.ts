// Types du moteur de rendu des personnages (rt.js, porté de Dofus Survivors).

export interface AnimDir {
  w: number; h: number; ax: number; ay: number; n: number; f: [number, number][];
}
export interface BakedAnim {
  fps: number; loop: number; d: Record<string, AnimDir>; img: HTMLCanvasElement; shot?: number;
  mis?: HTMLCanvasElement | null;
}
export interface BakedMeta { S: number; ref: number; a: Record<string, BakedAnim> }
export interface Character { key: string; meta: BakedMeta; sp: BakedMeta | null }

export function rtLoad(key: string): Promise<unknown>;
export function buildCharacter(breed: number, gender: 'm' | 'f'): Promise<Character | null>;
export function buildSpells(breed: number, gender: 'm' | 'f', names: string[]): Promise<Character | null>;
export function animOf(ch: Character | null, name: string): BakedAnim | null;
export function animLength(ch: Character | null, name: string): number;
export function drawAnim(
  ctx: CanvasRenderingContext2D, ch: Character, name: string, t: number, x: number, y: number, h: number, flip?: boolean,
): boolean;
export function shotTime(ch: Character | null, name: string): number;
