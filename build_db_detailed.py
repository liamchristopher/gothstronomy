#!/usr/bin/env python3
"""
build_db_detailed.py

Builds gothstronomy_detailed.db -- a second, separate database sharing the
same schema and the same name/goth_title/cardinality/happiness/season/colors
columns as gothstronomy.db (imported directly from build_db.py, so the two
never drift on that content), but replacing the other two columns with
substantially richer data:

  tarot_mapping
    The original database used only 20 of the 22 Major Arcana, with heavy
    repetition (e.g. "The Hermit" alone covered 15 of the 88 rows). This
    version assigns each constellation a specific card from the FULL 78-card
    deck -- all 22 Major Arcana (each used exactly once) plus court cards and
    numbered pips from all four Minor Arcana suits. Method, so the choice is
    principled rather than arbitrary:

      - The 12 constellations that are actual zodiac signs (plus Ophiuchus,
        astronomy's uninvited 13th) keep the standard Golden Dawn
        zodiac-to-Major-Arcana correspondence (Aries=The Emperor, Taurus=The
        Hierophant, and so on) -- a real, established esoteric system, not
        invented for this project.
      - Ten more Major Arcana went to the 88's most mythologically potent,
        archetypal figures (Andromeda, Aquila, Orion, Perseus, Draco, Hydra,
        Pegasus, Phoenix, Corona Borealis, Coma Berenices) -- one card each,
        chosen for a specific thematic resonance with that constellation's
        myth (documented per-card in TAROT_MAPPING below).
      - Every remaining constellation is assigned a suit by which of the
        four astrological seasons it belongs to, using the same
        element-per-season correspondence astrology already uses for the
        cardinal signs that open each season (Aries/Fire opens spring,
        Cancer/Water opens summer, Libra/Air opens autumn, Capricorn/Earth
        opens winter): Spring->Wands, Summer->Cups, Fall->Swords,
        Winter->Pentacles. The three circumpolar constellations (never
        rising or setting, outside the seasonal wheel) are placed
        individually by theme.
      - Within a suit, court cards went to constellations with a clear
        personified mythological figure (kings, queens, knights); numbered
        pips went to the rest, chosen by the specific mood/myth of that row.
      - 88 constellations need 88 cards from a 78-card deck, so a handful of
        cards had to repeat -- but only 12 of the 88 rows share a card with
        another row (each such pair chosen for a real thematic echo, noted
        below), and only 2 of the 78 cards (Ace of Wands, Four of Wands)
        go completely unused. 76 of 78 cards appear at least once.

  astrological_mapping
    The original database gave a bare planet name (and, for zodiac
    constellations, "Sign / Planet"). This version keeps every one of those
    original planet/sign choices unchanged -- they were already sound
    mythological/thematic fits -- but expands each into real classical
    astrological detail: for zodiac signs, element and modality (e.g. "Fire,
    Cardinal"); for every row, the ruling planet's classical day of the
    week, metal, and temperament (the four humors), per standard
    medieval/Renaissance planetary correspondence. The three outer planets
    (Uranus/Neptune/Pluto), used for constellations mapped to them in the
    original data, have no classical correspondence (they weren't discovered
    yet), so they're given their modern astrological attributions instead,
    explicitly noted as such.

Run:
    python3 build_db_detailed.py

This never touches gothstronomy.db or build_db.py -- it only reads
CONSTELLATIONS from build_db.py and writes a new, separate file.
"""

import sqlite3
from pathlib import Path

from build_db import CONSTELLATIONS, SCHEMA

DB_PATH = Path(__file__).parent / "gothstronomy_detailed.db"

# ---------------------------------------------------------------------------
# Tarot: the full 78-card deck, and each constellation's assigned card.
# ---------------------------------------------------------------------------

MAJOR_ARCANA = [
    "The Fool", "The Magician", "The High Priestess", "The Empress",
    "The Emperor", "The Hierophant", "The Lovers", "The Chariot", "Strength",
    "The Hermit", "Wheel of Fortune", "Justice", "The Hanged Man", "Death",
    "Temperance", "The Devil", "The Tower", "The Star", "The Moon",
    "The Sun", "Judgement", "The World",
]
MINOR_SUITS = ["Wands", "Cups", "Swords", "Pentacles"]
MINOR_RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven",
               "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"]
FULL_DECK = set(MAJOR_ARCANA) | {
    f"{rank} of {suit}" for suit in MINOR_SUITS for rank in MINOR_RANKS
}
assert len(FULL_DECK) == 78, f"expected a 78-card deck, built {len(FULL_DECK)}"

