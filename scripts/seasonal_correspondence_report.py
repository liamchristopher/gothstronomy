#!/usr/bin/env python3
"""
seasonal_correspondence_report.py

Reproduces the numbers behind docs/insight-seasonal-correspondence-drift.md
by querying gothstronomy_merged.db (see build_db_merged.py). Every number
this prints is a live query, not a cached claim -- if the underlying data
ever changes, this script's output is what to trust over the doc's prose.

Run:
    python3 scripts/seasonal_correspondence_report.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "gothstronomy_merged.db"


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"{DB_PATH.name} not found -- run build_db_merged.py first.")

    conn = sqlite3.connect(DB_PATH)
    try:
        total, matches = conn.execute("""
            SELECT COUNT(*), SUM(CASE WHEN sky_season = tarot_season THEN 1 ELSE 0 END)
            FROM constellation_tarot_detail
        """).fetchone()
        print(f"Direct sky-season / tarot-season match, all {total} constellations: "
              f"{matches}/{total} ({matches / total:.1%})")

        print("\nBy suit family (excluding the 4 circumpolar constellations, which have "
              "no sky season to compare):")
        rows = conn.execute("""
            SELECT su.suit_name = 'Major Arcana' AS is_major, COUNT(*),
                   SUM(CASE WHEN v.sky_season = v.tarot_season THEN 1 ELSE 0 END)
            FROM constellation_tarot_detail v
            JOIN cards c ON c.name = v.card_name
            JOIN suits su ON su.suit_id = c.suit_id
            WHERE v.sky_season != 'Circumpolar (Year-round)'
            GROUP BY 1
            ORDER BY 1
        """).fetchall()
        for is_major, n, m in rows:
            label = "Major Arcana (zodiac/myth-assigned)" if is_major else "Minor Arcana (suit-assigned)"
            print(f"  {label}: {m}/{n} match ({m / n:.1%})")

        print("\nMinor-Arcana-only crosstab (sky season -> tarot season, with counts):")
        rows = conn.execute("""
            SELECT v.sky_season, v.tarot_season, COUNT(*)
            FROM constellation_tarot_detail v
            JOIN cards c ON c.name = v.card_name
            JOIN suits su ON su.suit_id = c.suit_id
            WHERE su.suit_name != 'Major Arcana' AND v.sky_season != 'Circumpolar (Year-round)'
            GROUP BY 1, 2
            ORDER BY 1, 3 DESC
        """).fetchall()
        for sky, tarot, n in rows:
            print(f"  {sky:8s} -> {tarot:8s}  ({n})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
