"""Repères d'équilibrage tirés des exports Spire Codex (StS2).
Usage : python3 -I benchmarks.py <dossier ref-spire>"""
import json, sys, statistics as st, collections

ref = sys.argv[1]
cards = json.load(open(f"{ref}/cards.json"))
monsters = json.load(open(f"{ref}/monsters.json"))
encounters = json.load(open(f"{ref}/encounters.json"))

def med(xs):
    return round(st.median(xs), 1) if xs else None

def q(xs):
    if len(xs) < 4:
        return med(xs)
    s = sorted(xs)
    return f"{s[len(s)//4]}–{s[3*len(s)//4]}"

# ---------- Cartes ----------
colors = collections.Counter(c["color"] for c in cards)
print("Cartes par couleur :", dict(colors))
CHARS = [k for k, v in colors.items() if v >= 50 and k not in ("colorless", "curse", "status", "event", "token", "quest")]
print("Personnages retenus :", CHARS)

print("\nComposition des pools par personnage (rareté x type) :")
for ch in CHARS:
    cnt = collections.Counter((c["rarity_key"], c["type_key"]) for c in cards if c["color"] == ch)
    print(f"  {ch:12}", dict(sorted(cnt.items())))

print("\nCartes de base (Basic) par personnage :")
for ch in CHARS:
    basics = [c for c in cards if c["color"] == ch and c["rarity_key"] == "Basic"]
    print(f"  {ch:12}", [(c["name"], c["cost"], c["type_key"], c["damage"], c["hit_count"], c["block"]) for c in basics])

def pure_attack(c):
    # Attaque « simple » : dégâts sans pioche/énergie/perte de PV ni pouvoirs appliqués
    return (c["type_key"] == "Attack" and c["damage"] and not c["is_x_cost"] and c["cost"] >= 0
            and not c["powers_applied"] and not c["cards_draw"] and not c["energy_gain"] and not c["hp_loss"]
            and not c["block"] and c["color"] in CHARS)

def pure_block(c):
    return (c["type_key"] == "Skill" and c["block"] and not c["is_x_cost"] and c["cost"] >= 0
            and not c["powers_applied"] and not c["cards_draw"] and not c["energy_gain"] and not c["damage"]
            and c["color"] in CHARS)

print("\nAttaques simples : dégâts totaux (dégâts x coups) par coût et rareté [médiane | quartiles | n]")
groups = collections.defaultdict(list)
for c in cards:
    if pure_attack(c):
        groups[(c["cost"], c["rarity_key"])].append(c["damage"] * (c["hit_count"] or 1))
for k in sorted(groups):
    print(f"  coût {k[0]} {k[1]:9} médiane {med(groups[k]):5}  q {q(groups[k])!s:9}  n={len(groups[k])}")

print("\nCompétences d'armure simples : armure par coût et rareté")
groups = collections.defaultdict(list)
for c in cards:
    if pure_block(c):
        groups[(c["cost"], c["rarity_key"])].append(c["block"])
for k in sorted(groups):
    print(f"  coût {k[0]} {k[1]:9} médiane {med(groups[k]):5}  q {q(groups[k])!s:9}  n={len(groups[k])}")

print("\nAmélioration typique des dégâts / armure (valeur ajoutée) :")
dmg_up, blk_up = [], []
for c in cards:
    up = c.get("upgrade") or {}
    for k, v in up.items():
        if isinstance(v, str) and v.startswith("+"):
            try:
                n = int(v[1:])
            except ValueError:
                continue
            if k == "damage":
                dmg_up.append((c["damage"], n))
            elif k == "block":
                blk_up.append((c["block"], n))
print("  dégâts : +%s en médiane (n=%d), soit +%s %%" % (med([n for _, n in dmg_up]), len(dmg_up),
      med([100 * n / b for b, n in dmg_up if b])))
print("  armure : +%s en médiane (n=%d), soit +%s %%" % (med([n for _, n in blk_up]), len(blk_up),
      med([100 * n / b for b, n in blk_up if b])))

kw = collections.Counter(k for c in cards if c["color"] in CHARS for k in (c["keywords_key"] or []))
print("\nMots-clés les plus fréquents :", kw.most_common(10))
pw = collections.Counter(p["power_key"] for c in cards if c["color"] in CHARS for p in (c["powers_applied"] or []))
print("Pouvoirs appliqués les plus fréquents :", pw.most_common(12))

# ---------- Monstres ----------
def act_of(m):
    acts = {e["act"] for e in (m["encounters"] or []) if e["act"]}
    return sorted(acts)

def move_damage(mv):
    d = mv.get("damage")
    if not d or d.get("normal") is None:
        return 0
    return d["normal"] * (d.get("hit_count") or 1)

def act_num(a):
    return a.split(" - ")[0] if a else "?"

print("\nMonstres : PV et dégâts par tour (moyenne des coups, coup max) par acte et type de salle")
rows = collections.defaultdict(lambda: {"hp": [], "avg": [], "max": []})
mon_by_id = {m["id"]: m for m in monsters}
for m in monsters:
    if m["min_hp"] is None:
        continue
    hp = (m["min_hp"] + (m["max_hp"] or m["min_hp"])) / 2
    dmgs = [move_damage(mv) for mv in m["moves"]]
    avg = st.mean(dmgs) if dmgs else 0
    rooms = {(act_num(e["act"]), e["room_type"] + ("-faible" if e["is_weak"] else ""))
             for e in (m["encounters"] or []) if e["act"]}
    for key in rooms:
        rows[key]["hp"].append(hp)
        rows[key]["avg"].append(avg)
        rows[key]["max"].append(max(dmgs) if dmgs else 0)
for k in sorted(rows):
    r = rows[k]
    print(f"  {k[0]:6} {k[1]:15} PV méd {med(r['hp']):6}  q {q([round(x) for x in r['hp']])!s:9}  "
          f"dégâts/tour méd {med(r['avg']):5}  coup max méd {med(r['max']):5}  n={len(r['hp'])}")

print("\nRencontres : nombre de monstres et PV totaux (estimés, 1 exemplaire par id listé)")
enc_rows = collections.defaultdict(lambda: {"n": [], "hp": []})
for e in encounters:
    if not e["act"]:
        continue
    key = (act_num(e["act"]), e["room_type"] + ("-faible" if e["is_weak"] else ""))
    hps = []
    for mm in e["monsters"]:
        m = mon_by_id.get(mm["id"])
        if m and m["min_hp"]:
            hps.append((m["min_hp"] + (m["max_hp"] or m["min_hp"])) / 2)
    enc_rows[key]["n"].append(len(e["monsters"]))
    enc_rows[key]["hp"].append(sum(hps))
for k in sorted(enc_rows):
    r = enc_rows[k]
    print(f"  {k[0]:6} {k[1]:15} monstres méd {med(r['n'])}  PV totaux méd {med(r['hp'])}  n={len(r['n'])}")

pat = collections.Counter((m["attack_pattern"] or {}).get("type") for m in monsters)
print("\nTypes de patterns d'attaque :", dict(pat))
ip = collections.Counter(p["power_id"] for m in monsters for p in (m["innate_powers"] or []))
print("Pouvoirs innés des monstres :", ip.most_common(8))
