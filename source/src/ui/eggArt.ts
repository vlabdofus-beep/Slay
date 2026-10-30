// Artwork officiel des Dofus, chargé depuis DofusDB par le navigateur du joueur (type d'objet 23 = Dofus).
// Les adresses trouvées sont gardées en mémoire locale ; en cas d'échec, l'icône locale (recolorée) reste affichée.
import { EGGS } from '../data/eggs.ts';

const KEY = 'slay.eggArt.v1';
const API = 'https://api.dofusdb.fr/items';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const eggArt: Record<string, string> = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
})();

let loading: Promise<boolean> | null = null;

/** Charge les artworks manquants ; renvoie true si de nouvelles images ont été trouvées. */
export function loadEggArt(): Promise<boolean> {
  if (EGGS.every((e) => eggArt[e.id])) return Promise.resolve(false);
  loading ??= (async () => {
    const wanted = new Map(EGGS.map((e) => [norm(e.name), e.id]));
    let found = false;
    try {
      for (let skip = 0; skip < 200; skip += 50) {
        const r = await fetch(`${API}?typeId=23&$limit=50&$skip=${skip}&$select[]=name&$select[]=img`);
        if (!r.ok) break;
        const page = await r.json() as { total: number; data: { name?: { fr?: string }; img?: string }[] };
        for (const it of page.data ?? []) {
          const n = norm(it.name?.fr ?? '');
          const id = wanted.get(n) ?? [...wanted].find(([k]) => n.startsWith(k))?.[1];
          if (id && it.img && !eggArt[id]) { eggArt[id] = it.img; found = true; }
        }
        if (skip + 50 >= (page.total ?? 0)) break;
      }
      if (found) localStorage.setItem(KEY, JSON.stringify(eggArt));
    } catch { /* hors ligne ou DofusDB indisponible : on garde les icônes locales */ }
    return found;
  })();
  return loading;
}
