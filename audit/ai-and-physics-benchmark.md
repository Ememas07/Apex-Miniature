# Apex Miniature — Multi-Car Physics & AI Benchmark Report

Audited **all 76 vehicles** in `CARS` across **7 flagship circuits** (`spa-francorchamps`, `monza`, `suzuka`, `silverstone`, `laguna-seca`, `le-mans`, `monaco`) running at `Alien` (1.07× pace) flying-lap pace at `60 Hz`.

## 1. Class-Level Performance Summary vs Real-World Targets

| Class | Cars | Mean 0–100 | Mean 0–200 | Base Vmax Range | Special Vmax Range | Avg Off-Track % | Total Wall Hits |
|---|---:|---:|---:|---|---|---:|---:|
| `HYPERCAR_GTP` | 12 | 2.92s | 6.90s | 318–329 km/h | 329–339 km/h | 0.00% | 0 |
| `LMP2` | 4 | 3.20s | 7.56s | 322–325 km/h | 322–325 km/h | 0.00% | 0 |
| `GT3` | 14 | 3.63s | 9.52s | 278–288 km/h | 278–288 km/h | 0.00% | 0 |
| `GT4` | 8 | 4.43s | 12.26s | 257–265 km/h | 257–265 km/h | 0.00% | 0 |
| `F1_2026` | 11 | 1.81s | 3.93s | 325–334 km/h | 341–350 km/h | 0.00% | 0 |
| `F1_2021` | 4 | 1.78s | 3.83s | 335–343 km/h | 347–355 km/h | 0.00% | 0 |
| `F1_2005` | 4 | 1.77s | 3.76s | 345–352 km/h | 355–362 km/h | 0.00% | 0 |
| `FORMULA_E` | 4 | 2.44s | 6.28s | 292–298 km/h | 309–314 km/h | 0.00% | 0 |
| `TRACK_COUPE` | 7 | 4.68s | 12.95s | 247–284 km/h | 247–284 km/h | 0.00% | 0 |
| `SUPERCAR` | 8 | 2.66s | 6.36s | 330–389 km/h | 330–389 km/h | 0.00% | 0 |

## 2. Circuit Lap Time & Speed Trap Comparison vs IRL Benchmarks (Class Leaders)

| Circuit | Class | Fastest Car | Sim S1 | Sim S2 | Sim S3 | Sim Lap | Trap km/h | IRL Reference Lap & Vmax |
|---|---|---|---:|---:|---:|---:|---:|---|
| `spa-francorchamps` | `HYPERCAR_GTP` | Cadillac V-Series.R | 35.62s | 43.72s | 43.70s | **2:03.03** | 318.3 | 122.5–126.0s (2:02–2:06) @ 315–325 km/h (WEC 6h Spa Hyperpole) |
| `spa-francorchamps` | `LMP2` | Oreca 07 Gibson — Inter Europol | 37.90s | 46.42s | 46.57s | **2:10.88** | 306.2 | LMP2 Prototype class pace |
| `spa-francorchamps` | `GT3` | Lamborghini Temerario GT3 | 41.57s | 50.55s | 50.92s | **2:23.03** | 275.9 | 136.0–140.0s (2:16–2:20) @ 275–285 km/h (GTWC/WEC LMGT3 Spa) |
| `spa-francorchamps` | `GT4` | McLaren Artura GT4 | 46.60s | 57.62s | 58.42s | **2:42.63** | 248.6 | GT4 European / IMSA GS class pace |
| `spa-francorchamps` | `F1_2026` | Red Bull RB22 (2026) | 29.95s | 36.80s | 36.12s | **1:42.87** | 353.3 | 102.0–105.0s (1:42–1:45) @ 335–345 km/h (F1 Spa GP Quali/Race) |
| `spa-francorchamps` | `F1_2021` | Mercedes W12 (2021) | 29.75s | 36.40s | 35.63s | **1:41.78** | 346.2 | Formula 1 — 2021 Spec class pace |
| `spa-francorchamps` | `F1_2005` | McLaren MP4-20 V10 (2005) | 29.60s | 36.55s | 35.85s | **1:42.00** | 357.9 | Formula 1 — 2005 V10 class pace |
| `spa-francorchamps` | `FORMULA_E` | Nissan e-4ORCE 05 | 38.17s | 47.27s | 47.52s | **2:12.95** | 292.3 | Formula E (GEN3 Evo) class pace |
| `spa-francorchamps` | `TRACK_COUPE` | Nissan GT-R NISMO | 46.23s | 58.08s | 58.98s | **2:43.30** | 255.9 | Production Track Coupes class pace |
| `spa-francorchamps` | `SUPERCAR` | Koenigsegg Jesko Attack | 38.05s | 48.63s | 48.95s | **2:15.63** | 325.4 | Production Supercars & Hypercars class pace |
| `monza` | `HYPERCAR_GTP` | Cadillac V-Series.R | 32.17s | 31.57s | 34.10s | **1:37.83** | 329.3 | 95.0–98.5s (1:35–1:38) @ 330–340 km/h (WEC 6h Monza) |
| `monza` | `LMP2` | Oreca 07 Gibson — Inter Europol | 33.95s | 33.38s | 36.13s | **1:43.47** | 317.5 | LMP2 Prototype class pace |
| `monza` | `GT3` | Lamborghini Temerario GT3 | 37.18s | 36.55s | 39.47s | **1:53.20** | 284.3 | 106.5–109.5s (1:46–1:49) @ 285–295 km/h (GTWC/WEC GT3 Monza) |
| `monza` | `GT4` | McLaren Artura GT4 | 42.20s | 41.12s | 44.90s | **2:08.22** | 260.2 | GT4 European / IMSA GS class pace |
| `monza` | `F1_2026` | Red Bull RB22 (2026) | 26.98s | 26.78s | 28.85s | **1:22.62** | 353.7 | 79.5–82.5s (1:19–1:22) @ 348–356 km/h (F1 Italian GP Low-Downforce) |
| `monza` | `F1_2021` | McLaren MCL35M (2021) | 26.80s | 26.62s | 28.57s | **1:21.98** | 349.8 | Formula 1 — 2021 Spec class pace |
| `monza` | `F1_2005` | McLaren MP4-20 V10 (2005) | 26.68s | 26.53s | 28.52s | **1:21.73** | 358.8 | Formula 1 — 2005 V10 class pace |
| `monza` | `FORMULA_E` | Nissan e-4ORCE 05 | 34.62s | 33.80s | 36.85s | **1:45.27** | 297.9 | Formula E (GEN3 Evo) class pace |
| `monza` | `TRACK_COUPE` | Nissan GT-R NISMO | 42.12s | 40.93s | 45.03s | **2:08.08** | 272.3 | Production Track Coupes class pace |
| `monza` | `SUPERCAR` | Koenigsegg Jesko Attack | 34.38s | 33.43s | 37.13s | **1:44.95** | 359.4 | Production Supercars & Hypercars class pace |
| `suzuka` | `HYPERCAR_GTP` | Cadillac V-Series.R | 40.80s | 35.38s | 37.37s | **1:53.55** | 316.8 | WEC Hypercar / IMSA GTP class pace |
| `suzuka` | `LMP2` | Oreca 07 Gibson — Inter Europol | 43.45s | 37.58s | 39.67s | **2:00.70** | 303.1 | LMP2 Prototype class pace |
| `suzuka` | `GT3` | Lamborghini Temerario GT3 | 47.28s | 41.03s | 43.38s | **2:11.70** | 271.5 | 120.0–124.0s (2:00–2:04) @ 275–285 km/h (Suzuka 1000km / GT3) |
| `suzuka` | `GT4` | McLaren Artura GT4 | 53.98s | 46.90s | 49.70s | **2:30.58** | 246.4 | GT4 European / IMSA GS class pace |
| `suzuka` | `F1_2026` | Red Bull RB22 (2026) | 33.67s | 29.40s | 31.23s | **1:34.30** | 349.6 | 88.0–91.5s (1:28–1:31) @ 322–332 km/h (F1 Japanese GP) |
| `suzuka` | `F1_2021` | Red Bull RB16B (2021) | 33.22s | 29.02s | 30.87s | **1:33.10** | 342.6 | Formula 1 — 2021 Spec class pace |
| `suzuka` | `F1_2005` | McLaren MP4-20 V10 (2005) | 33.42s | 29.18s | 30.97s | **1:33.57** | 357.3 | Formula 1 — 2005 V10 class pace |
| `suzuka` | `FORMULA_E` | Nissan e-4ORCE 05 | 43.58s | 38.33s | 40.70s | **2:02.62** | 293.6 | Formula E (GEN3 Evo) class pace |
| `suzuka` | `TRACK_COUPE` | Nissan GT-R NISMO | 54.45s | 47.23s | 50.23s | **2:31.92** | 253.2 | Production Track Coupes class pace |
| `suzuka` | `SUPERCAR` | Koenigsegg Jesko Attack | 45.38s | 39.40s | 41.65s | **2:06.43** | 321.1 | Production Supercars & Hypercars class pace |
| `silverstone` | `HYPERCAR_GTP` | Cadillac V-Series.R | 33.85s | 35.33s | 36.00s | **1:45.18** | 308.4 | 101.0–105.0s (1:41–1:45) @ 310–320 km/h (ELMS / WEC Silverstone) |
| `silverstone` | `LMP2` | Oreca 07 Gibson — Inter Europol | 36.00s | 37.53s | 38.32s | **1:51.85** | 295.3 | LMP2 Prototype class pace |
| `silverstone` | `GT3` | Lamborghini Temerario GT3 | 39.37s | 41.03s | 41.78s | **2:02.18** | 267.2 | 117.0–121.0s (1:57–2:01) @ 272–282 km/h (British GT / GTWC) |
| `silverstone` | `GT4` | McLaren Artura GT4 | 44.75s | 46.77s | 47.83s | **2:19.35** | 242.7 | GT4 European / IMSA GS class pace |
| `silverstone` | `F1_2026` | Red Bull RB22 (2026) | 28.28s | 29.48s | 30.03s | **1:27.80** | 347.0 | 85.5–89.0s (1:25–1:29) @ 325–336 km/h (F1 British GP) |
| `silverstone` | `F1_2021` | Mercedes W12 (2021) | 28.00s | 29.13s | 29.70s | **1:26.83** | 345.9 | Formula 1 — 2021 Spec class pace |
| `silverstone` | `F1_2005` | McLaren MP4-20 V10 (2005) | 28.10s | 29.32s | 29.83s | **1:27.25** | 355.5 | Formula 1 — 2005 V10 class pace |
| `silverstone` | `FORMULA_E` | Nissan e-4ORCE 05 | 36.70s | 38.40s | 39.18s | **1:54.28** | 287.5 | Formula E (GEN3 Evo) class pace |
| `silverstone` | `TRACK_COUPE` | Nissan GT-R NISMO | 44.90s | 47.03s | 48.20s | **2:20.13** | 250.2 | Production Track Coupes class pace |
| `silverstone` | `SUPERCAR` | Koenigsegg Jesko Attack | 37.07s | 39.12s | 40.00s | **1:56.18** | 318.5 | Production Supercars & Hypercars class pace |
| `laguna-seca` | `HYPERCAR_GTP` | Acura ARX-06 | 23.17s | 26.50s | 29.03s | **1:18.70** | 269.7 | 72.0–75.0s (1:12–1:15) @ 275–285 km/h (IMSA WeatherTech Laguna) |
| `laguna-seca` | `LMP2` | Oreca 07 Gibson — Inter Europol | 24.62s | 28.35s | 31.03s | **1:24.00** | 258.3 | LMP2 Prototype class pace |
| `laguna-seca` | `GT3` | Lamborghini Temerario GT3 | 26.80s | 30.92s | 33.70s | **1:31.42** | 236.5 | 82.5–85.5s (1:22–1:25) @ 250–262 km/h (IMSA GTD Pro Laguna) |
| `laguna-seca` | `GT4` | McLaren Artura GT4 | 30.33s | 35.35s | 38.67s | **1:44.35** | 216.8 | GT4 European / IMSA GS class pace |
| `laguna-seca` | `F1_2026` | Red Bull RB22 (2026) | 19.32s | 21.63s | 23.83s | **1:04.78** | 314.3 | Formula 1 — 2026 Spec class pace |
| `laguna-seca` | `F1_2021` | Red Bull RB16B (2021) | 19.07s | 21.33s | 23.52s | **1:03.92** | 315.7 | Formula 1 — 2021 Spec class pace |
| `laguna-seca` | `F1_2005` | McLaren MP4-20 V10 (2005) | 19.15s | 21.52s | 23.68s | **1:04.35** | 318.6 | Formula 1 — 2005 V10 class pace |
| `laguna-seca` | `FORMULA_E` | Nissan e-4ORCE 05 | 24.18s | 28.02s | 30.72s | **1:22.92** | 264.8 | Formula E (GEN3 Evo) class pace |
| `laguna-seca` | `TRACK_COUPE` | Nissan GT-R NISMO | 30.35s | 35.50s | 39.03s | **1:44.88** | 222.5 | Production Track Coupes class pace |
| `laguna-seca` | `SUPERCAR` | Koenigsegg Jesko Attack | 25.07s | 28.77s | 32.07s | **1:25.90** | 276.9 | Production Supercars & Hypercars class pace |
| `le-mans` | `HYPERCAR_GTP` | Cadillac V-Series.R | 64.48s | 59.80s | 73.75s | **3:18.03** | 333.5 | 204.0–209.0s (3:24–3:29) @ 335–345 km/h (24h Le Mans Hyperpole) |
| `le-mans` | `LMP2` | Oreca 07 Gibson — Inter Europol | 67.82s | 62.85s | 78.07s | **3:28.73** | 328.0 | 213.0–218.0s (3:33–3:38) @ 315–325 km/h (24h Le Mans LMP2) |
| `le-mans` | `GT3` | Bentley Continental GT3 | 74.65s | 69.32s | 85.72s | **3:49.68** | 293.4 | 234.0–240.0s (3:54–4:00) @ 285–296 km/h (24h Le Mans LMGT3) |
| `le-mans` | `GT4` | Ford Mustang GT4 | 83.83s | 76.60s | 97.77s | **4:18.20** | 269.8 | GT4 European / IMSA GS class pace |
| `le-mans` | `F1_2026` | Williams FW48 (2026) | 55.72s | 52.25s | 62.80s | **2:50.77** | 356.6 | Formula 1 — 2026 Spec class pace |
| `le-mans` | `F1_2021` | McLaren MCL35M (2021) | 55.65s | 52.48s | 62.23s | **2:50.37** | 349.6 | Formula 1 — 2021 Spec class pace |
| `le-mans` | `F1_2005` | McLaren MP4-20 V10 (2005) | 55.10s | 51.78s | 62.03s | **2:48.92** | 358.1 | Formula 1 — 2005 V10 class pace |
| `le-mans` | `FORMULA_E` | Porsche 99X Electric GEN3 Evo | 70.08s | 64.30s | 80.33s | **3:34.72** | 299.5 | Formula E (GEN3 Evo) class pace |
| `le-mans` | `TRACK_COUPE` | Nissan GT-R NISMO | 83.17s | 74.83s | 97.62s | **4:15.62** | 281.4 | Production Track Coupes class pace |
| `le-mans` | `SUPERCAR` | Koenigsegg Jesko Attack | 67.88s | 58.95s | 80.77s | **3:27.60** | 380.6 | Production Supercars & Hypercars class pace |
| `monaco` | `HYPERCAR_GTP` | Acura ARX-06 | 21.77s | 31.93s | 27.82s | **1:21.52** | 287.9 | WEC Hypercar / IMSA GTP class pace |
| `monaco` | `LMP2` | Oreca 07 Gibson — Inter Europol | 23.05s | 34.27s | 29.90s | **1:27.22** | 278.8 | LMP2 Prototype class pace |
| `monaco` | `GT3` | Lamborghini Temerario GT3 | 24.83s | 37.07s | 32.75s | **1:34.65** | 257.3 | GTD Pro / LMGT3 class pace |
| `monaco` | `GT4` | McLaren Artura GT4 | 28.05s | 42.57s | 37.93s | **1:48.55** | 238.9 | GT4 European / IMSA GS class pace |
| `monaco` | `F1_2026` | Red Bull RB22 (2026) | 18.27s | 25.98s | 22.50s | **1:06.75** | 328.7 | 70.0–73.5s (1:10–1:13) @ 288–296 km/h (F1 Monaco GP) |
| `monaco` | `F1_2021` | Red Bull RB16B (2021) | 18.07s | 25.55s | 22.20s | **1:05.82** | 330.1 | Formula 1 — 2021 Spec class pace |
| `monaco` | `F1_2005` | Renault R25 V10 (2005) | 18.17s | 25.77s | 22.33s | **1:06.27** | 332.9 | Formula 1 — 2005 V10 class pace |
| `monaco` | `FORMULA_E` | Nissan e-4ORCE 05 | 22.97s | 34.00s | 29.33s | **1:26.30** | 278.6 | 86.0–90.0s (1:26–1:30) @ 245–265 km/h (Monaco E-Prix Gen3 Evo) |
| `monaco` | `TRACK_COUPE` | Nissan GT-R NISMO | 28.27s | 43.28s | 38.08s | **1:49.63** | 242.3 | Production Track Coupes class pace |
| `monaco` | `SUPERCAR` | Koenigsegg Jesko Attack | 24.02s | 36.18s | 30.67s | **1:30.87** | 279.1 | Production Supercars & Hypercars class pace |

