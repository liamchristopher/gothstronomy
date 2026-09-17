#!/usr/bin/env python3
"""
build_db.py

Builds gothstronomy.db: a SQLite database of all 88 IAU-recognized
constellations, each with a suggested goth-themed title plus columns for
cardinality, happiness, season, colors, tarot mappings, and astrological
mappings.

Run:
    python3 build_db.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "gothstronomy.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS constellations (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    name                   TEXT NOT NULL UNIQUE,
    goth_title             TEXT NOT NULL,
    cardinality            INTEGER NOT NULL,
    happiness              TEXT NOT NULL,
    season                 TEXT NOT NULL,
    colors                 TEXT NOT NULL,
    tarot_mapping          TEXT NOT NULL,
    astrological_mapping   TEXT NOT NULL
);
"""

# Columns: name, goth_title, cardinality, happiness, season, colors,
# tarot_mapping, astrological_mapping
CONSTELLATIONS = [
    ("Andromeda", "The Chained Bride of Sorrow", 4, "Anguish", "Fall", "Bone White, Iron Grey", "The Hanged Man", "Venus"),
    ("Antlia", "The Bellows of the Drowned", 3, "Ennui", "Spring", "Ash Grey", "The Hermit", "Saturn"),
    ("Apus", "The Plumage of the Damned", 4, "Melancholy", "Fall", "Obsidian, Deep Violet", "The Star", "Neptune"),
    ("Aquarius", "The Vessel of Endless Tears", 13, "Grief", "Fall", "Midnight Blue, Silver", "The Star", "Aquarius / Uranus"),
    ("Aquila", "The Talon of Judgment", 5, "Wrath", "Summer", "Blood Red, Black", "Judgement", "Jupiter"),
    ("Ara", "The Altar of Broken Oaths", 7, "Bitterness", "Summer", "Charcoal, Rust", "The Devil", "Mars"),
    ("Aries", "The Fleece of the Forsaken", 4, "Longing", "Fall", "Bone White, Rust", "The Emperor", "Aries / Mars"),
    ("Auriga", "The Charioteer of the Weeping Goat", 6, "Sorrow", "Winter", "Iron Grey, Rust", "The Chariot", "Mercury"),
    ("Boötes", "The Herdsman of the Restless Dead", 7, "Resignation", "Spring", "Deep Violet, Ash Grey", "The Hermit", "Saturn"),
    ("Caelum", "The Chisel of the Silent Sculptor", 4, "Numbness", "Winter", "Charcoal", "The Hierophant", "Saturn"),
    ("Camelopardalis", "The Long-Necked Wanderer of the Void", 5, "Isolation", "Circumpolar (Year-round)", "Ash Grey, Bone White", "The Hermit", "Uranus"),
    ("Cancer", "The Carapace of the Crushed", 5, "Grief", "Winter", "Pale Grey, Silver", "The Moon", "Cancer / Moon"),
    ("Canes Venatici", "The Hounds of the Endless Hunt", 2, "Dread", "Spring", "Black, Rust", "Strength", "Mars"),
    ("Canis Major", "The Hound of the Death Star", 8, "Wrath", "Winter", "Blood Red, Black", "Death", "Pluto"),
    ("Canis Minor", "The Lesser Hound of Forgotten Loyalty", 2, "Isolation", "Winter", "Ash Grey", "The Fool", "Mercury"),
    ("Capricornus", "The Drowned Goat of Pan's Terror", 8, "Dread", "Fall", "Charcoal, Obsidian", "The Devil", "Capricorn / Saturn"),
    ("Carina", "The Keel of the Sunken Argo", 6, "Melancholy", "Winter", "Iron Grey, Obsidian", "The Tower", "Neptune"),
    ("Cassiopeia", "The Vain Queen's Throne of Torment", 5, "Torment", "Fall", "Deep Violet, Gold-tarnish", "The Empress", "Venus"),
    ("Centaurus", "The Wounded Healer's Last Ride", 11, "Anguish", "Spring", "Rust, Bone White", "The Hermit", "Saturn"),
    ("Cepheus", "The King Who Chained His Daughter", 5, "Regret", "Fall", "Iron Grey, Blood Red", "The Emperor", "Saturn"),
    ("Cetus", "The Leviathan of Devouring Dread", 14, "Wrath", "Fall", "Obsidian, Midnight Blue", "The Devil", "Neptune"),
    ("Chamaeleon", "The Silent Stalker of the Southern Void", 4, "Numbness", "Spring", "Ash Grey, Moss Black", "The Hermit", "Mercury"),
    ("Circinus", "The Compass of the Damned Cartographer", 3, "Ennui", "Summer", "Charcoal", "The Hierophant", "Mercury"),
    ("Columba", "The Dove That Never Returned", 5, "Longing", "Winter", "Bone White, Ash Grey", "The Star", "Venus"),
    ("Coma Berenices", "The Shorn Locks of Sacrifice", 3, "Grief", "Spring", "Silver, Bone White", "The Empress", "Venus"),
    ("Corona Australis", "The Crown Cast Into the Abyss", 7, "Despair", "Summer", "Deep Violet, Obsidian", "The Wheel of Fortune", "Saturn"),
    ("Corona Borealis", "The Abandoned Bride's Crown", 7, "Sorrow", "Summer", "Silver, Deep Violet", "The Lovers", "Venus"),
    ("Corvus", "The Liar's Crow of Apollo's Wrath", 5, "Bitterness", "Spring", "Black, Obsidian", "The Tower", "Mercury"),
    ("Crater", "The Cup That Poisoned Patience", 7, "Bitterness", "Spring", "Bone White, Rust", "Temperance", "Venus"),
    ("Crux", "The Cross of the Southern Martyrs", 4, "Sorrow", "Spring", "Blood Red, Black", "The Hanged Man", "Saturn"),
    ("Cygnus", "The Swan Song of the Grieving Bard", 9, "Grief", "Summer", "Bone White, Midnight Blue", "Death", "Neptune"),
    ("Delphinus", "The Dolphin's Rescue From the Deep", 5, "Longing", "Summer", "Silver, Midnight Blue", "The Star", "Neptune"),
    ("Dorado", "The Golden Hunter of the Abyssal Dark", 4, "Isolation", "Winter", "Rust-gold, Black", "The Moon", "Neptune"),
    ("Draco", "The Slain Dragon's Eternal Coil", 14, "Wrath", "Circumpolar (Year-round)", "Obsidian, Rust", "The Devil", "Pluto"),
    ("Equuleus", "The Foal That Never Grew", 4, "Sorrow", "Summer", "Bone White", "The Fool", "Mercury"),
    ("Eridanus", "The River of Phaeton's Endless Fall", 24, "Despair", "Fall", "Midnight Blue, Iron Grey", "The Tower", "Neptune"),
    ("Fornax", "The Furnace That Forges Ash", 3, "Numbness", "Fall", "Charcoal, Rust", "The Tower", "Mars"),
    ("Gemini", "The Twins Divided by Death", 8, "Grief", "Winter", "Bone White, Black", "The Lovers", "Gemini / Mercury"),
    ("Grus", "The Crane That Watches the Grave", 6, "Dread", "Fall", "Ash Grey, Bone White", "The Hermit", "Saturn"),
    ("Hercules", "The Kneeling Hero's Twelve Torments", 9, "Torment", "Summer", "Rust, Iron Grey", "Strength", "Mars"),
    ("Horologium", "The Clock That Counts the Dying Hours", 6, "Dread", "Fall", "Charcoal, Silver", "The Wheel of Fortune", "Saturn"),
    ("Hydra", "The Many-Headed Serpent of Undying Malice", 17, "Wrath", "Spring", "Obsidian, Venom Green-Black", "Death", "Pluto"),
    ("Hydrus", "The Lesser Serpent of the Southern Deep", 5, "Isolation", "Fall", "Midnight Blue, Black", "The Moon", "Neptune"),
    ("Indus", "The Wanderer of the Forgotten Frontier", 4, "Isolation", "Fall", "Rust, Ash Grey", "The Hermit", "Saturn"),
    ("Lacerta", "The Lizard That Slips Through Shadow", 5, "Ennui", "Fall", "Ash Grey, Moss Black", "The Moon", "Mercury"),
    ("Leo", "The Nemean Lion's Unkillable Hide", 9, "Wrath", "Spring", "Rust, Gold-tarnish, Black", "Strength", "Leo / Sun"),
    ("Leo Minor", "The Lion's Forgotten Cub", 4, "Isolation", "Spring", "Ash Grey, Rust", "The Sun", "Sun"),
    ("Lepus", "The Hare Forever Fleeing the Hunter", 6, "Dread", "Winter", "Bone White, Ash Grey", "The Moon", "Mercury"),
    ("Libra", "The Scales That Weigh the Damned", 4, "Grim Resolve", "Summer", "Iron Grey, Bone White", "Justice", "Libra / Venus"),
    ("Lupus", "The Wolf Bound for the Altar", 9, "Dread", "Summer", "Charcoal, Blood Red", "The Devil", "Mars"),
    ("Lynx", "The Eyes That See Only in Darkness", 6, "Isolation", "Winter", "Ash Grey, Rust", "The Hermit", "Mercury"),
    ("Lyra", "The Silenced Lyre of Orpheus", 5, "Grief", "Summer", "Deep Violet, Bone White", "The Hanged Man", "Neptune"),
    ("Mensa", "The Mountain That Fades Into Mist", 4, "Ennui", "Winter", "Ash Grey", "The Hermit", "Saturn"),
    ("Microscopium", "The Lens That Reveals the Rot", 4, "Dread", "Fall", "Charcoal, Silver", "The Moon", "Mercury"),
    ("Monoceros", "The Unicorn Lost in the Winter Dark", 4, "Melancholy", "Winter", "Bone White, Midnight Blue", "The Star", "Venus"),
    ("Musca", "The Fly That Feasts on the Dying Light", 6, "Numbness", "Spring", "Obsidian, Rust", "Death", "Pluto"),
    ("Norma", "The Level That Measures the Fallen", 4, "Ennui", "Summer", "Charcoal", "The Hierophant", "Saturn"),
    ("Octans", "The Pole of Eternal Stillness", 5, "Numbness", "Circumpolar (Year-round)", "Ash Grey, Black", "The Hermit", "Saturn"),
    ("Ophiuchus", "The Serpent Bearer's Forbidden Cure", 10, "Torment", "Summer", "Deep Violet, Venom Green-Black", "The Hierophant", "Ophiuchus / Pluto"),
    ("Orion", "The Hunter Slain by His Own Pride", 7, "Wrath", "Winter", "Blood Red, Iron Grey, Black", "The Tower", "Mars"),
    ("Pavo", "The Peacock's Vanity in the Dark", 6, "Vanity", "Summer", "Deep Violet, Gold-tarnish", "The Empress", "Venus"),
    ("Pegasus", "The Winged Horse Born From Medusa's Death", 4, "Grief", "Fall", "Bone White, Blood Red", "Death", "Neptune"),
    ("Perseus", "The Hero Who Carries the Gorgon's Head", 6, "Grim Resolve", "Fall", "Blood Red, Iron Grey", "The Magician", "Mars"),
    ("Phoenix", "The Ashes That Refuse to Rest", 5, "Resignation", "Fall", "Rust, Charcoal, Blood Red", "Judgement", "Sun"),
    ("Pictor", "The Easel of the Forgotten Painter", 3, "Ennui", "Winter", "Charcoal, Ash Grey", "The Hierophant", "Mercury"),
    ("Pisces", "The Fish Bound by an Unbreakable Cord", 14, "Longing", "Fall", "Midnight Blue, Silver", "The Moon", "Pisces / Neptune"),
    ("Piscis Austrinus", "The Fish That Drinks the Endless Tears", 8, "Grief", "Fall", "Midnight Blue, Bone White", "The Star", "Neptune"),
    ("Puppis", "The Stern of the Wrecked Argo", 9, "Despair", "Winter", "Iron Grey, Obsidian", "The Tower", "Neptune"),
    ("Pyxis", "The Broken Compass of the Lost Voyage", 3, "Isolation", "Winter", "Charcoal", "The Hermit", "Mercury"),
    ("Reticulum", "The Net That Catches Nothing but Silence", 4, "Ennui", "Winter", "Ash Grey", "The Hanged Man", "Saturn"),
    ("Sagitta", "The Arrow That Never Misses Its Mark", 4, "Grim Resolve", "Summer", "Iron Grey, Blood Red", "The Chariot", "Mars"),
    ("Sagittarius", "The Archer Who Guards the Abyss's Heart", 8, "Grim Resolve", "Summer", "Deep Violet, Black", "Temperance", "Sagittarius / Jupiter"),
    ("Scorpius", "The Scorpion That Ended the Hunter", 15, "Wrath", "Summer", "Blood Red, Black", "Death", "Scorpio / Pluto"),
    ("Sculptor", "The Sculptor's Unfinished Corpse of Marble", 4, "Numbness", "Fall", "Bone White, Charcoal", "The Hierophant", "Saturn"),
    ("Scutum", "The Shield That Failed to Save Him", 4, "Regret", "Summer", "Iron Grey, Rust", "The Emperor", "Mars"),
    ("Serpens", "The Serpent Torn in Two by the Healer", 11, "Torment", "Summer", "Venom Green-Black, Obsidian", "The Devil", "Pluto"),
    ("Sextans", "The Sextant That Navigates the Void", 4, "Isolation", "Spring", "Charcoal, Ash Grey", "The Hermit", "Uranus"),
    ("Taurus", "The Bull That Stole the Weeping Princess", 7, "Wrath", "Winter", "Blood Red, Rust, Black", "The Hierophant", "Taurus / Venus"),
    ("Telescopium", "The Telescope That Watches the End of All Things", 4, "Dread", "Summer", "Charcoal, Midnight Blue", "The Tower", "Uranus"),
    ("Triangulum", "The Triangle That Points to the Abyss", 3, "Ennui", "Fall", "Ash Grey, Silver", "The Hierophant", "Mercury"),
    ("Triangulum Australe", "The Southern Triangle of Silent Judgment", 3, "Grim Resolve", "Summer", "Ash Grey, Deep Violet", "Justice", "Saturn"),
    ("Tucana", "The Toucan That Guards the Small Cloud of Souls", 4, "Isolation", "Fall", "Obsidian, Bone White", "The Moon", "Neptune"),
    ("Ursa Major", "The Great Bear's Eternal Exile", 7, "Sorrow", "Spring", "Iron Grey, Rust", "The Moon", "Moon"),
    ("Ursa Minor", "The Little Bear's Eternal Vigil", 7, "Resignation", "Circumpolar (Year-round)", "Midnight Blue, Silver", "The Hermit", "Moon"),
    ("Vela", "The Sails That Carry the Dead Onward", 6, "Despair", "Winter", "Bone White, Midnight Blue", "Death", "Neptune"),
    ("Virgo", "The Maiden Who Mourns the Dying Harvest", 9, "Grief", "Spring", "Bone White, Rust, Ash Grey", "The Hermit", "Virgo / Mercury"),
    ("Volans", "The Fish That Fled Into the Starless Sky", 5, "Dread", "Winter", "Midnight Blue, Silver", "The Star", "Neptune"),
    ("Vulpecula", "The Fox That Prowls the Dying Light", 4, "Isolation", "Summer", "Rust, Charcoal", "The Hermit", "Mercury"),
]


def build() -> None:
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
            CONSTELLATIONS,
        )
        conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM constellations").fetchone()[0]
        print(f"Built {DB_PATH.name} with {count} constellations.")
        if count != 88:
            raise SystemExit(
                f"Expected all 88 IAU constellations, got {count}. Check for duplicates or gaps."
            )
    finally:
        conn.close()


if __name__ == "__main__":
    build()
