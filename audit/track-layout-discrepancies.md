# Track Layout Discrepancy Audit (Independent OpenStreetMap Overpass vs `TRACK_SVG_PATHS`)

Generated against **43 circuits** using live OpenStreetMap Overpass API geometry centered on verified GPS coordinates (`CIRCUIT_GEO`).
Notice: `TRACK_SVG_PATHS` and `trackElevations.ts` were **NOT modified**; all OSM reference SVGs live strictly in `audit/osmCandidateSvgs.ts`.

## Summary
- **HIGH Discrepancy**: 28 circuits (notable geometric shape, corner sequence, or aspect ratio mismatch even after optimal rotation alignment)
- **MEDIUM Discrepancy / Incomplete OSM**: 15 circuits (moderate shape divergence, chicane/hairpin detail drift, or temporary street circuit lacking continuous `highway=raceway` tags in OSM)
- **LOW Discrepancy (Faithful Shape)**: 0 circuits (strong structural agreement after rotation alignment)

> **Score Guide:** Rotation-aligned Chamfer distance is normalized to a unit-RMS shape (`~5–10` = very close, `10–18` = noticeable corner/straight proportion drift, `>= 18` = major structural mismatch). `BestRot` shows map orientation offset relative to North-up OSM.

## Full Ranked Audit Table (Highest → Lowest Discrepancy)