## 3. Complete Matrix — All 76 Cars × 7 Circuits (532 Flying Laps)

| Track | Class | Car | 0–100 | 0–200 | Base Vmax | S1 | S2 | S3 | Lap Time | Trap | Max Lat / HalfW |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `spa-francorchamps` | `HYPERCAR_GTP` | `ferrari-499p` | 2.87s | 6.73s | 325.8 | 35.87s | 43.88s | 43.80s | 2:03.55 | 317.0 | 5.0m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `toyota-gr010` | 2.95s | 7.00s | 319.7 | 36.28s | 44.07s | 44.15s | 2:04.50 | 313.2 | 5.1m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `porsche-963` | 2.92s | 6.88s | 321.2 | 36.15s | 44.00s | 44.00s | 2:04.15 | 314.3 | 5.1m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.78s | 6.53s | 327.3 | 35.62s | 43.72s | 43.70s | 2:03.03 | 318.3 | 5.0m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.92s | 6.85s | 324.2 | 36.03s | 44.12s | 44.02s | 2:04.17 | 316.1 | 5.1m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `acura-arx-06` | 2.83s | 6.73s | 318.2 | 35.95s | 43.77s | 43.68s | 2:03.40 | 313.8 | 5.1m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `alpine-a424` | 3.00s | 7.05s | 324.2 | 36.20s | 44.18s | 44.05s | 2:04.43 | 315.6 | 5.0m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `peugeot-9x8` | 3.00s | 7.12s | 318.2 | 36.38s | 44.12s | 44.12s | 2:04.62 | 312.2 | 5.1m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.98s | 6.98s | 328.8 | 36.17s | 44.10s | 44.12s | 2:04.38 | 319.1 | 5.1m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.95s | 6.97s | 322.7 | 36.17s | 44.13s | 44.15s | 2:04.45 | 315.2 | 5.0m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.87s | 6.77s | 322.7 | 35.93s | 43.90s | 43.85s | 2:03.68 | 316.0 | 5.0m / 7.0m |
| `spa-francorchamps` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 3.03s | 7.13s | 325.7 | 36.37s | 44.38s | 44.37s | 2:05.12 | 317.2 | 5.0m / 7.0m |
| `spa-francorchamps` | `LMP2` | `oreca-07-united` | 3.22s | 7.58s | 323.4 | 38.00s | 46.60s | 46.67s | 2:11.27 | 306.1 | 5.0m / 7.0m |
| `spa-francorchamps` | `LMP2` | `oreca-07-europol` | 3.17s | 7.48s | 322.2 | 37.90s | 46.42s | 46.57s | 2:10.88 | 306.2 | 5.0m / 7.0m |
| `spa-francorchamps` | `LMP2` | `oreca-07-ao` | 3.22s | 7.60s | 322.2 | 38.00s | 46.53s | 46.72s | 2:11.25 | 305.6 | 5.0m / 7.0m |
| `spa-francorchamps` | `LMP2` | `ligier-js-p217` | 3.22s | 7.57s | 324.7 | 37.97s | 46.58s | 46.67s | 2:11.22 | 306.6 | 5.0m / 7.0m |
| `spa-francorchamps` | `GT3` | `porsche-911-gt3-r` | 3.62s | 9.57s | 278.4 | 41.93s | 50.70s | 51.12s | 2:23.75 | 272.8 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `ferrari-296-gt3` | 3.67s | 9.62s | 282.1 | 41.95s | 50.83s | 51.13s | 2:23.92 | 274.4 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `corvette-z06-gt3r` | 3.53s | 9.25s | 284.6 | 41.60s | 50.65s | 50.95s | 2:23.20 | 276.5 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `bmw-m4-gt3` | 3.72s | 9.75s | 283.3 | 42.07s | 51.02s | 51.32s | 2:24.40 | 274.5 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `ford-mustang-gt3` | 3.58s | 9.33s | 287.0 | 41.70s | 50.80s | 51.08s | 2:23.58 | 277.0 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `aston-vantage-gt3` | 3.67s | 9.62s | 282.1 | 41.98s | 50.90s | 51.27s | 2:24.15 | 274.1 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `lamborghini-temerario-gt3` | 3.53s | 9.28s | 283.3 | 41.57s | 50.55s | 50.92s | 2:23.03 | 275.9 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `mercedes-amg-gt3` | 3.73s | 9.82s | 280.9 | 42.18s | 51.08s | 51.37s | 2:24.63 | 273.0 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `lexus-rcf-gt3` | 3.72s | 9.72s | 284.5 | 42.12s | 51.12s | 51.45s | 2:24.68 | 274.6 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `mclaren-720s-gt3` | 3.67s | 9.65s | 280.9 | 41.92s | 50.78s | 51.10s | 2:23.80 | 274.3 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `renault-rs01-gt3` | 3.60s | 9.43s | 283.3 | 41.75s | 50.72s | 50.98s | 2:23.45 | 275.7 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `bentley-continental-gt3` | 3.58s | 9.30s | 288.2 | 41.63s | 50.87s | 51.15s | 2:23.65 | 277.3 | 5.0m / 7.0m |
| `spa-francorchamps` | `GT3` | `audi-r8-lms-gt3` | 3.67s | 9.62s | 282.1 | 41.93s | 50.90s | 51.18s | 2:24.02 | 274.7 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT3` | `acura-nsx-gt3` | 3.55s | 9.33s | 280.9 | 41.68s | 50.65s | 50.90s | 2:23.23 | 274.9 | 5.1m / 7.0m |
| `spa-francorchamps` | `GT4` | `porsche-cayman-gt4-rs` | 4.45s | 12.40s | 258.1 | 46.80s | 57.88s | 58.57s | 2:43.25 | 247.5 | 5.0m / 7.0m |
| `spa-francorchamps` | `GT4` | `bmw-m4-gt4` | 4.42s | 12.13s | 263.6 | 46.67s | 57.87s | 58.73s | 2:43.27 | 249.8 | 5.0m / 7.0m |
| `spa-francorchamps` | `GT4` | `aston-vantage-gt4` | 4.52s | 12.45s | 262.2 | 46.88s | 58.02s | 58.85s | 2:43.75 | 248.8 | 4.9m / 7.0m |
| `spa-francorchamps` | `GT4` | `toyota-supra-gt4` | 4.35s | 12.02s | 260.9 | 46.58s | 57.77s | 58.50s | 2:42.85 | 249.5 | 4.9m / 7.0m |
| `spa-francorchamps` | `GT4` | `mclaren-artura-gt4` | 4.35s | 12.08s | 259.5 | 46.60s | 57.62s | 58.42s | 2:42.63 | 248.6 | 5.0m / 7.0m |
| `spa-francorchamps` | `GT4` | `mercedes-amg-gt4` | 4.52s | 12.45s | 262.2 | 46.88s | 58.17s | 58.95s | 2:44.00 | 248.7 | 5.0m / 7.0m |
| `spa-francorchamps` | `GT4` | `alpine-a110-gt4` | 4.45s | 12.47s | 256.7 | 46.90s | 57.83s | 58.63s | 2:43.37 | 246.7 | 5.0m / 7.0m |
| `spa-francorchamps` | `GT4` | `ford-mustang-gt4` | 4.42s | 12.08s | 265.0 | 46.63s | 57.90s | 58.80s | 2:43.33 | 250.5 | 4.9m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-ferrari` | 1.78s | 3.87s | 329.8 | 29.95s | 36.88s | 36.17s | 1:43.00 | 351.7 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-mclaren` | 1.83s | 3.97s | 326.7 | 30.12s | 36.90s | 36.18s | 1:43.20 | 348.5 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-mercedes` | 1.80s | 3.92s | 329.8 | 30.02s | 36.92s | 36.17s | 1:43.10 | 351.7 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-redbull` | 1.80s | 3.90s | 331.3 | 29.95s | 36.80s | 36.12s | 1:42.87 | 353.3 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-aston` | 1.82s | 3.93s | 325.2 | 30.15s | 36.93s | 36.22s | 1:43.30 | 346.9 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-williams` | 1.82s | 3.93s | 334.3 | 29.92s | 36.98s | 36.28s | 1:43.18 | 356.4 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-alpine` | 1.85s | 4.00s | 328.2 | 30.18s | 37.08s | 36.35s | 1:43.62 | 350.0 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-haas` | 1.80s | 3.92s | 329.8 | 30.02s | 37.03s | 36.28s | 1:43.33 | 351.7 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-audi` | 1.78s | 3.90s | 326.8 | 30.10s | 36.90s | 36.20s | 1:43.20 | 348.5 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-cadillac` | 1.82s | 3.95s | 331.3 | 30.03s | 37.00s | 36.27s | 1:43.30 | 353.2 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2026` | `f1-26-racing-bulls` | 1.83s | 3.97s | 326.7 | 30.12s | 36.95s | 36.23s | 1:43.30 | 348.5 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-mercedes` | 1.78s | 3.82s | 339.6 | 29.75s | 36.40s | 35.63s | 1:41.78 | 346.2 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-redbull` | 1.77s | 3.80s | 336.4 | 29.83s | 36.40s | 35.63s | 1:41.87 | 343.4 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-ferrari` | 1.78s | 3.85s | 334.8 | 29.92s | 36.48s | 35.77s | 1:42.17 | 341.7 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2021` | `f1-21-mclaren` | 1.80s | 3.83s | 342.9 | 29.72s | 36.45s | 35.70s | 1:41.87 | 349.5 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-renault` | 1.73s | 3.72s | 344.8 | 29.70s | 36.60s | 35.87s | 1:42.17 | 352.8 | 4.8m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-mclaren` | 1.77s | 3.77s | 350.0 | 29.60s | 36.55s | 35.85s | 1:42.00 | 357.9 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-ferrari` | 1.80s | 3.82s | 346.5 | 29.78s | 36.75s | 36.00s | 1:42.53 | 354.4 | 4.7m / 7.0m |
| `spa-francorchamps` | `F1_2005` | `f1-05-williams` | 1.77s | 3.75s | 351.7 | 29.60s | 36.67s | 35.92s | 1:42.18 | 359.6 | 4.8m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-porsche-99x` | 2.40s | 6.18s | 294.2 | 38.23s | 47.38s | 47.67s | 2:13.28 | 292.9 | 4.9m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-jaguar-itype7` | 2.48s | 6.37s | 295.9 | 38.33s | 47.63s | 47.77s | 2:13.73 | 292.9 | 4.9m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-nissan-e4orce` | 2.37s | 6.12s | 292.4 | 38.17s | 47.27s | 47.52s | 2:12.95 | 292.3 | 4.9m / 7.0m |
| `spa-francorchamps` | `FORMULA_E` | `fe-maserati-folgore` | 2.52s | 6.43s | 297.7 | 38.40s | 47.60s | 47.98s | 2:13.98 | 293.6 | 4.9m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `bmw-m2-cs` | 4.72s | 13.05s | 261.7 | 48.02s | 59.88s | 60.82s | 2:48.72 | 245.3 | 4.9m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.58s | 12.40s | 269.0 | 47.23s | 58.97s | 59.98s | 2:46.18 | 249.8 | 4.9m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.32s | 11.32s | 283.7 | 46.35s | 58.32s | 59.30s | 2:43.97 | 257.5 | 4.9m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `nissan-gtr-nismo` | 4.17s | 11.07s | 276.4 | 46.23s | 58.08s | 58.98s | 2:43.30 | 255.9 | 4.9m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `renault-clio-v6` | 5.17s | 14.98s | 247.0 | 49.45s | 60.98s | 61.92s | 2:52.35 | 236.2 | 4.9m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `honda-civic-type-r` | 4.98s | 13.90s | 257.9 | 48.58s | 60.27s | 61.18s | 2:50.03 | 242.3 | 4.9m / 7.0m |
| `spa-francorchamps` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.80s | 13.90s | 247.0 | 48.60s | 60.13s | 60.97s | 2:49.70 | 238.4 | 5.0m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `ferrari-296-gtb` | 2.72s | 6.58s | 334.8 | 39.20s | 49.68s | 50.07s | 2:18.95 | 304.0 | 4.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `mclaren-750s` | 2.72s | 6.53s | 344.3 | 38.98s | 49.48s | 49.82s | 2:18.28 | 307.9 | 4.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `ferrari-sf90` | 2.63s | 6.32s | 349.1 | 38.80s | 49.35s | 49.62s | 2:17.77 | 311.0 | 4.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `porsche-918-spyder` | 2.70s | 6.60s | 330.1 | 39.27s | 49.63s | 50.10s | 2:19.00 | 302.1 | 4.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `aston-valkyrie-road` | 2.72s | 6.40s | 363.3 | 38.57s | 49.10s | 49.43s | 2:17.10 | 315.2 | 4.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `koenigsegg-jesko` | 2.57s | 5.95s | 389.5 | 38.05s | 48.63s | 48.95s | 2:15.63 | 325.4 | 4.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `ferrari-f80` | 2.62s | 6.23s | 358.6 | 38.55s | 49.08s | 49.40s | 2:17.03 | 314.8 | 4.8m / 7.0m |
| `spa-francorchamps` | `SUPERCAR` | `mclaren-w1` | 2.63s | 6.27s | 358.6 | 38.60s | 49.12s | 49.45s | 2:17.17 | 314.7 | 4.8m / 7.0m |
| `monza` | `HYPERCAR_GTP` | `ferrari-499p` | 2.87s | 6.73s | 325.8 | 32.18s | 31.68s | 34.15s | 1:38.02 | 327.1 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `toyota-gr010` | 2.95s | 7.00s | 319.7 | 32.50s | 32.00s | 34.45s | 1:38.95 | 321.7 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `porsche-963` | 2.92s | 6.88s | 321.2 | 32.37s | 31.82s | 34.32s | 1:38.50 | 323.4 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.78s | 6.53s | 327.3 | 32.17s | 31.57s | 34.10s | 1:37.83 | 329.3 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.92s | 6.85s | 324.2 | 32.33s | 31.82s | 34.32s | 1:38.47 | 325.4 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `acura-arx-06` | 2.83s | 6.73s | 318.2 | 32.20s | 31.73s | 34.15s | 1:38.08 | 322.5 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `alpine-a424` | 3.00s | 7.05s | 324.2 | 32.43s | 31.93s | 34.48s | 1:38.85 | 324.1 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `peugeot-9x8` | 3.00s | 7.12s | 318.2 | 32.48s | 32.07s | 34.48s | 1:39.03 | 320.0 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.98s | 6.98s | 328.8 | 32.32s | 31.80s | 34.35s | 1:38.47 | 329.2 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.95s | 6.97s | 322.7 | 32.47s | 31.92s | 34.38s | 1:38.77 | 323.8 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.87s | 6.77s | 322.7 | 32.28s | 31.75s | 34.27s | 1:38.30 | 325.0 | 3.9m / 6.8m |
| `monza` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 3.03s | 7.13s | 325.7 | 32.53s | 32.07s | 34.63s | 1:39.23 | 326.5 | 3.9m / 6.8m |
| `monza` | `LMP2` | `oreca-07-united` | 3.22s | 7.58s | 323.4 | 34.05s | 33.53s | 36.27s | 1:43.85 | 317.5 | 3.8m / 6.8m |
| `monza` | `LMP2` | `oreca-07-europol` | 3.17s | 7.48s | 322.2 | 33.95s | 33.38s | 36.13s | 1:43.47 | 317.5 | 3.8m / 6.8m |
| `monza` | `LMP2` | `oreca-07-ao` | 3.22s | 7.60s | 322.2 | 34.12s | 33.48s | 36.28s | 1:43.88 | 316.7 | 3.8m / 6.8m |
| `monza` | `LMP2` | `ligier-js-p217` | 3.22s | 7.57s | 324.7 | 34.03s | 33.52s | 36.27s | 1:43.82 | 318.3 | 3.8m / 6.8m |
| `monza` | `GT3` | `porsche-911-gt3-r` | 3.62s | 9.57s | 278.4 | 37.43s | 36.77s | 39.63s | 1:53.83 | 280.4 | 3.8m / 6.8m |
| `monza` | `GT3` | `ferrari-296-gt3` | 3.67s | 9.62s | 282.1 | 37.43s | 36.77s | 39.67s | 1:53.87 | 282.2 | 3.8m / 6.8m |
| `monza` | `GT3` | `corvette-z06-gt3r` | 3.53s | 9.25s | 284.6 | 37.28s | 36.60s | 39.50s | 1:53.38 | 285.2 | 3.8m / 6.8m |
| `monza` | `GT3` | `bmw-m4-gt3` | 3.72s | 9.75s | 283.3 | 37.57s | 36.85s | 39.82s | 1:54.23 | 282.4 | 3.8m / 6.8m |
| `monza` | `GT3` | `ford-mustang-gt3` | 3.58s | 9.33s | 287.0 | 37.33s | 36.65s | 39.63s | 1:53.62 | 286.2 | 3.8m / 6.8m |
| `monza` | `GT3` | `aston-vantage-gt3` | 3.67s | 9.62s | 282.1 | 37.47s | 36.85s | 39.73s | 1:54.05 | 282.2 | 3.8m / 6.8m |
| `monza` | `GT3` | `lamborghini-temerario-gt3` | 3.53s | 9.28s | 283.3 | 37.18s | 36.55s | 39.47s | 1:53.20 | 284.3 | 3.8m / 6.8m |
| `monza` | `GT3` | `mercedes-amg-gt3` | 3.73s | 9.82s | 280.9 | 37.58s | 36.95s | 39.85s | 1:54.38 | 280.7 | 3.8m / 6.8m |
| `monza` | `GT3` | `lexus-rcf-gt3` | 3.72s | 9.72s | 284.5 | 37.52s | 36.93s | 39.88s | 1:54.33 | 283.2 | 3.8m / 6.8m |
| `monza` | `GT3` | `mclaren-720s-gt3` | 3.67s | 9.65s | 280.9 | 37.40s | 36.73s | 39.68s | 1:53.82 | 281.4 | 3.8m / 6.8m |
| `monza` | `GT3` | `renault-rs01-gt3` | 3.60s | 9.43s | 283.3 | 37.28s | 36.63s | 39.55s | 1:53.47 | 283.7 | 3.8m / 6.8m |
| `monza` | `GT3` | `bentley-continental-gt3` | 3.58s | 9.30s | 288.2 | 37.32s | 36.62s | 39.62s | 1:53.55 | 287.0 | 3.8m / 6.8m |
| `monza` | `GT3` | `audi-r8-lms-gt3` | 3.67s | 9.62s | 282.1 | 37.38s | 36.75s | 39.70s | 1:53.83 | 282.3 | 3.8m / 6.8m |
| `monza` | `GT3` | `acura-nsx-gt3` | 3.55s | 9.33s | 280.9 | 37.32s | 36.68s | 39.55s | 1:53.55 | 282.6 | 3.8m / 6.8m |
| `monza` | `GT4` | `porsche-cayman-gt4-rs` | 4.45s | 12.40s | 258.1 | 42.35s | 41.35s | 45.08s | 2:08.78 | 258.5 | 3.6m / 6.8m |
| `monza` | `GT4` | `bmw-m4-gt4` | 4.42s | 12.13s | 263.6 | 42.27s | 41.28s | 45.03s | 2:08.58 | 262.2 | 3.6m / 6.8m |
| `monza` | `GT4` | `aston-vantage-gt4` | 4.52s | 12.45s | 262.2 | 42.45s | 41.40s | 45.22s | 2:09.07 | 260.5 | 3.6m / 6.8m |
| `monza` | `GT4` | `toyota-supra-gt4` | 4.35s | 12.02s | 260.9 | 42.18s | 41.18s | 44.92s | 2:08.28 | 261.1 | 3.6m / 6.8m |
| `monza` | `GT4` | `mclaren-artura-gt4` | 4.35s | 12.08s | 259.5 | 42.20s | 41.12s | 44.90s | 2:08.22 | 260.2 | 3.6m / 6.8m |
| `monza` | `GT4` | `mercedes-amg-gt4` | 4.52s | 12.45s | 262.2 | 42.47s | 41.43s | 45.28s | 2:09.18 | 260.6 | 3.6m / 6.8m |
| `monza` | `GT4` | `alpine-a110-gt4` | 4.45s | 12.47s | 256.7 | 42.35s | 41.35s | 45.05s | 2:08.75 | 257.6 | 3.6m / 6.8m |
| `monza` | `GT4` | `ford-mustang-gt4` | 4.42s | 12.08s | 265.0 | 42.35s | 41.23s | 45.10s | 2:08.68 | 263.1 | 3.6m / 6.8m |
| `monza` | `F1_2026` | `f1-26-ferrari` | 1.78s | 3.87s | 329.8 | 27.05s | 26.85s | 28.87s | 1:22.77 | 352.1 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-mclaren` | 1.83s | 3.97s | 326.7 | 27.10s | 26.95s | 28.97s | 1:23.02 | 348.8 | 3.8m / 6.8m |
| `monza` | `F1_2026` | `f1-26-mercedes` | 1.80s | 3.92s | 329.8 | 27.03s | 26.83s | 28.90s | 1:22.77 | 352.1 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-redbull` | 1.80s | 3.90s | 331.3 | 26.98s | 26.78s | 28.85s | 1:22.62 | 353.7 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-aston` | 1.82s | 3.93s | 325.2 | 27.13s | 26.92s | 29.02s | 1:23.07 | 347.2 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-williams` | 1.82s | 3.93s | 334.3 | 27.00s | 26.85s | 28.95s | 1:22.80 | 356.9 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-alpine` | 1.85s | 4.00s | 328.2 | 27.15s | 26.97s | 29.05s | 1:23.17 | 350.4 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-haas` | 1.80s | 3.92s | 329.8 | 27.05s | 26.92s | 29.00s | 1:22.97 | 352.1 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-audi` | 1.78s | 3.90s | 326.8 | 27.08s | 26.92s | 28.97s | 1:22.97 | 348.9 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-cadillac` | 1.82s | 3.95s | 331.3 | 27.10s | 26.88s | 28.97s | 1:22.95 | 353.7 | 3.9m / 6.8m |
| `monza` | `F1_2026` | `f1-26-racing-bulls` | 1.83s | 3.97s | 326.7 | 27.13s | 26.98s | 29.00s | 1:23.12 | 348.8 | 3.9m / 6.8m |
| `monza` | `F1_2021` | `f1-21-mercedes` | 1.78s | 3.82s | 339.6 | 26.83s | 26.62s | 28.55s | 1:22.00 | 346.6 | 3.9m / 6.8m |
| `monza` | `F1_2021` | `f1-21-redbull` | 1.77s | 3.80s | 336.4 | 26.87s | 26.65s | 28.55s | 1:22.07 | 343.3 | 3.9m / 6.8m |
| `monza` | `F1_2021` | `f1-21-ferrari` | 1.78s | 3.85s | 334.8 | 26.95s | 26.78s | 28.70s | 1:22.43 | 341.6 | 3.9m / 6.8m |
| `monza` | `F1_2021` | `f1-21-mclaren` | 1.80s | 3.83s | 342.9 | 26.80s | 26.62s | 28.57s | 1:21.98 | 349.8 | 3.9m / 6.8m |
| `monza` | `F1_2005` | `f1-05-renault` | 1.73s | 3.72s | 344.8 | 26.80s | 26.62s | 28.62s | 1:22.03 | 353.5 | 3.9m / 6.8m |
| `monza` | `F1_2005` | `f1-05-mclaren` | 1.77s | 3.77s | 350.0 | 26.68s | 26.53s | 28.52s | 1:21.73 | 358.8 | 3.9m / 6.8m |
| `monza` | `F1_2005` | `f1-05-ferrari` | 1.80s | 3.82s | 346.5 | 26.83s | 26.72s | 28.70s | 1:22.25 | 355.2 | 3.8m / 6.8m |
| `monza` | `F1_2005` | `f1-05-williams` | 1.77s | 3.75s | 351.7 | 26.73s | 26.58s | 28.60s | 1:21.92 | 360.5 | 3.9m / 6.8m |
| `monza` | `FORMULA_E` | `fe-porsche-99x` | 2.40s | 6.18s | 294.2 | 34.62s | 33.90s | 36.90s | 1:45.42 | 299.6 | 3.8m / 6.8m |
| `monza` | `FORMULA_E` | `fe-jaguar-itype7` | 2.48s | 6.37s | 295.9 | 34.80s | 33.98s | 37.02s | 1:45.80 | 301.3 | 3.8m / 6.8m |
| `monza` | `FORMULA_E` | `fe-nissan-e4orce` | 2.37s | 6.12s | 292.4 | 34.62s | 33.80s | 36.85s | 1:45.27 | 297.9 | 3.8m / 6.8m |
| `monza` | `FORMULA_E` | `fe-maserati-folgore` | 2.52s | 6.43s | 297.7 | 34.82s | 34.07s | 37.10s | 1:45.98 | 303.1 | 3.8m / 6.8m |
| `monza` | `TRACK_COUPE` | `bmw-m2-cs` | 4.72s | 13.05s | 261.7 | 43.58s | 42.48s | 46.58s | 2:12.65 | 258.3 | 3.6m / 6.8m |
| `monza` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.58s | 12.40s | 269.0 | 42.90s | 41.77s | 45.85s | 2:10.52 | 264.0 | 3.6m / 6.8m |
| `monza` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.32s | 11.32s | 283.7 | 42.23s | 41.00s | 45.23s | 2:08.47 | 274.9 | 3.6m / 6.8m |
| `monza` | `TRACK_COUPE` | `nissan-gtr-nismo` | 4.17s | 11.07s | 276.4 | 42.12s | 40.93s | 45.03s | 2:08.08 | 272.3 | 3.6m / 6.8m |
| `monza` | `TRACK_COUPE` | `renault-clio-v6` | 5.17s | 14.98s | 247.0 | 44.67s | 43.58s | 47.50s | 2:15.75 | 245.9 | 3.6m / 6.8m |
| `monza` | `TRACK_COUPE` | `honda-civic-type-r` | 4.98s | 13.90s | 257.9 | 43.97s | 42.87s | 46.88s | 2:13.72 | 254.0 | 3.6m / 6.8m |
| `monza` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.80s | 13.90s | 247.0 | 44.05s | 42.97s | 46.83s | 2:13.85 | 248.5 | 3.6m / 6.8m |
| `monza` | `SUPERCAR` | `ferrari-296-gtb` | 2.72s | 6.58s | 334.8 | 35.57s | 34.65s | 38.22s | 1:48.43 | 327.7 | 3.7m / 6.8m |
| `monza` | `SUPERCAR` | `mclaren-750s` | 2.72s | 6.53s | 344.3 | 35.43s | 34.45s | 38.03s | 1:47.92 | 333.1 | 3.7m / 6.8m |
| `monza` | `SUPERCAR` | `ferrari-sf90` | 2.63s | 6.32s | 349.1 | 35.20s | 34.23s | 37.88s | 1:47.32 | 337.4 | 3.7m / 6.8m |
| `monza` | `SUPERCAR` | `porsche-918-spyder` | 2.70s | 6.60s | 330.1 | 35.68s | 34.75s | 38.25s | 1:48.68 | 325.1 | 3.7m / 6.8m |
| `monza` | `SUPERCAR` | `aston-valkyrie-road` | 2.72s | 6.40s | 363.3 | 35.02s | 34.07s | 37.63s | 1:46.72 | 343.3 | 3.7m / 6.8m |
| `monza` | `SUPERCAR` | `koenigsegg-jesko` | 2.57s | 5.95s | 389.5 | 34.38s | 33.43s | 37.13s | 1:44.95 | 359.4 | 3.7m / 6.8m |
| `monza` | `SUPERCAR` | `ferrari-f80` | 2.62s | 6.23s | 358.6 | 34.97s | 33.97s | 37.65s | 1:46.58 | 342.8 | 3.7m / 6.8m |
| `monza` | `SUPERCAR` | `mclaren-w1` | 2.63s | 6.27s | 358.6 | 35.00s | 34.02s | 37.67s | 1:46.68 | 342.4 | 3.7m / 6.8m |
| `suzuka` | `HYPERCAR_GTP` | `ferrari-499p` | 2.87s | 6.73s | 325.8 | 40.90s | 35.40s | 37.45s | 1:53.75 | 314.4 | 4.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `toyota-gr010` | 2.95s | 7.00s | 319.7 | 41.28s | 35.75s | 37.80s | 1:54.83 | 309.2 | 4.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `porsche-963` | 2.92s | 6.88s | 321.2 | 41.08s | 35.55s | 37.65s | 1:54.28 | 310.8 | 4.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.78s | 6.53s | 327.3 | 40.80s | 35.38s | 37.37s | 1:53.55 | 316.8 | 4.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.92s | 6.85s | 324.2 | 41.20s | 35.58s | 37.63s | 1:54.42 | 312.6 | 4.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `acura-arx-06` | 2.83s | 6.73s | 318.2 | 40.80s | 35.40s | 37.42s | 1:53.62 | 310.5 | 4.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `alpine-a424` | 3.00s | 7.05s | 324.2 | 41.30s | 35.70s | 37.78s | 1:54.78 | 311.1 | 4.6m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `peugeot-9x8` | 3.00s | 7.12s | 318.2 | 41.27s | 35.65s | 37.83s | 1:54.75 | 307.4 | 4.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.98s | 6.98s | 328.8 | 41.28s | 35.65s | 37.72s | 1:54.65 | 314.9 | 4.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.95s | 6.97s | 322.7 | 41.25s | 35.67s | 37.72s | 1:54.63 | 311.0 | 4.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.87s | 6.77s | 322.7 | 40.97s | 35.52s | 37.55s | 1:54.03 | 312.6 | 4.5m / 6.5m |
| `suzuka` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 3.03s | 7.13s | 325.7 | 41.60s | 35.87s | 38.00s | 1:55.47 | 312.4 | 4.6m / 6.5m |
| `suzuka` | `LMP2` | `oreca-07-united` | 3.22s | 7.58s | 323.4 | 43.67s | 37.72s | 39.80s | 2:01.18 | 302.8 | 4.5m / 6.5m |
| `suzuka` | `LMP2` | `oreca-07-europol` | 3.17s | 7.48s | 322.2 | 43.45s | 37.58s | 39.67s | 2:00.70 | 303.1 | 4.5m / 6.5m |
| `suzuka` | `LMP2` | `oreca-07-ao` | 3.22s | 7.60s | 322.2 | 43.72s | 37.78s | 39.83s | 2:01.33 | 302.2 | 4.5m / 6.5m |
| `suzuka` | `LMP2` | `ligier-js-p217` | 3.22s | 7.57s | 324.7 | 43.67s | 37.72s | 39.82s | 2:01.20 | 303.6 | 4.5m / 6.5m |
| `suzuka` | `GT3` | `porsche-911-gt3-r` | 3.62s | 9.57s | 278.4 | 47.52s | 41.13s | 43.62s | 2:12.27 | 267.8 | 4.5m / 6.5m |
| `suzuka` | `GT3` | `ferrari-296-gt3` | 3.67s | 9.62s | 282.1 | 47.55s | 41.05s | 43.65s | 2:12.25 | 269.3 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `corvette-z06-gt3r` | 3.53s | 9.25s | 284.6 | 47.37s | 41.08s | 43.50s | 2:11.95 | 272.3 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `bmw-m4-gt3` | 3.72s | 9.75s | 283.3 | 47.87s | 41.35s | 43.77s | 2:12.98 | 269.3 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `ford-mustang-gt3` | 3.58s | 9.33s | 287.0 | 47.55s | 41.20s | 43.52s | 2:12.27 | 273.0 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `aston-vantage-gt3` | 3.67s | 9.62s | 282.1 | 47.65s | 41.28s | 43.70s | 2:12.63 | 269.3 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `lamborghini-temerario-gt3` | 3.53s | 9.28s | 283.3 | 47.28s | 41.03s | 43.38s | 2:11.70 | 271.5 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `mercedes-amg-gt3` | 3.73s | 9.82s | 280.9 | 47.82s | 41.33s | 43.87s | 2:13.02 | 267.8 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `lexus-rcf-gt3` | 3.72s | 9.72s | 284.5 | 47.87s | 41.42s | 43.87s | 2:13.15 | 269.9 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `mclaren-720s-gt3` | 3.67s | 9.65s | 280.9 | 47.58s | 41.12s | 43.60s | 2:12.30 | 268.6 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `renault-rs01-gt3` | 3.60s | 9.43s | 283.3 | 47.40s | 41.05s | 43.47s | 2:11.92 | 270.8 | 4.5m / 6.5m |
| `suzuka` | `GT3` | `bentley-continental-gt3` | 3.58s | 9.30s | 288.2 | 47.53s | 41.15s | 43.58s | 2:12.27 | 273.6 | 4.4m / 6.5m |
| `suzuka` | `GT3` | `audi-r8-lms-gt3` | 3.67s | 9.62s | 282.1 | 47.63s | 41.17s | 43.63s | 2:12.43 | 269.3 | 4.5m / 6.5m |
| `suzuka` | `GT3` | `acura-nsx-gt3` | 3.55s | 9.33s | 280.9 | 47.35s | 41.00s | 43.47s | 2:11.82 | 270.1 | 4.4m / 6.5m |
| `suzuka` | `GT4` | `porsche-cayman-gt4-rs` | 4.45s | 12.40s | 258.1 | 54.17s | 47.00s | 49.88s | 2:31.05 | 245.1 | 4.3m / 6.5m |
| `suzuka` | `GT4` | `bmw-m4-gt4` | 4.42s | 12.13s | 263.6 | 54.32s | 47.10s | 49.95s | 2:31.37 | 247.9 | 4.3m / 6.5m |
| `suzuka` | `GT4` | `aston-vantage-gt4` | 4.52s | 12.45s | 262.2 | 54.50s | 47.18s | 50.05s | 2:31.73 | 246.6 | 4.3m / 6.5m |
| `suzuka` | `GT4` | `toyota-supra-gt4` | 4.35s | 12.02s | 260.9 | 54.15s | 46.98s | 49.78s | 2:30.92 | 247.2 | 4.3m / 6.5m |
| `suzuka` | `GT4` | `mclaren-artura-gt4` | 4.35s | 12.08s | 259.5 | 53.98s | 46.90s | 49.70s | 2:30.58 | 246.4 | 4.3m / 6.5m |
| `suzuka` | `GT4` | `mercedes-amg-gt4` | 4.52s | 12.45s | 262.2 | 54.55s | 47.25s | 50.15s | 2:31.95 | 246.4 | 4.3m / 6.5m |
| `suzuka` | `GT4` | `alpine-a110-gt4` | 4.45s | 12.47s | 256.7 | 54.13s | 47.02s | 49.80s | 2:30.95 | 244.3 | 4.3m / 6.5m |
| `suzuka` | `GT4` | `ford-mustang-gt4` | 4.42s | 12.08s | 265.0 | 54.30s | 47.12s | 49.98s | 2:31.40 | 248.7 | 4.3m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-ferrari` | 1.78s | 3.87s | 329.8 | 33.68s | 29.47s | 31.27s | 1:34.42 | 348.8 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-mclaren` | 1.83s | 3.97s | 326.7 | 33.73s | 29.48s | 31.35s | 1:34.57 | 345.4 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-mercedes` | 1.80s | 3.92s | 329.8 | 33.75s | 29.48s | 31.27s | 1:34.50 | 348.4 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-redbull` | 1.80s | 3.90s | 331.3 | 33.67s | 29.40s | 31.23s | 1:34.30 | 349.6 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-aston` | 1.82s | 3.93s | 325.2 | 33.70s | 29.47s | 31.33s | 1:34.50 | 344.7 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-williams` | 1.82s | 3.93s | 334.3 | 33.78s | 29.53s | 31.32s | 1:34.63 | 351.4 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-alpine` | 1.85s | 4.00s | 328.2 | 33.90s | 29.58s | 31.42s | 1:34.90 | 346.2 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-haas` | 1.80s | 3.92s | 329.8 | 33.78s | 29.53s | 31.35s | 1:34.67 | 348.3 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-audi` | 1.78s | 3.90s | 326.8 | 33.68s | 29.48s | 31.27s | 1:34.43 | 346.3 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-cadillac` | 1.82s | 3.95s | 331.3 | 33.78s | 29.47s | 31.35s | 1:34.60 | 349.1 | 4.6m / 6.5m |
| `suzuka` | `F1_2026` | `f1-26-racing-bulls` | 1.83s | 3.97s | 326.7 | 33.72s | 29.47s | 31.37s | 1:34.55 | 345.4 | 4.5m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-mercedes` | 1.78s | 3.82s | 339.6 | 33.20s | 29.08s | 30.85s | 1:33.13 | 345.9 | 4.6m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-redbull` | 1.77s | 3.80s | 336.4 | 33.22s | 29.02s | 30.87s | 1:33.10 | 342.6 | 4.6m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-ferrari` | 1.78s | 3.85s | 334.8 | 33.30s | 29.20s | 30.98s | 1:33.48 | 341.0 | 4.5m / 6.5m |
| `suzuka` | `F1_2021` | `f1-21-mclaren` | 1.80s | 3.83s | 342.9 | 33.27s | 29.08s | 30.90s | 1:33.25 | 349.2 | 4.6m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-renault` | 1.73s | 3.72s | 344.8 | 33.42s | 29.25s | 30.98s | 1:33.65 | 352.2 | 4.6m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-mclaren` | 1.77s | 3.77s | 350.0 | 33.42s | 29.18s | 30.97s | 1:33.57 | 357.3 | 4.6m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-ferrari` | 1.80s | 3.82s | 346.5 | 33.53s | 29.30s | 31.13s | 1:33.97 | 353.8 | 4.6m / 6.5m |
| `suzuka` | `F1_2005` | `f1-05-williams` | 1.77s | 3.75s | 351.7 | 33.50s | 29.25s | 31.03s | 1:33.78 | 359.0 | 4.6m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-porsche-99x` | 2.40s | 6.18s | 294.2 | 43.68s | 38.52s | 40.78s | 2:02.98 | 294.4 | 4.4m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-jaguar-itype7` | 2.48s | 6.37s | 295.9 | 43.90s | 38.63s | 40.90s | 2:03.43 | 294.5 | 4.5m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-nissan-e4orce` | 2.37s | 6.12s | 292.4 | 43.58s | 38.33s | 40.70s | 2:02.62 | 293.6 | 4.5m / 6.5m |
| `suzuka` | `FORMULA_E` | `fe-maserati-folgore` | 2.52s | 6.43s | 297.7 | 43.98s | 38.70s | 40.93s | 2:03.62 | 295.1 | 4.4m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `bmw-m2-cs` | 4.72s | 13.05s | 261.7 | 56.28s | 48.70s | 51.72s | 2:36.70 | 243.3 | 4.3m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.58s | 12.40s | 269.0 | 55.38s | 48.02s | 50.97s | 2:34.37 | 248.5 | 4.3m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.32s | 11.32s | 283.7 | 54.83s | 47.42s | 50.43s | 2:32.68 | 254.8 | 4.3m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `nissan-gtr-nismo` | 4.17s | 11.07s | 276.4 | 54.45s | 47.23s | 50.23s | 2:31.92 | 253.2 | 4.3m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `renault-clio-v6` | 5.17s | 14.98s | 247.0 | 57.35s | 49.55s | 52.60s | 2:39.50 | 232.6 | 4.3m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `honda-civic-type-r` | 4.98s | 13.90s | 257.9 | 56.67s | 48.98s | 52.07s | 2:37.72 | 239.5 | 4.3m / 6.5m |
| `suzuka` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.80s | 13.90s | 247.0 | 56.45s | 48.90s | 51.83s | 2:37.18 | 235.2 | 4.3m / 6.5m |
| `suzuka` | `SUPERCAR` | `ferrari-296-gtb` | 2.72s | 6.58s | 334.8 | 46.15s | 40.30s | 42.68s | 2:09.13 | 298.1 | 4.3m / 6.5m |
| `suzuka` | `SUPERCAR` | `mclaren-750s` | 2.72s | 6.53s | 344.3 | 46.08s | 40.17s | 42.52s | 2:08.77 | 302.1 | 4.4m / 6.5m |
| `suzuka` | `SUPERCAR` | `ferrari-sf90` | 2.63s | 6.32s | 349.1 | 45.90s | 39.97s | 42.32s | 2:08.18 | 305.6 | 4.4m / 6.5m |
| `suzuka` | `SUPERCAR` | `porsche-918-spyder` | 2.70s | 6.60s | 330.1 | 46.23s | 40.25s | 42.65s | 2:09.13 | 296.2 | 4.3m / 6.5m |
| `suzuka` | `SUPERCAR` | `aston-valkyrie-road` | 2.72s | 6.40s | 363.3 | 45.68s | 39.78s | 42.07s | 2:07.53 | 309.5 | 4.3m / 6.5m |
| `suzuka` | `SUPERCAR` | `koenigsegg-jesko` | 2.57s | 5.95s | 389.5 | 45.38s | 39.40s | 41.65s | 2:06.43 | 321.1 | 4.3m / 6.5m |
| `suzuka` | `SUPERCAR` | `ferrari-f80` | 2.62s | 6.23s | 358.6 | 45.68s | 39.77s | 42.13s | 2:07.58 | 309.6 | 4.3m / 6.5m |
| `suzuka` | `SUPERCAR` | `mclaren-w1` | 2.63s | 6.27s | 358.6 | 45.68s | 39.75s | 42.17s | 2:07.60 | 309.1 | 4.4m / 6.5m |
| `silverstone` | `HYPERCAR_GTP` | `ferrari-499p` | 2.87s | 6.73s | 325.8 | 33.97s | 35.42s | 36.07s | 1:45.45 | 306.7 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `toyota-gr010` | 2.95s | 7.00s | 319.7 | 34.23s | 35.72s | 36.35s | 1:46.30 | 302.4 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `porsche-963` | 2.92s | 6.88s | 321.2 | 34.12s | 35.55s | 36.27s | 1:45.93 | 303.8 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.78s | 6.53s | 327.3 | 33.85s | 35.33s | 36.00s | 1:45.18 | 308.4 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.92s | 6.85s | 324.2 | 34.13s | 35.58s | 36.22s | 1:45.93 | 305.1 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `acura-arx-06` | 2.83s | 6.73s | 318.2 | 33.95s | 35.40s | 36.00s | 1:45.35 | 304.0 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `alpine-a424` | 3.00s | 7.05s | 324.2 | 34.25s | 35.68s | 36.32s | 1:46.25 | 303.9 | 3.9m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `peugeot-9x8` | 3.00s | 7.12s | 318.2 | 34.23s | 35.67s | 36.35s | 1:46.25 | 301.2 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.98s | 6.98s | 328.8 | 34.20s | 35.63s | 36.27s | 1:46.10 | 307.4 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.95s | 6.97s | 322.7 | 34.20s | 35.68s | 36.30s | 1:46.18 | 303.8 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.87s | 6.77s | 322.7 | 34.03s | 35.48s | 36.18s | 1:45.70 | 305.2 | 3.8m / 7.3m |
| `silverstone` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 3.03s | 7.13s | 325.7 | 34.47s | 35.88s | 36.53s | 1:46.88 | 305.3 | 3.8m / 7.3m |
| `silverstone` | `LMP2` | `oreca-07-united` | 3.22s | 7.58s | 323.4 | 36.05s | 37.68s | 38.42s | 1:52.15 | 295.0 | 3.8m / 7.3m |
| `silverstone` | `LMP2` | `oreca-07-europol` | 3.17s | 7.48s | 322.2 | 36.00s | 37.53s | 38.32s | 1:51.85 | 295.3 | 3.7m / 7.3m |
| `silverstone` | `LMP2` | `oreca-07-ao` | 3.22s | 7.60s | 322.2 | 36.10s | 37.68s | 38.43s | 1:52.22 | 294.3 | 3.8m / 7.3m |
| `silverstone` | `LMP2` | `ligier-js-p217` | 3.22s | 7.57s | 324.7 | 36.08s | 37.67s | 38.37s | 1:52.12 | 295.6 | 3.7m / 7.3m |
| `silverstone` | `GT3` | `porsche-911-gt3-r` | 3.62s | 9.57s | 278.4 | 39.55s | 41.17s | 41.90s | 2:02.62 | 264.6 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `ferrari-296-gt3` | 3.67s | 9.62s | 282.1 | 39.55s | 41.20s | 41.95s | 2:02.70 | 265.3 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `corvette-z06-gt3r` | 3.53s | 9.25s | 284.6 | 39.38s | 41.08s | 41.85s | 2:02.32 | 267.9 | 3.7m / 7.3m |
| `silverstone` | `GT3` | `bmw-m4-gt3` | 3.72s | 9.75s | 283.3 | 39.73s | 41.38s | 42.10s | 2:03.22 | 265.4 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `ford-mustang-gt3` | 3.58s | 9.33s | 287.0 | 39.48s | 41.20s | 41.98s | 2:02.67 | 267.9 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `aston-vantage-gt3` | 3.67s | 9.62s | 282.1 | 39.62s | 41.27s | 42.10s | 2:02.98 | 265.2 | 3.7m / 7.3m |
| `silverstone` | `GT3` | `lamborghini-temerario-gt3` | 3.53s | 9.28s | 283.3 | 39.37s | 41.03s | 41.78s | 2:02.18 | 267.2 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `mercedes-amg-gt3` | 3.73s | 9.82s | 280.9 | 39.72s | 41.35s | 42.12s | 2:03.18 | 264.2 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `lexus-rcf-gt3` | 3.72s | 9.72s | 284.5 | 39.72s | 41.48s | 42.18s | 2:03.38 | 265.6 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `mclaren-720s-gt3` | 3.67s | 9.65s | 280.9 | 39.55s | 41.17s | 41.95s | 2:02.67 | 265.0 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `renault-rs01-gt3` | 3.60s | 9.43s | 283.3 | 39.42s | 41.08s | 41.85s | 2:02.35 | 266.8 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `bentley-continental-gt3` | 3.58s | 9.30s | 288.2 | 39.50s | 41.20s | 42.03s | 2:02.73 | 268.5 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `audi-r8-lms-gt3` | 3.67s | 9.62s | 282.1 | 39.57s | 41.25s | 41.98s | 2:02.80 | 265.3 | 3.8m / 7.3m |
| `silverstone` | `GT3` | `acura-nsx-gt3` | 3.55s | 9.33s | 280.9 | 39.42s | 41.08s | 41.90s | 2:02.40 | 266.0 | 3.8m / 7.3m |
| `silverstone` | `GT4` | `porsche-cayman-gt4-rs` | 4.45s | 12.40s | 258.1 | 44.88s | 46.88s | 48.03s | 2:19.80 | 241.2 | 3.7m / 7.3m |
| `silverstone` | `GT4` | `bmw-m4-gt4` | 4.42s | 12.13s | 263.6 | 44.90s | 46.95s | 48.05s | 2:19.90 | 243.6 | 3.7m / 7.3m |
| `silverstone` | `GT4` | `aston-vantage-gt4` | 4.52s | 12.45s | 262.2 | 45.03s | 47.05s | 48.13s | 2:20.22 | 242.3 | 3.7m / 7.3m |
| `silverstone` | `GT4` | `toyota-supra-gt4` | 4.35s | 12.02s | 260.9 | 44.77s | 46.82s | 47.90s | 2:19.48 | 243.2 | 3.7m / 7.3m |
| `silverstone` | `GT4` | `mclaren-artura-gt4` | 4.35s | 12.08s | 259.5 | 44.75s | 46.77s | 47.83s | 2:19.35 | 242.7 | 3.7m / 7.3m |
| `silverstone` | `GT4` | `mercedes-amg-gt4` | 4.52s | 12.45s | 262.2 | 45.03s | 47.15s | 48.13s | 2:20.32 | 242.3 | 3.7m / 7.3m |
| `silverstone` | `GT4` | `alpine-a110-gt4` | 4.45s | 12.47s | 256.7 | 44.88s | 46.93s | 47.95s | 2:19.77 | 240.8 | 3.7m / 7.3m |
| `silverstone` | `GT4` | `ford-mustang-gt4` | 4.42s | 12.08s | 265.0 | 44.88s | 46.95s | 48.00s | 2:19.83 | 244.0 | 3.7m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-ferrari` | 1.78s | 3.87s | 329.8 | 28.33s | 29.60s | 30.13s | 1:28.07 | 346.1 | 4.1m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-mclaren` | 1.83s | 3.97s | 326.7 | 28.38s | 29.60s | 30.12s | 1:28.10 | 343.5 | 4.2m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-mercedes` | 1.80s | 3.92s | 329.8 | 28.37s | 29.57s | 30.08s | 1:28.02 | 345.8 | 4.2m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-redbull` | 1.80s | 3.90s | 331.3 | 28.28s | 29.48s | 30.03s | 1:27.80 | 347.0 | 4.2m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-aston` | 1.82s | 3.93s | 325.2 | 28.40s | 29.60s | 30.13s | 1:28.13 | 343.3 | 4.1m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-williams` | 1.82s | 3.93s | 334.3 | 28.40s | 29.62s | 30.17s | 1:28.18 | 348.0 | 4.1m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-alpine` | 1.85s | 4.00s | 328.2 | 28.48s | 29.68s | 30.27s | 1:28.43 | 344.1 | 4.2m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-haas` | 1.80s | 3.92s | 329.8 | 28.42s | 29.67s | 30.22s | 1:28.30 | 345.5 | 4.1m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-audi` | 1.78s | 3.90s | 326.8 | 28.37s | 29.62s | 30.18s | 1:28.17 | 344.1 | 4.1m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-cadillac` | 1.82s | 3.95s | 331.3 | 28.40s | 29.62s | 30.20s | 1:28.22 | 346.3 | 4.1m / 7.3m |
| `silverstone` | `F1_2026` | `f1-26-racing-bulls` | 1.83s | 3.97s | 326.7 | 28.42s | 29.62s | 30.15s | 1:28.18 | 344.0 | 4.2m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-mercedes` | 1.78s | 3.82s | 339.6 | 28.00s | 29.13s | 29.70s | 1:26.83 | 345.9 | 4.2m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-redbull` | 1.77s | 3.80s | 336.4 | 28.00s | 29.18s | 29.72s | 1:26.90 | 342.7 | 4.2m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-ferrari` | 1.78s | 3.85s | 334.8 | 28.13s | 29.30s | 29.85s | 1:27.28 | 341.1 | 4.2m / 7.3m |
| `silverstone` | `F1_2021` | `f1-21-mclaren` | 1.80s | 3.83s | 342.9 | 28.05s | 29.17s | 29.80s | 1:27.02 | 348.8 | 4.2m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-renault` | 1.73s | 3.72s | 344.8 | 28.12s | 29.35s | 29.88s | 1:27.35 | 351.0 | 4.2m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-mclaren` | 1.77s | 3.77s | 350.0 | 28.10s | 29.32s | 29.83s | 1:27.25 | 355.5 | 4.2m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-ferrari` | 1.80s | 3.82s | 346.5 | 28.22s | 29.43s | 29.98s | 1:27.63 | 352.3 | 4.2m / 7.3m |
| `silverstone` | `F1_2005` | `f1-05-williams` | 1.77s | 3.75s | 351.7 | 28.13s | 29.38s | 29.88s | 1:27.40 | 356.5 | 4.1m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-porsche-99x` | 2.40s | 6.18s | 294.2 | 36.78s | 38.52s | 39.35s | 1:54.65 | 287.8 | 3.6m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-jaguar-itype7` | 2.48s | 6.37s | 295.9 | 36.92s | 38.63s | 39.47s | 1:55.02 | 287.6 | 3.7m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-nissan-e4orce` | 2.37s | 6.12s | 292.4 | 36.70s | 38.40s | 39.18s | 1:54.28 | 287.5 | 3.6m / 7.3m |
| `silverstone` | `FORMULA_E` | `fe-maserati-folgore` | 2.52s | 6.43s | 297.7 | 36.92s | 38.73s | 39.50s | 1:55.15 | 288.0 | 3.6m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `bmw-m2-cs` | 4.72s | 13.05s | 261.7 | 46.38s | 48.57s | 49.67s | 2:24.62 | 238.8 | 3.7m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.58s | 12.40s | 269.0 | 45.65s | 47.83s | 48.93s | 2:22.42 | 243.3 | 3.7m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.32s | 11.32s | 283.7 | 45.10s | 47.25s | 48.42s | 2:20.77 | 251.2 | 3.7m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `nissan-gtr-nismo` | 4.17s | 11.07s | 276.4 | 44.90s | 47.03s | 48.20s | 2:20.13 | 250.2 | 3.7m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `renault-clio-v6` | 5.17s | 14.98s | 247.0 | 47.28s | 49.47s | 50.53s | 2:27.28 | 229.7 | 3.7m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `honda-civic-type-r` | 4.98s | 13.90s | 257.9 | 46.72s | 48.85s | 50.00s | 2:25.57 | 235.5 | 3.7m / 7.3m |
| `silverstone` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.80s | 13.90s | 247.0 | 46.67s | 48.75s | 49.82s | 2:25.23 | 232.5 | 3.7m / 7.3m |
| `silverstone` | `SUPERCAR` | `ferrari-296-gtb` | 2.72s | 6.58s | 334.8 | 38.17s | 40.17s | 41.08s | 1:59.42 | 297.2 | 3.6m / 7.3m |
| `silverstone` | `SUPERCAR` | `mclaren-750s` | 2.72s | 6.53s | 344.3 | 38.02s | 39.97s | 40.83s | 1:58.82 | 300.6 | 3.6m / 7.3m |
| `silverstone` | `SUPERCAR` | `ferrari-sf90` | 2.63s | 6.32s | 349.1 | 37.80s | 39.80s | 40.67s | 1:58.27 | 304.0 | 3.6m / 7.3m |
| `silverstone` | `SUPERCAR` | `porsche-918-spyder` | 2.70s | 6.60s | 330.1 | 38.22s | 40.17s | 41.03s | 1:59.42 | 295.6 | 3.6m / 7.3m |
| `silverstone` | `SUPERCAR` | `aston-valkyrie-road` | 2.72s | 6.40s | 363.3 | 37.60s | 39.53s | 40.48s | 1:57.62 | 307.2 | 3.6m / 7.3m |
| `silverstone` | `SUPERCAR` | `koenigsegg-jesko` | 2.57s | 5.95s | 389.5 | 37.07s | 39.12s | 40.00s | 1:56.18 | 318.5 | 3.6m / 7.3m |
| `silverstone` | `SUPERCAR` | `ferrari-f80` | 2.62s | 6.23s | 358.6 | 37.53s | 39.57s | 40.47s | 1:57.57 | 307.3 | 3.6m / 7.3m |
| `silverstone` | `SUPERCAR` | `mclaren-w1` | 2.63s | 6.27s | 358.6 | 37.60s | 39.53s | 40.52s | 1:57.65 | 307.0 | 3.6m / 7.3m |
| `laguna-seca` | `HYPERCAR_GTP` | `ferrari-499p` | 2.87s | 6.73s | 325.8 | 23.23s | 26.60s | 29.23s | 1:19.07 | 271.2 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `toyota-gr010` | 2.95s | 7.00s | 319.7 | 23.43s | 26.83s | 29.43s | 1:19.70 | 267.6 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `porsche-963` | 2.92s | 6.88s | 321.2 | 23.37s | 26.77s | 29.33s | 1:19.47 | 269.0 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.78s | 6.53s | 327.3 | 23.15s | 26.47s | 29.13s | 1:18.75 | 273.3 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.92s | 6.85s | 324.2 | 23.35s | 26.77s | 29.37s | 1:19.48 | 269.9 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `acura-arx-06` | 2.83s | 6.73s | 318.2 | 23.17s | 26.50s | 29.03s | 1:18.70 | 269.7 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `alpine-a424` | 3.00s | 7.05s | 324.2 | 23.48s | 26.90s | 29.47s | 1:19.85 | 268.0 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `peugeot-9x8` | 3.00s | 7.12s | 318.2 | 23.42s | 26.88s | 29.35s | 1:19.65 | 266.4 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.98s | 6.98s | 328.8 | 23.45s | 26.92s | 29.45s | 1:19.82 | 268.1 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.95s | 6.97s | 322.7 | 23.40s | 26.87s | 29.43s | 1:19.70 | 268.5 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.87s | 6.77s | 322.7 | 23.27s | 26.65s | 29.37s | 1:19.28 | 270.2 | 3.4m / 6.0m |
| `laguna-seca` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 3.03s | 7.13s | 325.7 | 23.60s | 27.12s | 29.68s | 1:20.40 | 266.2 | 3.4m / 6.0m |
| `laguna-seca` | `LMP2` | `oreca-07-united` | 3.22s | 7.58s | 323.4 | 24.70s | 28.48s | 31.18s | 1:24.37 | 257.7 | 3.4m / 6.0m |
| `laguna-seca` | `LMP2` | `oreca-07-europol` | 3.17s | 7.48s | 322.2 | 24.62s | 28.35s | 31.03s | 1:24.00 | 258.3 | 3.4m / 6.0m |
| `laguna-seca` | `LMP2` | `oreca-07-ao` | 3.22s | 7.60s | 322.2 | 24.72s | 28.52s | 31.28s | 1:24.52 | 257.4 | 3.4m / 6.0m |
| `laguna-seca` | `LMP2` | `ligier-js-p217` | 3.22s | 7.57s | 324.7 | 24.65s | 28.50s | 31.18s | 1:24.33 | 258.1 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `porsche-911-gt3-r` | 3.62s | 9.57s | 278.4 | 26.92s | 31.12s | 33.83s | 1:31.87 | 234.4 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `ferrari-296-gt3` | 3.67s | 9.62s | 282.1 | 26.95s | 31.13s | 33.85s | 1:31.93 | 234.5 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `corvette-z06-gt3r` | 3.53s | 9.25s | 284.6 | 26.87s | 30.97s | 33.78s | 1:31.62 | 236.9 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `bmw-m4-gt3` | 3.72s | 9.75s | 283.3 | 27.10s | 31.37s | 34.05s | 1:32.52 | 233.9 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `ford-mustang-gt3` | 3.58s | 9.33s | 287.0 | 26.90s | 31.10s | 33.92s | 1:31.92 | 236.8 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `aston-vantage-gt3` | 3.67s | 9.62s | 282.1 | 26.98s | 31.20s | 33.90s | 1:32.08 | 234.5 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `lamborghini-temerario-gt3` | 3.53s | 9.28s | 283.3 | 26.80s | 30.92s | 33.70s | 1:31.42 | 236.5 | 3.3m / 6.0m |
| `laguna-seca` | `GT3` | `mercedes-amg-gt3` | 3.73s | 9.82s | 280.9 | 27.13s | 31.37s | 34.10s | 1:32.60 | 233.3 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `lexus-rcf-gt3` | 3.72s | 9.72s | 284.5 | 27.13s | 31.37s | 34.15s | 1:32.65 | 234.2 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `mclaren-720s-gt3` | 3.67s | 9.65s | 280.9 | 26.93s | 31.03s | 33.78s | 1:31.75 | 234.2 | 3.3m / 6.0m |
| `laguna-seca` | `GT3` | `renault-rs01-gt3` | 3.60s | 9.43s | 283.3 | 26.87s | 31.02s | 33.77s | 1:31.65 | 235.7 | 3.3m / 6.0m |
| `laguna-seca` | `GT3` | `bentley-continental-gt3` | 3.58s | 9.30s | 288.2 | 26.92s | 31.13s | 33.97s | 1:32.02 | 237.1 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `audi-r8-lms-gt3` | 3.67s | 9.62s | 282.1 | 26.93s | 31.15s | 33.95s | 1:32.03 | 234.6 | 3.4m / 6.0m |
| `laguna-seca` | `GT3` | `acura-nsx-gt3` | 3.55s | 9.33s | 280.9 | 26.88s | 30.95s | 33.73s | 1:31.57 | 235.7 | 3.4m / 6.0m |
| `laguna-seca` | `GT4` | `porsche-cayman-gt4-rs` | 4.45s | 12.40s | 258.1 | 30.47s | 35.52s | 38.82s | 1:44.80 | 215.4 | 3.2m / 6.0m |
| `laguna-seca` | `GT4` | `bmw-m4-gt4` | 4.42s | 12.13s | 263.6 | 30.52s | 35.53s | 38.93s | 1:44.98 | 217.0 | 3.2m / 6.0m |
| `laguna-seca` | `GT4` | `aston-vantage-gt4` | 4.52s | 12.45s | 262.2 | 30.58s | 35.68s | 39.05s | 1:45.32 | 215.6 | 3.2m / 6.0m |
| `laguna-seca` | `GT4` | `toyota-supra-gt4` | 4.35s | 12.02s | 260.9 | 30.35s | 35.42s | 38.77s | 1:44.53 | 217.2 | 3.3m / 6.0m |
| `laguna-seca` | `GT4` | `mclaren-artura-gt4` | 4.35s | 12.08s | 259.5 | 30.33s | 35.35s | 38.67s | 1:44.35 | 216.8 | 3.2m / 6.0m |
| `laguna-seca` | `GT4` | `mercedes-amg-gt4` | 4.52s | 12.45s | 262.2 | 30.62s | 35.77s | 39.13s | 1:45.52 | 215.7 | 3.3m / 6.0m |
| `laguna-seca` | `GT4` | `alpine-a110-gt4` | 4.45s | 12.47s | 256.7 | 30.45s | 35.52s | 38.78s | 1:44.75 | 215.0 | 3.3m / 6.0m |
| `laguna-seca` | `GT4` | `ford-mustang-gt4` | 4.42s | 12.08s | 265.0 | 30.43s | 35.55s | 38.95s | 1:44.93 | 217.5 | 3.2m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-ferrari` | 1.78s | 3.87s | 329.8 | 19.33s | 21.65s | 23.85s | 1:04.83 | 314.2 | 3.6m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-mclaren` | 1.83s | 3.97s | 326.7 | 19.38s | 21.68s | 23.90s | 1:04.97 | 311.6 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-mercedes` | 1.80s | 3.92s | 329.8 | 19.38s | 21.67s | 23.88s | 1:04.93 | 313.5 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-redbull` | 1.80s | 3.90s | 331.3 | 19.32s | 21.63s | 23.83s | 1:04.78 | 314.3 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-aston` | 1.82s | 3.93s | 325.2 | 19.37s | 21.68s | 23.88s | 1:04.93 | 311.4 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-williams` | 1.82s | 3.93s | 334.3 | 19.38s | 21.72s | 23.98s | 1:05.08 | 314.9 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-alpine` | 1.85s | 4.00s | 328.2 | 19.45s | 21.83s | 23.98s | 1:05.27 | 311.8 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-haas` | 1.80s | 3.92s | 329.8 | 19.38s | 21.75s | 23.93s | 1:05.07 | 313.5 | 3.6m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-audi` | 1.78s | 3.90s | 326.8 | 19.37s | 21.68s | 23.82s | 1:04.87 | 312.7 | 3.6m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-cadillac` | 1.82s | 3.95s | 331.3 | 19.42s | 21.75s | 23.98s | 1:05.15 | 313.5 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2026` | `f1-26-racing-bulls` | 1.83s | 3.97s | 326.7 | 19.37s | 21.72s | 23.90s | 1:04.98 | 311.6 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-mercedes` | 1.78s | 3.82s | 339.6 | 19.08s | 21.35s | 23.53s | 1:03.97 | 316.6 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-redbull` | 1.77s | 3.80s | 336.4 | 19.07s | 21.33s | 23.52s | 1:03.92 | 315.7 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-ferrari` | 1.78s | 3.85s | 334.8 | 19.15s | 21.47s | 23.60s | 1:04.22 | 314.4 | 3.8m / 6.0m |
| `laguna-seca` | `F1_2021` | `f1-21-mclaren` | 1.80s | 3.83s | 342.9 | 19.13s | 21.42s | 23.62s | 1:04.17 | 317.4 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-renault` | 1.73s | 3.72s | 344.8 | 19.17s | 21.52s | 23.68s | 1:04.37 | 317.6 | 3.6m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-mclaren` | 1.77s | 3.77s | 350.0 | 19.15s | 21.52s | 23.68s | 1:04.35 | 318.6 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-ferrari` | 1.80s | 3.82s | 346.5 | 19.27s | 21.60s | 23.78s | 1:04.65 | 316.6 | 3.7m / 6.0m |
| `laguna-seca` | `F1_2005` | `f1-05-williams` | 1.77s | 3.75s | 351.7 | 19.22s | 21.53s | 23.78s | 1:04.53 | 319.2 | 3.7m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-porsche-99x` | 2.40s | 6.18s | 294.2 | 24.27s | 28.18s | 30.85s | 1:23.30 | 264.5 | 3.3m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-jaguar-itype7` | 2.48s | 6.37s | 295.9 | 24.38s | 28.27s | 31.05s | 1:23.70 | 263.3 | 3.3m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-nissan-e4orce` | 2.37s | 6.12s | 292.4 | 24.18s | 28.02s | 30.72s | 1:22.92 | 264.8 | 3.3m / 6.0m |
| `laguna-seca` | `FORMULA_E` | `fe-maserati-folgore` | 2.52s | 6.43s | 297.7 | 24.45s | 28.47s | 31.15s | 1:24.07 | 263.2 | 3.3m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `bmw-m2-cs` | 4.72s | 13.05s | 261.7 | 31.48s | 36.87s | 40.43s | 1:48.78 | 212.8 | 3.2m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.58s | 12.40s | 269.0 | 30.97s | 36.33s | 39.77s | 1:47.07 | 216.1 | 3.2m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.32s | 11.32s | 283.7 | 30.48s | 35.78s | 39.33s | 1:45.60 | 222.3 | 3.2m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `nissan-gtr-nismo` | 4.17s | 11.07s | 276.4 | 30.35s | 35.50s | 39.03s | 1:44.88 | 222.5 | 3.2m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `renault-clio-v6` | 5.17s | 14.98s | 247.0 | 32.23s | 37.78s | 41.23s | 1:51.25 | 204.8 | 3.2m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `honda-civic-type-r` | 4.98s | 13.90s | 257.9 | 31.80s | 37.28s | 40.82s | 1:49.90 | 209.3 | 3.2m / 6.0m |
| `laguna-seca` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.80s | 13.90s | 247.0 | 31.68s | 37.02s | 40.53s | 1:49.23 | 208.3 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `ferrari-296-gtb` | 2.72s | 6.58s | 334.8 | 25.70s | 29.57s | 32.72s | 1:27.98 | 262.7 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `mclaren-750s` | 2.72s | 6.53s | 344.3 | 25.58s | 29.48s | 32.63s | 1:27.70 | 264.7 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `ferrari-sf90` | 2.63s | 6.32s | 349.1 | 25.43s | 29.28s | 32.47s | 1:27.18 | 267.5 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `porsche-918-spyder` | 2.70s | 6.60s | 330.1 | 25.72s | 29.53s | 32.63s | 1:27.88 | 261.8 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `aston-valkyrie-road` | 2.72s | 6.40s | 363.3 | 25.35s | 29.22s | 32.35s | 1:26.92 | 268.7 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `koenigsegg-jesko` | 2.57s | 5.95s | 389.5 | 25.07s | 28.77s | 32.07s | 1:25.90 | 276.9 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `ferrari-f80` | 2.62s | 6.23s | 358.6 | 25.28s | 29.12s | 32.33s | 1:26.73 | 269.8 | 3.2m / 6.0m |
| `laguna-seca` | `SUPERCAR` | `mclaren-w1` | 2.63s | 6.27s | 358.6 | 25.37s | 29.18s | 32.32s | 1:26.87 | 269.5 | 3.2m / 6.0m |
| `le-mans` | `HYPERCAR_GTP` | `ferrari-499p` | 2.87s | 6.73s | 325.8 | 64.75s | 60.18s | 73.97s | 3:18.90 | 331.9 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `toyota-gr010` | 2.95s | 7.00s | 319.7 | 65.43s | 61.00s | 74.48s | 3:20.92 | 325.7 | 3.7m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `porsche-963` | 2.92s | 6.88s | 321.2 | 65.17s | 60.70s | 74.25s | 3:20.12 | 327.3 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.78s | 6.53s | 327.3 | 64.48s | 59.80s | 73.75s | 3:18.03 | 333.5 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.92s | 6.85s | 324.2 | 64.98s | 60.47s | 74.25s | 3:19.70 | 330.4 | 3.7m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `acura-arx-06` | 2.83s | 6.73s | 318.2 | 65.05s | 60.70s | 73.95s | 3:19.70 | 324.2 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `alpine-a424` | 3.00s | 7.05s | 324.2 | 65.20s | 60.73s | 74.42s | 3:20.35 | 330.3 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `peugeot-9x8` | 3.00s | 7.12s | 318.2 | 65.50s | 61.30s | 74.45s | 3:21.25 | 324.2 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.98s | 6.98s | 328.8 | 64.77s | 60.33s | 74.25s | 3:19.35 | 335.5 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.95s | 6.97s | 322.7 | 65.22s | 60.72s | 74.43s | 3:20.37 | 328.8 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.87s | 6.77s | 322.7 | 64.97s | 60.47s | 74.15s | 3:19.58 | 328.8 | 3.8m / 6.5m |
| `le-mans` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 3.03s | 7.13s | 325.7 | 65.22s | 60.80s | 74.73s | 3:20.75 | 332.4 | 3.8m / 6.5m |
| `le-mans` | `LMP2` | `oreca-07-united` | 3.22s | 7.58s | 323.4 | 67.93s | 63.00s | 78.23s | 3:29.17 | 329.3 | 3.5m / 6.5m |
| `le-mans` | `LMP2` | `oreca-07-europol` | 3.17s | 7.48s | 322.2 | 67.82s | 62.85s | 78.07s | 3:28.73 | 328.0 | 3.5m / 6.5m |
| `le-mans` | `LMP2` | `oreca-07-ao` | 3.22s | 7.60s | 322.2 | 68.12s | 63.13s | 78.32s | 3:29.57 | 328.0 | 3.5m / 6.5m |
| `le-mans` | `LMP2` | `ligier-js-p217` | 3.22s | 7.57s | 324.7 | 67.92s | 62.90s | 78.27s | 3:29.08 | 330.6 | 3.5m / 6.5m |
| `le-mans` | `GT3` | `porsche-911-gt3-r` | 3.62s | 9.57s | 278.4 | 75.33s | 70.37s | 85.97s | 3:51.67 | 283.5 | 3.2m / 6.5m |
| `le-mans` | `GT3` | `ferrari-296-gt3` | 3.67s | 9.62s | 282.1 | 75.13s | 70.13s | 85.92s | 3:51.18 | 287.2 | 3.1m / 6.5m |
| `le-mans` | `GT3` | `corvette-z06-gt3r` | 3.53s | 9.25s | 284.6 | 74.72s | 69.55s | 85.62s | 3:49.88 | 289.7 | 3.1m / 6.5m |
| `le-mans` | `GT3` | `bmw-m4-gt3` | 3.72s | 9.75s | 283.3 | 75.35s | 70.25s | 86.23s | 3:51.83 | 288.4 | 3.2m / 6.5m |
| `le-mans` | `GT3` | `ford-mustang-gt3` | 3.58s | 9.33s | 287.0 | 74.72s | 69.45s | 85.72s | 3:49.88 | 292.2 | 3.1m / 6.5m |
| `le-mans` | `GT3` | `aston-vantage-gt3` | 3.67s | 9.62s | 282.1 | 75.27s | 70.20s | 86.07s | 3:51.53 | 287.2 | 3.2m / 6.5m |
| `le-mans` | `GT3` | `lamborghini-temerario-gt3` | 3.53s | 9.28s | 283.3 | 74.82s | 69.58s | 85.55s | 3:49.95 | 288.5 | 3.2m / 6.5m |
| `le-mans` | `GT3` | `mercedes-amg-gt3` | 3.73s | 9.82s | 280.9 | 75.45s | 70.55s | 86.33s | 3:52.33 | 285.9 | 3.1m / 6.5m |
| `le-mans` | `GT3` | `lexus-rcf-gt3` | 3.72s | 9.72s | 284.5 | 75.35s | 70.17s | 86.33s | 3:51.85 | 289.7 | 3.1m / 6.5m |
| `le-mans` | `GT3` | `mclaren-720s-gt3` | 3.67s | 9.65s | 280.9 | 75.18s | 70.30s | 85.92s | 3:51.40 | 286.0 | 3.2m / 6.5m |
| `le-mans` | `GT3` | `renault-rs01-gt3` | 3.60s | 9.43s | 283.3 | 74.88s | 69.78s | 85.65s | 3:50.32 | 288.5 | 3.1m / 6.5m |
| `le-mans` | `GT3` | `bentley-continental-gt3` | 3.58s | 9.30s | 288.2 | 74.65s | 69.32s | 85.72s | 3:49.68 | 293.4 | 3.1m / 6.5m |
| `le-mans` | `GT3` | `audi-r8-lms-gt3` | 3.67s | 9.62s | 282.1 | 75.27s | 70.17s | 85.97s | 3:51.40 | 287.2 | 3.2m / 6.5m |
| `le-mans` | `GT3` | `acura-nsx-gt3` | 3.55s | 9.33s | 280.9 | 74.98s | 69.93s | 85.72s | 3:50.63 | 286.0 | 3.1m / 6.5m |
| `le-mans` | `GT4` | `porsche-cayman-gt4-rs` | 4.45s | 12.40s | 258.1 | 84.35s | 77.47s | 97.82s | 4:19.63 | 262.8 | 2.5m / 6.5m |
| `le-mans` | `GT4` | `bmw-m4-gt4` | 4.42s | 12.13s | 263.6 | 83.93s | 76.80s | 97.78s | 4:18.52 | 268.4 | 2.5m / 6.5m |
| `le-mans` | `GT4` | `aston-vantage-gt4` | 4.52s | 12.45s | 262.2 | 84.28s | 77.27s | 97.93s | 4:19.48 | 267.0 | 2.5m / 6.5m |
| `le-mans` | `GT4` | `toyota-supra-gt4` | 4.35s | 12.02s | 260.9 | 83.93s | 76.90s | 97.50s | 4:18.33 | 265.6 | 2.5m / 6.5m |
| `le-mans` | `GT4` | `mclaren-artura-gt4` | 4.35s | 12.08s | 259.5 | 84.00s | 76.98s | 97.52s | 4:18.50 | 264.2 | 2.5m / 6.5m |
| `le-mans` | `GT4` | `mercedes-amg-gt4` | 4.52s | 12.45s | 262.2 | 84.32s | 77.25s | 98.12s | 4:19.68 | 267.0 | 2.5m / 6.5m |
| `le-mans` | `GT4` | `alpine-a110-gt4` | 4.45s | 12.47s | 256.7 | 84.47s | 77.65s | 97.80s | 4:19.92 | 261.4 | 2.5m / 6.5m |
| `le-mans` | `GT4` | `ford-mustang-gt4` | 4.42s | 12.08s | 265.0 | 83.83s | 76.60s | 97.77s | 4:18.20 | 269.8 | 2.5m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-ferrari` | 1.78s | 3.87s | 329.8 | 55.93s | 52.57s | 62.80s | 2:51.30 | 351.8 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-mclaren` | 1.83s | 3.97s | 326.7 | 56.17s | 52.95s | 63.00s | 2:52.12 | 348.6 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-mercedes` | 1.80s | 3.92s | 329.8 | 55.90s | 52.63s | 62.82s | 2:51.35 | 351.8 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-redbull` | 1.80s | 3.90s | 331.3 | 55.77s | 52.47s | 62.65s | 2:50.88 | 353.4 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-aston` | 1.82s | 3.93s | 325.2 | 56.28s | 53.08s | 63.10s | 2:52.47 | 347.0 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-williams` | 1.82s | 3.93s | 334.3 | 55.72s | 52.25s | 62.80s | 2:50.77 | 356.6 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-alpine` | 1.85s | 4.00s | 328.2 | 56.23s | 52.90s | 63.15s | 2:52.28 | 350.2 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-haas` | 1.80s | 3.92s | 329.8 | 56.00s | 52.65s | 62.88s | 2:51.53 | 351.8 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-audi` | 1.78s | 3.90s | 326.8 | 56.17s | 52.88s | 62.95s | 2:52.00 | 348.6 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-cadillac` | 1.82s | 3.95s | 331.3 | 55.90s | 52.53s | 62.82s | 2:51.25 | 353.4 | 4.7m / 6.5m |
| `le-mans` | `F1_2026` | `f1-26-racing-bulls` | 1.83s | 3.97s | 326.7 | 56.18s | 52.97s | 63.00s | 2:52.15 | 348.6 | 4.7m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-mercedes` | 1.78s | 3.82s | 339.6 | 55.82s | 52.70s | 62.28s | 2:50.80 | 346.3 | 4.8m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-redbull` | 1.77s | 3.80s | 336.4 | 56.08s | 53.03s | 62.40s | 2:51.52 | 343.0 | 4.8m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-ferrari` | 1.78s | 3.85s | 334.8 | 56.25s | 53.27s | 62.70s | 2:52.22 | 341.4 | 4.8m / 6.5m |
| `le-mans` | `F1_2021` | `f1-21-mclaren` | 1.80s | 3.83s | 342.9 | 55.65s | 52.48s | 62.23s | 2:50.37 | 349.6 | 4.8m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-renault` | 1.73s | 3.72s | 344.8 | 55.50s | 52.23s | 62.28s | 2:50.02 | 352.9 | 4.8m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-mclaren` | 1.77s | 3.77s | 350.0 | 55.10s | 51.78s | 62.03s | 2:48.92 | 358.1 | 4.8m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-ferrari` | 1.80s | 3.82s | 346.5 | 55.53s | 52.22s | 62.40s | 2:50.15 | 354.6 | 4.8m / 6.5m |
| `le-mans` | `F1_2005` | `f1-05-williams` | 1.77s | 3.75s | 351.7 | 55.15s | 51.68s | 62.10s | 2:48.93 | 359.9 | 4.8m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-porsche-99x` | 2.40s | 6.18s | 294.2 | 70.08s | 64.30s | 80.33s | 3:34.72 | 299.5 | 3.1m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-jaguar-itype7` | 2.48s | 6.37s | 295.9 | 70.23s | 64.30s | 80.62s | 3:35.15 | 301.3 | 3.1m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-nissan-e4orce` | 2.37s | 6.12s | 292.4 | 70.08s | 64.35s | 80.28s | 3:34.72 | 297.6 | 3.1m / 6.5m |
| `le-mans` | `FORMULA_E` | `fe-maserati-folgore` | 2.52s | 6.43s | 297.7 | 70.20s | 64.22s | 80.72s | 3:35.13 | 303.1 | 3.1m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `bmw-m2-cs` | 4.72s | 13.05s | 261.7 | 86.25s | 78.57s | 100.93s | 4:25.75 | 266.4 | 2.4m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.58s | 12.40s | 269.0 | 84.83s | 77.10s | 99.33s | 4:21.27 | 273.9 | 2.4m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.32s | 11.32s | 283.7 | 83.28s | 74.70s | 97.88s | 4:15.87 | 288.9 | 2.4m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `nissan-gtr-nismo` | 4.17s | 11.07s | 276.4 | 83.17s | 74.83s | 97.62s | 4:15.62 | 281.4 | 2.5m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `renault-clio-v6` | 5.17s | 14.98s | 247.0 | 88.85s | 81.83s | 103.02s | 4:33.70 | 251.5 | 2.4m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `honda-civic-type-r` | 4.98s | 13.90s | 257.9 | 87.15s | 79.78s | 101.67s | 4:28.60 | 262.7 | 2.4m / 6.5m |
| `le-mans` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.80s | 13.90s | 247.0 | 87.75s | 80.60s | 101.82s | 4:30.17 | 251.5 | 2.4m / 6.5m |
| `le-mans` | `SUPERCAR` | `ferrari-296-gtb` | 2.72s | 6.58s | 334.8 | 70.68s | 62.62s | 83.08s | 3:36.38 | 340.8 | 2.9m / 6.5m |
| `le-mans` | `SUPERCAR` | `mclaren-750s` | 2.72s | 6.53s | 344.3 | 70.17s | 61.93s | 82.68s | 3:34.78 | 350.5 | 3.0m / 6.5m |
| `le-mans` | `SUPERCAR` | `ferrari-sf90` | 2.63s | 6.32s | 349.1 | 69.67s | 61.25s | 82.20s | 3:33.12 | 355.3 | 3.0m / 6.5m |
| `le-mans` | `SUPERCAR` | `porsche-918-spyder` | 2.70s | 6.60s | 330.1 | 70.90s | 62.95s | 83.18s | 3:37.03 | 336.0 | 2.9m / 6.5m |
| `le-mans` | `SUPERCAR` | `aston-valkyrie-road` | 2.72s | 6.40s | 363.3 | 69.07s | 60.72s | 81.72s | 3:31.50 | 369.3 | 3.0m / 6.5m |
| `le-mans` | `SUPERCAR` | `koenigsegg-jesko` | 2.57s | 5.95s | 389.5 | 67.88s | 58.95s | 80.77s | 3:27.60 | 380.6 | 3.1m / 6.5m |
| `le-mans` | `SUPERCAR` | `ferrari-f80` | 2.62s | 6.23s | 358.6 | 69.13s | 60.67s | 81.72s | 3:31.52 | 365.0 | 3.0m / 6.5m |
| `le-mans` | `SUPERCAR` | `mclaren-w1` | 2.63s | 6.27s | 358.6 | 69.15s | 60.72s | 81.85s | 3:31.72 | 365.0 | 3.0m / 6.5m |
| `monaco` | `HYPERCAR_GTP` | `ferrari-499p` | 2.87s | 6.73s | 325.8 | 21.83s | 32.12s | 27.95s | 1:21.90 | 289.7 | 4.1m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `toyota-gr010` | 2.95s | 7.00s | 319.7 | 21.98s | 32.37s | 28.22s | 1:22.57 | 286.2 | 4.2m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `porsche-963` | 2.92s | 6.88s | 321.2 | 21.92s | 32.33s | 28.08s | 1:22.33 | 287.4 | 4.2m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `cadillac-vseries-r` | 2.78s | 6.53s | 327.3 | 21.78s | 32.07s | 27.87s | 1:21.72 | 291.8 | 4.2m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `bmw-m-hybrid-v8` | 2.92s | 6.85s | 324.2 | 21.92s | 32.32s | 28.18s | 1:22.42 | 288.4 | 4.2m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `acura-arx-06` | 2.83s | 6.73s | 318.2 | 21.77s | 31.93s | 27.82s | 1:21.52 | 287.9 | 4.1m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `alpine-a424` | 3.00s | 7.05s | 324.2 | 22.00s | 32.40s | 28.32s | 1:22.72 | 286.9 | 4.1m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `peugeot-9x8` | 3.00s | 7.12s | 318.2 | 21.98s | 32.32s | 28.23s | 1:22.53 | 284.8 | 4.1m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `aston-valkyrie-lmh` | 2.98s | 6.98s | 328.8 | 21.98s | 32.45s | 28.35s | 1:22.78 | 287.7 | 4.1m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `lamborghini-sc63` | 2.95s | 6.97s | 322.7 | 21.98s | 32.40s | 28.20s | 1:22.58 | 287.2 | 4.1m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `genesis-gmr-001` | 2.87s | 6.77s | 322.7 | 21.87s | 32.13s | 27.97s | 1:21.97 | 288.8 | 4.2m / 4.8m |
| `monaco` | `HYPERCAR_GTP` | `glickenhaus-scg-007` | 3.03s | 7.13s | 325.7 | 22.13s | 32.68s | 28.53s | 1:23.35 | 286.1 | 4.1m / 4.8m |
| `monaco` | `LMP2` | `oreca-07-united` | 3.22s | 7.58s | 323.4 | 23.12s | 34.38s | 30.07s | 1:27.57 | 278.5 | 4.4m / 4.8m |
| `monaco` | `LMP2` | `oreca-07-europol` | 3.17s | 7.48s | 322.2 | 23.05s | 34.27s | 29.90s | 1:27.22 | 278.8 | 4.4m / 4.8m |
| `monaco` | `LMP2` | `oreca-07-ao` | 3.22s | 7.60s | 322.2 | 23.10s | 34.37s | 30.10s | 1:27.57 | 278.1 | 4.4m / 4.8m |
| `monaco` | `LMP2` | `ligier-js-p217` | 3.22s | 7.57s | 324.7 | 23.20s | 34.37s | 30.07s | 1:27.63 | 278.6 | 4.4m / 4.8m |
| `monaco` | `GT3` | `porsche-911-gt3-r` | 3.62s | 9.57s | 278.4 | 24.88s | 37.23s | 32.93s | 1:35.05 | 255.1 | 4.6m / 4.8m |
| `monaco` | `GT3` | `ferrari-296-gt3` | 3.67s | 9.62s | 282.1 | 24.92s | 37.22s | 33.02s | 1:35.15 | 255.5 | 4.6m / 4.8m |
| `monaco` | `GT3` | `corvette-z06-gt3r` | 3.53s | 9.25s | 284.6 | 24.90s | 37.18s | 32.80s | 1:34.88 | 257.7 | 4.7m / 4.8m |
| `monaco` | `GT3` | `bmw-m4-gt3` | 3.72s | 9.75s | 283.3 | 25.05s | 37.57s | 33.23s | 1:35.85 | 255.2 | 4.7m / 4.8m |
| `monaco` | `GT3` | `ford-mustang-gt3` | 3.58s | 9.33s | 287.0 | 24.93s | 37.38s | 32.98s | 1:35.30 | 257.8 | 4.7m / 4.8m |
| `monaco` | `GT3` | `aston-vantage-gt3` | 3.67s | 9.62s | 282.1 | 25.03s | 37.47s | 33.10s | 1:35.60 | 255.5 | 4.7m / 4.8m |
| `monaco` | `GT3` | `lamborghini-temerario-gt3` | 3.53s | 9.28s | 283.3 | 24.83s | 37.07s | 32.75s | 1:34.65 | 257.3 | 4.6m / 4.8m |
| `monaco` | `GT3` | `mercedes-amg-gt3` | 3.73s | 9.82s | 280.9 | 25.05s | 37.58s | 33.27s | 1:35.90 | 254.3 | 4.7m / 4.8m |
| `monaco` | `GT3` | `lexus-rcf-gt3` | 3.72s | 9.72s | 284.5 | 25.08s | 37.70s | 33.32s | 1:36.10 | 255.5 | 4.7m / 4.8m |
| `monaco` | `GT3` | `mclaren-720s-gt3` | 3.67s | 9.65s | 280.9 | 24.93s | 37.35s | 32.90s | 1:35.18 | 255.1 | 4.6m / 4.8m |
| `monaco` | `GT3` | `renault-rs01-gt3` | 3.60s | 9.43s | 283.3 | 24.87s | 37.22s | 32.88s | 1:34.97 | 256.6 | 4.6m / 4.8m |
| `monaco` | `GT3` | `bentley-continental-gt3` | 3.58s | 9.30s | 288.2 | 24.98s | 37.43s | 33.05s | 1:35.47 | 258.1 | 4.7m / 4.8m |
| `monaco` | `GT3` | `audi-r8-lms-gt3` | 3.67s | 9.62s | 282.1 | 24.92s | 37.33s | 33.12s | 1:35.37 | 255.6 | 4.6m / 4.8m |
| `monaco` | `GT3` | `acura-nsx-gt3` | 3.55s | 9.33s | 280.9 | 24.88s | 37.13s | 32.75s | 1:34.77 | 256.5 | 4.7m / 4.8m |
| `monaco` | `GT4` | `porsche-cayman-gt4-rs` | 4.45s | 12.40s | 258.1 | 28.18s | 42.78s | 38.07s | 1:49.03 | 237.6 | 5.4m / 4.8m |
| `monaco` | `GT4` | `bmw-m4-gt4` | 4.42s | 12.13s | 263.6 | 28.20s | 42.90s | 38.18s | 1:49.28 | 239.3 | 5.5m / 4.8m |
| `monaco` | `GT4` | `aston-vantage-gt4` | 4.52s | 12.45s | 262.2 | 28.22s | 43.08s | 38.35s | 1:49.65 | 238.2 | 5.5m / 4.8m |
| `monaco` | `GT4` | `toyota-supra-gt4` | 4.35s | 12.02s | 260.9 | 28.05s | 42.65s | 37.92s | 1:48.62 | 239.3 | 5.5m / 4.8m |
| `monaco` | `GT4` | `mclaren-artura-gt4` | 4.35s | 12.08s | 259.5 | 28.05s | 42.57s | 37.93s | 1:48.55 | 238.9 | 5.4m / 4.8m |
| `monaco` | `GT4` | `mercedes-amg-gt4` | 4.52s | 12.45s | 262.2 | 28.28s | 43.13s | 38.45s | 1:49.87 | 238.2 | 5.5m / 4.8m |
| `monaco` | `GT4` | `alpine-a110-gt4` | 4.45s | 12.47s | 256.7 | 28.08s | 42.70s | 38.13s | 1:48.92 | 237.1 | 5.4m / 4.8m |
| `monaco` | `GT4` | `ford-mustang-gt4` | 4.42s | 12.08s | 265.0 | 28.18s | 43.00s | 38.22s | 1:49.40 | 239.8 | 5.5m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-ferrari` | 1.78s | 3.87s | 329.8 | 18.27s | 26.00s | 22.55s | 1:06.82 | 328.5 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-mclaren` | 1.83s | 3.97s | 326.7 | 18.30s | 26.05s | 22.55s | 1:06.90 | 326.1 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-mercedes` | 1.80s | 3.92s | 329.8 | 18.28s | 26.03s | 22.55s | 1:06.87 | 328.2 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-redbull` | 1.80s | 3.90s | 331.3 | 18.27s | 25.98s | 22.50s | 1:06.75 | 328.7 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-aston` | 1.82s | 3.93s | 325.2 | 18.30s | 26.00s | 22.57s | 1:06.87 | 325.8 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-williams` | 1.82s | 3.93s | 334.3 | 18.37s | 26.12s | 22.67s | 1:07.15 | 329.6 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-alpine` | 1.85s | 4.00s | 328.2 | 18.40s | 26.18s | 22.70s | 1:07.28 | 326.4 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-haas` | 1.80s | 3.92s | 329.8 | 18.33s | 26.12s | 22.58s | 1:07.03 | 328.0 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-audi` | 1.78s | 3.90s | 326.8 | 18.30s | 25.98s | 22.55s | 1:06.83 | 327.1 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-cadillac` | 1.82s | 3.95s | 331.3 | 18.37s | 26.12s | 22.62s | 1:07.10 | 328.1 | 4.1m / 4.8m |
| `monaco` | `F1_2026` | `f1-26-racing-bulls` | 1.83s | 3.97s | 326.7 | 18.37s | 26.07s | 22.62s | 1:07.05 | 326.0 | 4.1m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-mercedes` | 1.78s | 3.82s | 339.6 | 18.08s | 25.60s | 22.20s | 1:05.88 | 331.4 | 4.1m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-redbull` | 1.77s | 3.80s | 336.4 | 18.07s | 25.55s | 22.20s | 1:05.82 | 330.1 | 4.1m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-ferrari` | 1.78s | 3.85s | 334.8 | 18.15s | 25.62s | 22.28s | 1:06.05 | 328.8 | 4.1m / 4.8m |
| `monaco` | `F1_2021` | `f1-21-mclaren` | 1.80s | 3.83s | 342.9 | 18.10s | 25.72s | 22.27s | 1:06.08 | 332.4 | 4.1m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-renault` | 1.73s | 3.72s | 344.8 | 18.17s | 25.77s | 22.33s | 1:06.27 | 332.9 | 4.1m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-mclaren` | 1.77s | 3.77s | 350.0 | 18.15s | 25.82s | 22.37s | 1:06.33 | 334.1 | 4.1m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-ferrari` | 1.80s | 3.82s | 346.5 | 18.22s | 25.93s | 22.48s | 1:06.63 | 332.2 | 4.1m / 4.8m |
| `monaco` | `F1_2005` | `f1-05-williams` | 1.77s | 3.75s | 351.7 | 18.22s | 25.95s | 22.43s | 1:06.60 | 334.9 | 4.1m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-porsche-99x` | 2.40s | 6.18s | 294.2 | 23.07s | 34.20s | 29.48s | 1:26.75 | 278.7 | 4.7m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-jaguar-itype7` | 2.48s | 6.37s | 295.9 | 23.13s | 34.27s | 29.60s | 1:27.00 | 278.0 | 4.6m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-nissan-e4orce` | 2.37s | 6.12s | 292.4 | 22.97s | 34.00s | 29.33s | 1:26.30 | 278.6 | 4.6m / 4.8m |
| `monaco` | `FORMULA_E` | `fe-maserati-folgore` | 2.52s | 6.43s | 297.7 | 23.18s | 34.37s | 29.68s | 1:27.23 | 278.0 | 4.6m / 4.8m |
| `monaco` | `TRACK_COUPE` | `bmw-m2-cs` | 4.72s | 13.05s | 261.7 | 29.08s | 44.63s | 39.88s | 1:53.60 | 235.7 | 5.7m / 4.8m |
| `monaco` | `TRACK_COUPE` | `porsche-911-gt3-rs` | 4.58s | 12.40s | 269.0 | 28.72s | 44.02s | 39.15s | 1:51.88 | 239.1 | 5.6m / 4.8m |
| `monaco` | `TRACK_COUPE` | `corvette-z06-coupe` | 4.32s | 11.32s | 283.7 | 28.42s | 43.63s | 38.52s | 1:50.57 | 243.6 | 5.7m / 4.8m |
| `monaco` | `TRACK_COUPE` | `nissan-gtr-nismo` | 4.17s | 11.07s | 276.4 | 28.27s | 43.28s | 38.08s | 1:49.63 | 242.3 | 5.7m / 4.8m |
| `monaco` | `TRACK_COUPE` | `renault-clio-v6` | 5.17s | 14.98s | 247.0 | 29.58s | 45.42s | 41.03s | 1:56.03 | 228.1 | 5.6m / 4.8m |
| `monaco` | `TRACK_COUPE` | `honda-civic-type-r` | 4.98s | 13.90s | 257.9 | 29.30s | 44.97s | 40.37s | 1:54.63 | 232.7 | 5.6m / 4.8m |
| `monaco` | `TRACK_COUPE` | `toyota-gr-yaris` | 4.80s | 13.90s | 247.0 | 29.17s | 44.52s | 39.95s | 1:53.63 | 230.8 | 5.6m / 4.8m |
| `monaco` | `SUPERCAR` | `ferrari-296-gtb` | 2.72s | 6.58s | 334.8 | 24.40s | 36.62s | 31.33s | 1:32.35 | 274.7 | 5.1m / 4.8m |
| `monaco` | `SUPERCAR` | `mclaren-750s` | 2.72s | 6.53s | 344.3 | 24.30s | 36.48s | 31.22s | 1:32.00 | 275.9 | 5.1m / 4.8m |
| `monaco` | `SUPERCAR` | `ferrari-sf90` | 2.63s | 6.32s | 349.1 | 24.25s | 36.42s | 31.08s | 1:31.75 | 276.1 | 5.2m / 4.8m |
| `monaco` | `SUPERCAR` | `porsche-918-spyder` | 2.70s | 6.60s | 330.1 | 24.42s | 36.55s | 31.27s | 1:32.23 | 275.1 | 5.1m / 4.8m |
| `monaco` | `SUPERCAR` | `aston-valkyrie-road` | 2.72s | 6.40s | 363.3 | 24.13s | 36.23s | 30.97s | 1:31.33 | 278.1 | 5.1m / 4.8m |
| `monaco` | `SUPERCAR` | `koenigsegg-jesko` | 2.57s | 5.95s | 389.5 | 24.02s | 36.18s | 30.67s | 1:30.87 | 279.1 | 5.2m / 4.8m |
| `monaco` | `SUPERCAR` | `ferrari-f80` | 2.62s | 6.23s | 358.6 | 24.15s | 36.28s | 30.90s | 1:31.33 | 277.0 | 5.1m / 4.8m |
| `monaco` | `SUPERCAR` | `mclaren-w1` | 2.63s | 6.27s | 358.6 | 24.22s | 36.32s | 30.97s | 1:31.50 | 276.7 | 5.2m / 4.8m |
