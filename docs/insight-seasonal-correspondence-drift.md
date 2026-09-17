# Insight: the merge reveals a season is not a season

Merging `gothstronomy_detailed.db` and `rider_waite_3nf-lower.sqlite` into `gothstronomy_merged.db`
(`build_db_merged.py`) makes a question answerable for the first time that neither file could
answer alone: **does a constellation's real sky-visibility season line up with the traditional
season of the tarot card it's mapped to?**

The two columns look like they should agree — they're the same word, "season," attached to
related mythological content. They don't agree, anywhere close to chance, and the mismatch turns
out to be a clean, 100%-deterministic pattern rather than noise. Reproduce every number below with
`python3 scripts/seasonal_correspondence_report.py`.

## The numbers

| Group | Constellations | Sky season matches tarot season |
|---|---|---|
| All (minus 4 circumpolar, which have no sky season) | 84 | 4 (4.8%) |
| Major Arcana (zodiac sign or myth-assigned card) | 21 | 4 (19.0%) |
| Minor Arcana (suit assigned by season) | 63 | **0 (0.0%)** |

For the 63 constellations whose card comes from a suit (`build_db_detailed.py` assigns
Spring→Wands, Summer→Cups, Fall→Swords, Winter→Pentacles), the mismatch isn't partial — it's
total, and it's a single fixed rotation:

```
Fall   -> Winter   (16/16)
Spring -> Summer   (12/12)
Summer -> Spring   (18/18)
Winter -> Autumn   (17/17)
```

## Why: two correct traditions, anchored a quarter-turn apart

Both files encode a real, defensible elemental-season correspondence — they just anchor the wheel
at different points:

- **`build_db_detailed.py`** assigns a suit to the season whose *cardinal sign opens* it: Aries
  (Fire) opens spring, so Fire → Wands → Spring; Cancer (Water) opens summer → Cups → Summer; Libra
  (Air) opens fall → Swords → Fall; Capricorn (Earth) opens winter → Pentacles → Winter.
- **`rider_waite_3nf-lower.sqlite`** assigns each suit to the season the query shows above: Wands →
  Summer, Cups → Spring, Swords → Winter, Pentacles → Autumn — the season each element is
  traditionally understood to *dominate*, not the one its cardinal sign opens.

Both conventions exist in real esoteric practice; nothing in either database is wrong on its own.
The active elements (Fire/Air) land one season *later* under the Rider-Waite convention than under
gothstronomy's, and the passive elements (Water/Earth) land one season *earlier* — an exact,
opposite-direction quarter-turn for the active/passive pair, not a random drift.

The 21 Major-Arcana-mapped constellations behave differently (19% match, not 0%) because those
cards were never chosen for seasonal reasons — the 12 zodiac constellations keep the standard
Golden Dawn zodiac-to-Arcana correspondence, and 9 more were picked for mythic resonance
(Andromeda→The Hanged Man, Orion→The Tower, etc.). Their occasional season match is coincidence,
not a rule — which is itself the control group that shows the Minor Arcana's 0% isn't a fluke of
small numbers, since 0/63 is far tighter than 4/21.

## Why this only shows up now

Before this merge, `constellations.season` and the tarot deck's `seasons` table lived in separate
files with no shared key, so nobody could write the one query that surfaces this — you'd have to
manually look up 88 cards' traditional seasons and compare them by hand. `build_db_merged.py`'s
`tarot_card_id` link and `constellation_tarot_detail` view turn that into:

```sql
SELECT sky_season, tarot_season, COUNT(*)
FROM constellation_tarot_detail
GROUP BY 1, 2;
```

That's the practical payoff of the merge: not just fewer files, but a question about the *combined*
dataset that was previously unaskable becoming a nine-line script.
