# Apex Miniature — Multi-Car Physics & AI Benchmark Report

Audited **all 76 vehicles** in `CARS` across **7 flagship circuits** (`spa-francorchamps`, `monza`, `suzuka`, `silverstone`, `laguna-seca`, `le-mans`, `monaco`) running at `Alien` (1.07× pace) flying-lap pace at `60 Hz`.

## 1. Class-Level Performance Summary vs Real-World Targets

| Class | Cars | Mean 0–100 | Mean 0–200 | Base Vmax Range | Special Vmax Range | Avg Off-Track % | Total Wall Hits |
|---|---:|---:|---:|---|---|---:|---:|
| `HYPERCAR_GTP` | 12 | 2.71s | 6.11s | 331–346 km/h | 343–356 km/h | 0.00% | 0 |
| `LMP2` | 4 | 2.94s | 6.74s | 316–326 km/h | 316–326 km/h | 0.00% | 0 |
| `GT3` | 14 | 3.26s | 8.12s | 286–301 km/h | 286–301 km/h | 0.00% | 0 |
| `GT4` | 8 | 4.18s | 11.00s | 260–270 km/h | 260–270 km/h | 0.00% | 0 |
| `F1_2026` | 11 | 1.87s | 3.97s | 323–332 km/h | 347–357 km/h | 0.00% | 0 |
| `F1_2021` | 4 | 1.83s | 3.85s | 335–343 km/h | 347–355 km/h | 0.00% | 0 |
| `F1_2005` | 4 | 1.83s | 3.79s | 345–352 km/h | 355–362 km/h | 0.00% | 0 |
| `FORMULA_E` | 4 | 2.28s | 5.63s | 296–302 km/h | 312–318 km/h | 0.00% | 0 |
| `TRACK_COUPE` | 7 | 4.47s | 11.92s | 247–284 km/h | 247–284 km/h | 0.00% | 0 |
| `SUPERCAR` | 8 | 2.53s | 5.84s | 330–410 km/h | 330–410 km/h | 0.00% | 0 |

## 2. Circuit Lap Time & Speed Trap Comparison vs IRL Benchmarks (Class Leaders)

| Circuit | Class | Fastest Car | Sim S1 | Sim S2 | Sim S3 | Sim Lap | Trap km/h | IRL Reference Lap & Vmax |
|---|---|---|---:|---:|---:|---:|---:|---|
| `spa-francorchamps` | `HYPERCAR_GTP` | Cadillac V-Series.R | 34.97s | 42.15s | 42.43s | **1:59.55** | 324.8 | 122.5–126.0s (2:02–2:06) @ 315–325 km/h (WEC 6h Spa Hyperpole) |
| `spa-francorchamps` | `LMP2` | Oreca 07 Gibson (High-DF) | 37.27s | 44.83s | 45.23s | **2:07.33** | 302.1 | LMP2 Prototype class pace |
| `spa-francorchamps` | `GT3` | Lamborghini Temerario GT3 | 41.10s | 49.70s | 50.35s | **2:21.15** | 279.0 | 136.0–140.0s (2:16–2:20) @ 275–285 km/h (GTWC/WEC LMGT3 Spa) |
| `spa-francorchamps` | `GT4` | McLaren Artura GT4 | 45.95s | 55.57s | 56.58s | **2:38.10** | 250.6 | GT4 European / IMSA GS class pace |
| `spa-francorchamps` | `F1_2026` | Red Bull RB22 (2026) | 30.13s | 36.50s | 36.28s | **1:42.92** | 355.5 | 102.0–105.0s (1:42–1:45) @ 335–345 km/h (F1 Spa GP Quali/Race) |
| `spa-francorchamps` | `F1_2021` | Red Bull RB16B (2021) | 30.05s | 36.12s | 35.87s | **1:42.03** | 343.0 | Formula 1 — 2021 Spec class pace |
| `spa-francorchamps` | `F1_2005` | McLaren MP4-20 V10 (2005) | 30.03s | 36.30s | 36.13s | **1:42.47** | 356.3 | Formula 1 — 2005 V10 class pace |
| `spa-francorchamps` | `FORMULA_E` | Nissan e-4ORCE 05 | 38.23s | 46.25s | 46.42s | **2:10.90** | 295.8 | Formula E (GEN3 Evo) class pace |
| `spa-francorchamps` | `TRACK_COUPE` | Nissan GT-R NISMO | 46.20s | 56.22s | 57.15s | **2:39.57** | 256.3 | Production Track Coupes class pace |
| `spa-francorchamps` | `SUPERCAR` | Koenigsegg Jesko Attack | 37.92s | 47.28s | 47.28s | **2:12.48** | 335.3 | Production Supercars & Hypercars class pace |
| `monza` | `HYPERCAR_GTP` | Cadillac V-Series.R | 30.48s | 30.07s | 32.87s | **1:33.42** | 349.4 | 95.0–98.5s (1:35–1:38) @ 330–340 km/h (WEC 6h Monza) |
| `monza` | `LMP2` | Oreca 07 Gibson (High-DF) | 32.65s | 32.12s | 35.05s | **1:39.82** | 321.3 | LMP2 Prototype class pace |
| `monza` | `GT3` | Lamborghini Temerario GT3 | 36.00s | 35.28s | 38.78s | **1:50.07** | 298.2 | 106.5–109.5s (1:46–1:49) @ 285–295 km/h (GTWC/WEC GT3 Monza) |
| `monza` | `GT4` | McLaren Artura GT4 | 40.35s | 39.45s | 43.42s | **2:03.22** | 268.1 | GT4 European / IMSA GS class pace |
| `monza` | `F1_2026` | Red Bull RB22 (2026) | 26.63s | 26.43s | 28.68s | **1:21.75** | 359.9 | 79.5–82.5s (1:19–1:22) @ 348–356 km/h (F1 Italian GP Low-Downforce) |
| `monza` | `F1_2021` | McLaren MCL35M (2021) | 26.57s | 26.38s | 28.47s | **1:21.42** | 350.2 | Formula 1 — 2021 Spec class pace |
| `monza` | `F1_2005` | McLaren MP4-20 V10 (2005) | 26.50s | 26.28s | 28.48s | **1:21.27** | 359.4 | Formula 1 — 2005 V10 class pace |
| `monza` | `FORMULA_E` | Nissan e-4ORCE 05 | 33.28s | 32.90s | 35.97s | **1:42.15** | 301.5 | Formula E (GEN3 Evo) class pace |
| `monza` | `TRACK_COUPE` | Nissan GT-R NISMO | 40.33s | 39.58s | 43.70s | **2:03.62** | 277.0 | Production Track Coupes class pace |
| `monza` | `SUPERCAR` | Koenigsegg Jesko Attack | 32.58s | 32.73s | 35.88s | **1:41.20** | 365.2 | Production Supercars & Hypercars class pace |
| `suzuka` | `HYPERCAR_GTP` | Cadillac V-Series.R | 37.47s | 34.83s | 36.03s | **1:48.33** | 319.9 | WEC Hypercar / IMSA GTP class pace |
| `suzuka` | `LMP2` | Oreca 07 Gibson (High-DF) | 39.88s | 37.08s | 38.52s | **1:55.48** | 295.1 | LMP2 Prototype class pace |
| `suzuka` | `GT3` | Lamborghini Temerario GT3 | 44.42s | 41.18s | 42.72s | **2:08.32** | 272.2 | 120.0–124.0s (2:00–2:04) @ 275–285 km/h (Suzuka 1000km / GT3) |
| `suzuka` | `GT4` | McLaren Artura GT4 | 49.92s | 46.15s | 47.97s | **2:24.03** | 243.0 | GT4 European / IMSA GS class pace |
| `suzuka` | `F1_2026` | Red Bull RB22 (2026) | 32.17s | 29.88s | 31.07s | **1:33.12** | 354.4 | 88.0–91.5s (1:28–1:31) @ 322–332 km/h (F1 Japanese GP) |
| `suzuka` | `F1_2021` | Mercedes W12 (2021) | 31.73s | 29.65s | 30.80s | **1:32.18** | 345.9 | Formula 1 — 2021 Spec class pace |
| `suzuka` | `F1_2005` | McLaren MP4-20 V10 (2005) | 31.90s | 29.77s | 30.95s | **1:32.62** | 355.8 | Formula 1 — 2005 V10 class pace |
| `suzuka` | `FORMULA_E` | Nissan e-4ORCE 05 | 41.25s | 38.23s | 39.67s | **1:59.15** | 291.2 | Formula E (GEN3 Evo) class pace |
| `suzuka` | `TRACK_COUPE` | Nissan GT-R NISMO | 50.55s | 46.62s | 48.47s | **2:25.63** | 249.2 | Production Track Coupes class pace |
| `suzuka` | `SUPERCAR` | Koenigsegg Jesko Attack | 42.22s | 38.88s | 40.23s | **2:01.33** | 330.0 | Production Supercars & Hypercars class pace |
| `silverstone` | `HYPERCAR_GTP` | Cadillac V-Series.R | 33.03s | 34.23s | 35.22s | **1:42.48** | 322.2 | 101.0–105.0s (1:41–1:45) @ 310–320 km/h (ELMS / WEC Silverstone) |
| `silverstone` | `LMP2` | Oreca 07 Gibson (High-DF) | 35.23s | 36.55s | 37.55s | **1:49.33** | 298.3 | LMP2 Prototype class pace |
| `silverstone` | `GT3` | Lamborghini Temerario GT3 | 39.00s | 40.52s | 41.65s | **2:01.17** | 276.5 | 117.0–121.0s (1:57–2:01) @ 272–282 km/h (British GT / GTWC) |
| `silverstone` | `GT4` | McLaren Artura GT4 | 43.65s | 45.32s | 46.67s | **2:15.63** | 248.4 | GT4 European / IMSA GS class pace |
| `silverstone` | `F1_2026` | Red Bull RB22 (2026) | 28.55s | 29.82s | 30.38s | **1:28.75** | 350.7 | 85.5–89.0s (1:25–1:29) @ 325–336 km/h (F1 British GP) |
| `silverstone` | `F1_2021` | Red Bull RB16B (2021) | 28.33s | 29.55s | 30.15s | **1:28.03** | 342.9 | Formula 1 — 2021 Spec class pace |
| `silverstone` | `F1_2005` | McLaren MP4-20 V10 (2005) | 28.45s | 29.63s | 30.23s | **1:28.32** | 355.4 | Formula 1 — 2005 V10 class pace |
| `silverstone` | `FORMULA_E` | Nissan e-4ORCE 05 | 36.13s | 37.68s | 38.68s | **1:52.50** | 295.3 | Formula E (GEN3 Evo) class pace |
| `silverstone` | `TRACK_COUPE` | Nissan GT-R NISMO | 43.93s | 45.68s | 47.12s | **2:16.73** | 254.4 | Production Track Coupes class pace |
| `silverstone` | `SUPERCAR` | Koenigsegg Jesko Attack | 36.18s | 37.92s | 39.15s | **1:53.25** | 336.2 | Production Supercars & Hypercars class pace |
| `laguna-seca` | `HYPERCAR_GTP` | Cadillac V-Series.R | 21.92s | 23.92s | 25.83s | **1:11.67** | 292.0 | 72.0–75.0s (1:12–1:15) @ 275–285 km/h (IMSA WeatherTech Laguna) |
| `laguna-seca` | `LMP2` | Oreca 07 Gibson (High-DF) | 23.40s | 25.53s | 27.52s | **1:16.45** | 270.0 | LMP2 Prototype class pace |
| `laguna-seca` | `GT3` | Lamborghini Temerario GT3 | 25.87s | 28.47s | 30.65s | **1:24.98** | 251.4 | 82.5–85.5s (1:22–1:25) @ 250–262 km/h (IMSA GTD Pro Laguna) |
| `laguna-seca` | `GT4` | McLaren Artura GT4 | 28.90s | 32.05s | 34.37s | **1:35.32** | 226.9 | GT4 European / IMSA GS class pace |
| `laguna-seca` | `F1_2026` | Red Bull RB22 (2026) | 18.97s | 20.58s | 22.37s | **1:01.92** | 322.9 | Formula 1 — 2026 Spec class pace |
| `laguna-seca` | `F1_2021` | Red Bull RB16B (2021) | 18.82s | 20.33s | 22.07s | **1:01.22** | 322.6 | Formula 1 — 2021 Spec class pace |
| `laguna-seca` | `F1_2005` | Renault R25 V10 (2005) | 18.90s | 20.47s | 22.27s | **1:01.63** | 324.8 | Formula 1 — 2005 V10 class pace |
| `laguna-seca` | `FORMULA_E` | Nissan e-4ORCE 05 | 23.47s | 26.27s | 28.20s | **1:17.93** | 279.0 | Formula E (GEN3 Evo) class pace |
| `laguna-seca` | `TRACK_COUPE` | Nissan GT-R NISMO | 29.12s | 32.43s | 34.82s | **1:36.37** | 230.9 | Production Track Coupes class pace |
| `laguna-seca` | `SUPERCAR` | Koenigsegg Jesko Attack | 24.18s | 26.75s | 29.25s | **1:20.18** | 292.1 | Production Supercars & Hypercars class pace |
| `le-mans` | `HYPERCAR_GTP` | Cadillac V-Series.R | 57.68s | 54.20s | 63.13s | **2:55.02** | 350.4 | 204.0–209.0s (3:24–3:29) @ 335–345 km/h (24h Le Mans Hyperpole) |
| `le-mans` | `LMP2` | Ligier JS P217 Gibson | 61.50s | 58.00s | 67.18s | **3:06.68** | 330.0 | 213.0–218.0s (3:33–3:38) @ 315–325 km/h (24h Le Mans LMP2) |
| `le-mans` | `GT3` | Bentley Continental GT3 | 67.58s | 63.33s | 74.53s | **3:25.45** | 306.0 | 234.0–240.0s (3:54–4:00) @ 285–296 km/h (24h Le Mans LMGT3) |
| `le-mans` | `GT4` | Ford Mustang GT4 | 75.63s | 70.93s | 83.52s | **3:50.08** | 274.4 | GT4 European / IMSA GS class pace |
| `le-mans` | `F1_2026` | Williams FW48 (2026) | 51.70s | 49.35s | 55.60s | **2:36.65** | 362.9 | Formula 1 — 2026 Spec class pace |
| `le-mans` | `F1_2021` | McLaren MCL35M (2021) | 52.12s | 50.17s | 55.48s | **2:37.77** | 349.9 | Formula 1 — 2021 Spec class pace |
| `le-mans` | `F1_2005` | Williams FW27 BMW V10 (2005) | 51.50s | 49.33s | 55.20s | **2:36.03** | 360.5 | Formula 1 — 2005 V10 class pace |
| `le-mans` | `FORMULA_E` | Maserati Tipo Folgore | 64.55s | 60.48s | 70.85s | **3:15.88** | 307.2 | Formula E (GEN3 Evo) class pace |
| `le-mans` | `TRACK_COUPE` | Chevrolet Corvette Z06 | 75.30s | 69.73s | 83.87s | **3:48.90** | 289.0 | Production Track Coupes class pace |
| `le-mans` | `SUPERCAR` | Koenigsegg Jesko Attack | 60.95s | 54.22s | 69.37s | **3:04.53** | 412.1 | Production Supercars & Hypercars class pace |
| `monaco` | `HYPERCAR_GTP` | Acura ARX-06 | 19.62s | 28.63s | 24.98s | **1:13.23** | 288.7 | WEC Hypercar / IMSA GTP class pace |
| `monaco` | `LMP2` | Oreca 07 Gibson (High-DF) | 20.78s | 30.40s | 26.77s | **1:17.95** | 274.5 | LMP2 Prototype class pace |
| `monaco` | `GT3` | Lamborghini Temerario GT3 | 22.95s | 34.02s | 30.07s | **1:27.03** | 251.5 | GTD Pro / LMGT3 class pace |
| `monaco` | `GT4` | McLaren Artura GT4 | 25.52s | 38.17s | 34.25s | **1:37.93** | 231.5 | GT4 European / IMSA GS class pace |
| `monaco` | `F1_2026` | McLaren MCL40 (2026) | 17.12s | 24.45s | 21.22s | **1:02.78** | 329.9 | 70.0–73.5s (1:10–1:13) @ 288–296 km/h (F1 Monaco GP) |
| `monaco` | `F1_2021` | Red Bull RB16B (2021) | 16.95s | 24.02s | 20.90s | **1:01.87** | 335.9 | Formula 1 — 2021 Spec class pace |
| `monaco` | `F1_2005` | Renault R25 V10 (2005) | 17.03s | 24.33s | 21.10s | **1:02.47** | 333.3 | Formula 1 — 2005 V10 class pace |
| `monaco` | `FORMULA_E` | Nissan e-4ORCE 05 | 21.35s | 31.27s | 27.28s | **1:19.90** | 270.6 | 86.0–90.0s (1:26–1:30) @ 245–265 km/h (Monaco E-Prix Gen3 Evo) |
| `monaco` | `TRACK_COUPE` | Nissan GT-R NISMO | 25.88s | 38.95s | 34.63s | **1:39.47** | 234.0 | Production Track Coupes class pace |
| `monaco` | `SUPERCAR` | Koenigsegg Jesko Attack | 22.12s | 32.78s | 28.22s | **1:23.12** | 281.8 | Production Supercars & Hypercars class pace |