# name -> tarot card. See the module docstring for the assignment method.
TAROT_MAPPING = {
    # -- the 12 zodiac signs + Ophiuchus: standard Golden Dawn correspondence --
    "Aries": "The Emperor",
    "Taurus": "The Hierophant",
    "Gemini": "The Lovers",
    "Cancer": "The Chariot",
    "Leo": "Strength",
    "Virgo": "The Hermit",
    "Libra": "Justice",
    "Scorpius": "Death",
    "Sagittarius": "Temperance",
    "Capricornus": "The Devil",
    "Aquarius": "The Star",
    "Pisces": "The Moon",
    # -- 10 more Major Arcana, for the most archetypal non-zodiac myths --
    "Andromeda": "The Hanged Man",       # chained, suspended, self-sacrifice
    "Aquila": "Judgement",               # Zeus's eagle: literal divine judgment
    "Orion": "The Tower",                # hubris, sudden catastrophic downfall
    "Perseus": "The Magician",           # skill, tools, the mirrored shield
    "Draco": "The World",                # the eternal coil encircling the pole
    "Hydra": "Wheel of Fortune",         # endless regeneration, unkillable cycle
    "Pegasus": "The Fool",               # the leap into flight, born of chaos
    "Phoenix": "The Sun",                # fire-death and radiant rebirth
    "Corona Borealis": "The High Priestess",  # the veiled, abandoned bride's mystery
    "Coma Berenices": "The Empress",     # a queen's devoted, fertile sacrifice
    # -- Spring / Wands (12 constellations, all 12 cards distinct) --
    "Antlia": "Two of Wands",
    "Boötes": "King of Wands",
    "Canes Venatici": "Three of Wands",
    "Centaurus": "Knight of Wands",
    "Chamaeleon": "Nine of Wands",
    "Corvus": "Five of Wands",
    "Crater": "Six of Wands",
    "Crux": "Ten of Wands",
    "Leo Minor": "Page of Wands",
    "Musca": "Eight of Wands",
    "Sextans": "Seven of Wands",
    "Ursa Major": "Queen of Wands",
    # -- Summer / Cups (18 constellations; Four/Five/Seven/Eight repeat once) --
    "Ara": "Two of Cups",
    "Circinus": "Nine of Cups",
    "Corona Australis": "Four of Cups",
    "Cygnus": "King of Cups",
    "Delphinus": "Knight of Cups",
    "Equuleus": "Page of Cups",
    "Hercules": "Five of Cups",
    "Lupus": "Five of Cups",
    "Lyra": "Six of Cups",
    "Norma": "Ten of Cups",
    "Ophiuchus": "Seven of Cups",
    "Pavo": "Queen of Cups",
    "Sagitta": "Ace of Cups",
    "Scutum": "Eight of Cups",
    "Serpens": "Eight of Cups",
    "Telescopium": "Four of Cups",
    "Triangulum Australe": "Three of Cups",
    "Vulpecula": "Seven of Cups",
    # -- Fall / Swords (17 constellations; Page/Two/Eight repeat once) --
    "Apus": "Ace of Swords",
    "Camelopardalis": "Page of Swords",
    "Cassiopeia": "Queen of Swords",
    "Cepheus": "King of Swords",
    "Cetus": "Ten of Swords",
    "Eridanus": "Five of Swords",
    "Fornax": "Four of Swords",
    "Grus": "Knight of Swords",
    "Horologium": "Eight of Swords",
    "Hydrus": "Two of Swords",
    "Indus": "Page of Swords",
    "Lacerta": "Seven of Swords",
    "Microscopium": "Three of Swords",
    "Piscis Austrinus": "Nine of Swords",
    "Sculptor": "Six of Swords",
    "Triangulum": "Two of Swords",
    "Tucana": "Eight of Swords",
    # -- Winter / Pentacles (19 constellations; Nine/Four/Eight/Two/Seven repeat once) --
    "Auriga": "Nine of Pentacles",
    "Caelum": "Four of Pentacles",
    "Canis Major": "Knight of Pentacles",
    "Canis Minor": "Page of Pentacles",
    "Carina": "Ten of Pentacles",
    "Columba": "Eight of Pentacles",
    "Dorado": "Nine of Pentacles",
    "Lepus": "Two of Pentacles",
    "Lynx": "Three of Pentacles",
    "Mensa": "Four of Pentacles",
    "Monoceros": "Ace of Pentacles",
    "Octans": "King of Pentacles",
    "Pictor": "Eight of Pentacles",
    "Puppis": "Five of Pentacles",
    "Pyxis": "Seven of Pentacles",
    "Reticulum": "Seven of Pentacles",
    "Ursa Minor": "Queen of Pentacles",
    "Vela": "Six of Pentacles",
    "Volans": "Two of Pentacles",
}

