#!/usr/bin/env python3
"""
build_db_merged.py

Builds gothstronomy_merged.db -- the union of every database in this repo,
joined into one file instead of left as four unrelated artifacts:

  - constellations         from gothstronomy_detailed.db (the richest of the
                            two constellation tables; see build_db_detailed.py)
  - suits / elements / seasons / cards / description_terms / card_descriptions /
    keyword_terms / card_keywords / meaning_terms / meaning_sets /
    meaning_set_items / card_images
                            copied verbatim (schema and data, including the
                            card_image BLOBs) from rider_waite_3nf-lower.sqlite

These two halves were previously joinable only in theory: every one of the
88 `constellations.tarot_mapping` strings happens to exactly match a
`cards.name` in the Rider-Waite database (verified below; the build aborts
if that ever stops being true), but nothing in either file said so or let
you act on it. This script makes that link real:

  - adds `constellations.tarot_card_id INTEGER REFERENCES cards(card_id)`,
    populated from the name match
  - adds a `constellation_tarot_detail` view that joins a constellation to
    its card's suit/element/season, so e.g. "what element governs Orion's
    tarot card" is one query instead of a manual cross-reference between
    two files

gothstronomy.db and gothstronomy_original.db contribute nothing new here --
gothstronomy_original.db is a byte-for-byte backup of gothstronomy.db, and
gothstronomy.db's own constellations data is a strict subset of
gothstronomy_detailed.db's (same name/goth_title/cardinality/happiness/
season/colors, plus richer tarot_mapping/astrological_mapping) -- so neither
is copied here; the game itself is untouched and keeps reading
gothstronomy.db directly (see README.md).

Run:
    python3 build_db_merged.py
"""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).parent
DETAILED_DB = ROOT / "gothstronomy_detailed.db"
RIDER_WAITE_DB = ROOT / "rider_waite_3nf-lower.sqlite"
MERGED_DB = ROOT / "gothstronomy_merged.db"

RIDER_WAITE_TABLES = [
    "suits", "elements", "seasons", "cards", "description_terms",
    "card_descriptions", "keyword_terms", "card_keywords", "meaning_terms",
    "meaning_sets", "meaning_set_items", "card_images",
]


def build() -> None:
    if MERGED_DB.exists():
        MERGED_DB.unlink()

    conn = sqlite3.connect(MERGED_DB)
    try:
        conn.execute(f"ATTACH DATABASE '{DETAILED_DB}' AS src_detailed")
        conn.execute(f"ATTACH DATABASE '{RIDER_WAITE_DB}' AS src_rw")

        # --- constellations, from the detailed db ---------------------------
        conn.execute("""
            CREATE TABLE constellations (
                id                     INTEGER PRIMARY KEY AUTOINCREMENT,
                name                   TEXT NOT NULL UNIQUE,
                goth_title             TEXT NOT NULL,
                cardinality            INTEGER NOT NULL,
                happiness              TEXT NOT NULL,
                season                 TEXT NOT NULL,
                colors                 TEXT NOT NULL,
                tarot_mapping          TEXT NOT NULL,
                astrological_mapping   TEXT NOT NULL,
                tarot_card_id          INTEGER REFERENCES cards(card_id)
            )
        """)
        conn.execute("""
            INSERT INTO constellations
                (id, name, goth_title, cardinality, happiness, season, colors,
                 tarot_mapping, astrological_mapping)
            SELECT id, name, goth_title, cardinality, happiness, season, colors,
                   tarot_mapping, astrological_mapping
            FROM src_detailed.constellations
        """)

        # --- full Rider-Waite tarot schema, copied verbatim ------------------
        for table in RIDER_WAITE_TABLES:
            create_sql = conn.execute(
                "SELECT sql FROM src_rw.sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()[0]
            conn.execute(create_sql)
            conn.execute(f"INSERT INTO {table} SELECT * FROM src_rw.{table}")

        # --- the link the two files couldn't express on their own -----------
        unmatched = conn.execute("""
            SELECT tarot_mapping FROM constellations
            WHERE tarot_mapping NOT IN (SELECT name FROM cards)
        """).fetchall()
        if unmatched:
            raise SystemExit(
                f"{len(unmatched)} tarot_mapping value(s) don't match any "
                f"Rider-Waite card name: {[r[0] for r in unmatched]}"
            )

        conn.execute("""
            UPDATE constellations
            SET tarot_card_id = (
                SELECT card_id FROM cards WHERE cards.name = constellations.tarot_mapping
            )
        """)

        conn.execute("""
            CREATE VIEW constellation_tarot_detail AS
            SELECT
                c.id, c.name, c.goth_title, c.happiness, c.season AS sky_season,
                c.tarot_mapping AS card_name, su.suit_name,
                se.season_name AS tarot_season, el.element_name AS tarot_element,
                rc.appearance_description
            FROM constellations c
            JOIN cards rc ON rc.card_id = c.tarot_card_id
            JOIN suits su ON su.suit_id = rc.suit_id
            LEFT JOIN seasons se ON se.season_id = rc.season_id
            LEFT JOIN elements el ON el.element_id = rc.element_id
        """)

        conn.commit()

        star_count = conn.execute("SELECT COUNT(*) FROM constellations").fetchone()[0]
        card_count = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
        linked = conn.execute(
            "SELECT COUNT(*) FROM constellations WHERE tarot_card_id IS NOT NULL"
        ).fetchone()[0]
        image_count = conn.execute("SELECT COUNT(*) FROM card_images").fetchone()[0]
        print(
            f"Built {MERGED_DB.name}: {star_count} constellations, {card_count} tarot "
            f"cards ({image_count} card images), {linked}/{star_count} constellations "
            f"linked to a card via tarot_card_id."
        )
        if star_count != 88:
            raise SystemExit(f"Expected 88 constellations, got {star_count}.")
        if card_count != 78:
            raise SystemExit(f"Expected 78 tarot cards, got {card_count}.")
        if linked != star_count:
            raise SystemExit(f"Expected every constellation linked, got {linked}/{star_count}.")
    finally:
        conn.close()


if __name__ == "__main__":
    build()