## 3. Complete Matrix — All 76 Cars × 7 Circuits (532 Flying Laps)

| Track | Class | Car | 0–100 | 0–200 | Base Vmax | S1 | S2 | S3 | Lap Time | Trap | Max Lat / HalfW |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `spa-francorchamps` | `HYPERCAR_GTP` | `ferrari-499p` | 2.65s | 5.97s | 341.5 | 35.05s | 42.22s | 42.57s | 1:59.83 | 322.7 | 3.5m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `toyota-gr010` | 2.73s | 6.20s | 333.1 | 35.37s | 42.55s | 42.87s | 2:00.78 | 317.2 | 3.6m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `porsche-963` | 2.70s | 6.10s | 335.2 | 35.23s | 42.38s | 42.72s | 2:00.33 | 319.1 | 3.6m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.58s | 5.80s | 343.6 | 34.97s | 42.15s | 42.43s | 1:59.55 | 324.8 | 3.5m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.70s | 6.07s | 339.4 | 35.18s | 42.40s | 42.70s | 2:00.28 | 320.9 | 3.5m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `acura-arx-06` | 2.63s | 5.97s | 331.1 | 35.08s | 42.20s | 42.50s | 1:59.78 | 318.3 | 3.5m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `alpine-a424` | 2.77s | 6.23s | 339.4 | 35.30s | 42.52s | 42.85s | 2:00.67 | 319.9 | 3.6m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `peugeot-9x8` | 2.78s | 6.30s | 331.0 | 35.45s | 42.50s | 42.88s | 2:00.83 | 315.6 | 3.6m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.77s | 6.18s | 345.6 | 35.25s | 42.52s | 42.80s | 2:00.57 | 324.1 | 3.5m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.73s | 6.17s | 337.3 | 35.32s | 42.52s | 42.85s | 2:00.68 | 319.2 | 3.5m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.67s | 6.00s | 337.3 | 35.18s | 42.30s | 42.63s | 2:00.12 | 320.5 | 3.5m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 2.80s | 6.30s | 341.4 | 35.47s | 42.80s | 43.12s | 2:01.38 | 321.4 | 3.6m / 7.0m |
| `spa-francorchamps` | `LMP2` | `oreca-07-united` | 2.98s | 6.80s | 325.8 | 37.38s | 45.08s | 45.55s | 2:08.02 | 305.1 | 3.3m / 7.0m |
| `spa-francorchamps` | `LMP2` | `oreca-07-europol` | 2.90s | 6.70s | 315.9 | 37.27s | 44.83s | 45.23s | 2:07.33 | 302.1 | 3.3m / 7.0m |
| `spa-francorchamps` | `LMP2` | `oreca-07-ao` | 2.93s | 6.75s | 320.8 | 37.32s | 44.97s | 45.42s | 2:07.70 | 303.6 | 3.3m / 7.0m |
| `spa-francorchamps` | `LMP2` | `ligier-js-p217` | 2.93s | 6.72s | 324.1 | 37.32s | 44.97s | 45.45s | 2:07.73 | 305.1 | 3.3m / 7.0m |
| `spa-francorchamps` | `GT3` | `porsche-911-gt3-r` | 3.25s | 8.18s | 285.8 | 41.33s | 49.95s | 50.58s | 2:21.87 | 274.9 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `ferrari-296-gt3` | 3.28s | 8.20s | 291.3 | 41.33s | 49.92s | 50.55s | 2:21.80 | 276.9 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `corvette-z06-gt3r` | 3.18s | 7.88s | 295.0 | 41.13s | 49.77s | 50.40s | 2:21.30 | 279.9 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `bmw-m4-gt3` | 3.33s | 8.30s | 293.2 | 41.42s | 50.17s | 50.78s | 2:22.37 | 277.0 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `ford-mustang-gt3` | 3.22s | 7.95s | 298.7 | 41.15s | 49.85s | 50.53s | 2:21.53 | 281.0 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `aston-vantage-gt3` | 3.28s | 8.20s | 291.3 | 41.43s | 50.05s | 50.65s | 2:22.13 | 276.9 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `lamborghini-temerario-gt3` | 3.18s | 7.92s | 293.2 | 41.10s | 49.70s | 50.35s | 2:21.15 | 279.0 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `mercedes-amg-gt3` | 3.35s | 8.38s | 289.5 | 41.50s | 50.18s | 50.83s | 2:22.52 | 275.4 | 2.9m / 7.0m |
| `spa-francorchamps` | `GT3` | `lexus-rcf-gt3` | 3.33s | 8.27s | 295.0 | 41.48s | 50.23s | 50.90s | 2:22.62 | 277.6 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `mclaren-720s-gt3` | 3.28s | 8.25s | 289.5 | 41.30s | 49.90s | 50.62s | 2:21.82 | 276.0 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `renault-rs01-gt3` | 3.23s | 8.05s | 293.2 | 41.23s | 49.83s | 50.35s | 2:21.42 | 278.4 | 2.9m / 7.0m |
| `spa-francorchamps` | `GT3` | `bentley-continental-gt3` | 3.22s | 7.92s | 300.5 | 41.15s | 49.85s | 50.53s | 2:21.53 | 281.9 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `audi-r8-lms-gt3` | 3.28s | 8.20s | 291.3 | 41.42s | 50.00s | 50.68s | 2:22.10 | 276.6 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT3` | `acura-nsx-gt3` | 3.18s | 7.98s | 289.5 | 41.25s | 49.80s | 50.43s | 2:21.48 | 277.1 | 2.8m / 7.0m |
| `spa-francorchamps` | `GT4` | `porsche-cayman-gt4-rs` | 4.18s | 11.12s | 262.0 | 46.18s | 55.67s | 56.87s | 2:38.72 | 249.1 | 2.6m / 7.0m |
| `spa-francorchamps` | `GT4` | `bmw-m4-gt4` | 4.17s | 10.90s | 268.1 | 46.08s | 55.87s | 56.87s | 2:38.82 | 251.8 | 2.6m / 7.0m |
| `spa-francorchamps` | `GT4` | `aston-vantage-gt4` | 4.25s | 11.17s | 266.5 | 46.20s | 55.97s | 57.05s | 2:39.22 | 250.4 | 2.6m / 7.0m |
| `spa-francorchamps` | `GT4` | `toyota-supra-gt4` | 4.10s | 10.78s | 265.0 | 46.02s | 55.67s | 56.68s | 2:38.37 | 251.1 | 2.7m / 7.0m |
| `spa-francorchamps` | `GT4` | `mclaren-artura-gt4` | 4.10s | 10.85s | 263.5 | 45.95s | 55.57s | 56.58s | 2:38.10 | 250.6 | 2.6m / 7.0m |
| `spa-francorchamps` | `GT4` | `mercedes-amg-gt4` | 4.25s | 11.17s | 266.5 | 46.27s | 55.98s | 57.13s | 2:39.38 | 250.4 | 2.6m / 7.0m |
| `spa-francorchamps` | `GT4` | `alpine-a110-gt4` | 4.18s | 11.17s | 260.5 | 46.20s | 55.72s | 56.85s | 2:38.77 | 248.5 | 2.6m / 7.0m |
| `spa-francorchamps` | `GT4` | `ford-mustang-gt4` | 4.17s | 10.85s | 269.6 | 46.10s | 55.87s | 56.90s | 2:38.87 | 252.6 | 2.6m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-ferrari` | 1.85s | 3.90s | 327.2 | 30.20s | 36.58s | 36.35s | 1:43.13 | 354.3 | 4.9m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-mclaren` | 1.88s | 4.00s | 324.1 | 30.28s | 36.58s | 36.38s | 1:43.25 | 351.5 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-mercedes` | 1.87s | 3.95s | 327.2 | 30.22s | 36.60s | 36.37s | 1:43.18 | 354.3 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-redbull` | 1.87s | 3.93s | 328.7 | 30.13s | 36.50s | 36.28s | 1:42.92 | 355.5 | 4.5m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-aston` | 1.87s | 3.97s | 322.7 | 30.30s | 36.62s | 36.42s | 1:43.33 | 350.8 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-williams` | 1.88s | 3.97s | 331.7 | 30.18s | 36.65s | 36.45s | 1:43.28 | 356.3 | 4.9m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-alpine` | 1.92s | 4.05s | 325.6 | 30.37s | 36.70s | 36.52s | 1:43.58 | 352.2 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-haas` | 1.87s | 3.95s | 327.2 | 30.27s | 36.65s | 36.45s | 1:43.37 | 354.2 | 5.0m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-audi` | 1.85s | 3.92s | 324.2 | 30.27s | 36.53s | 36.38s | 1:43.18 | 352.4 | 4.6m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-cadillac` | 1.88s | 3.98s | 328.7 | 30.25s | 36.63s | 36.47s | 1:43.35 | 354.6 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-racing-bulls` | 1.88s | 4.00s | 324.1 | 30.30s | 36.65s | 36.45s | 1:43.40 | 351.3 | 4.9m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-mercedes` | 1.83s | 3.83s | 339.9 | 30.07s | 36.08s | 35.95s | 1:42.10 | 346.1 | 5.0m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-redbull` | 1.82s | 3.82s | 336.7 | 30.05s | 36.12s | 35.87s | 1:42.03 | 343.0 | 5.0m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-ferrari` | 1.83s | 3.87s | 335.1 | 30.17s | 36.25s | 36.08s | 1:42.50 | 341.3 | 5.2m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-mclaren` | 1.85s | 3.87s | 343.2 | 30.05s | 36.17s | 36.02s | 1:42.23 | 349.0 | 5.0m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-renault` | 1.80s | 3.73s | 345.2 | 30.07s | 36.35s | 36.18s | 1:42.60 | 352.3 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-mclaren` | 1.83s | 3.78s | 350.3 | 30.03s | 36.30s | 36.13s | 1:42.47 | 356.3 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-ferrari` | 1.85s | 3.85s | 346.8 | 30.18s | 36.52s | 36.33s | 1:43.03 | 353.1 | 4.9m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-williams` | 1.83s | 3.78s | 352.0 | 30.03s | 36.42s | 36.22s | 1:42.67 | 358.0 | 4.9m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-porsche-99x` | 2.25s | 5.55s | 297.9 | 38.27s | 46.37s | 46.57s | 2:11.20 | 296.7 | 3.1m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-jaguar-itype7` | 2.32s | 5.70s | 299.8 | 38.33s | 46.57s | 46.80s | 2:11.70 | 296.7 | 3.0m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-nissan-e4orce` | 2.22s | 5.50s | 295.9 | 38.23s | 46.25s | 46.42s | 2:10.90 | 295.8 | 3.0m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-maserati-folgore` | 2.35s | 5.77s | 301.8 | 38.47s | 46.60s | 46.85s | 2:11.92 | 297.2 | 3.0m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `bmw-m2-cs` | 4.52s | 12.02s | 261.8 | 47.70s | 57.78s | 59.00s | 2:44.48 | 244.5 | 2.6m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.38s | 11.45s | 269.2 | 46.98s | 56.98s | 58.17s | 2:42.13 | 249.4 | 2.7m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.15s | 10.50s | 283.9 | 46.27s | 56.42s | 57.43s | 2:40.12 | 257.5 | 2.8m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `nissan-gtr-nismo` | 3.98s | 10.25s | 276.6 | 46.20s | 56.22s | 57.15s | 2:39.57 | 256.3 | 2.7m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `renault-clio-v6` | 4.93s | 13.72s | 247.1 | 48.68s | 58.73s | 60.12s | 2:47.53 | 234.7 | 2.7m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `honda-civic-type-r` | 4.77s | 12.78s | 258.1 | 48.03s | 58.12s | 59.38s | 2:45.53 | 241.0 | 2.6m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.58s | 12.72s | 247.1 | 48.10s | 58.00s | 59.22s | 2:45.32 | 237.4 | 2.6m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `ferrari-296-gtb` | 2.58s | 6.07s | 336.4 | 39.38s | 48.38s | 48.62s | 2:16.38 | 306.8 | 2.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `mclaren-750s` | 2.58s | 6.00s | 348.6 | 39.10s | 48.17s | 48.40s | 2:15.67 | 311.9 | 2.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `ferrari-sf90` | 2.50s | 5.80s | 354.8 | 38.88s | 48.10s | 48.08s | 2:15.07 | 315.6 | 2.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `porsche-918-spyder` | 2.57s | 6.10s | 330.3 | 39.42s | 48.38s | 48.62s | 2:16.42 | 304.6 | 2.9m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `aston-valkyrie-road` | 2.57s | 5.88s | 373.1 | 38.60s | 47.72s | 47.92s | 2:14.23 | 320.9 | 2.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `koenigsegg-jesko` | 2.43s | 5.43s | 409.9 | 37.92s | 47.28s | 47.28s | 2:12.48 | 335.3 | 2.9m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `ferrari-f80` | 2.48s | 5.72s | 367.0 | 38.62s | 47.80s | 47.80s | 2:14.22 | 320.5 | 2.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `mclaren-w1` | 2.50s | 5.75s | 367.0 | 38.65s | 47.80s | 47.90s | 2:14.35 | 320.0 | 2.8m / 7.0m |
| `monza` | `HYPERCAR_GTP` | `ferrari-499p` | 2.65s | 5.97s | 341.5 | 30.63s | 30.18s | 32.97s | 1:33.78 | 347.1 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `toyota-gr010` | 2.73s | 6.20s | 333.1 | 30.98s | 30.48s | 33.32s | 1:34.78 | 338.8 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `porsche-963` | 2.70s | 6.10s | 335.2 | 30.83s | 30.40s | 33.22s | 1:34.45 | 341.0 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.58s | 5.80s | 343.6 | 30.48s | 30.07s | 32.87s | 1:33.42 | 349.4 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.70s | 6.07s | 339.4 | 30.78s | 30.32s | 33.12s | 1:34.22 | 345.0 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `acura-arx-06` | 2.63s | 5.97s | 331.1 | 30.77s | 30.27s | 33.02s | 1:34.05 | 337.2 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `alpine-a424` | 2.77s | 6.23s | 339.4 | 30.88s | 30.47s | 33.22s | 1:34.57 | 344.3 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `peugeot-9x8` | 2.78s | 6.30s | 331.0 | 31.05s | 30.57s | 33.28s | 1:34.90 | 336.7 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.77s | 6.18s | 345.6 | 30.72s | 30.30s | 33.12s | 1:34.13 | 350.7 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.73s | 6.17s | 337.3 | 30.92s | 30.45s | 33.22s | 1:34.58 | 342.9 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.67s | 6.00s | 337.3 | 30.72s | 30.25s | 33.08s | 1:34.05 | 343.1 | 3.1m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 2.80s | 6.30s | 341.4 | 30.97s | 30.55s | 33.40s | 1:34.92 | 346.9 | 3.1m / 6.8m |
| `monza` | `LMP2` | `oreca-07-united` | 2.98s | 6.80s | 325.8 | 32.73s | 32.18s | 35.27s | 1:40.18 | 329.1 | 2.8m / 6.8m |
| `monza` | `LMP2` | `oreca-07-europol` | 2.90s | 6.70s | 315.9 | 32.65s | 32.12s | 35.05s | 1:39.82 | 321.3 | 2.9m / 6.8m |
| `monza` | `LMP2` | `oreca-07-ao` | 2.93s | 6.75s | 320.8 | 32.65s | 32.15s | 35.18s | 1:39.98 | 326.0 | 2.8m / 6.8m |
| `monza` | `LMP2` | `ligier-js-p217` | 2.93s | 6.72s | 324.1 | 32.67s | 32.13s | 35.13s | 1:39.93 | 328.6 | 2.8m / 6.8m |
| `monza` | `GT3` | `porsche-911-gt3-r` | 3.25s | 8.18s | 285.8 | 36.22s | 35.55s | 39.12s | 1:50.88 | 290.9 | 2.4m / 6.8m |
| `monza` | `GT3` | `ferrari-296-gt3` | 3.28s | 8.20s | 291.3 | 36.20s | 35.47s | 38.98s | 1:50.65 | 296.3 | 2.4m / 6.8m |
| `monza` | `GT3` | `corvette-z06-gt3r` | 3.18s | 7.88s | 295.0 | 35.98s | 35.33s | 38.80s | 1:50.12 | 300.1 | 2.4m / 6.8m |
| `monza` | `GT3` | `bmw-m4-gt3` | 3.33s | 8.30s | 293.2 | 36.35s | 35.60s | 39.08s | 1:51.03 | 298.0 | 2.4m / 6.8m |
| `monza` | `GT3` | `ford-mustang-gt3` | 3.22s | 7.95s | 298.7 | 36.03s | 35.32s | 38.88s | 1:50.23 | 303.4 | 2.4m / 6.8m |
| `monza` | `GT3` | `aston-vantage-gt3` | 3.28s | 8.20s | 291.3 | 36.25s | 35.57s | 39.07s | 1:50.88 | 296.3 | 2.4m / 6.8m |
| `monza` | `GT3` | `lamborghini-temerario-gt3` | 3.18s | 7.92s | 293.2 | 36.00s | 35.28s | 38.78s | 1:50.07 | 298.2 | 2.4m / 6.8m |
| `monza` | `GT3` | `mercedes-amg-gt3` | 3.35s | 8.38s | 289.5 | 36.38s | 35.68s | 39.12s | 1:51.18 | 294.4 | 2.4m / 6.8m |
| `monza` | `GT3` | `lexus-rcf-gt3` | 3.33s | 8.27s | 295.0 | 36.35s | 35.58s | 39.10s | 1:51.03 | 299.6 | 2.4m / 6.8m |
| `monza` | `GT3` | `mclaren-720s-gt3` | 3.28s | 8.25s | 289.5 | 36.25s | 35.57s | 38.97s | 1:50.78 | 294.5 | 2.4m / 6.8m |
| `monza` | `GT3` | `renault-rs01-gt3` | 3.23s | 8.05s | 293.2 | 36.08s | 35.37s | 38.83s | 1:50.28 | 298.2 | 2.4m / 6.8m |
| `monza` | `GT3` | `bentley-continental-gt3` | 3.22s | 7.92s | 300.5 | 35.98s | 35.30s | 38.87s | 1:50.15 | 304.8 | 2.4m / 6.8m |
| `monza` | `GT3` | `audi-r8-lms-gt3` | 3.28s | 8.20s | 291.3 | 36.20s | 35.55s | 39.02s | 1:50.77 | 296.3 | 2.4m / 6.8m |
| `monza` | `GT3` | `acura-nsx-gt3` | 3.18s | 7.98s | 289.5 | 36.10s | 35.37s | 38.95s | 1:50.42 | 294.6 | 2.4m / 6.8m |
| `monza` | `GT4` | `porsche-cayman-gt4-rs` | 4.18s | 11.12s | 262.0 | 40.57s | 39.67s | 43.62s | 2:03.85 | 266.5 | 2.0m / 6.8m |
| `monza` | `GT4` | `bmw-m4-gt4` | 4.17s | 10.90s | 268.1 | 40.40s | 39.55s | 43.58s | 2:03.53 | 272.2 | 2.0m / 6.8m |
| `monza` | `GT4` | `aston-vantage-gt4` | 4.25s | 11.17s | 266.5 | 40.62s | 39.68s | 43.65s | 2:03.95 | 270.4 | 2.0m / 6.8m |
| `monza` | `GT4` | `toyota-supra-gt4` | 4.10s | 10.78s | 265.0 | 40.37s | 39.47s | 43.52s | 2:03.35 | 269.5 | 2.0m / 6.8m |
| `monza` | `GT4` | `mclaren-artura-gt4` | 4.10s | 10.85s | 263.5 | 40.35s | 39.45s | 43.42s | 2:03.22 | 268.1 | 2.0m / 6.8m |
| `monza` | `GT4` | `mercedes-amg-gt4` | 4.25s | 11.17s | 266.5 | 40.67s | 39.68s | 43.78s | 2:04.13 | 270.5 | 2.0m / 6.8m |
| `monza` | `GT4` | `alpine-a110-gt4` | 4.18s | 11.17s | 260.5 | 40.58s | 39.70s | 43.60s | 2:03.88 | 265.0 | 2.0m / 6.8m |
| `monza` | `GT4` | `ford-mustang-gt4` | 4.17s | 10.85s | 269.6 | 40.42s | 39.48s | 43.53s | 2:03.43 | 273.3 | 2.0m / 6.8m |
| `monza` | `F1_2026` | `f1-26-ferrari` | 1.85s | 3.90s | 327.2 | 26.67s | 26.48s | 28.72s | 1:21.87 | 358.3 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-mclaren` | 1.88s | 4.00s | 324.1 | 26.73s | 26.55s | 28.82s | 1:22.10 | 354.9 | 4.0m / 6.8m |
| `monza` | `F1_2026` | `f1-26-mercedes` | 1.87s | 3.95s | 327.2 | 26.68s | 26.48s | 28.72s | 1:21.88 | 358.3 | 4.0m / 6.8m |
| `monza` | `F1_2026` | `f1-26-redbull` | 1.87s | 3.93s | 328.7 | 26.63s | 26.43s | 28.68s | 1:21.75 | 359.9 | 4.0m / 6.8m |
| `monza` | `F1_2026` | `f1-26-aston` | 1.87s | 3.97s | 322.7 | 26.75s | 26.60s | 28.78s | 1:22.13 | 353.3 | 4.0m / 6.8m |
| `monza` | `F1_2026` | `f1-26-williams` | 1.88s | 3.97s | 331.7 | 26.72s | 26.43s | 28.77s | 1:21.92 | 363.2 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-alpine` | 1.92s | 4.05s | 325.6 | 26.83s | 26.62s | 28.87s | 1:22.32 | 356.6 | 4.0m / 6.8m |
| `monza` | `F1_2026` | `f1-26-haas` | 1.87s | 3.95s | 327.2 | 26.77s | 26.52s | 28.82s | 1:22.10 | 358.3 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-audi` | 1.85s | 3.92s | 324.2 | 26.75s | 26.52s | 28.75s | 1:22.02 | 355.0 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-cadillac` | 1.88s | 3.98s | 328.7 | 26.73s | 26.53s | 28.78s | 1:22.05 | 359.9 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-racing-bulls` | 1.88s | 4.00s | 324.1 | 26.80s | 26.60s | 28.82s | 1:22.22 | 354.9 | 4.0m / 6.8m |
| `monza` | `F1_2021` | `f1-21-mercedes` | 1.83s | 3.83s | 339.9 | 26.55s | 26.40s | 28.48s | 1:21.43 | 347.0 | 4.1m / 6.8m |
| `monza` | `F1_2021` | `f1-21-redbull` | 1.82s | 3.82s | 336.7 | 26.60s | 26.45s | 28.47s | 1:21.52 | 343.7 | 4.1m / 6.8m |
| `monza` | `F1_2021` | `f1-21-ferrari` | 1.83s | 3.87s | 335.1 | 26.72s | 26.57s | 28.63s | 1:21.92 | 342.0 | 4.1m / 6.8m |
| `monza` | `F1_2021` | `f1-21-mclaren` | 1.85s | 3.87s | 343.2 | 26.57s | 26.38s | 28.47s | 1:21.42 | 350.2 | 4.1m / 6.8m |
| `monza` | `F1_2005` | `f1-05-renault` | 1.80s | 3.73s | 345.2 | 26.58s | 26.38s | 28.52s | 1:21.48 | 354.2 | 3.9m / 6.8m |
| `monza` | `F1_2005` | `f1-05-mclaren` | 1.83s | 3.78s | 350.3 | 26.50s | 26.28s | 28.48s | 1:21.27 | 359.4 | 4.0m / 6.8m |
| `monza` | `F1_2005` | `f1-05-ferrari` | 1.85s | 3.85s | 346.8 | 26.67s | 26.48s | 28.62s | 1:21.77 | 355.9 | 3.9m / 6.8m |
| `monza` | `F1_2005` | `f1-05-williams` | 1.83s | 3.78s | 352.0 | 26.52s | 26.30s | 28.52s | 1:21.33 | 361.2 | 3.9m / 6.8m |
| `monza` | `FORMULA_E` | `fe-porsche-99x` | 2.25s | 5.55s | 297.9 | 33.32s | 32.90s | 36.07s | 1:42.28 | 303.5 | 2.6m / 6.8m |
| `monza` | `FORMULA_E` | `fe-jaguar-itype7` | 2.32s | 5.70s | 299.8 | 33.47s | 33.00s | 36.25s | 1:42.72 | 305.5 | 2.5m / 6.8m |
| `monza` | `FORMULA_E` | `fe-nissan-e4orce` | 2.22s | 5.50s | 295.9 | 33.28s | 32.90s | 35.97s | 1:42.15 | 301.5 | 2.6m / 6.8m |
| `monza` | `FORMULA_E` | `fe-maserati-folgore` | 2.35s | 5.77s | 301.8 | 33.47s | 33.07s | 36.25s | 1:42.78 | 307.4 | 2.6m / 6.8m |
| `monza` | `TRACK_COUPE` | `bmw-m2-cs` | 4.52s | 12.02s | 261.8 | 41.87s | 40.88s | 45.07s | 2:07.82 | 264.9 | 2.0m / 6.8m |
| `monza` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.38s | 11.45s | 269.2 | 41.20s | 40.23s | 44.43s | 2:05.87 | 270.8 | 2.0m / 6.8m |
| `monza` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.15s | 10.50s | 283.9 | 40.43s | 39.72s | 43.83s | 2:03.98 | 279.9 | 2.0m / 6.8m |
| `monza` | `TRACK_COUPE` | `nissan-gtr-nismo` | 3.98s | 10.25s | 276.6 | 40.33s | 39.58s | 43.70s | 2:03.62 | 277.0 | 2.0m / 6.8m |
| `monza` | `TRACK_COUPE` | `renault-clio-v6` | 4.93s | 13.72s | 247.1 | 42.95s | 41.95s | 45.95s | 2:10.85 | 251.2 | 2.0m / 6.8m |
| `monza` | `TRACK_COUPE` | `honda-civic-type-r` | 4.77s | 12.78s | 258.1 | 42.28s | 41.35s | 45.43s | 2:09.07 | 260.6 | 2.0m / 6.8m |
| `monza` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.58s | 12.72s | 247.1 | 42.28s | 41.38s | 45.38s | 2:09.05 | 251.6 | 2.0m / 6.8m |
| `monza` | `SUPERCAR` | `ferrari-296-gtb` | 2.58s | 6.07s | 336.4 | 34.12s | 33.98s | 37.17s | 1:45.27 | 330.3 | 2.4m / 6.8m |
| `monza` | `SUPERCAR` | `mclaren-750s` | 2.58s | 6.00s | 348.6 | 33.80s | 33.68s | 36.90s | 1:44.38 | 336.6 | 2.5m / 6.8m |
| `monza` | `SUPERCAR` | `ferrari-sf90` | 2.50s | 5.80s | 354.8 | 33.55s | 33.50s | 36.70s | 1:43.75 | 340.5 | 2.5m / 6.8m |
| `monza` | `SUPERCAR` | `porsche-918-spyder` | 2.57s | 6.10s | 330.3 | 34.13s | 33.95s | 37.23s | 1:45.32 | 327.3 | 2.4m / 6.8m |
| `monza` | `SUPERCAR` | `aston-valkyrie-road` | 2.57s | 5.88s | 373.1 | 33.30s | 33.22s | 36.48s | 1:43.00 | 348.7 | 2.5m / 6.8m |
| `monza` | `SUPERCAR` | `koenigsegg-jesko` | 2.43s | 5.43s | 409.9 | 32.58s | 32.73s | 35.88s | 1:41.20 | 365.2 | 2.5m / 6.8m |
| `monza` | `SUPERCAR` | `ferrari-f80` | 2.48s | 5.72s | 367.0 | 33.30s | 33.30s | 36.45s | 1:43.05 | 347.0 | 2.5m / 6.8m |
| `monza` | `SUPERCAR` | `mclaren-w1` | 2.50s | 5.75s | 367.0 | 33.33s | 33.30s | 36.53s | 1:43.17 | 346.6 | 2.5m / 6.8m |
| `suzuka` | `HYPERCAR_GTP` | `ferrari-499p` | 2.65s | 5.97s | 341.5 | 37.47s | 34.92s | 36.17s | 1:48.55 | 317.0 | 3.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `toyota-gr010` | 2.73s | 6.20s | 333.1 | 37.73s | 35.17s | 36.42s | 1:49.32 | 311.3 | 3.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `porsche-963` | 2.70s | 6.10s | 335.2 | 37.62s | 35.12s | 36.30s | 1:49.03 | 313.3 | 3.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.58s | 5.80s | 343.6 | 37.47s | 34.83s | 36.03s | 1:48.33 | 319.9 | 3.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.70s | 6.07s | 339.4 | 37.72s | 35.12s | 36.28s | 1:49.12 | 315.4 | 3.7m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `acura-arx-06` | 2.63s | 5.97s | 331.1 | 37.40s | 34.92s | 36.13s | 1:48.45 | 312.6 | 3.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `alpine-a424` | 2.77s | 6.23s | 339.4 | 37.77s | 35.18s | 36.42s | 1:49.37 | 313.7 | 3.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `peugeot-9x8` | 2.78s | 6.30s | 331.0 | 37.78s | 35.23s | 36.40s | 1:49.42 | 309.6 | 3.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.77s | 6.18s | 345.6 | 37.78s | 35.10s | 36.33s | 1:49.22 | 318.5 | 3.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.73s | 6.17s | 337.3 | 37.77s | 35.15s | 36.40s | 1:49.32 | 313.2 | 3.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.67s | 6.00s | 337.3 | 37.60s | 34.95s | 36.22s | 1:48.77 | 315.1 | 3.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 2.80s | 6.30s | 341.4 | 38.08s | 35.33s | 36.63s | 1:50.05 | 315.4 | 3.6m / 6.5m |
| `suzuka` | `LMP2` | `oreca-07-united` | 2.98s | 6.80s | 325.8 | 40.15s | 37.32s | 38.65s | 1:56.12 | 298.4 | 3.5m / 6.5m |
| `suzuka` | `LMP2` | `oreca-07-europol` | 2.90s | 6.70s | 315.9 | 39.88s | 37.08s | 38.52s | 1:55.48 | 295.1 | 3.5m / 6.5m |
| `suzuka` | `LMP2` | `oreca-07-ao` | 2.93s | 6.75s | 320.8 | 40.12s | 37.27s | 38.58s | 1:55.97 | 296.7 | 3.7m / 6.5m |
| `suzuka` | `LMP2` | `ligier-js-p217` | 2.93s | 6.72s | 324.1 | 40.18s | 37.23s | 38.55s | 1:55.97 | 298.6 | 3.7m / 6.5m |
| `suzuka` | `GT3` | `porsche-911-gt3-r` | 3.25s | 8.18s | 285.8 | 44.58s | 41.37s | 43.00s | 2:08.95 | 267.7 | 3.5m / 6.5m |
| `suzuka` | `GT3` | `ferrari-296-gt3` | 3.28s | 8.20s | 291.3 | 44.58s | 41.33s | 42.92s | 2:08.83 | 269.8 | 3.6m / 6.5m |
| `suzuka` | `GT3` | `corvette-z06-gt3r` | 3.18s | 7.88s | 295.0 | 44.58s | 41.25s | 42.82s | 2:08.65 | 273.1 | 3.6m / 6.5m |
| `suzuka` | `GT3` | `bmw-m4-gt3` | 3.33s | 8.30s | 293.2 | 44.88s | 41.55s | 43.13s | 2:09.57 | 269.7 | 3.7m / 6.5m |
| `suzuka` | `GT3` | `ford-mustang-gt3` | 3.22s | 7.95s | 298.7 | 44.73s | 41.35s | 42.92s | 2:09.00 | 274.0 | 3.7m / 6.5m |
| `suzuka` | `GT3` | `aston-vantage-gt3` | 3.28s | 8.20s | 291.3 | 44.75s | 41.50s | 43.03s | 2:09.28 | 269.7 | 3.5m / 6.5m |
| `suzuka` | `GT3` | `lamborghini-temerario-gt3` | 3.18s | 7.92s | 293.2 | 44.42s | 41.18s | 42.72s | 2:08.32 | 272.2 | 3.5m / 6.5m |
| `suzuka` | `GT3` | `mercedes-amg-gt3` | 3.35s | 8.38s | 289.5 | 44.95s | 41.57s | 43.18s | 2:09.70 | 267.9 | 3.7m / 6.5m |
| `suzuka` | `GT3` | `lexus-rcf-gt3` | 3.33s | 8.27s | 295.0 | 44.98s | 41.67s | 43.17s | 2:09.82 | 270.5 | 3.6m / 6.5m |
| `suzuka` | `GT3` | `mclaren-720s-gt3` | 3.28s | 8.25s | 289.5 | 44.67s | 41.30s | 42.93s | 2:08.90 | 268.8 | 3.7m / 6.5m |
| `suzuka` | `GT3` | `renault-rs01-gt3` | 3.23s | 8.05s | 293.2 | 44.62s | 41.28s | 42.80s | 2:08.70 | 271.6 | 3.7m / 6.5m |
| `suzuka` | `GT3` | `bentley-continental-gt3` | 3.22s | 7.92s | 300.5 | 44.57s | 41.35s | 42.93s | 2:08.85 | 274.8 | 3.4m / 6.5m |
| `suzuka` | `GT3` | `audi-r8-lms-gt3` | 3.28s | 8.20s | 291.3 | 44.62s | 41.40s | 43.05s | 2:09.07 | 269.5 | 3.5m / 6.5m |
| `suzuka` | `GT3` | `acura-nsx-gt3` | 3.18s | 7.98s | 289.5 | 44.45s | 41.30s | 42.90s | 2:08.65 | 270.2 | 3.6m / 6.5m |
| `suzuka` | `GT4` | `porsche-cayman-gt4-rs` | 4.18s | 11.12s | 262.0 | 50.10s | 46.33s | 48.08s | 2:24.52 | 241.4 | 3.6m / 6.5m |
| `suzuka` | `GT4` | `bmw-m4-gt4` | 4.17s | 10.90s | 268.1 | 50.20s | 46.30s | 48.13s | 2:24.63 | 244.2 | 3.6m / 6.5m |
| `suzuka` | `GT4` | `aston-vantage-gt4` | 4.25s | 11.17s | 266.5 | 50.27s | 46.55s | 48.22s | 2:25.03 | 242.7 | 3.5m / 6.5m |
| `suzuka` | `GT4` | `toyota-supra-gt4` | 4.10s | 10.78s | 265.0 | 50.10s | 46.25s | 47.97s | 2:24.32 | 243.8 | 3.7m / 6.5m |
| `suzuka` | `GT4` | `mclaren-artura-gt4` | 4.10s | 10.85s | 263.5 | 49.92s | 46.15s | 47.97s | 2:24.03 | 243.0 | 3.6m / 6.5m |
| `suzuka` | `GT4` | `mercedes-amg-gt4` | 4.25s | 11.17s | 266.5 | 50.40s | 46.53s | 48.32s | 2:25.25 | 242.4 | 3.7m / 6.5m |
| `suzuka` | `GT4` | `alpine-a110-gt4` | 4.18s | 11.17s | 260.5 | 50.03s | 46.32s | 48.08s | 2:24.43 | 240.6 | 3.5m / 6.5m |
| `suzuka` | `GT4` | `ford-mustang-gt4` | 4.17s | 10.85s | 269.6 | 50.18s | 46.38s | 48.20s | 2:24.77 | 244.9 | 3.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-ferrari` | 1.85s | 3.90s | 327.2 | 32.33s | 29.97s | 31.10s | 1:33.40 | 353.8 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-mclaren` | 1.88s | 4.00s | 324.1 | 32.17s | 29.98s | 31.18s | 1:33.33 | 350.4 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-mercedes` | 1.87s | 3.95s | 327.2 | 32.17s | 29.97s | 31.15s | 1:33.28 | 353.2 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-redbull` | 1.87s | 3.93s | 328.7 | 32.17s | 29.88s | 31.07s | 1:33.12 | 354.4 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-aston` | 1.87s | 3.97s | 322.7 | 32.20s | 29.97s | 31.18s | 1:33.35 | 349.8 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-williams` | 1.88s | 3.97s | 331.7 | 32.28s | 30.02s | 31.22s | 1:33.52 | 355.9 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-alpine` | 1.92s | 4.05s | 325.6 | 32.32s | 30.10s | 31.30s | 1:33.72 | 350.9 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-haas` | 1.87s | 3.95s | 327.2 | 32.28s | 29.98s | 31.22s | 1:33.48 | 353.2 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-audi` | 1.85s | 3.92s | 324.2 | 32.20s | 29.98s | 31.13s | 1:33.32 | 351.3 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-cadillac` | 1.88s | 3.98s | 328.7 | 32.25s | 30.02s | 31.23s | 1:33.50 | 353.9 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-racing-bulls` | 1.88s | 4.00s | 324.1 | 32.17s | 30.02s | 31.23s | 1:33.42 | 350.4 | 4.3m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-mercedes` | 1.83s | 3.83s | 339.9 | 31.73s | 29.65s | 30.80s | 1:32.18 | 345.9 | 4.3m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-redbull` | 1.82s | 3.82s | 336.7 | 31.83s | 29.65s | 30.78s | 1:32.27 | 343.0 | 4.4m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-ferrari` | 1.83s | 3.87s | 335.1 | 31.85s | 29.73s | 30.93s | 1:32.52 | 341.4 | 4.3m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-mclaren` | 1.85s | 3.87s | 343.2 | 31.78s | 29.63s | 30.88s | 1:32.30 | 348.9 | 4.3m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-renault` | 1.80s | 3.73s | 345.2 | 31.93s | 29.77s | 30.95s | 1:32.65 | 351.9 | 4.2m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-mclaren` | 1.83s | 3.78s | 350.3 | 31.90s | 29.77s | 30.95s | 1:32.62 | 355.8 | 4.3m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-ferrari` | 1.85s | 3.85s | 346.8 | 32.08s | 29.92s | 31.13s | 1:33.13 | 352.5 | 4.2m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-williams` | 1.83s | 3.78s | 352.0 | 32.02s | 29.88s | 31.02s | 1:32.92 | 357.0 | 4.2m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-porsche-99x` | 2.25s | 5.55s | 297.9 | 41.32s | 38.35s | 39.87s | 1:59.53 | 291.8 | 3.4m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-jaguar-itype7` | 2.32s | 5.70s | 299.8 | 41.52s | 38.50s | 39.95s | 1:59.97 | 291.7 | 3.6m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-nissan-e4orce` | 2.22s | 5.50s | 295.9 | 41.25s | 38.23s | 39.67s | 1:59.15 | 291.2 | 3.5m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-maserati-folgore` | 2.35s | 5.77s | 301.8 | 41.65s | 38.52s | 40.00s | 2:00.17 | 292.1 | 3.7m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `bmw-m2-cs` | 4.52s | 12.02s | 261.8 | 52.07s | 47.98s | 49.92s | 2:29.97 | 236.6 | 3.7m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.38s | 11.45s | 269.2 | 51.38s | 47.33s | 49.17s | 2:27.88 | 241.6 | 3.6m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.15s | 10.50s | 283.9 | 50.85s | 46.80s | 48.67s | 2:26.32 | 250.2 | 3.7m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `nissan-gtr-nismo` | 3.98s | 10.25s | 276.6 | 50.55s | 46.62s | 48.47s | 2:25.63 | 249.2 | 3.5m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `renault-clio-v6` | 4.93s | 13.72s | 247.1 | 52.75s | 48.83s | 50.67s | 2:32.25 | 226.0 | 3.5m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `honda-civic-type-r` | 4.77s | 12.78s | 258.1 | 52.37s | 48.35s | 50.17s | 2:30.88 | 232.7 | 3.7m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.58s | 12.72s | 247.1 | 52.12s | 48.20s | 50.00s | 2:30.32 | 229.5 | 3.5m / 6.5m |
| `suzuka` | `SUPERCAR` | `ferrari-296-gtb` | 2.58s | 6.07s | 336.4 | 43.23s | 39.93s | 41.37s | 2:04.53 | 301.7 | 3.5m / 6.5m |
| `suzuka` | `SUPERCAR` | `mclaren-750s` | 2.58s | 6.00s | 348.6 | 42.90s | 39.77s | 41.18s | 2:03.85 | 306.5 | 3.4m / 6.5m |
| `suzuka` | `SUPERCAR` | `ferrari-sf90` | 2.50s | 5.80s | 354.8 | 42.78s | 39.60s | 41.00s | 2:03.38 | 310.6 | 3.4m / 6.5m |
| `suzuka` | `SUPERCAR` | `porsche-918-spyder` | 2.57s | 6.10s | 330.3 | 43.32s | 40.05s | 41.47s | 2:04.83 | 299.3 | 3.5m / 6.5m |
| `suzuka` | `SUPERCAR` | `aston-valkyrie-road` | 2.57s | 5.88s | 373.1 | 42.63s | 39.38s | 40.70s | 2:02.72 | 315.4 | 3.5m / 6.5m |
| `suzuka` | `SUPERCAR` | `koenigsegg-jesko` | 2.43s | 5.43s | 409.9 | 42.22s | 38.88s | 40.23s | 2:01.33 | 330.0 | 3.5m / 6.5m |
| `suzuka` | `SUPERCAR` | `ferrari-f80` | 2.48s | 5.72s | 367.0 | 42.57s | 39.33s | 40.77s | 2:02.67 | 315.2 | 3.4m / 6.5m |
| `suzuka` | `SUPERCAR` | `mclaren-w1` | 2.50s | 5.75s | 367.0 | 42.62s | 39.42s | 40.77s | 2:02.80 | 314.8 | 3.4m / 6.5m |
| `silverstone` | `HYPERCAR_GTP` | `ferrari-499p` | 2.65s | 5.97s | 341.5 | 33.10s | 34.35s | 35.30s | 1:42.75 | 319.5 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `toyota-gr010` | 2.73s | 6.20s | 333.1 | 33.42s | 34.60s | 35.63s | 1:43.65 | 313.8 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `porsche-963` | 2.70s | 6.10s | 335.2 | 33.25s | 34.48s | 35.50s | 1:43.23 | 315.7 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.58s | 5.80s | 343.6 | 33.03s | 34.23s | 35.22s | 1:42.48 | 322.2 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.70s | 6.07s | 339.4 | 33.25s | 34.50s | 35.48s | 1:43.23 | 317.9 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `acura-arx-06` | 2.63s | 5.97s | 331.1 | 33.13s | 34.37s | 35.33s | 1:42.83 | 315.2 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `alpine-a424` | 2.77s | 6.23s | 339.4 | 33.37s | 34.62s | 35.60s | 1:43.58 | 316.0 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `peugeot-9x8` | 2.78s | 6.30s | 331.0 | 33.45s | 34.65s | 35.60s | 1:43.70 | 312.0 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.77s | 6.18s | 345.6 | 33.27s | 34.52s | 35.52s | 1:43.30 | 320.0 | 3.3m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.73s | 6.17s | 337.3 | 33.37s | 34.63s | 35.57s | 1:43.57 | 315.9 | 3.2m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.67s | 6.00s | 337.3 | 33.23s | 34.43s | 35.38s | 1:43.05 | 317.4 | 3.2m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 2.80s | 6.30s | 341.4 | 33.52s | 34.82s | 35.75s | 1:44.08 | 317.4 | 3.3m / 7.3m |
| `silverstone` | `LMP2` | `oreca-07-united` | 2.98s | 6.80s | 325.8 | 35.47s | 36.77s | 37.75s | 1:49.98 | 301.2 | 3.1m / 7.3m |
| `silverstone` | `LMP2` | `oreca-07-europol` | 2.90s | 6.70s | 315.9 | 35.23s | 36.55s | 37.55s | 1:49.33 | 298.3 | 3.1m / 7.3m |
| `silverstone` | `LMP2` | `oreca-07-ao` | 2.93s | 6.75s | 320.8 | 35.35s | 36.68s | 37.65s | 1:49.68 | 299.9 | 3.1m / 7.3m |
| `silverstone` | `LMP2` | `ligier-js-p217` | 2.93s | 6.72s | 324.1 | 35.37s | 36.62s | 37.68s | 1:49.67 | 301.4 | 3.1m / 7.3m |
| `silverstone` | `GT3` | `porsche-911-gt3-r` | 3.25s | 8.18s | 285.8 | 39.27s | 40.73s | 41.97s | 2:01.97 | 272.1 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `ferrari-296-gt3` | 3.28s | 8.20s | 291.3 | 39.18s | 40.63s | 41.88s | 2:01.70 | 274.1 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `corvette-z06-gt3r` | 3.18s | 7.88s | 295.0 | 39.07s | 40.53s | 41.73s | 2:01.33 | 277.3 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `bmw-m4-gt3` | 3.33s | 8.30s | 293.2 | 39.35s | 40.87s | 42.12s | 2:02.33 | 274.0 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `ford-mustang-gt3` | 3.22s | 7.95s | 298.7 | 39.08s | 40.62s | 41.80s | 2:01.50 | 278.4 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `aston-vantage-gt3` | 3.28s | 8.20s | 291.3 | 39.28s | 40.77s | 42.00s | 2:02.05 | 273.9 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `lamborghini-temerario-gt3` | 3.18s | 7.92s | 293.2 | 39.00s | 40.52s | 41.65s | 2:01.17 | 276.5 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `mercedes-amg-gt3` | 3.35s | 8.38s | 289.5 | 39.43s | 40.85s | 42.08s | 2:02.37 | 272.5 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `lexus-rcf-gt3` | 3.33s | 8.27s | 295.0 | 39.43s | 40.93s | 42.08s | 2:02.45 | 274.8 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `mclaren-720s-gt3` | 3.28s | 8.25s | 289.5 | 39.22s | 40.67s | 41.88s | 2:01.77 | 273.1 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `renault-rs01-gt3` | 3.23s | 8.05s | 293.2 | 39.08s | 40.58s | 41.78s | 2:01.45 | 275.7 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `bentley-continental-gt3` | 3.22s | 7.92s | 300.5 | 39.10s | 40.57s | 41.77s | 2:01.43 | 279.3 | 3.1m / 7.3m |
| `silverstone` | `GT3` | `audi-r8-lms-gt3` | 3.28s | 8.20s | 291.3 | 39.28s | 40.72s | 41.93s | 2:01.93 | 274.1 | 3.2m / 7.3m |
| `silverstone` | `GT3` | `acura-nsx-gt3` | 3.18s | 7.98s | 289.5 | 39.08s | 40.58s | 41.77s | 2:01.43 | 274.6 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `porsche-cayman-gt4-rs` | 4.18s | 11.12s | 262.0 | 43.80s | 45.45s | 46.88s | 2:16.13 | 246.8 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `bmw-m4-gt4` | 4.17s | 10.90s | 268.1 | 43.82s | 45.50s | 46.92s | 2:16.23 | 249.4 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `aston-vantage-gt4` | 4.25s | 11.17s | 266.5 | 43.95s | 45.58s | 47.02s | 2:16.55 | 248.0 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `toyota-supra-gt4` | 4.10s | 10.78s | 265.0 | 43.70s | 45.33s | 46.82s | 2:15.85 | 249.0 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `mclaren-artura-gt4` | 4.10s | 10.85s | 263.5 | 43.65s | 45.32s | 46.67s | 2:15.63 | 248.4 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `mercedes-amg-gt4` | 4.25s | 11.17s | 266.5 | 43.97s | 45.68s | 47.15s | 2:16.80 | 247.8 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `alpine-a110-gt4` | 4.18s | 11.17s | 260.5 | 43.82s | 45.42s | 46.85s | 2:16.08 | 246.2 | 3.2m / 7.3m |
| `silverstone` | `GT4` | `ford-mustang-gt4` | 4.17s | 10.85s | 269.6 | 43.83s | 45.55s | 46.88s | 2:16.27 | 250.0 | 3.2m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-ferrari` | 1.85s | 3.90s | 327.2 | 28.58s | 29.88s | 30.47s | 1:28.93 | 350.6 | 3.7m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-mclaren` | 1.88s | 4.00s | 324.1 | 28.63s | 29.90s | 30.53s | 1:29.07 | 347.5 | 3.7m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-mercedes` | 1.87s | 3.95s | 327.2 | 28.62s | 29.83s | 30.45s | 1:28.90 | 350.2 | 3.7m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-redbull` | 1.87s | 3.93s | 328.7 | 28.55s | 29.82s | 30.38s | 1:28.75 | 350.7 | 3.7m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-aston` | 1.87s | 3.97s | 322.7 | 28.65s | 29.93s | 30.55s | 1:29.13 | 346.9 | 3.6m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-williams` | 1.88s | 3.97s | 331.7 | 28.65s | 29.95s | 30.53s | 1:29.13 | 352.0 | 3.6m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-alpine` | 1.92s | 4.05s | 325.6 | 28.73s | 30.02s | 30.62s | 1:29.37 | 347.8 | 3.7m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-haas` | 1.87s | 3.95s | 327.2 | 28.68s | 29.92s | 30.57s | 1:29.17 | 350.0 | 3.6m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-audi` | 1.85s | 3.92s | 324.2 | 28.63s | 29.88s | 30.50s | 1:29.02 | 348.5 | 3.6m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-cadillac` | 1.88s | 3.98s | 328.7 | 28.65s | 29.95s | 30.57s | 1:29.17 | 350.0 | 3.6m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-racing-bulls` | 1.88s | 4.00s | 324.1 | 28.65s | 29.93s | 30.52s | 1:29.10 | 347.5 | 3.7m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-mercedes` | 1.83s | 3.83s | 339.9 | 28.33s | 29.58s | 30.15s | 1:28.07 | 346.0 | 3.8m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-redbull` | 1.82s | 3.82s | 336.7 | 28.33s | 29.55s | 30.15s | 1:28.03 | 342.9 | 3.8m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-ferrari` | 1.83s | 3.87s | 335.1 | 28.43s | 29.70s | 30.23s | 1:28.37 | 341.3 | 3.7m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-mclaren` | 1.85s | 3.87s | 343.2 | 28.37s | 29.58s | 30.18s | 1:28.13 | 349.0 | 3.8m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-renault` | 1.80s | 3.73s | 345.2 | 28.48s | 29.72s | 30.27s | 1:28.47 | 351.2 | 3.7m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-mclaren` | 1.83s | 3.78s | 350.3 | 28.45s | 29.63s | 30.23s | 1:28.32 | 355.4 | 3.7m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-ferrari` | 1.85s | 3.85s | 346.8 | 28.58s | 29.77s | 30.38s | 1:28.73 | 352.2 | 3.7m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-williams` | 1.83s | 3.78s | 352.0 | 28.50s | 29.70s | 30.30s | 1:28.50 | 356.8 | 3.7m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-porsche-99x` | 2.25s | 5.55s | 297.9 | 36.22s | 37.77s | 38.82s | 1:52.80 | 295.9 | 3.0m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-jaguar-itype7` | 2.32s | 5.70s | 299.8 | 36.38s | 37.83s | 38.90s | 1:53.12 | 295.7 | 3.0m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-nissan-e4orce` | 2.22s | 5.50s | 295.9 | 36.13s | 37.68s | 38.68s | 1:52.50 | 295.3 | 3.0m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-maserati-folgore` | 2.35s | 5.77s | 301.8 | 36.37s | 37.92s | 39.00s | 1:53.28 | 296.4 | 3.1m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `bmw-m2-cs` | 4.52s | 12.02s | 261.8 | 45.33s | 47.08s | 48.58s | 2:21.00 | 242.3 | 3.3m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.38s | 11.45s | 269.2 | 44.68s | 46.40s | 47.92s | 2:19.00 | 246.7 | 3.2m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.15s | 10.50s | 283.9 | 44.12s | 45.85s | 47.42s | 2:17.38 | 255.5 | 3.2m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `nissan-gtr-nismo` | 3.98s | 10.25s | 276.6 | 43.93s | 45.68s | 47.12s | 2:16.73 | 254.4 | 3.2m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `renault-clio-v6` | 4.93s | 13.72s | 247.1 | 46.25s | 47.95s | 49.43s | 2:23.63 | 232.4 | 3.3m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `honda-civic-type-r` | 4.77s | 12.78s | 258.1 | 45.70s | 47.43s | 48.87s | 2:22.00 | 238.6 | 3.3m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.58s | 12.72s | 247.1 | 45.62s | 47.33s | 48.75s | 2:21.70 | 235.5 | 3.3m / 7.3m |
| `silverstone` | `SUPERCAR` | `ferrari-296-gtb` | 2.58s | 6.07s | 336.4 | 37.40s | 39.15s | 40.32s | 1:56.87 | 306.7 | 3.0m / 7.3m |
| `silverstone` | `SUPERCAR` | `mclaren-750s` | 2.58s | 6.00s | 348.6 | 37.20s | 38.93s | 40.07s | 1:56.20 | 311.6 | 3.0m / 7.3m |
| `silverstone` | `SUPERCAR` | `ferrari-sf90` | 2.50s | 5.80s | 354.8 | 36.95s | 38.70s | 39.92s | 1:55.57 | 315.9 | 3.1m / 7.3m |
| `silverstone` | `SUPERCAR` | `porsche-918-spyder` | 2.57s | 6.10s | 330.3 | 37.47s | 39.18s | 40.32s | 1:56.97 | 304.2 | 3.1m / 7.3m |
| `silverstone` | `SUPERCAR` | `aston-valkyrie-road` | 2.57s | 5.88s | 373.1 | 36.75s | 38.48s | 39.67s | 1:54.90 | 320.8 | 3.1m / 7.3m |
| `silverstone` | `SUPERCAR` | `koenigsegg-jesko` | 2.43s | 5.43s | 409.9 | 36.18s | 37.92s | 39.15s | 1:53.25 | 336.2 | 3.0m / 7.3m |
| `silverstone` | `SUPERCAR` | `ferrari-f80` | 2.48s | 5.72s | 367.0 | 36.75s | 38.45s | 39.63s | 1:54.83 | 320.7 | 3.1m / 7.3m |
| `silverstone` | `SUPERCAR` | `mclaren-w1` | 2.50s | 5.75s | 367.0 | 36.80s | 38.52s | 39.72s | 1:55.03 | 320.4 | 3.0m / 7.3m |
| `laguna-seca` | `HYPERCAR_GTP` | `ferrari-499p` | 2.65s | 5.97s | 341.5 | 21.98s | 24.03s | 25.87s | 1:11.88 | 289.5 | 3.3m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `toyota-gr010` | 2.73s | 6.20s | 333.1 | 22.18s | 24.22s | 26.12s | 1:12.52 | 285.3 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `porsche-963` | 2.70s | 6.10s | 335.2 | 22.10s | 24.13s | 26.02s | 1:12.25 | 287.0 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.58s | 5.80s | 343.6 | 21.92s | 23.92s | 25.83s | 1:11.67 | 292.0 | 3.3m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.70s | 6.07s | 339.4 | 22.08s | 24.12s | 26.02s | 1:12.22 | 288.2 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `acura-arx-06` | 2.63s | 5.97s | 331.1 | 21.98s | 23.95s | 25.83s | 1:11.77 | 287.4 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `alpine-a424` | 2.77s | 6.23s | 339.4 | 22.17s | 24.22s | 26.07s | 1:12.45 | 286.3 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `peugeot-9x8` | 2.78s | 6.30s | 331.0 | 22.20s | 24.23s | 26.15s | 1:12.58 | 283.8 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.77s | 6.18s | 345.6 | 22.20s | 24.20s | 26.08s | 1:12.48 | 286.4 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.73s | 6.17s | 337.3 | 22.18s | 24.18s | 26.08s | 1:12.45 | 286.7 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.67s | 6.00s | 337.3 | 22.03s | 24.07s | 25.90s | 1:12.00 | 288.2 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 2.80s | 6.30s | 341.4 | 22.37s | 24.42s | 26.32s | 1:13.10 | 284.2 | 3.3m / 6.0m |
| `laguna-seca` | `LMP2` | `oreca-07-united` | 2.98s | 6.80s | 325.8 | 23.52s | 25.73s | 27.72s | 1:16.97 | 271.2 | 3.0m / 6.0m |
| `laguna-seca` | `LMP2` | `oreca-07-europol` | 2.90s | 6.70s | 315.9 | 23.40s | 25.53s | 27.52s | 1:16.45 | 270.0 | 3.1m / 6.0m |
| `laguna-seca` | `LMP2` | `oreca-07-ao` | 2.93s | 6.75s | 320.8 | 23.50s | 25.65s | 27.70s | 1:16.85 | 270.6 | 3.1m / 6.0m |
| `laguna-seca` | `LMP2` | `ligier-js-p217` | 2.93s | 6.72s | 324.1 | 23.47s | 25.67s | 27.62s | 1:16.75 | 271.6 | 3.1m / 6.0m |
| `laguna-seca` | `GT3` | `porsche-911-gt3-r` | 3.25s | 8.18s | 285.8 | 26.02s | 28.62s | 30.82s | 1:25.45 | 248.2 | 2.7m / 6.0m |
| `laguna-seca` | `GT3` | `ferrari-296-gt3` | 3.28s | 8.20s | 291.3 | 25.97s | 28.60s | 30.77s | 1:25.33 | 249.3 | 2.7m / 6.0m |
| `laguna-seca` | `GT3` | `corvette-z06-gt3r` | 3.18s | 7.88s | 295.0 | 25.83s | 28.50s | 30.70s | 1:25.03 | 252.1 | 2.6m / 6.0m |
| `laguna-seca` | `GT3` | `bmw-m4-gt3` | 3.33s | 8.30s | 293.2 | 26.03s | 28.75s | 30.85s | 1:25.63 | 249.0 | 2.7m / 6.0m |
| `laguna-seca` | `GT3` | `ford-mustang-gt3` | 3.22s | 7.95s | 298.7 | 25.92s | 28.57s | 30.82s | 1:25.30 | 252.2 | 2.6m / 6.0m |
| `laguna-seca` | `GT3` | `aston-vantage-gt3` | 3.28s | 8.20s | 291.3 | 26.00s | 28.72s | 30.85s | 1:25.57 | 249.2 | 2.7m / 6.0m |
| `laguna-seca` | `GT3` | `lamborghini-temerario-gt3` | 3.18s | 7.92s | 293.2 | 25.87s | 28.47s | 30.65s | 1:24.98 | 251.4 | 2.6m / 6.0m |
| `laguna-seca` | `GT3` | `mercedes-amg-gt3` | 3.35s | 8.38s | 289.5 | 26.12s | 28.77s | 31.03s | 1:25.92 | 247.8 | 2.7m / 6.0m |
| `laguna-seca` | `GT3` | `lexus-rcf-gt3` | 3.33s | 8.27s | 295.0 | 26.12s | 28.78s | 30.98s | 1:25.88 | 249.3 | 2.6m / 6.0m |
| `laguna-seca` | `GT3` | `mclaren-720s-gt3` | 3.28s | 8.25s | 289.5 | 25.98s | 28.58s | 30.77s | 1:25.33 | 248.7 | 2.7m / 6.0m |
| `laguna-seca` | `GT3` | `renault-rs01-gt3` | 3.23s | 8.05s | 293.2 | 25.85s | 28.48s | 30.67s | 1:25.00 | 250.7 | 2.6m / 6.0m |
| `laguna-seca` | `GT3` | `bentley-continental-gt3` | 3.22s | 7.92s | 300.5 | 25.92s | 28.60s | 30.83s | 1:25.35 | 252.8 | 2.6m / 6.0m |
| `laguna-seca` | `GT3` | `audi-r8-lms-gt3` | 3.28s | 8.20s | 291.3 | 26.00s | 28.63s | 30.75s | 1:25.38 | 249.2 | 2.6m / 6.0m |
| `laguna-seca` | `GT3` | `acura-nsx-gt3` | 3.18s | 7.98s | 289.5 | 25.85s | 28.53s | 30.67s | 1:25.05 | 250.4 | 2.6m / 6.0m |
| `laguna-seca` | `GT4` | `porsche-cayman-gt4-rs` | 4.18s | 11.12s | 262.0 | 29.08s | 32.13s | 34.55s | 1:35.77 | 225.5 | 2.3m / 6.0m |
| `laguna-seca` | `GT4` | `bmw-m4-gt4` | 4.17s | 10.90s | 268.1 | 29.07s | 32.20s | 34.60s | 1:35.87 | 227.3 | 2.3m / 6.0m |
| `laguna-seca` | `GT4` | `aston-vantage-gt4` | 4.25s | 11.17s | 266.5 | 29.12s | 32.37s | 34.67s | 1:36.15 | 225.8 | 2.3m / 6.0m |
| `laguna-seca` | `GT4` | `toyota-supra-gt4` | 4.10s | 10.78s | 265.0 | 28.93s | 32.05s | 34.47s | 1:35.45 | 227.2 | 2.3m / 6.0m |
| `laguna-seca` | `GT4` | `mclaren-artura-gt4` | 4.10s | 10.85s | 263.5 | 28.90s | 32.05s | 34.37s | 1:35.32 | 226.9 | 2.3m / 6.0m |
| `laguna-seca` | `GT4` | `mercedes-amg-gt4` | 4.25s | 11.17s | 266.5 | 29.17s | 32.35s | 34.68s | 1:36.20 | 225.8 | 2.3m / 6.0m |
| `laguna-seca` | `GT4` | `alpine-a110-gt4` | 4.18s | 11.17s | 260.5 | 29.05s | 32.17s | 34.50s | 1:35.72 | 224.9 | 2.4m / 6.0m |
| `laguna-seca` | `GT4` | `ford-mustang-gt4` | 4.17s | 10.85s | 269.6 | 29.07s | 32.20s | 34.65s | 1:35.92 | 227.6 | 2.3m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-ferrari` | 1.85s | 3.90s | 327.2 | 19.02s | 20.62s | 22.43s | 1:02.07 | 322.8 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-mclaren` | 1.88s | 4.00s | 324.1 | 19.05s | 20.63s | 22.40s | 1:02.08 | 320.2 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-mercedes` | 1.87s | 3.95s | 327.2 | 19.07s | 20.62s | 22.37s | 1:02.05 | 322.2 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-redbull` | 1.87s | 3.93s | 328.7 | 18.97s | 20.58s | 22.37s | 1:01.92 | 322.9 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-aston` | 1.87s | 3.97s | 322.7 | 19.07s | 20.62s | 22.37s | 1:02.05 | 320.1 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-williams` | 1.88s | 3.97s | 331.7 | 19.08s | 20.67s | 22.50s | 1:02.25 | 323.3 | 4.1m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-alpine` | 1.92s | 4.05s | 325.6 | 19.13s | 20.77s | 22.53s | 1:02.43 | 320.3 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-haas` | 1.87s | 3.95s | 327.2 | 19.08s | 20.70s | 22.47s | 1:02.25 | 322.2 | 4.1m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-audi` | 1.85s | 3.92s | 324.2 | 19.03s | 20.65s | 22.38s | 1:02.07 | 321.4 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-cadillac` | 1.88s | 3.98s | 328.7 | 19.07s | 20.68s | 22.48s | 1:02.23 | 322.2 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-racing-bulls` | 1.88s | 4.00s | 324.1 | 19.07s | 20.65s | 22.43s | 1:02.15 | 320.2 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-mercedes` | 1.83s | 3.83s | 339.9 | 18.82s | 20.38s | 22.12s | 1:01.32 | 323.5 | 4.3m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-redbull` | 1.82s | 3.82s | 336.7 | 18.82s | 20.33s | 22.07s | 1:01.22 | 322.6 | 4.3m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-ferrari` | 1.83s | 3.87s | 335.1 | 18.88s | 20.43s | 22.17s | 1:01.48 | 321.2 | 4.3m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-mclaren` | 1.85s | 3.87s | 343.2 | 18.87s | 20.42s | 22.15s | 1:01.43 | 324.4 | 4.3m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-renault` | 1.80s | 3.73s | 345.2 | 18.90s | 20.47s | 22.27s | 1:01.63 | 324.8 | 4.1m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-mclaren` | 1.83s | 3.78s | 350.3 | 18.93s | 20.47s | 22.27s | 1:01.67 | 325.5 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-ferrari` | 1.85s | 3.85s | 346.8 | 18.97s | 20.57s | 22.37s | 1:01.90 | 323.5 | 4.2m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-williams` | 1.83s | 3.78s | 352.0 | 18.95s | 20.55s | 22.30s | 1:01.80 | 326.2 | 4.1m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-porsche-99x` | 2.25s | 5.55s | 297.9 | 23.53s | 26.32s | 28.28s | 1:18.13 | 278.9 | 2.8m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-jaguar-itype7` | 2.32s | 5.70s | 299.8 | 23.62s | 26.37s | 28.38s | 1:18.37 | 277.9 | 2.8m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-nissan-e4orce` | 2.22s | 5.50s | 295.9 | 23.47s | 26.27s | 28.20s | 1:17.93 | 279.0 | 2.8m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-maserati-folgore` | 2.35s | 5.77s | 301.8 | 23.67s | 26.47s | 28.47s | 1:18.60 | 277.8 | 2.8m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `bmw-m2-cs` | 4.52s | 12.02s | 261.8 | 30.00s | 33.45s | 35.90s | 1:39.35 | 220.8 | 2.3m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.38s | 11.45s | 269.2 | 29.62s | 32.98s | 35.37s | 1:37.97 | 224.4 | 2.4m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.15s | 10.50s | 283.9 | 29.27s | 32.60s | 35.08s | 1:36.95 | 230.8 | 2.3m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `nissan-gtr-nismo` | 3.98s | 10.25s | 276.6 | 29.12s | 32.43s | 34.82s | 1:36.37 | 230.9 | 2.3m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `renault-clio-v6` | 4.93s | 13.72s | 247.1 | 30.68s | 34.03s | 36.60s | 1:41.32 | 212.8 | 2.4m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `honda-civic-type-r` | 4.77s | 12.78s | 258.1 | 30.32s | 33.68s | 36.13s | 1:40.13 | 217.4 | 2.4m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.58s | 12.72s | 247.1 | 30.22s | 33.47s | 35.97s | 1:39.65 | 216.1 | 2.4m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `ferrari-296-gtb` | 2.58s | 6.07s | 336.4 | 24.88s | 27.48s | 29.75s | 1:22.12 | 273.8 | 2.3m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `mclaren-750s` | 2.58s | 6.00s | 348.6 | 24.78s | 27.42s | 29.62s | 1:21.82 | 276.4 | 2.3m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `ferrari-sf90` | 2.50s | 5.80s | 354.8 | 24.60s | 27.27s | 29.57s | 1:21.43 | 279.9 | 2.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `porsche-918-spyder` | 2.57s | 6.10s | 330.3 | 24.92s | 27.50s | 29.72s | 1:22.13 | 272.3 | 2.3m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `aston-valkyrie-road` | 2.57s | 5.88s | 373.1 | 24.48s | 27.08s | 29.38s | 1:20.95 | 282.0 | 2.3m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `koenigsegg-jesko` | 2.43s | 5.43s | 409.9 | 24.18s | 26.75s | 29.25s | 1:20.18 | 292.1 | 2.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `ferrari-f80` | 2.48s | 5.72s | 367.0 | 24.50s | 27.08s | 29.43s | 1:21.02 | 282.7 | 2.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `mclaren-w1` | 2.50s | 5.75s | 367.0 | 24.50s | 27.10s | 29.43s | 1:21.03 | 282.3 | 2.2m / 6.0m |
| `le-mans` | `HYPERCAR_GTP` | `ferrari-499p` | 2.65s | 5.97s | 341.5 | 57.95s | 54.47s | 63.27s | 2:55.68 | 348.2 | 5.6m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `toyota-gr010` | 2.73s | 6.20s | 333.1 | 58.72s | 55.40s | 63.97s | 2:58.08 | 339.7 | 5.7m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `porsche-963` | 2.70s | 6.10s | 335.2 | 58.42s | 55.07s | 63.73s | 2:57.22 | 341.8 | 5.7m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.58s | 5.80s | 343.6 | 57.68s | 54.20s | 63.13s | 2:55.02 | 350.4 | 5.6m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.70s | 6.07s | 339.4 | 58.17s | 54.77s | 63.62s | 2:56.55 | 346.0 | 5.7m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `acura-arx-06` | 2.63s | 5.97s | 331.1 | 58.57s | 55.25s | 63.68s | 2:57.50 | 337.6 | 5.6m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `alpine-a424` | 2.77s | 6.23s | 339.4 | 58.33s | 54.92s | 63.67s | 2:56.92 | 346.0 | 5.6m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `peugeot-9x8` | 2.78s | 6.30s | 331.0 | 58.85s | 55.58s | 64.08s | 2:58.52 | 337.5 | 5.7m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.77s | 6.18s | 345.6 | 57.77s | 54.37s | 63.33s | 2:55.47 | 353.0 | 5.6m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.73s | 6.17s | 337.3 | 58.38s | 55.02s | 63.77s | 2:57.17 | 343.9 | 5.6m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.67s | 6.00s | 337.3 | 58.22s | 54.87s | 63.60s | 2:56.68 | 344.0 | 5.6m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 2.80s | 6.30s | 341.4 | 58.17s | 54.82s | 63.78s | 2:56.77 | 348.7 | 5.7m / 6.5m |
| `le-mans` | `LMP2` | `oreca-07-united` | 2.98s | 6.80s | 325.8 | 61.43s | 58.02s | 67.32s | 3:06.77 | 331.6 | 6.7m / 6.5m |
| `le-mans` | `LMP2` | `oreca-07-europol` | 2.90s | 6.70s | 315.9 | 61.87s | 58.62s | 67.37s | 3:07.85 | 321.5 | 6.5m / 6.5m |
| `le-mans` | `LMP2` | `oreca-07-ao` | 2.93s | 6.75s | 320.8 | 61.68s | 58.32s | 67.48s | 3:07.48 | 326.6 | 6.5m / 6.5m |
| `le-mans` | `LMP2` | `ligier-js-p217` | 2.93s | 6.72s | 324.1 | 61.50s | 58.00s | 67.18s | 3:06.68 | 330.0 | 6.6m / 6.5m |
| `le-mans` | `GT3` | `porsche-911-gt3-r` | 3.25s | 8.18s | 285.8 | 68.72s | 64.88s | 75.32s | 3:28.92 | 291.0 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `ferrari-296-gt3` | 3.28s | 8.20s | 291.3 | 68.25s | 64.28s | 74.95s | 3:27.48 | 296.6 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `corvette-z06-gt3r` | 3.18s | 7.88s | 295.0 | 67.90s | 63.77s | 74.70s | 3:26.37 | 300.4 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `bmw-m4-gt3` | 3.33s | 8.30s | 293.2 | 68.28s | 64.32s | 75.03s | 3:27.63 | 298.5 | 6.9m / 6.5m |
| `le-mans` | `GT3` | `ford-mustang-gt3` | 3.22s | 7.95s | 298.7 | 67.67s | 63.52s | 74.62s | 3:25.80 | 304.1 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `aston-vantage-gt3` | 3.28s | 8.20s | 291.3 | 68.37s | 64.40s | 75.17s | 3:27.93 | 296.6 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `lamborghini-temerario-gt3` | 3.18s | 7.92s | 293.2 | 67.98s | 63.93s | 74.67s | 3:26.58 | 298.5 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `mercedes-amg-gt3` | 3.35s | 8.38s | 289.5 | 68.63s | 64.77s | 75.35s | 3:28.75 | 294.7 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `lexus-rcf-gt3` | 3.33s | 8.27s | 295.0 | 68.27s | 64.17s | 75.12s | 3:27.55 | 300.3 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `mclaren-720s-gt3` | 3.28s | 8.25s | 289.5 | 68.42s | 64.57s | 75.10s | 3:28.08 | 294.7 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `renault-rs01-gt3` | 3.23s | 8.05s | 293.2 | 68.02s | 63.98s | 74.68s | 3:26.68 | 298.5 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `bentley-continental-gt3` | 3.22s | 7.92s | 300.5 | 67.58s | 63.33s | 74.53s | 3:25.45 | 306.0 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `audi-r8-lms-gt3` | 3.28s | 8.20s | 291.3 | 68.33s | 64.37s | 75.07s | 3:27.77 | 296.6 | 6.8m / 6.5m |
| `le-mans` | `GT3` | `acura-nsx-gt3` | 3.18s | 7.98s | 289.5 | 68.27s | 64.35s | 74.98s | 3:27.60 | 294.8 | 6.7m / 6.5m |
| `le-mans` | `GT4` | `porsche-cayman-gt4-rs` | 4.18s | 11.12s | 262.0 | 76.18s | 71.75s | 83.77s | 3:51.70 | 266.8 | 6.6m / 6.5m |
| `le-mans` | `GT4` | `bmw-m4-gt4` | 4.17s | 10.90s | 268.1 | 75.73s | 71.05s | 83.58s | 3:50.37 | 272.9 | 6.7m / 6.5m |
| `le-mans` | `GT4` | `aston-vantage-gt4` | 4.25s | 11.17s | 266.5 | 75.98s | 71.37s | 83.67s | 3:51.02 | 271.4 | 6.7m / 6.5m |
| `le-mans` | `GT4` | `toyota-supra-gt4` | 4.10s | 10.78s | 265.0 | 75.83s | 71.25s | 83.55s | 3:50.63 | 269.8 | 6.6m / 6.5m |
| `le-mans` | `GT4` | `mclaren-artura-gt4` | 4.10s | 10.85s | 263.5 | 75.88s | 71.37s | 83.57s | 3:50.82 | 268.3 | 6.6m / 6.5m |
| `le-mans` | `GT4` | `mercedes-amg-gt4` | 4.25s | 11.17s | 266.5 | 76.00s | 71.43s | 83.85s | 3:51.28 | 271.4 | 6.7m / 6.5m |
| `le-mans` | `GT4` | `alpine-a110-gt4` | 4.18s | 11.17s | 260.5 | 76.40s | 71.97s | 83.87s | 3:52.23 | 265.2 | 6.6m / 6.5m |
| `le-mans` | `GT4` | `ford-mustang-gt4` | 4.17s | 10.85s | 269.6 | 75.63s | 70.93s | 83.52s | 3:50.08 | 274.4 | 6.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-ferrari` | 1.85s | 3.90s | 327.2 | 51.92s | 49.72s | 55.70s | 2:37.33 | 358.0 | 6.5m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-mclaren` | 1.88s | 4.00s | 324.1 | 52.15s | 50.03s | 55.85s | 2:38.03 | 354.7 | 6.5m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-mercedes` | 1.87s | 3.95s | 327.2 | 51.93s | 49.72s | 55.75s | 2:37.40 | 358.0 | 6.5m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-redbull` | 1.87s | 3.93s | 328.7 | 51.72s | 49.55s | 55.50s | 2:36.77 | 359.6 | 6.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-aston` | 1.87s | 3.97s | 322.7 | 52.32s | 50.18s | 55.97s | 2:38.47 | 353.0 | 6.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-williams` | 1.88s | 3.97s | 331.7 | 51.70s | 49.35s | 55.60s | 2:36.65 | 362.9 | 6.6m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-alpine` | 1.92s | 4.05s | 325.6 | 52.15s | 49.97s | 55.95s | 2:38.07 | 356.3 | 6.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-haas` | 1.87s | 3.95s | 327.2 | 52.00s | 49.77s | 55.85s | 2:37.62 | 358.0 | 6.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-audi` | 1.85s | 3.92s | 324.2 | 52.15s | 50.02s | 55.90s | 2:38.07 | 354.7 | 6.5m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-cadillac` | 1.88s | 3.98s | 328.7 | 51.90s | 49.63s | 55.73s | 2:37.27 | 359.6 | 6.5m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-racing-bulls` | 1.88s | 4.00s | 324.1 | 52.18s | 50.08s | 55.87s | 2:38.13 | 354.7 | 6.5m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-mercedes` | 1.83s | 3.83s | 339.9 | 52.30s | 50.45s | 55.63s | 2:38.38 | 346.6 | 6.7m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-redbull` | 1.82s | 3.82s | 336.7 | 52.52s | 50.77s | 55.77s | 2:39.05 | 343.3 | 6.7m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-ferrari` | 1.83s | 3.87s | 335.1 | 52.75s | 50.98s | 55.95s | 2:39.68 | 341.7 | 6.6m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-mclaren` | 1.85s | 3.87s | 343.2 | 52.12s | 50.17s | 55.48s | 2:37.77 | 349.9 | 6.5m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-renault` | 1.80s | 3.73s | 345.2 | 51.92s | 49.92s | 55.42s | 2:37.25 | 353.6 | 6.5m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-mclaren` | 1.83s | 3.78s | 350.3 | 51.55s | 49.47s | 55.15s | 2:36.17 | 358.8 | 6.6m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-ferrari` | 1.85s | 3.85s | 346.8 | 51.92s | 49.85s | 55.53s | 2:37.30 | 355.2 | 6.6m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-williams` | 1.83s | 3.78s | 352.0 | 51.50s | 49.33s | 55.20s | 2:36.03 | 360.5 | 6.6m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-porsche-99x` | 2.25s | 5.55s | 297.9 | 64.68s | 60.75s | 70.85s | 3:16.28 | 303.2 | 6.8m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-jaguar-itype7` | 2.32s | 5.70s | 299.8 | 64.68s | 60.67s | 70.85s | 3:16.20 | 305.2 | 6.7m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-nissan-e4orce` | 2.22s | 5.50s | 295.9 | 64.78s | 60.90s | 70.75s | 3:16.43 | 301.2 | 6.7m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-maserati-folgore` | 2.35s | 5.77s | 301.8 | 64.55s | 60.48s | 70.85s | 3:15.88 | 307.2 | 6.8m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `bmw-m2-cs` | 4.52s | 12.02s | 261.8 | 78.13s | 73.25s | 86.33s | 3:57.72 | 266.6 | 6.6m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.38s | 11.45s | 269.2 | 76.85s | 71.85s | 84.93s | 3:53.63 | 274.1 | 6.8m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.15s | 10.50s | 283.9 | 75.30s | 69.73s | 83.87s | 3:48.90 | 289.0 | 6.8m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `nissan-gtr-nismo` | 3.98s | 10.25s | 276.6 | 75.50s | 70.12s | 83.75s | 3:49.37 | 281.6 | 6.8m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `renault-clio-v6` | 4.93s | 13.72s | 247.1 | 80.42s | 76.05s | 88.25s | 4:04.72 | 251.6 | 6.5m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `honda-civic-type-r` | 4.77s | 12.78s | 258.1 | 78.78s | 74.12s | 86.82s | 3:59.72 | 262.8 | 6.6m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.58s | 12.72s | 247.1 | 79.75s | 75.30s | 87.42s | 4:02.47 | 251.6 | 6.6m / 6.5m |
| `le-mans` | `SUPERCAR` | `ferrari-296-gtb` | 2.58s | 6.07s | 336.4 | 64.40s | 58.67s | 71.97s | 3:15.03 | 342.5 | 6.8m / 6.5m |
| `le-mans` | `SUPERCAR` | `mclaren-750s` | 2.58s | 6.00s | 348.6 | 63.63s | 57.73s | 71.45s | 3:12.82 | 354.9 | 6.9m / 6.5m |
| `le-mans` | `SUPERCAR` | `ferrari-sf90` | 2.50s | 5.80s | 354.8 | 63.18s | 57.17s | 71.12s | 3:11.47 | 361.2 | 6.8m / 6.5m |
| `le-mans` | `SUPERCAR` | `porsche-918-spyder` | 2.57s | 6.10s | 330.3 | 64.62s | 59.08s | 72.17s | 3:15.87 | 336.2 | 6.7m / 6.5m |
| `le-mans` | `SUPERCAR` | `aston-valkyrie-road` | 2.57s | 5.88s | 373.1 | 62.32s | 56.12s | 70.33s | 3:08.77 | 379.8 | 6.8m / 6.5m |
| `le-mans` | `SUPERCAR` | `koenigsegg-jesko` | 2.43s | 5.43s | 409.9 | 60.95s | 54.22s | 69.37s | 3:04.53 | 412.1 | 6.9m / 6.5m |
| `le-mans` | `SUPERCAR` | `ferrari-f80` | 2.48s | 5.72s | 367.0 | 62.57s | 56.30s | 70.57s | 3:09.43 | 373.6 | 6.9m / 6.5m |
| `le-mans` | `SUPERCAR` | `mclaren-w1` | 2.50s | 5.75s | 367.0 | 62.62s | 56.33s | 70.58s | 3:09.53 | 373.6 | 6.9m / 6.5m |
| `monaco` | `HYPERCAR_GTP` | `ferrari-499p` | 2.65s | 5.97s | 341.5 | 19.68s | 28.78s | 25.03s | 1:13.50 | 289.1 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `toyota-gr010` | 2.73s | 6.20s | 333.1 | 19.82s | 28.92s | 25.23s | 1:13.97 | 287.3 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `porsche-963` | 2.70s | 6.10s | 335.2 | 19.72s | 28.80s | 25.15s | 1:13.67 | 288.5 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.58s | 5.80s | 343.6 | 19.65s | 28.70s | 25.00s | 1:13.35 | 287.7 | 4.0m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.70s | 6.07s | 339.4 | 19.78s | 28.87s | 25.22s | 1:13.87 | 287.7 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `acura-arx-06` | 2.63s | 5.97s | 331.1 | 19.62s | 28.63s | 24.98s | 1:13.23 | 288.7 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `alpine-a424` | 2.77s | 6.23s | 339.4 | 19.77s | 28.90s | 25.30s | 1:13.97 | 288.2 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `peugeot-9x8` | 2.78s | 6.30s | 331.0 | 19.78s | 28.82s | 25.23s | 1:13.83 | 288.6 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.77s | 6.18s | 345.6 | 19.75s | 28.87s | 25.32s | 1:13.93 | 289.8 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.73s | 6.17s | 337.3 | 19.80s | 28.87s | 25.22s | 1:13.88 | 287.9 | 4.0m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.67s | 6.00s | 337.3 | 19.70s | 28.77s | 25.13s | 1:13.60 | 288.0 | 3.9m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 2.80s | 6.30s | 341.4 | 19.85s | 29.13s | 25.52s | 1:14.50 | 287.4 | 3.9m / 4.8m |
| `monaco` | `LMP2` | `oreca-07-united` | 2.98s | 6.80s | 325.8 | 20.92s | 30.75s | 27.05s | 1:18.72 | 273.3 | 4.0m / 4.8m |
| `monaco` | `LMP2` | `oreca-07-europol` | 2.90s | 6.70s | 315.9 | 20.78s | 30.40s | 26.77s | 1:17.95 | 274.5 | 4.0m / 4.8m |
| `monaco` | `LMP2` | `oreca-07-ao` | 2.93s | 6.75s | 320.8 | 20.85s | 30.70s | 26.93s | 1:18.48 | 273.9 | 4.0m / 4.8m |
| `monaco` | `LMP2` | `ligier-js-p217` | 2.93s | 6.72s | 324.1 | 20.87s | 30.67s | 26.90s | 1:18.43 | 273.9 | 4.0m / 4.8m |
| `monaco` | `GT3` | `porsche-911-gt3-r` | 3.25s | 8.18s | 285.8 | 22.98s | 34.12s | 30.22s | 1:27.32 | 249.0 | 4.2m / 4.8m |
| `monaco` | `GT3` | `ferrari-296-gt3` | 3.28s | 8.20s | 291.3 | 22.98s | 34.10s | 30.25s | 1:27.33 | 249.7 | 4.2m / 4.8m |
| `monaco` | `GT3` | `corvette-z06-gt3r` | 3.18s | 7.88s | 295.0 | 22.98s | 34.15s | 30.10s | 1:27.23 | 251.9 | 4.3m / 4.8m |
| `monaco` | `GT3` | `bmw-m4-gt3` | 3.33s | 8.30s | 293.2 | 23.12s | 34.32s | 30.38s | 1:27.82 | 249.0 | 4.2m / 4.8m |
| `monaco` | `GT3` | `ford-mustang-gt3` | 3.22s | 7.95s | 298.7 | 23.00s | 34.23s | 30.23s | 1:27.47 | 252.2 | 4.3m / 4.8m |
| `monaco` | `GT3` | `aston-vantage-gt3` | 3.28s | 8.20s | 291.3 | 23.10s | 34.25s | 30.37s | 1:27.72 | 249.3 | 4.2m / 4.8m |
| `monaco` | `GT3` | `lamborghini-temerario-gt3` | 3.18s | 7.92s | 293.2 | 22.95s | 34.02s | 30.07s | 1:27.03 | 251.5 | 4.2m / 4.8m |
| `monaco` | `GT3` | `mercedes-amg-gt3` | 3.35s | 8.38s | 289.5 | 23.15s | 34.37s | 30.42s | 1:27.93 | 248.1 | 4.3m / 4.8m |
| `monaco` | `GT3` | `lexus-rcf-gt3` | 3.33s | 8.27s | 295.0 | 23.12s | 34.37s | 30.50s | 1:27.98 | 249.6 | 4.3m / 4.8m |
| `monaco` | `GT3` | `mclaren-720s-gt3` | 3.28s | 8.25s | 289.5 | 22.98s | 34.03s | 30.17s | 1:27.18 | 249.0 | 4.2m / 4.8m |
| `monaco` | `GT3` | `renault-rs01-gt3` | 3.23s | 8.05s | 293.2 | 22.98s | 34.05s | 30.12s | 1:27.15 | 250.8 | 4.3m / 4.8m |
| `monaco` | `GT3` | `bentley-continental-gt3` | 3.22s | 7.92s | 300.5 | 23.03s | 34.28s | 30.25s | 1:27.57 | 252.4 | 4.3m / 4.8m |
| `monaco` | `GT3` | `audi-r8-lms-gt3` | 3.28s | 8.20s | 291.3 | 23.03s | 34.17s | 30.30s | 1:27.50 | 249.6 | 4.2m / 4.8m |
| `monaco` | `GT3` | `acura-nsx-gt3` | 3.18s | 7.98s | 289.5 | 22.95s | 34.07s | 30.08s | 1:27.10 | 250.6 | 4.3m / 4.8m |
| `monaco` | `GT4` | `porsche-cayman-gt4-rs` | 4.18s | 11.12s | 262.0 | 25.58s | 38.22s | 34.40s | 1:38.20 | 230.2 | 4.6m / 4.8m |
| `monaco` | `GT4` | `bmw-m4-gt4` | 4.17s | 10.90s | 268.1 | 25.63s | 38.45s | 34.48s | 1:38.57 | 231.6 | 4.7m / 4.8m |
| `monaco` | `GT4` | `aston-vantage-gt4` | 4.25s | 11.17s | 266.5 | 25.67s | 38.52s | 34.58s | 1:38.77 | 230.4 | 4.6m / 4.8m |
| `monaco` | `GT4` | `toyota-supra-gt4` | 4.10s | 10.78s | 265.0 | 25.55s | 38.18s | 34.22s | 1:37.95 | 231.9 | 4.7m / 4.8m |
| `monaco` | `GT4` | `mclaren-artura-gt4` | 4.10s | 10.85s | 263.5 | 25.52s | 38.17s | 34.25s | 1:37.93 | 231.5 | 4.6m / 4.8m |
| `monaco` | `GT4` | `mercedes-amg-gt4` | 4.25s | 11.17s | 266.5 | 25.72s | 38.47s | 34.62s | 1:38.80 | 230.3 | 4.7m / 4.8m |
| `monaco` | `GT4` | `alpine-a110-gt4` | 4.18s | 11.17s | 260.5 | 25.57s | 38.13s | 34.32s | 1:38.02 | 229.9 | 4.6m / 4.8m |
| `monaco` | `GT4` | `ford-mustang-gt4` | 4.17s | 10.85s | 269.6 | 25.65s | 38.47s | 34.52s | 1:38.63 | 231.9 | 4.7m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-ferrari` | 1.85s | 3.90s | 327.2 | 17.15s | 24.53s | 21.23s | 1:02.92 | 331.0 | 4.4m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-mclaren` | 1.88s | 4.00s | 324.1 | 17.12s | 24.45s | 21.22s | 1:02.78 | 329.9 | 4.3m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-mercedes` | 1.87s | 3.95s | 327.2 | 17.13s | 24.52s | 21.27s | 1:02.92 | 331.4 | 4.4m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-redbull` | 1.87s | 3.93s | 328.7 | 17.13s | 24.45s | 21.22s | 1:02.80 | 332.1 | 4.3m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-aston` | 1.87s | 3.97s | 322.7 | 17.15s | 24.47s | 21.28s | 1:02.90 | 328.4 | 4.3m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-williams` | 1.88s | 3.97s | 331.7 | 17.22s | 24.60s | 21.35s | 1:03.17 | 330.8 | 4.4m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-alpine` | 1.92s | 4.05s | 325.6 | 17.20s | 24.58s | 21.35s | 1:03.13 | 330.5 | 4.4m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-haas` | 1.87s | 3.95s | 327.2 | 17.20s | 24.62s | 21.37s | 1:03.18 | 330.4 | 4.5m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-audi` | 1.85s | 3.92s | 324.2 | 17.17s | 24.50s | 21.27s | 1:02.93 | 329.5 | 4.4m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-cadillac` | 1.88s | 3.98s | 328.7 | 17.17s | 24.60s | 21.28s | 1:03.05 | 331.6 | 4.3m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-racing-bulls` | 1.88s | 4.00s | 324.1 | 17.13s | 24.48s | 21.30s | 1:02.92 | 329.8 | 4.2m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-mercedes` | 1.83s | 3.83s | 339.9 | 16.95s | 24.10s | 20.98s | 1:02.03 | 335.3 | 4.4m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-redbull` | 1.82s | 3.82s | 336.7 | 16.95s | 24.02s | 20.90s | 1:01.87 | 335.9 | 4.3m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-ferrari` | 1.83s | 3.87s | 335.1 | 16.98s | 24.15s | 21.03s | 1:02.17 | 334.4 | 4.3m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-mclaren` | 1.85s | 3.87s | 343.2 | 16.97s | 24.27s | 21.02s | 1:02.25 | 335.6 | 4.3m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-renault` | 1.80s | 3.73s | 345.2 | 17.03s | 24.33s | 21.10s | 1:02.47 | 333.3 | 4.3m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-mclaren` | 1.83s | 3.78s | 350.3 | 17.05s | 24.38s | 21.13s | 1:02.57 | 334.6 | 4.3m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-ferrari` | 1.85s | 3.85s | 346.8 | 17.12s | 24.48s | 21.22s | 1:02.82 | 333.9 | 4.4m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-williams` | 1.83s | 3.78s | 352.0 | 17.10s | 24.45s | 21.17s | 1:02.72 | 334.0 | 4.4m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-porsche-99x` | 2.25s | 5.55s | 297.9 | 21.38s | 31.47s | 27.40s | 1:20.25 | 270.4 | 4.3m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-jaguar-itype7` | 2.32s | 5.70s | 299.8 | 21.47s | 31.53s | 27.53s | 1:20.53 | 269.5 | 4.3m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-nissan-e4orce` | 2.22s | 5.50s | 295.9 | 21.35s | 31.27s | 27.28s | 1:19.90 | 270.6 | 4.3m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-maserati-folgore` | 2.35s | 5.77s | 301.8 | 21.47s | 31.63s | 27.60s | 1:20.70 | 269.5 | 4.3m / 4.8m |
| `monaco` | `TRACK_COUPE` | `bmw-m2-cs` | 4.52s | 12.02s | 261.8 | 26.45s | 39.93s | 35.88s | 1:42.27 | 226.3 | 4.8m / 4.8m |
| `monaco` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.38s | 11.45s | 269.2 | 26.18s | 39.33s | 35.35s | 1:40.87 | 229.2 | 4.7m / 4.8m |
| `monaco` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.15s | 10.50s | 283.9 | 26.00s | 39.18s | 34.90s | 1:40.08 | 233.8 | 4.8m / 4.8m |
| `monaco` | `TRACK_COUPE` | `nissan-gtr-nismo` | 3.98s | 10.25s | 276.6 | 25.88s | 38.95s | 34.63s | 1:39.47 | 234.0 | 4.8m / 4.8m |
| `monaco` | `TRACK_COUPE` | `renault-clio-v6` | 4.93s | 13.72s | 247.1 | 26.78s | 40.38s | 36.68s | 1:43.85 | 219.8 | 4.7m / 4.8m |
| `monaco` | `TRACK_COUPE` | `honda-civic-type-r` | 4.77s | 12.78s | 258.1 | 26.60s | 39.98s | 36.27s | 1:42.85 | 223.6 | 4.7m / 4.8m |
| `monaco` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.58s | 12.72s | 247.1 | 26.53s | 39.77s | 35.92s | 1:42.22 | 222.7 | 4.7m / 4.8m |
| `monaco` | `SUPERCAR` | `ferrari-296-gtb` | 2.58s | 6.07s | 336.4 | 22.58s | 33.27s | 28.87s | 1:24.72 | 268.7 | 4.5m / 4.8m |
| `monaco` | `SUPERCAR` | `mclaren-750s` | 2.58s | 6.00s | 348.6 | 22.48s | 33.10s | 28.73s | 1:24.32 | 270.5 | 4.5m / 4.8m |
| `monaco` | `SUPERCAR` | `ferrari-sf90` | 2.50s | 5.80s | 354.8 | 22.42s | 33.07s | 28.60s | 1:24.08 | 273.1 | 4.6m / 4.8m |
| `monaco` | `SUPERCAR` | `porsche-918-spyder` | 2.57s | 6.10s | 330.3 | 22.53s | 33.22s | 28.88s | 1:24.63 | 267.9 | 4.5m / 4.8m |
| `monaco` | `SUPERCAR` | `aston-valkyrie-road` | 2.57s | 5.88s | 373.1 | 22.28s | 32.90s | 28.48s | 1:23.67 | 274.7 | 4.5m / 4.8m |
| `monaco` | `SUPERCAR` | `koenigsegg-jesko` | 2.43s | 5.43s | 409.9 | 22.12s | 32.78s | 28.22s | 1:23.12 | 281.8 | 4.6m / 4.8m |
| `monaco` | `SUPERCAR` | `ferrari-f80` | 2.48s | 5.72s | 367.0 | 22.32s | 32.92s | 28.43s | 1:23.67 | 275.4 | 4.5m / 4.8m |
| `monaco` | `SUPERCAR` | `mclaren-w1` | 2.50s | 5.75s | 367.0 | 22.27s | 33.03s | 28.47s | 1:23.77 | 274.9 | 4.6m / 4.8m |