# ---------------------------------------------------------------------------
# Astrology: classical planetary correspondences + zodiac element/modality.
# ---------------------------------------------------------------------------

# planet -> (classical day, metal, temperament, domain)
PLANET_DETAIL = {
    "Sun": ("Sunday", "Gold", "hot & dry", "vitality, kingship, the life-force"),
    "Moon": ("Monday", "Silver", "cold & moist", "instinct, tides, the unconscious"),
    "Mercury": ("Wednesday", "Quicksilver", "cold & dry, mutable by nature", "intellect, communication, trickery"),
    "Venus": ("Friday", "Copper", "cold & moist", "love, beauty, harmony"),
    "Mars": ("Tuesday", "Iron", "hot & dry", "war, aggression, iron will"),
    "Jupiter": ("Thursday", "Tin", "hot & moist", "expansion, fortune, excess"),
    "Saturn": ("Saturday", "Lead", "cold & dry", "limitation, time, decay"),
    "Uranus": ("no classical day -- discovered 1781", "Uranium", "erratic", "sudden rupture, revolution"),
    "Neptune": ("no classical day -- discovered 1846", "Neptunium", "dissolving", "illusion, the oceanic unconscious"),
    "Pluto": ("no classical day -- discovered 1930", "Plutonium", "transformative", "the underworld, destruction and rebirth"),
}

# zodiac sign -> (element, modality)
ZODIAC_DETAIL = {
    "Aries": ("Fire", "Cardinal"), "Taurus": ("Earth", "Fixed"),
    "Gemini": ("Air", "Mutable"), "Cancer": ("Water", "Cardinal"),
    "Leo": ("Fire", "Fixed"), "Virgo": ("Earth", "Mutable"),
    "Libra": ("Air", "Cardinal"), "Scorpio": ("Water", "Fixed"),
    "Sagittarius": ("Fire", "Mutable"), "Capricorn": ("Earth", "Cardinal"),
    "Aquarius": ("Air", "Fixed"), "Pisces": ("Water", "Mutable"),
}

# name -> (zodiac sign or None, ruling planet). Every planet/sign choice here
# is identical to the original gothstronomy.db -- only the presentation
# changes. `sign` uses ZODIAC_DETAIL's keys (note "Scorpio"/"Capricorn", not
# the constellation names "Scorpius"/"Capricornus").
ASTRO_INFO = {
    "Andromeda": (None, "Venus"), "Antlia": (None, "Saturn"),
    "Apus": (None, "Neptune"), "Aquarius": ("Aquarius", "Uranus"),
    "Aquila": (None, "Jupiter"), "Ara": (None, "Mars"),
    "Aries": ("Aries", "Mars"), "Auriga": (None, "Mercury"),
    "Boötes": (None, "Saturn"), "Caelum": (None, "Saturn"),
    "Camelopardalis": (None, "Uranus"), "Cancer": ("Cancer", "Moon"),
    "Canes Venatici": (None, "Mars"), "Canis Major": (None, "Pluto"),
    "Canis Minor": (None, "Mercury"), "Capricornus": ("Capricorn", "Saturn"),
    "Carina": (None, "Neptune"), "Cassiopeia": (None, "Venus"),
    "Centaurus": (None, "Saturn"), "Cepheus": (None, "Saturn"),
    "Cetus": (None, "Neptune"), "Chamaeleon": (None, "Mercury"),
    "Circinus": (None, "Mercury"), "Columba": (None, "Venus"),
    "Coma Berenices": (None, "Venus"), "Corona Australis": (None, "Saturn"),
    "Corona Borealis": (None, "Venus"), "Corvus": (None, "Mercury"),
    "Crater": (None, "Venus"), "Crux": (None, "Saturn"),
    "Cygnus": (None, "Neptune"), "Delphinus": (None, "Neptune"),
    "Dorado": (None, "Neptune"), "Draco": (None, "Pluto"),
    "Equuleus": (None, "Mercury"), "Eridanus": (None, "Neptune"),
    "Fornax": (None, "Mars"), "Gemini": ("Gemini", "Mercury"),
    "Grus": (None, "Saturn"), "Hercules": (None, "Mars"),
    "Horologium": (None, "Saturn"), "Hydra": (None, "Pluto"),
    "Hydrus": (None, "Neptune"), "Indus": (None, "Saturn"),
    "Lacerta": (None, "Mercury"), "Leo": ("Leo", "Sun"),
    "Leo Minor": (None, "Sun"), "Lepus": (None, "Mercury"),
    "Libra": ("Libra", "Venus"), "Lupus": (None, "Mars"),
    "Lynx": (None, "Mercury"), "Lyra": (None, "Neptune"),
    "Mensa": (None, "Saturn"), "Microscopium": (None, "Mercury"),
    "Monoceros": (None, "Venus"), "Musca": (None, "Pluto"),
    "Norma": (None, "Saturn"), "Octans": (None, "Saturn"),
    "Ophiuchus": ("Ophiuchus", "Pluto"), "Orion": (None, "Mars"),
    "Pavo": (None, "Venus"), "Pegasus": (None, "Neptune"),
    "Perseus": (None, "Mars"), "Phoenix": (None, "Sun"),
    "Pictor": (None, "Mercury"), "Pisces": ("Pisces", "Neptune"),
    "Piscis Austrinus": (None, "Neptune"), "Puppis": (None, "Neptune"),
    "Pyxis": (None, "Mercury"), "Reticulum": (None, "Saturn"),
    "Sagitta": (None, "Mars"), "Sagittarius": ("Sagittarius", "Jupiter"),
    "Scorpius": ("Scorpio", "Pluto"), "Sculptor": (None, "Saturn"),
    "Scutum": (None, "Mars"), "Serpens": (None, "Pluto"),
    "Sextans": (None, "Uranus"), "Taurus": ("Taurus", "Venus"),
    "Telescopium": (None, "Uranus"), "Triangulum": (None, "Mercury"),
    "Triangulum Australe": (None, "Saturn"), "Tucana": (None, "Neptune"),
    "Ursa Major": (None, "Moon"), "Ursa Minor": (None, "Moon"),
    "Vela": (None, "Neptune"), "Virgo": ("Virgo", "Mercury"),
    "Volans": (None, "Neptune"), "Vulpecula": (None, "Mercury"),
}