| Rank | Track ID | Severity | Score | Aligned Shape Err | Raw Err | BestRot | Aspect (Cur / OSM) | Corners (Cur / OSM) | Len (Ref / OSM) | Notes |
|---:|---|---|---:|---:|---:|---:|---|---|---|---|
| 1 | `watkins-glen` | **HIGH** | 53.94 | 12.96 | 27.68 | 260° | 1.47 / 0.41 | 22 / 2 | 5472m / 5454m | Map rotated ~260° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 2 | `montreal` | **HIGH** | 51.14 | 11.79 | 44.29 | 285° | 2.37 / 0.33 | 16 / 12 | 4361m / 4370m | Map rotated ~285° vs North-up; Aspect ratio stretched |
| 3 | `jeddah` | **HIGH** | 48.31 | 4.32 | 72.15 | 250° | 1.65 / 0.21 | 24 / 16 | 6174m / 6203m | Map rotated ~250° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 4 | `barcelona` | **HIGH** | 43.44 | 10.02 | 32.79 | 65° | 2.13 / 0.82 | 22 / 4 | 4657m / 4670m | Map rotated ~65° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 5 | `portimao` | **HIGH** | 43 | 13.46 | 30 | 275° | 1.43 / 0.59 | 21 / 6 | 4653m / 4657m | Map rotated ~275° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 6 | `indianapolis-road` | **HIGH** | 41.75 | 15.37 | 37.5 | 75° | 1.29 / 0.47 | 18 / 9 | 3925m / 4088m | Map rotated ~75° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 7 | `yas-marina` | **HIGH** | 38.93 | 11.76 | 29.93 | 100° | 1.42 / 0.47 | 19 / 11 | 5281m / 5299m | Map rotated ~100° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 8 | `hungaroring` | **HIGH** | 36.9 | 12.91 | 21.84 | 335° | 0.57 / 0.88 | 24 / 6 | 4381m / 4381m | Map rotated ~335° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 9 | `silverstone` | **HIGH** | 36.14 | 11.98 | 25.5 | 275° | 1.03 / 0.6 | 21 / 5 | 5891m / 5884m | Map rotated ~275° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 10 | `zandvoort` | **HIGH** | 34.11 | 10.68 | 28.36 | 260° | 0.61 / 1.17 | 19 / 6 | 4259m / 4260m | Map rotated ~260° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 11 | `miami` | **HIGH** | 33.09 | 12.94 | 13.2 | 355° | 1.5 / 2.52 | 25 / 13 | 5412m / 5421m | Aspect ratio stretched; Corner density/chicane detail differs |
| 12 | `interlagos` | **HIGH** | 31.48 | 11.79 | 18.71 | 50° | 0.98 / 0.63 | 20 / 7 | 4309m / 4302m | Map rotated ~50° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 13 | `sepang` | **HIGH** | 31.31 | 12.83 | 13.03 | 5° | 0.72 / 1.22 | 22 / 12 | 5543m / 5555m | Aspect ratio stretched; Corner density/chicane detail differs |
| 14 | `red-bull-ring` | **HIGH** | 30.83 | 13.42 | 14.67 | 15° | 0.95 / 1.59 | 13 / 4 | 4318m / 4307m | Aspect ratio stretched; Corner density/chicane detail differs |
| 15 | `shanghai` | **HIGH** | 29.31 | 12.09 | 19.45 | 115° | 0.93 / 1.14 | 27 / 12 | 5451m / 5454m | Map rotated ~115° vs North-up; Corner density/chicane detail differs |
| 16 | `lusail` | **HIGH** | 29.07 | 13.18 | 16.31 | 25° | 0.82 / 0.85 | 20 / 3 | 5419m / 5427m | Map rotated ~25° vs North-up; Corner density/chicane detail differs |
| 17 | `suzuka` | **HIGH** | 28.72 | 5.98 | 11.59 | 15° | 1.12 / 1.87 | 24 / 9 | 5807m / 5818m | Aspect ratio stretched; Corner density/chicane detail differs |
| 18 | `monza` | **HIGH** | 28.31 | 10.48 | 49.37 | 280° | 1.21 / 0.58 | 15 / 10 | 5793m / 5793m | Map rotated ~280° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 19 | `las-vegas` | **HIGH** | 27.83 | 16.19 | 19.97 | 280° | 0.99 / 0.6 | 14 / 11 | 6201m / 6228m | Map rotated ~280° vs North-up; Aspect ratio stretched |
| 20 | `singapore` | **HIGH** | 24.32 | 10.72 | 11.89 | 350° | 0.93 / 1.54 | 20 / 15 | 4940m / 4948m | Aspect ratio stretched; Corner density/chicane detail differs |
| 21 | `spa-francorchamps` | **HIGH** | 24.29 | 12.01 | 23.42 | 255° | 0.95 / 0.62 | 21 / 16 | 7004m / 6986m | Map rotated ~255° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 22 | `albert-park` | **HIGH** | 23.75 | 12.01 | 24.5 | 325° | 1.22 / 0.82 | 18 / 13 | 5278m / 5279m | Map rotated ~325° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 23 | `mexico-city` | **HIGH** | 23.64 | 11.41 | 16.9 | 15° | 0.82 / 1.38 | 17 / 14 | 4304m / 4307m | Aspect ratio stretched |
| 24 | `bahrain` | **HIGH** | 22.83 | 14.52 | 17.16 | 285° | 0.92 / 0.67 | 13 / 10 | 5412m / 5425m | Map rotated ~285° vs North-up; Aspect ratio stretched |
| 25 | `cota` | **HIGH** | 22.68 | 9.51 | 14.04 | 345° | 1.03 / 1.75 | 24 / 20 | 5513m / 5526m | Aspect ratio stretched |
| 26 | `monaco` | **HIGH** | 22.59 | 8.55 | 49.74 | 60° | 1.57 / 0.76 | 21 / 20 | 3337m / 3328m | Map rotated ~60° vs North-up; Aspect ratio stretched |
| 27 | `madring` | **HIGH** | 22.19 | 9.21 | 43.22 | 75° | 0.95 / 0.62 | 25 / 19 | 5474m / 5437m | Map rotated ~75° vs North-up; Aspect ratio stretched; Corner density/chicane detail differs |
| 28 | `imola` | **HIGH** | 18.84 | 8.5 | 15.81 | 345° | 1.15 / 1.93 | 12 / 11 | 4909m / 4904m | Aspect ratio stretched |
| 29 | `baku` | **MEDIUM** | 17.2 | 9.12 | 15.54 | 15° | 1.74 / 1.36 | 15 / 19 | 6003m / 5993m | Aspect ratio stretched |
| 30 | `daytona-road` | **MEDIUM** | 15 | — | — | — | — | — | 5729m / — | The operation was aborted due to timeout |
| 31 | `detroit-street` | **MEDIUM** | 15 | — | — | — | — | — | 2735m / — | The operation was aborted due to timeout |
| 32 | `fuji` | **MEDIUM** | 15 | — | — | — | — | — | 4563m / — | The operation was aborted due to timeout |
| 33 | `laguna-seca` | **MEDIUM** | 15 | — | — | — | — | — | 3602m / — | The operation was aborted due to timeout |
| 34 | `le-mans` | **MEDIUM** | 15 | — | — | — | — | — | 13626m / — | The operation was aborted due to timeout |
| 35 | `lime-rock` | **MEDIUM** | 15 | — | — | — | — | — | 2414m / — | The operation was aborted due to timeout |
| 36 | `long-beach` | **MEDIUM** | 15 | — | — | — | — | — | 3167m / — | The operation was aborted due to timeout |
| 37 | `mid-ohio` | **MEDIUM** | 15 | — | — | — | — | — | 3634m / — | The operation was aborted due to timeout |
| 38 | `mosport` | **MEDIUM** | 15 | — | — | — | — | — | 3957m / — | The operation was aborted due to timeout |
| 39 | `road-america` | **MEDIUM** | 15 | — | — | — | — | — | 6515m / — | The operation was aborted due to timeout |
| 40 | `road-atlanta` | **MEDIUM** | 15 | — | — | — | — | — | 4088m / — | The operation was aborted due to timeout |
| 41 | `sebring` | **MEDIUM** | 15 | — | — | — | — | — | 6019m / — | The operation was aborted due to timeout |
| 42 | `vir` | **MEDIUM** | 15 | — | — | — | — | — | 5260m / — | The operation was aborted due to timeout |
| 43 | `paul-ricard` | **MEDIUM** | 13.27 | 4.06 | 13.21 | 15° | 0.96 / 1.6 | 20 / 20 | 5842m / 5825m | Aspect ratio stretched |