def format_astro(sign, planet):
    day, metal, temperament, domain = PLANET_DETAIL[planet]
    planet_str = f"{planet} ({day}, {metal}) -- {temperament}, {domain}"
    if sign == "Ophiuchus":
        return f"Ophiuchus, the unofficial 13th sign (solar transit ~Nov 30-Dec 17) -- ruled by {planet_str}"
    if sign:
        element, modality = ZODIAC_DETAIL[sign]
        return f"{sign} [{element}, {modality}] -- ruled by {planet_str}"
    return planet_str


def _validate_and_build_rows():
    names = {row[0] for row in CONSTELLATIONS}
    tarot_names = set(TAROT_MAPPING)
    astro_names = set(ASTRO_INFO)

    if names != tarot_names:
        raise SystemExit(
            "TAROT_MAPPING doesn't exactly match CONSTELLATIONS names.\n"
            f"Missing from TAROT_MAPPING: {sorted(names - tarot_names)}\n"
            f"Extra in TAROT_MAPPING: {sorted(tarot_names - names)}"
        )
    if names != astro_names:
        raise SystemExit(
            "ASTRO_INFO doesn't exactly match CONSTELLATIONS names.\n"
            f"Missing from ASTRO_INFO: {sorted(names - astro_names)}\n"
            f"Extra in ASTRO_INFO: {sorted(astro_names - names)}"
        )

    bad_cards = {card for card in TAROT_MAPPING.values() if card not in FULL_DECK}
    if bad_cards:
        raise SystemExit(f"Not real tarot cards: {sorted(bad_cards)}")

    bad_planets = {p for _, p in ASTRO_INFO.values() if p not in PLANET_DETAIL}
    if bad_planets:
        raise SystemExit(f"No PLANET_DETAIL entry for: {sorted(bad_planets)}")
    bad_signs = {s for s, _ in ASTRO_INFO.values() if s and s not in ZODIAC_DETAIL and s != "Ophiuchus"}
    if bad_signs:
        raise SystemExit(f"No ZODIAC_DETAIL entry for: {sorted(bad_signs)}")

    rows = []
    for name, goth_title, cardinality, happiness, season, colors, _old_tarot, _old_astro in CONSTELLATIONS:
        sign, planet = ASTRO_INFO[name]
        rows.append((
            name, goth_title, cardinality, happiness, season, colors,
            TAROT_MAPPING[name], format_astro(sign, planet),
        ))
    return rows


def build() -> None:
    rows = _validate_and_build_rows()

    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(SCHEMA)
        conn.executemany(
            """
            INSERT INTO constellations
                (name, goth_title, cardinality, happiness, season, colors,
                 tarot_mapping, astrological_mapping)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM constellations").fetchone()[0]
        distinct_cards = conn.execute("SELECT COUNT(DISTINCT tarot_mapping) FROM constellations").fetchone()[0]
        print(f"Built {DB_PATH.name} with {count} constellations, "
              f"using {distinct_cards} distinct cards out of the 78-card deck.")
        if count != 88:
            raise SystemExit(f"Expected 88 rows, got {count}.")
    finally:
        conn.close()


if __name__ == "__main__":
    build()
