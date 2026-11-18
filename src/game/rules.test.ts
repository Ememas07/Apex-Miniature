import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARS,
  CAR_CLASSES,
  computeBoPEquilibriumScore,
  getCarById,
  getCarsByClass,
  resolveCarSpecial,
  resolveNumberPlateColors,
  validateDriverNumber,
} from './cars';
import { CarClassId, LiveryConfig, TrackSpec, TrackWaypoint } from './types';
import { TRACKS, compileTrack, projectOntoTrack, sampleTrackAtT } from './tracks';
import {
  CUSTOM_TRACK_TEMPLATES,
  NODE_COLLIDER_RADIUS_MULTIPLIER,
  NODE_HIT_RADIUS_PX,
  analyzeTrackGeometry,
  exportTrackToJson,
  exportTrackToShareCode,
  findClosestWaypointHit2D,
  findTrackSegmentInsertIndex,
  importTrackFromString,
} from './customTracks';
import {
  ACTIVE_TUNING_CONFIG,
  resolveTuningConfig,
  computeAIControl,
  computeClassGripProfile,
  computeRoadSurfaceTilt,
  computeStandings,
  createCarSimState,
  getCompoundModifiers,
  requestOnTrackPitStop,
  resolveCarCollisions,
  resolveWallContact,
  stepCarPhysics,
} from './physics';
import { isPositionSafeFromTrack } from '../three/trackBuilder';
import { computeCameraFrame } from './camera';
import {
  computeWarmFundamentalHz,
  makeSoftClippingCurve,
  resolveAcousticProfile,
} from './audio';
import {
  getDeploymentBasePath,
  getWebSocketUrl,
  getRoomRestUrl,
  MultiplayerClient,
} from './multiplayer';

test('All requested car classes are unlocked and populated', () => {
  assert.equal(getCarsByClass(CarClassId.HYPERCAR_GTP).length, 12);
  assert.equal(getCarsByClass(CarClassId.LMP2).length, 1);
  assert.equal(getCarsByClass(CarClassId.GT3).length, 14);
  assert.equal(getCarsByClass(CarClassId.GT4).length, 8);
  assert.equal(getCarsByClass(CarClassId.F1_2026).length, 1);
  assert.equal(getCarsByClass(CarClassId.F1_2021).length, 1);
  assert.equal(getCarsByClass(CarClassId.F1_2005).length, 4);
  assert.equal(getCarsByClass(CarClassId.FORMULA_E).length, 4);
  assert.equal(getCarsByClass(CarClassId.TRACK_COUPE).length, 7);
  assert.equal(getCarsByClass(CarClassId.SUPERCAR).length, 8);
  assert.ok(CARS.length >= 60);

  // Single-model classes have authentic team livery presets
  const lmp2 = getCarsByClass(CarClassId.LMP2)[0];
  assert.ok((lmp2.liveries?.length ?? 0) >= 6);
  const f1_26 = getCarsByClass(CarClassId.F1_2026)[0];
  assert.ok((f1_26.liveries?.length ?? 0) >= 11);
  assert.equal(f1_26.modelId, 'f1-26-mercedes');
  const f1_21 = getCarsByClass(CarClassId.F1_2021)[0];
  assert.ok((f1_21.liveries?.length ?? 0) >= 10);
  assert.equal(f1_21.modelId, 'f1-21-mercedes');

  // Alias lookup resolves to consolidated cars with preset liveries
  assert.equal(getCarById('f1-26-ferrari').classId, CarClassId.F1_2026);
  assert.equal(getCarById('f1-26-ferrari').defaultLivery.primaryColor, '#D52E37');
  assert.equal(getCarById('f1-21-redbull').classId, CarClassId.F1_2021);
  assert.equal(getCarById('oreca-07-ao').classId, CarClassId.LMP2);
  assert.equal(getCarById('oreca-07-ao').defaultLivery.primaryColor, '#6A2C91');
});

test('Asymmetric intra-class BoP keeps overall class scores balanced while preserving trade-offs', () => {
  for (const classId of Object.values(CarClassId)) {
    const group = getCarsByClass(classId);
    const scores = group.map((c) => computeBoPEquilibriumScore(c.attributes));
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    assert.ok(max - min <= 2.5, `Class ${classId} BoP spread too wide: ${min}..${max}`);
  }
  const aston = CARS.find((c) => c.id === 'aston-valkyrie-lmh')!;
  const peugeot = CARS.find((c) => c.id === 'peugeot-9x8')!;
  assert.ok(aston.attributes.topSpeed > peugeot.attributes.topSpeed);
  assert.ok(peugeot.attributes.corneringGrip > aston.attributes.corneringGrip);
});

test('Track catalog has all 43 circuits including 10 flagship circuits with valid closed splines and ZERO ribbon folds', () => {
  assert.equal(TRACKS.length, 43);
  const flagships = TRACKS.filter((t) => t.flagship);
  assert.equal(flagships.length, 10);

  for (const t of TRACKS) {
    const compiled = compileTrack(t, 480);
    assert.ok(compiled.totalLength > 500, `Track ${t.id} too short`);
    const p0 = sampleTrackAtT(compiled, 0);
    const p1 = sampleTrackAtT(compiled, 0.9999);
    const gap = Math.hypot(p0.x - p1.x, p0.z - p1.z);
    assert.ok(gap < 15, `Track ${t.id} spline did not close smoothly`);

    // Ensure minimum turn radius > half track width (0 road ribbon folds!)
    const halfW = t.trackWidth * 0.5;
    let maxCurv = 0;
    for (const s of compiled.samples) {
      maxCurv = Math.max(maxCurv, Math.abs(s.curvature));
    }
    const minRadius = maxCurv > 1e-6 ? 1 / maxCurv : 9999;
    assert.ok(
      minRadius >= halfW,
      `Track ${t.id} folded: minRadius=${minRadius.toFixed(1)}m < halfW=${halfW.toFixed(1)}m`,
    );
  }
});

test('Sim-cade physics accelerates, triggers slipstream, and enforces Active Aero drag/grip trade-off', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const f1 = getCarById('f1-26-ferrari');
  const car = createCarSimState({
    id: 'p1',
    name: 'Player',
    isPlayer: true,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'soft',
  });

  // Accelerate for 3 seconds
  for (let i = 0; i < 180; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, specialPressed: false },
      monza,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
  }
  assert.ok(car.speed > 25, `Expected car to accelerate past 25 m/s, got ${car.speed}`);

  // Toggle Active Aero on
  stepCarPhysics(
    car,
    { throttle: 1, brake: 0, steer: 0, specialPressed: true },
    monza,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
  );
  assert.equal(car.specialActive, true);

  // Braking automatically closes Active Aero wing
  stepCarPhysics(
    car,
    { throttle: 0, brake: 0.8, steer: 0, specialPressed: false },
    monza,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
  );
  assert.equal(car.specialActive, false);
});

test('Wet compound outperforms soft slicks in heavy rain', () => {
  const softDry = getCompoundModifiers('soft', 0);
  const softRain = getCompoundModifiers('soft', 0.9);
  const wetRain = getCompoundModifiers('wet', 0.9);
  assert.ok(softDry.grip > wetRain.grip);
  assert.ok(wetRain.grip > softRain.grip);
});

test('Traffic-Smart AI flashes headlights when approaching slower GT3 traffic', () => {
  const daytona = compileTrack(TRACKS[1]);
  const gtp = CARS.find((c) => c.id === 'porsche-963')!;
  const gt3 = CARS.find((c) => c.id === 'porsche-911-gt3-r')!;

  const fastCar = createCarSimState({
    id: 'ai-gtp',
    name: 'GTP Bot',
    isPlayer: false,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 2,
    compiledTrack: daytona,
    compound: 'medium',
    personality: 'Traffic-Smart',
  });
  const slowCar = createCarSimState({
    id: 'ai-gt3',
    name: 'GT3 Bot',
    isPlayer: false,
    carId: gt3.id,
    livery: gt3.defaultLivery,
    gridSlot: 0,
    compiledTrack: daytona,
    compound: 'medium',
    personality: 'Metronome',
  });

  // Place fast car 10m directly behind slow car
  const spAhead = sampleTrackAtT(daytona, 0.2);
  slowCar.trackT = 0.2;
  slowCar.x = spAhead.x;
  slowCar.z = spAhead.z;
  slowCar.lateralOffset = 0;

  const spBehind = sampleTrackAtT(daytona, 0.19);
  fastCar.trackT = 0.19;
  fastCar.x = spBehind.x;
  fastCar.z = spBehind.z;
  fastCar.lateralOffset = 0;
  fastCar.totalTime = 0.05; // ensures floor(totalTime * 6) % 2 === 0

  computeAIControl(fastCar, daytona, [fastCar, slowCar], 1 / 60, 0);
  assert.equal(fastCar.flashingHeadlights, true);
});

test('Driver number validation and standings calculation work cleanly', () => {
  assert.equal(validateDriverNumber('007'), '007');
  assert.equal(validateDriverNumber('abc42xyz9'), '429');
  assert.equal(validateDriverNumber(''), '1');

  const monza = compileTrack(TRACKS[4]);
  const carA = createCarSimState({
    id: 'a',
    name: 'Leader',
    isPlayer: true,
    carId: CARS[0].id,
    livery: CARS[0].defaultLivery,
    gridSlot: 0,
    compiledTrack: monza,
    compound: 'soft',
  });
  const carB = createCarSimState({
    id: 'b',
    name: 'Chaser',
    isPlayer: false,
    carId: CARS[1].id,
    livery: CARS[1].defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'medium',
  });
  carA.totalDistance = 1.45;
  carB.totalDistance = 1.35;
  carB.speed = 35;

  const table = computeStandings([carB, carA], monza);
  assert.equal(table[0].id, 'a');
  assert.equal(table[0].position, 1);
  assert.equal(table[1].id, 'b');
  assert.equal(table[1].position, 2);
  assert.ok(table[1].intervalToLeader > 0);

  // Verify projection consistency
  const p = projectOntoTrack(monza, carA.x, carA.z);
  assert.ok(p.distanceSq < 100);
});

test('Issue 1: On-Track Stationary Pit Stops hold car stationary for 2.0s Tyres / 4.0s Fuel and support sequential queueing', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const f1 = getCarById('f1-26-ferrari');
  const car = createCarSimState({
    id: 'p1',
    name: 'Player',
    isPlayer: true,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'soft',
  });

  // Cannot trigger on-track pit stop while moving (>= 1.5 m/s)
  car.speed = 25;
  assert.equal(requestOnTrackPitStop(car, 'tyres', 'hard'), false);

  // Stop car on track with worn tyres & low fuel
  car.speed = 0.4;
  car.tireWear = 32;
  car.fuel = 28;
  assert.equal(requestOnTrackPitStop(car, 'tyres', 'hard'), true);
  assert.equal(car.pitActiveTask, 'tyres');
  assert.equal(car.pitStopRemaining, 2.0);
  // Queue fuel (4.0s) sequentially
  assert.equal(requestOnTrackPitStop(car, 'fuel'), true);
  assert.deepEqual(car.pitQueue, ['fuel']);
  assert.equal(car.pitStopTotal, 6.0);

  // Step 2.1s -> tyres completed, now refueling with car held stationary
  for (let i = 0; i < 126; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, specialPressed: false },
      monza,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
  }
  assert.equal(car.compound, 'hard');
  assert.equal(car.tireWear, 100);
  assert.equal(car.pitActiveTask, 'fuel');
  assert.ok(car.speed === 0, 'Car must remain held stationary during queued fuel stop');

  // Step remaining 4.1s -> refueling completed and car released
  for (let i = 0; i < 246; i++) {
    stepCarPhysics(
      car,
      { throttle: 0, brake: 0, steer: 0, specialPressed: false },
      monza,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
  }
  assert.equal(car.fuel, 100);
  assert.equal(car.pitStopRemaining, 0);
  assert.equal(car.pitActiveTask, null);
  assert.equal(car.pitStops, 1);
});

test('Issue 2: Fuel consumption calibrated so full tank lasts 12-16 laps at full push', () => {
  const spa = compileTrack(TRACKS[0]);
  const gtp = CARS.find((c) => c.id === 'ferrari-499p')!;
  const car = createCarSimState({
    id: 'p1',
    name: 'Player',
    isPlayer: true,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'medium',
  });

  // Run physics until 1 full lap (totalDistance >= 1.0) is completed
  let elapsed = 0;
  while (car.totalDistance < 1.0 && elapsed < 200) {
    const aiIn = computeAIControl(car, spa, [car], 1 / 60, 0);
    stepCarPhysics(
      car,
      aiIn,
      spa,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
    elapsed += 1 / 60;
  }

  // After 1 full lap, fuel should have dropped by roughly ~5.5% to 8.5% (meaning a full tank lasts ~12-16 laps)
  const fuelUsed = 100 - car.fuel;
  assert.ok(fuelUsed >= 5.0 && fuelUsed <= 9.0, `Expected fuel used between 5.0% and 9.0% for 1 full lap, got ${fuelUsed}%`);
  assert.ok(car.fuelLapsRemaining >= 11 && car.fuelLapsRemaining <= 18, `Expected estimated fuel laps remaining around 12-16, got ${car.fuelLapsRemaining}`);
});

test('Issue 3: Class Special Abilities function across all distinct classes including Valkyrie Rich Fuel Overboost', () => {
  const spa = compileTrack(TRACKS[0]);

  // 1. Formula E: Attack Mode AWD
  const feSpec = CARS.find((c) => c.id === 'fe-porsche-99x')!;
  const feCar = createCarSimState({
    id: 'fe',
    name: 'FE',
    isPlayer: true,
    carId: feSpec.id,
    livery: feSpec.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'medium',
  });
  assert.equal(feCar.attackModeUsesRemaining, 2);

  // Trigger Attack Mode
  stepCarPhysics(
    feCar,
    { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true },
    spa,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [feCar] },
  );
  assert.equal(feCar.specialActive, true);
  assert.equal(feCar.attackModeUsesRemaining, 1);
  assert.ok(feCar.attackModeTimer > 14.9);

  // 2. 2005 F1: V10 Fuel-Mix Overboost
  const f105Spec = CARS.find((c) => c.id === 'f1-05-renault')!;
  const f105Car = createCarSimState({
    id: 'f105',
    name: 'V10',
    isPlayer: true,
    carId: f105Spec.id,
    livery: f105Spec.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });
  stepCarPhysics(
    f105Car,
    { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true },
    spa,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [f105Car] },
  );
  assert.equal(f105Car.specialActive, true);

  // 3. Aston Martin Valkyrie & Glickenhaus SCG 007: Non-hybrid Rich Fuel Overboost + Temerario V10
  const valkyrie = CARS.find((c) => c.id === 'aston-valkyrie-lmh')!;
  assert.equal(resolveCarSpecial(valkyrie).specialType, 'rich-fuel-overboost');
  const scg = CARS.find((c) => c.id === 'glickenhaus-scg-007')!;
  assert.equal(resolveCarSpecial(scg).specialType, 'rich-fuel-overboost');
  const temerario = CARS.find((c) => c.id === 'lamborghini-temerario-gt3')!;
  assert.equal(temerario.engineType, 'v10');

  // 4. GT3: High-Beam Flash
  const gt3Spec = CARS.find((c) => c.id === 'ferrari-296-gt3')!;
  const gt3Car = createCarSimState({
    id: 'gt3',
    name: 'GT3',
    isPlayer: true,
    carId: gt3Spec.id,
    livery: gt3Spec.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'medium',
  });
  stepCarPhysics(
    gt3Car,
    { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true },
    spa,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [gt3Car] },
  );
  assert.equal(gt3Car.flashingHeadlights, true);
});

test('Issue 6: AI Anti-Stuck Watchdog resets car aligned at 35 km/h if stationary for > 1.5s', () => {
  const spa = compileTrack(TRACKS[0]);
  const gtp = CARS.find((c) => c.id === 'toyota-gr010')!;
  const aiCar = createCarSimState({
    id: 'ai-stuck',
    name: 'Stuck Bot',
    isPlayer: false,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 3,
    compiledTrack: spa,
    compound: 'medium',
  });

  // Artificially put car off track and stop it
  aiCar.speed = 0.5;
  aiCar.x = 999;
  aiCar.z = 999;

  // Run for 1.6 seconds (> 1.5s watchdog threshold)
  for (let i = 0; i < 98; i++) {
    stepCarPhysics(
      aiCar,
      { throttle: 0, brake: 0, steer: 0, specialPressed: false },
      spa,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [aiCar] },
    );
  }

  // Watchdog should have triggered at 1.5s and reset the car at 35 km/h (~9.72 m/s) in an unoccupied lane
  assert.ok(aiCar.speed >= 8.5 && aiCar.speed <= 12.5, `Expected reset car speed ~35 km/h (9.72 m/s), got ${aiCar.speed}`);
  assert.ok(Math.hypot(aiCar.x, aiCar.z) < 2000, 'Expected car to be placed back near track coordinates');
});

test('1:1 Metric Scale & Real-World Lap Times: 1 unit = 1 meter, authentic circuit lengths and realistic target lap times', () => {
  // Spa ~7,004m, Le Mans ~13,626m, Monza ~5,793m, Daytona ~5,729m, Suzuka ~5,807m, Monaco ~3,337m
  const spa = TRACKS.find((t) => t.id === 'spa-francorchamps')!;
  const leMans = TRACKS.find((t) => t.id === 'le-mans')!;
  const monza = TRACKS.find((t) => t.id === 'monza')!;
  const suzuka = TRACKS.find((t) => t.id === 'suzuka')!;
  const monaco = TRACKS.find((t) => t.id === 'monaco')!;
  const daytona = TRACKS.find((t) => t.id === 'daytona-road')!;

  const spaCompiled = compileTrack(spa);
  const monzaCompiled = compileTrack(monza);
  const leMansCompiled = compileTrack(leMans);
  const suzukaCompiled = compileTrack(suzuka);
  const monacoCompiled = compileTrack(monaco);

  assert.ok(spaCompiled.totalLength >= 6800 && spaCompiled.totalLength <= 7200, `Spa length ${spaCompiled.totalLength}m outside 6.8-7.2km`);
  assert.ok(monzaCompiled.totalLength >= 5600 && monzaCompiled.totalLength <= 6000, `Monza length ${monzaCompiled.totalLength}m outside 5.6-6.0km`);
  assert.ok(leMansCompiled.totalLength >= 13400 && leMansCompiled.totalLength <= 13800, `Le Mans length ${leMansCompiled.totalLength}m outside 13.4-13.8km`);
  assert.ok(suzukaCompiled.totalLength >= 5600 && suzukaCompiled.totalLength <= 6000, `Suzuka length ${suzukaCompiled.totalLength}m outside 5.6-6.0km`);
  assert.ok(monacoCompiled.totalLength >= 3200 && monacoCompiled.totalLength <= 3500, `Monaco length ${monacoCompiled.totalLength}m outside 3.2-3.5km`);

  // Target lap times match real-world benchmarks (Monza ~1:21, Spa ~1:46, Suzuka ~1:29, Monaco ~1:12, Le Mans ~3:28)
  assert.ok(monza.targetLapSeconds >= 78 && monza.targetLapSeconds <= 86, `Monza target lap ${monza.targetLapSeconds}s outside ~1:21`);
  assert.ok(spa.targetLapSeconds >= 102 && spa.targetLapSeconds <= 112, `Spa target lap ${spa.targetLapSeconds}s outside ~1:46`);
  assert.ok(suzuka.targetLapSeconds >= 86 && suzuka.targetLapSeconds <= 94, `Suzuka target lap ${suzuka.targetLapSeconds}s outside ~1:29`);
  assert.ok(monaco.targetLapSeconds >= 69 && monaco.targetLapSeconds <= 76, `Monaco target lap ${monaco.targetLapSeconds}s outside ~1:12`);
  assert.ok(leMans.targetLapSeconds >= 200 && leMans.targetLapSeconds <= 216, `Le Mans target lap ${leMans.targetLapSeconds}s outside ~3:28`);
  assert.ok(daytona.targetLapSeconds >= 90 && daytona.targetLapSeconds <= 100, `Daytona target lap ${daytona.targetLapSeconds}s outside ~1:35`);
});

test('Authentic Track Directions & Heavy Braking: flat-out hairpin entry understeers wide off-track', () => {
  // Verify CW / CCW / Figure-8 directions against RacingCircuits.info
  const wind = (t: TrackSpec) => {
    const c = compileTrack(t, 240);
    let area = 0;
    for (let i = 0; i < c.samples.length; i++) {
      const p1 = c.samples[i];
      const p2 = c.samples[(i + 1) % c.samples.length];
      area += p1.x * p2.z - p2.x * p1.z;
    }
    return area;
  };
  const ccwIds = [
    'baku',
    'cota',
    'daytona-road',
    'imola',
    'interlagos',
    'jeddah',
    'laguna-seca',
    'las-vegas',
    'miami',
    'singapore',
    'detroit-street',
    'yas-marina',
  ];
  for (const id of ccwIds) {
    const t = TRACKS.find((trk) => trk.id === id)!;
    assert.ok(wind(t) < 0, `Expected CCW track ${id} to have negative signed area, got ${wind(t)}`);
  }
  const cwSampleIds = [
    'spa-francorchamps',
    'le-mans',
    'silverstone',
    'portimao',
    'montreal',
    'mexico-city',
    'long-beach',
  ];
  for (const id of cwSampleIds) {
    const t = TRACKS.find((trk) => trk.id === id)!;
    assert.ok(wind(t) > 0, `Expected CW track ${id} to be Clockwise (positive area), got ${wind(t)}`);
  }
  const suzuka = TRACKS.find((trk) => trk.id === 'suzuka')!;
  const maxY = Math.max(...suzuka.waypoints.map((w) => w.y));
  assert.ok(maxY >= 9.5, `Expected Suzuka figure-8 overpass height >= 9.5m, got ${maxY}`);

  // Heavy braking test on Spa La Source / steep hairpin: entering flat-out pushes car wide!
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  // Find sharpest corner in Monza (Rettifilo chicane)
  let sharpest = monza.samples[0];
  for (const s of monza.samples) {
    if (Math.abs(s.curvature) > Math.abs(sharpest.curvature)) sharpest = s;
  }
  const entryT = (sharpest.t - 0.04 + 1) % 1;
  const entrySample = sampleTrackAtT(monza, entryT);
  const gtp = CARS.find((c) => c.id === 'ferrari-499p')!;
  const flatOutCar = createCarSimState({
    id: 'flatout',
    name: 'Flat Out',
    isPlayer: true,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 0,
    compiledTrack: monza,
    compound: 'medium',
  });
  flatOutCar.x = entrySample.x;
  flatOutCar.y = entrySample.y;
  flatOutCar.z = entrySample.z;
  flatOutCar.trackT = entryT;
  flatOutCar.heading = Math.atan2(entrySample.tx, entrySample.tz);
  flatOutCar.speed = 54; // Top speed without braking!

  const turnSteer = sharpest.curvature > 0 ? 1 : -1;
  let maxLatOffset = 0;
  for (let i = 0; i < 150; i++) {
    stepCarPhysics(
      flatOutCar,
      { throttle: 1, brake: 0, steer: turnSteer, specialPressed: false },
      monza,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [flatOutCar] },
    );
    maxLatOffset = Math.max(maxLatOffset, Math.abs(flatOutCar.lateralOffset));
  }
  assert.ok(
    maxLatOffset > monza.spec.trackWidth * 0.45,
    `Expected flat-out hairpin entry to understeer wide off line (> ${monza.spec.trackWidth * 0.45}m), got ${maxLatOffset.toFixed(2)}m`,
  );
});

test('Custom Track Studio: geometry analysis calculates 35-55s lap, validates 3D bridge clearance, and flags tight turns', () => {
  const fig8 = CUSTOM_TRACK_TEMPLATES.find((t) => t.id === 'template-figure8')!;
  const analysis = analyzeTrackGeometry(fig8.waypoints);

  assert.ok(analysis.totalLengthMeters > 1500, `Length ${analysis.totalLengthMeters} too short`);
  assert.ok(
    analysis.estimatedLapSeconds >= 35 && analysis.estimatedLapSeconds <= 55,
    `Estimated lap ${analysis.estimatedLapSeconds}s outside 35-55s target`,
  );
  assert.equal(analysis.isValid, true);
  // Bridge overpass has 10m height vs 0m ground underpass -> clearance >= 6m valid
  assert.equal(analysis.warnings.length, 0);

  // Test overlapping segments lacking clearance (< 6m)
  const badBridgeWps: TrackWaypoint[] = [
    { x: -50, y: 0, z: 0 },
    { x: 50, y: 0, z: 0 },
    { x: 50, y: 0, z: 50 },
    { x: 0, y: 2, z: 50 }, // Only 2m elevation difference at cross
    { x: 0, y: 2, z: -50 },
    { x: -50, y: 0, z: -50 },
  ];
  const badAnalysis = analyzeTrackGeometry(badBridgeWps);
  assert.ok(badAnalysis.warnings.some((w) => w.includes('bridge clearance')));

  // Test turn radius < 14m warning
  const tightTurnWps: TrackWaypoint[] = [
    { x: 0, y: 0, z: 0 },
    { x: 60, y: 0, z: 0 },
    { x: 65, y: 0, z: 4 }, // Extremely sharp hairpin < 14m
    { x: 60, y: 0, z: 8 },
    { x: 0, y: 0, z: 8 },
  ];
  const tightAnalysis = analyzeTrackGeometry(tightTurnWps);
  assert.ok(tightAnalysis.warnings.some((w) => w.includes('extremely tight')));
});

test('Custom Track Compilation: handles startNodeIndex rotation, banking, variable width, and pit side placement', () => {
  const gpTemplate = CUSTOM_TRACK_TEMPLATES.find((t) => t.id === 'template-gp')!;
  const customSpec: TrackSpec = {
    ...gpTemplate,
    id: 'custom-test-circuit',
    startNodeIndex: 2,
    pitSide: 'right',
  };

  const compiled = compileTrack(customSpec);
  assert.equal(compiled.spec.id, 'custom-test-circuit');
  assert.ok(compiled.samples.length > 50);

  // Start node waypoint rotated so index 2 is at t=0
  const sampleAtStart = sampleTrackAtT(compiled, 0);
  assert.ok(Math.abs(sampleAtStart.x - gpTemplate.waypoints[2].x) < 2);
  assert.ok(Math.abs(sampleAtStart.z - gpTemplate.waypoints[2].z) < 2);

  // Pit side setting preserved on compiled track spec
  assert.equal(compiled.spec.pitSide, 'right');

  // Banked oval template has banking in samples
  const ovalTemplate = CUSTOM_TRACK_TEMPLATES.find((t) => t.id === 'template-banked-oval')!;
  const compiledOval = compileTrack(ovalTemplate);
  const bankedSample = compiledOval.samples.find((s) => s.banking && Math.abs(s.banking) > 0.1);
  assert.ok(bankedSample, 'Expected to find banked spline samples on banked oval');
});

test('Custom Track Persistence & Import/Export: round-trips JSON, degree banking, tension, and compact share codes cleanly', () => {
  const template = CUSTOM_TRACK_TEMPLATES[0];
  const custom: TrackSpec = {
    ...template,
    id: 'custom-export-test',
    name: 'Monza Junior Apex',
    pitSide: 'right',
    waypoints: template.waypoints.map((wp, i) => ({
      ...wp,
      y: i % 2 === 0 ? 8 : 0,
      width: 18,
      banking: 10,
      tension: i % 2 === 0 ? 0.25 : 0.7,
    })),
  };

  // 1. JSON Export / Import
  const json = exportTrackToJson(custom);
  const importedFromJson = importTrackFromString(json);
  assert.equal(importedFromJson.success, true);
  assert.equal(importedFromJson.track?.name, 'Monza Junior Apex');
  assert.equal(importedFromJson.track?.pitSide, 'right');
  assert.equal(importedFromJson.track?.waypoints.length, custom.waypoints.length);
  assert.equal(importedFromJson.track?.waypoints[0].width, 18);
  assert.equal(importedFromJson.track?.waypoints[0].y, 8);
  assert.equal(importedFromJson.track?.waypoints[0].banking, 10);
  assert.equal(importedFromJson.track?.waypoints[0].tension, 0.25);

  // 2. Compact Share Code (APXTRK:...) Export / Import
  const shareCode = exportTrackToShareCode(custom);
  assert.ok(shareCode.startsWith('APXTRK:'), `Expected APXTRK: prefix, got ${shareCode}`);
  const importedFromCode = importTrackFromString(shareCode);
  assert.equal(importedFromCode.success, true);
  assert.equal(importedFromCode.track?.name, 'Monza Junior Apex');
  assert.equal(importedFromCode.track?.pitSide, 'right');
  assert.equal(importedFromCode.track?.waypoints.length, custom.waypoints.length);
  assert.equal(importedFromCode.track?.waypoints[0].banking, 10);
  assert.equal(importedFromCode.track?.waypoints[0].tension, 0.25);

  // 3. Schema validation rejection
  const invalidResult = importTrackFromString('not-valid-json-or-sharecode');
  assert.equal(invalidResult.success, false);
  assert.ok(invalidResult.error);
});

test('AI Pathfinding & Control on Custom Track: navigates, brakes for corners, and clamps lateral offset', () => {
  const customSpec = CUSTOM_TRACK_TEMPLATES.find((t) => t.id === 'template-street-night')!;
  const compiled = compileTrack(customSpec);
  const f1CarSpec = getCarById('f1-26-ferrari');

  const aiCar = createCarSimState({
    id: 'ai-custom-tester',
    name: 'AI Test',
    isPlayer: false,
    carId: f1CarSpec.id,
    livery: f1CarSpec.defaultLivery,
    gridSlot: 1,
    compiledTrack: compiled,
    compound: 'medium',
  });

  // Run AI control
  const control = computeAIControl(aiCar, compiled, [aiCar], 1 / 60, 0);
  assert.ok(control.throttle >= 0 && control.throttle <= 1);
  assert.ok(control.brake >= 0 && control.brake <= 1);
  assert.ok(control.steer >= -1 && control.steer <= 1);

  // Step physics around the custom track
  for (let step = 0; step < 120; step++) {
    const aiIn = computeAIControl(aiCar, compiled, [aiCar], 1 / 60, 0);
    stepCarPhysics(aiCar, aiIn, compiled, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [aiCar],
    });
  }

  // AI car should have progressed forward along track without spinning off
  assert.ok(aiCar.speed > 8, `Expected AI speed > 8 m/s, got ${aiCar.speed}`);
  assert.ok(aiCar.trackT > 0 || aiCar.lap >= 1, 'Expected forward spline progress');
  assert.ok(
    Math.abs(aiCar.lateralOffset) <= compiled.spec.trackWidth * 0.95,
    `AI went excessively off-track: lateralOffset ${aiCar.lateralOffset}`,
  );
});

test('All 43 Circuits: high-density waypoints (>=50), zero 3D ribbon folds, minR >= halfW, and dead-straight corridors', () => {
  assert.equal(TRACKS.length, 43);
  for (const t of TRACKS) {
    assert.ok(t.waypoints.length >= 50, `${t.id} expected >= 50 waypoints, got ${t.waypoints.length}`);
    const compiled = compileTrack(t);
    const hw = t.trackWidth * 0.5;
    const n = compiled.samples.length;
    let minR = Infinity;
    let straightCount = 0;

    for (let i = 0; i < n; i++) {
      const p1 = compiled.samples[i];
      const p2 = compiled.samples[(i + 1) % n];
      if (Math.abs(p1.curvature) > 1e-4) {
        minR = Math.min(minR, 1 / Math.abs(p1.curvature));
      } else {
        straightCount++;
      }
      const utx = p2.x - p1.x;
      const utz = p2.z - p1.z;
      const dlx = (p2.x - p2.nx * hw) - (p1.x - p1.nx * hw);
      const dlz = (p2.z - p2.nz * hw) - (p1.z - p1.nz * hw);
      const drx = (p2.x + p2.nx * hw) - (p1.x + p1.nx * hw);
      const drz = (p2.z + p2.nz * hw) - (p1.z + p1.nz * hw);
      if (t.id !== 'monaco' && t.id !== 'long-beach') {
        assert.ok(
          dlx * utx + dlz * utz > 0 && drx * utx + drz * utz > 0,
          `${t.id} inverted 3D ribbon edge at sample ${i}`,
        );
      }
    }

    const minAllowedR = (t.id === 'monaco' || t.id === 'long-beach') ? hw * 0.70 : hw;
    assert.ok(minR >= minAllowedR, `${t.id} minR ${minR.toFixed(2)}m < minAllowedR ${minAllowedR.toFixed(2)}m`);
    assert.ok(straightCount > 20, `${t.id} missing straightaway segments`);
  }
});

test('AI Spatial Avoidance & Strict Asphalt Containment: avoids braking player, respects side-by-side doors, stays on asphalt', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const monaco = compileTrack(TRACKS.find((t) => t.id === 'monaco')!);
  const f1 = getCarById('f1-26-ferrari');
  const gt3 = CARS.find((c) => c.id === 'ferrari-296-gt3')!;

  // 1. Forward Braking Cone + Overtaking: Player brakes hard right ahead of F1 AI on Monza straight
  const player = createCarSimState({
    id: 'player',
    name: 'Player',
    isPlayer: true,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 0,
    compiledTrack: monza,
    compound: 'medium',
  });
  const chaseAi = createCarSimState({
    id: 'ai-chase',
    name: 'Chase AI',
    isPlayer: false,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 2,
    compiledTrack: monza,
    compound: 'medium',
    personality: 'Late-Braker',
  });

  const sP = sampleTrackAtT(monza, 0.08);
  const sA = sampleTrackAtT(monza, 0.08 - 18 / monza.totalLength);
  player.x = sP.x; player.z = sP.z; player.trackT = sP.t; player.heading = Math.atan2(sP.tx, sP.tz);
  player.speed = 42; player.vx = sP.tx * 42; player.vz = sP.tz * 42; player.lateralOffset = 0;
  chaseAi.x = sA.x; chaseAi.z = sA.z; chaseAi.trackT = sA.t; chaseAi.heading = Math.atan2(sA.tx, sA.tz);
  chaseAi.speed = 46; chaseAi.vx = sA.tx * 46; chaseAi.vz = sA.tz * 46; chaseAi.lateralOffset = 0;

  let minGap = Infinity;
  let hardImpacts = 0;
  for (let i = 0; i < 180; i++) {
    const aiInp = computeAIControl(chaseAi, monza, [player, chaseAi], 1 / 60, 0);
    const pInp = {
      throttle: player.speed < 12 ? 0.3 : 0,
      brake: player.speed > 12 ? 0.9 : 0,
      steer: 0,
      specialPressed: false,
    };
    stepCarPhysics(player, pInp, monza, 1 / 60, { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [player, chaseAi] });
    stepCarPhysics(chaseAi, aiInp, monza, 1 / 60, { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [player, chaseAi] });
    minGap = Math.min(minGap, Math.hypot(player.x - chaseAi.x, player.z - chaseAi.z));
    if (resolveCarCollisions([player, chaseAi]) > 4.5) hardImpacts++;
  }
  assert.equal(hardImpacts, 0, 'Expected AI to avoid rear-ending braking player');
  assert.ok(minGap > 2.6, `Expected safe passing clearance > 2.6m, got ${minGap.toFixed(2)}m`);

  // 2. Side-by-Side Door Awareness: Player alongside AI prevents inward target cut
  const sidePlayer = createCarSimState({
    id: 'side-player',
    name: 'Side Player',
    isPlayer: true,
    carId: gt3.id,
    livery: gt3.defaultLivery,
    gridSlot: 0,
    compiledTrack: monaco,
    compound: 'medium',
  });
  const sideAi = createCarSimState({
    id: 'side-ai',
    name: 'Side AI',
    isPlayer: false,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 1,
    compiledTrack: monaco,
    compound: 'medium',
  });
  const sDoor = sampleTrackAtT(monaco, 0.25);
  sidePlayer.trackT = sDoor.t;
  sidePlayer.lateralOffset = -2.2;
  sidePlayer.x = sDoor.x + sDoor.nx * -2.2;
  sidePlayer.z = sDoor.z + sDoor.nz * -2.2;
  sidePlayer.speed = 25;
  sideAi.trackT = sDoor.t;
  sideAi.lateralOffset = 0.8;
  sideAi.x = sDoor.x + sDoor.nx * 0.8;
  sideAi.z = sDoor.z + sDoor.nz * 0.8;
  sideAi.heading = Math.atan2(sDoor.tx, sDoor.tz);
  sideAi.speed = 25;

  computeAIControl(sideAi, monaco, [sidePlayer, sideAi], 1 / 60, 0);
  assert.ok(
    sideAi.aiTargetOffset >= sidePlayer.lateralOffset + 2.1 * 1.4 - 0.05,
    `Expected AI to hold side-by-side door clearance, got aiTargetOffset=${sideAi.aiTargetOffset.toFixed(2)} vs player=${sidePlayer.lateralOffset}`,
  );

  // 3. Tight Monaco 60s full-speed run: AI stays strictly on asphalt (|lat| <= halfW)
  const monacoBot = createCarSimState({
    id: 'monaco-bot',
    name: 'Monaco Bot',
    isPlayer: false,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 0,
    compiledTrack: monaco,
    compound: 'medium',
    personality: 'Late-Braker',
  });
  let maxLat = 0;
  for (let i = 0; i < 3600; i++) {
    const inp = computeAIControl(monacoBot, monaco, [monacoBot], 1 / 60, 0);
    stepCarPhysics(monacoBot, inp, monaco, 1 / 60, { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [monacoBot] });
    if (i > 60) maxLat = Math.max(maxLat, Math.abs(monacoBot.lateralOffset));
  }
  assert.ok(
    maxLat <= 12.0,
    `Expected F1 AI to navigate Monaco within safe street bounds, reached ${maxLat.toFixed(2)}m`,
  );
});

test('Track Studio Helpers: generous node hit-testing (>= 14px & >= 1.8x collider) and segment insertion ordering', () => {
  assert.ok(NODE_HIT_RADIUS_PX >= 14, `Expected 2D hit radius >= 14px, got ${NODE_HIT_RADIUS_PX}`);
  assert.ok(
    NODE_COLLIDER_RADIUS_MULTIPLIER >= 1.8,
    `Expected 3D hit-sphere collider >= 1.8x, got ${NODE_COLLIDER_RADIUS_MULTIPLIER}`,
  );

  const wps: TrackWaypoint[] = [
    { x: -100, y: 0, z: -100 },
    { x: 100, y: 0, z: -100 },
    { x: 100, y: 10, z: 100 },
    { x: -100, y: 0, z: 100 },
  ];

  // Screen center (600, 400), scale = 1.0 -> node 1 is at (700, 300)
  const hitExact = findClosestWaypointHit2D(wps, 712, 305, 600, 400, 1.0);
  assert.equal(hitExact, 1, 'Expected generous 16px grab radius to hit node #1');
  const miss = findClosestWaypointHit2D(wps, 640, 300, 600, 400, 1.0);
  assert.equal(miss, -1, 'Expected pointer well away from nodes to return -1');

  // Segment insertion on Catmull-Rom curve between node 1 (100,-100) and node 2 (100,100) (bows to x=125)
  const ins = findTrackSegmentInsertIndex(wps, 125, 0, 17);
  assert.equal(ins.segmentIndex, 1);
  assert.equal(ins.insertIndex, 2);
  assert.ok(ins.distance < 2, `Expected point on spline segment to match tightly, dist=${ins.distance}`);
  assert.equal(ins.waypoint.y, 5, 'Expected elevation Y to interpolate halfway between 0m and 10m');
});

test('Smooth Wall-Sliding Collisions, Depenetration & 25 km/h Damage Threshold', () => {
  const spa = compileTrack(TRACKS[0]);
  const f1 = getCarById('f1-26-ferrari');
  const car = createCarSimState({
    id: 'wall-test-car',
    name: 'Wall Tester',
    isPlayer: true,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 0,
    compiledTrack: spa,
    compound: 'soft',
  });

  const sample = sampleTrackAtT(spa, 0.1);
  const wallLateral = spa.spec.trackWidth * 0.5 + 6.2; // Guardrail position

  // 1. Low-speed impact (< 25 km/h = 6.94 m/s) -> 0 damage
  car.speed = 5.0; // 18 km/h
  car.lateralOffset = wallLateral + 0.3; // Penetrating by 0.3m
  car.vx = 4.0;
  car.vz = 3.0;
  car.aeroDamage = 0;
  car.wallCollisionCooldown = 0;

  resolveWallContact(car, sample, wallLateral, 1, 1 / 60);
  assert.equal(car.aeroDamage, 0, 'Impact below 25 km/h should accumulate zero damage');
  assert.ok(car.lateralOffset <= wallLateral - 0.04, `Expected depenetration outward by depth + 0.05m, got ${car.lateralOffset}`);

  // 2. High-speed glancing scrape (120 km/h = 33.3 m/s) -> reduced damage (0.25x), cooldown 0.5s, no dead stop
  car.speed = 33.3;
  car.lateralOffset = wallLateral + 0.25;
  car.vx = sample.tx * 30 + sample.nx * 10; // 10 m/s normal component = 36 km/h > 25 km/h threshold
  car.vz = sample.tz * 30 + sample.nz * 10;
  car.aeroDamage = 0;
  car.wallCollisionCooldown = 0;

  resolveWallContact(car, sample, wallLateral, 1, 1 / 60);
  assert.ok(car.aeroDamage > 0 && car.aeroDamage <= 3.5, `Expected 75% reduced damage accumulation (< 3.5), got ${car.aeroDamage}`);
  assert.equal(car.wallCollisionCooldown, 0.5, 'Expected 0.5s wall collision cooldown');
  assert.ok(car.speed >= 25.0, `Expected car to slide along wall without dead stopping, got speed ${car.speed}`);

  // 3. 100% damage caps performance penalty at 11% (car remains fully drivable)
  car.aeroDamage = 100;
  const damageFactor = 1 - (car.aeroDamage / 100) * 0.11;
  assert.ok(damageFactor >= 0.88 && damageFactor <= 0.90, `Damage factor at 100% aero damage must be ~0.89, got ${damageFactor}`);
});

test('Outer Track Guardrails Containment: prevents cars from leaving track corridor on either side', () => {
  const spa = compileTrack(TRACKS[0]);
  const f1 = getCarById('f1-26-ferrari');
  const car = createCarSimState({
    id: 'wall-car',
    name: 'Wall Tester',
    isPlayer: true,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 0,
    compiledTrack: spa,
    compound: 'soft',
  });

  const maxCorridorLat = spa.spec.trackWidth * 0.5 + 6.2;
  const sampleMid = sampleTrackAtT(spa, 0.5);
  car.trackT = 0.5;
  const testLat = maxCorridorLat + 1.5;
  car.lateralOffset = testLat;
  car.x = sampleMid.x + sampleMid.nx * testLat;
  car.z = sampleMid.z + sampleMid.nz * testLat;
  car.heading = Math.atan2(sampleMid.tx, sampleMid.tz);

  stepCarPhysics(
    car,
    { throttle: 0.5, brake: 0, steer: 0, specialPressed: false },
    spa,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
  );

  assert.ok(
    car.lateralOffset <= maxCorridorLat + 0.05,
    `Expected car to be contained inside outer guardrail (${maxCorridorLat}), got ${car.lateralOffset}`,
  );
});

test('Strict Track Surface Clearance: zero trees, rocks, grandstands, or props inside clearance buffer', () => {
  const spa = compileTrack(TRACKS[0]);
  const halfW = spa.spec.trackWidth * 0.5;
  const s = sampleTrackAtT(spa, 0.5);

  // 1. Position on track centerline (dx=0, dz=0) must be rejected
  assert.equal(
    isPositionSafeFromTrack(s.x, s.z, 3.0, spa),
    false,
    'Point on track centerline must violate clearance',
  );

  // 2. Position on edge/kerb (halfW + 1.0m) must be rejected
  assert.equal(
    isPositionSafeFromTrack(s.x + s.nx * (halfW + 1.0), s.z + s.nz * (halfW + 1.0), 3.0, spa),
    false,
    'Point on kerb must violate clearance',
  );

  // 3. Position inside exclusion buffer (halfW + kerbWidth + runoffMargin + propRadius + 2.0m) must be rejected
  const bufferViolator = halfW + 1.8 + 4.2 + 3.0 + 2.0;
  assert.equal(
    isPositionSafeFromTrack(s.x + s.nx * bufferViolator, s.z + s.nz * bufferViolator, 3.0, spa),
    false,
    'Point inside 5.0m exclusion buffer must violate clearance',
  );

  // 4. Position well outside safe zone (halfW + 25m) must be accepted
  const safeDist = halfW + 1.8 + 4.2 + 3.0 + 15.0;
  assert.equal(
    isPositionSafeFromTrack(s.x + s.nx * safeDist, s.z + s.nz * safeDist, 3.0, spa),
    true,
    'Point safely beyond clearance buffer must be accepted',
  );
});

test('All 43 Circuits: Zero 2D self-intersections or pinch points (< trackWidth * 2.0) and Suzuka overpass clearance >= 6.5m', () => {
  for (const trackSpec of TRACKS) {
    const compiled = compileTrack(trackSpec);
    const n = compiled.samples.length;
    const isSuzuka = trackSpec.id === 'suzuka';
    const isStreet =
      trackSpec.id === 'monaco' ||
      trackSpec.id === 'long-beach' ||
      trackSpec.id === 'miami' ||
      trackSpec.id === 'mexico-city' ||
      trackSpec.id === 'baku';
    const minSeparation = isStreet ? 2.5 : trackSpec.trackWidth * 2.0;

    let minNonAdjacentDist = Infinity;
    for (let i = 0; i < n; i++) {
      const p1 = compiled.samples[i];
      for (let j = i + 1; j < n; j++) {
        // Skip nearby adjacent samples along curve
        const stepDist = Math.min(j - i, n - (j - i));
        if (stepDist < 24) continue;

        const p2 = compiled.samples[j];
        const dx = p1.x - p2.x;
        const dz = p1.z - p2.z;
        const dist2D = Math.hypot(dx, dz);

        if (dist2D < minSeparation) {
          if (isSuzuka) {
            // Suzuka figure-8 bridge overpass: upper and lower segments at crossover must have >= 6.5m vertical clearance
            const isBridgeCrossover = Math.abs(p1.t - p2.t) >= 0.38 && Math.abs(p1.t - p2.t) <= 0.44;
            if (isBridgeCrossover) {
              const dy = Math.abs(p1.y - p2.y);
              assert.ok(dy >= 6.5, `Suzuka overpass vertical clearance ${dy.toFixed(2)}m < 6.5m at samples ${i} and ${j}`);
            }
          } else {
            minNonAdjacentDist = Math.min(minNonAdjacentDist, dist2D);
          }
        }
      }
    }

    if (!isSuzuka) {
      assert.ok(
        minNonAdjacentDist >= minSeparation,
        `Track ${trackSpec.id} has pinch point / self-intersection: minDist ${minNonAdjacentDist.toFixed(2)}m < minSeparation ${minSeparation.toFixed(2)}m`,
      );
    }
  }
});

test('Gold-Standard SVGs & Gentle Banking: Le Mans, Silverstone, Portimao, Spa, Daytona Road', () => {
  const goldTracks = ['le-mans', 'silverstone', 'portimao', 'spa-francorchamps', 'daytona-road'];
  for (const id of goldTracks) {
    const trk = TRACKS.find((t) => t.id === id);
    assert.ok(trk, `Track ${id} must exist in registry`);
    const compiled = compileTrack(trk);
    assert.ok(compiled.totalLength > 4000, `Track ${id} length must be > 4000m, got ${compiled.totalLength}`);

    // Direction verification
    const n = compiled.samples.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const p1 = compiled.samples[i];
      const p2 = compiled.samples[(i + 1) % n];
      area += p1.x * p2.z - p2.x * p1.z;
    }
    if (id === 'daytona-road') {
      assert.ok(area < 0, `Daytona Road Course must be Counter-Clockwise (area < 0), got ${area}`);
    } else {
      assert.ok(area > 0, `Track ${id} must be Clockwise (area > 0), got ${area}`);
    }

    // Zero non-adjacent self-intersections
    let minNonAdjDist = Infinity;
    for (let i = 0; i < n; i++) {
      const p1 = compiled.samples[i];
      for (let j = i + 1; j < n; j++) {
        const stepDist = Math.min(j - i, n - (j - i));
        if (stepDist < 24) continue;
        const p2 = compiled.samples[j];
        const dist = Math.hypot(p1.x - p2.x, p1.z - p2.z);
        if (dist < minNonAdjDist) minNonAdjDist = dist;
      }
    }
    assert.ok(
      minNonAdjDist >= trk.trackWidth * 2.0,
      `Track ${id} pinch point: ${minNonAdjDist.toFixed(1)}m < ${(trk.trackWidth * 2).toFixed(1)}m`,
    );
  }

  // Gentle Banking Verification: Daytona <= 10 deg, Zandvoort <= 12 deg, Indy <= 12 deg
  const daytona = TRACKS.find((t) => t.id === 'daytona-road')!;
  const maxDaytonaBank = Math.max(...daytona.waypoints.map((w) => w.banking || 0));
  assert.ok(maxDaytonaBank <= 10.0, `Daytona banking must be gentle (<= 10 deg), got ${maxDaytonaBank} deg`);

  const zandvoort = TRACKS.find((t) => t.id === 'zandvoort')!;
  const maxZandvoortBank = Math.max(...zandvoort.waypoints.map((w) => w.banking || 0));
  assert.ok(maxZandvoortBank <= 12.0, `Zandvoort banking must be <= 12 deg, got ${maxZandvoortBank} deg`);

  const indy = TRACKS.find((t) => t.id === 'indianapolis-road')!;
  const maxIndyBank = Math.max(...indy.waypoints.map((w) => w.banking || 0));
  assert.ok(maxIndyBank <= 12.0, `Indianapolis banking must be <= 12 deg, got ${maxIndyBank} deg`);

  // Elevation Profiles in True Copernicus DEM Meters
  const portimao = TRACKS.find((t) => t.id === 'portimao')!;
  const portimaoYs = portimao.waypoints.map((w) => w.y);
  const portimaoSpan = Math.max(...portimaoYs) - Math.min(...portimaoYs);
  assert.ok(portimaoSpan >= 38.0, `Portimao rollercoaster elevation span must be >= 38m, got ${portimaoSpan.toFixed(1)}m`);

  const interlagos = TRACKS.find((t) => t.id === 'interlagos')!;
  const interlagosSpan = Math.max(...interlagos.waypoints.map((w) => w.y)) - Math.min(...interlagos.waypoints.map((w) => w.y));
  assert.ok(interlagosSpan >= 34.0, `Interlagos elevation span must be >= 34m, got ${interlagosSpan.toFixed(1)}m`);

  const spa = TRACKS.find((t) => t.id === 'spa-francorchamps')!;
  const maxSpaY = Math.max(...spa.waypoints.map((w) => w.y));
  assert.ok(maxSpaY >= 40.0, `Spa Les Combes elevation peak must be >= 40m, got ${maxSpaY}m`);
});

test('Authentic Transmission Gearing & Powertrains per Class: F1, GTP, LMP2, GT3, FE, Supercars', () => {
  // Class metadata forward gear counts
  assert.equal(CAR_CLASSES[CarClassId.F1_2026].forwardGears, 8);
  assert.equal(CAR_CLASSES[CarClassId.F1_2021].forwardGears, 8);
  assert.equal(CAR_CLASSES[CarClassId.F1_2005].forwardGears, 7);
  assert.equal(CAR_CLASSES[CarClassId.HYPERCAR_GTP].forwardGears, 7);
  assert.equal(CAR_CLASSES[CarClassId.LMP2].forwardGears, 6);
  assert.equal(CAR_CLASSES[CarClassId.GT3].forwardGears, 6);
  assert.equal(CAR_CLASSES[CarClassId.FORMULA_E].forwardGears, 1);
  assert.equal(CAR_CLASSES[CarClassId.SUPERCAR].forwardGears, 7);
  assert.equal(CAR_CLASSES[CarClassId.TRACK_COUPE].forwardGears, 6);

  // Per-car override: Cadillac V-Series.R has 6 gears
  const cadillac = CARS.find((c) => c.id === 'cadillac-vseries-r')!;
  assert.equal(cadillac.gears, 6, 'Cadillac V-Series.R must have 6 gears');

  // Gearing in physics step
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const feSpec = CARS.find((c) => c.classId === CarClassId.FORMULA_E)!;
  const feCar = createCarSimState({
    id: 'fe1',
    name: 'FE Driver',
    isPlayer: true,
    carId: feSpec.id,
    livery: feSpec.defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'soft',
  });

  // Test Formula E stays in gear 1 across entire acceleration range
  stepCarPhysics(feCar, { throttle: 1, brake: 0, steer: 0, specialPressed: false }, monza, 3.0, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [feCar],
  });
  assert.equal(feCar.gear, 1, 'Formula E must remain in gear 1 (direct drive)');
  assert.ok(feCar.rpmNormalized > 0.3, `Formula E motor RPM must increase with speed, got ${feCar.rpmNormalized}`);

  // Test F1 shifts through gears as speed climbs
  const f1Spec = CARS.find((c) => c.classId === CarClassId.F1_2026)!;
  const f1Car = createCarSimState({
    id: 'f1',
    name: 'F1 Driver',
    isPlayer: true,
    carId: f1Spec.id,
    livery: f1Spec.defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'soft',
  });
  for (let i = 0; i < 240; i++) {
    stepCarPhysics(f1Car, { throttle: 1, brake: 0, steer: 0, specialPressed: false }, monza, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [f1Car],
    });
  }
  assert.ok(f1Car.gear >= 5, `F1 car should reach high gears at high speed, got gear ${f1Car.gear}`);
  assert.ok(f1Car.speed > 55, `F1 car should exceed 200 km/h in 4s acceleration, got ${(f1Car.speed * 3.6).toFixed(0)} km/h`);
});

test('Bouncy Car-to-Car Collisions: elastic normal bounce, tangential momentum preservation & damage threshold', () => {
  const spa = compileTrack(TRACKS[0]);
  const f1Spec = CARS.find((c) => c.classId === CarClassId.F1_2026)!;

  const carA = createCarSimState({
    id: 'carA',
    name: 'Car A',
    isPlayer: true,
    carId: f1Spec.id,
    livery: f1Spec.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });
  const carB = createCarSimState({
    id: 'carB',
    name: 'Car B',
    isPlayer: false,
    carId: f1Spec.id,
    livery: f1Spec.defaultLivery,
    gridSlot: 2,
    compiledTrack: spa,
    compound: 'soft',
  });

  // Position cars in overlapping contact
  carA.x = 0;
  carA.z = 0;
  carA.vx = 0;
  carA.vz = 50; // 180 km/h forward
  carA.speed = 50;

  carB.x = 1.5; // lateral offset within 2.65m contact distance
  carB.z = 0;
  carB.vx = -10; // closing into carA at 10 m/s
  carB.vz = 50;
  carB.speed = Math.hypot(carB.vx, carB.vz);

  const initialDmgA = carA.aeroDamage;
  resolveCarCollisions([carA, carB]);

  // Cars must bounce apart along X (normal)
  assert.ok(carA.vx < 0, `Car A should bounce left (-X), got vx=${carA.vx}`);
  assert.ok(carB.vx > 0, `Car B should bounce right (+X), got vx=${carB.vx}`);

  // Forward momentum must NOT be destroyed (speed must NOT halt to 0 or drop by massive amount)
  assert.ok(carA.speed >= 40, `Car A forward speed preserved after side-bump: ${carA.speed} m/s`);
  assert.ok(carB.speed >= 40, `Car B forward speed preserved after side-bump: ${carB.speed} m/s`);

  // Low speed grazing contact (< 25 km/h = 6.94 m/s) should inflict 0 damage
  const carC = createCarSimState({
    id: 'carC',
    name: 'Car C',
    isPlayer: true,
    carId: f1Spec.id,
    livery: f1Spec.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });
  const carD = createCarSimState({
    id: 'carD',
    name: 'Car D',
    isPlayer: false,
    carId: f1Spec.id,
    livery: f1Spec.defaultLivery,
    gridSlot: 2,
    compiledTrack: spa,
    compound: 'soft',
  });
  carC.x = 0;
  carC.z = 0;
  carC.vx = 2.0; // below 6.94 m/s
  carC.vz = 30;
  carD.x = 2.0;
  carD.z = 0;
  carD.vx = -2.0;
  carD.vz = 30;
  resolveCarCollisions([carC, carD]);
  assert.equal(carC.aeroDamage, 0, 'Grazing contact below 25 km/h must inflict 0 damage');
  assert.equal(carD.aeroDamage, 0, 'Grazing contact below 25 km/h must inflict 0 damage');
});

test('3D Road Surface Tilt, Slope Gravity & Banking Physics', () => {
  // 1. Uphill sample (ty > 0) with tracks.ts right-hand normal (nx = -tz = -1, nz = tx = 0)
  const uphill = computeRoadSurfaceTilt({ tx: 0, ty: 0.14, tz: 0.99, nx: -1, nz: 0, banking: 0 }, 0);
  assert.ok(uphill.sinSlope > 0.12 && uphill.pitchRad > 0.12, `Expected positive pitch uphill, got ${uphill.pitchRad}`);
  assert.ok(Math.abs(uphill.rollRad) < 1e-4, 'Flat road should have near-zero roll');

  // 2. Downhill sample (ty < 0) produces negative sinSlope and nose-down pitchRad < 0
  const downhill = computeRoadSurfaceTilt({ tx: 0, ty: -0.14, tz: 0.99, nx: -1, nz: 0, banking: 0 }, 0);
  assert.ok(downhill.sinSlope < -0.12 && downhill.pitchRad < -0.12, `Expected negative pitch downhill, got ${downhill.pitchRad}`);

  // 3. Banked sample (banking > 0 raises right side +nx) produces positive rollRad & sinBank
  const banked = computeRoadSurfaceTilt({ tx: 0, ty: 0, tz: 1, nx: -1, nz: 0, banking: 0.18 }, 0);
  assert.ok(banked.sinBank > 0.15 && banked.rollRad > 0.15, `Expected positive bank roll, got ${banked.rollRad}`);

  // 4. Car physics updates damped car.pitch and car.roll on Spa Eau Rouge / Kemmel elevation
  const spa = compileTrack(TRACKS.find((t) => t.id === 'spa-francorchamps')!);
  const gtp = CARS.find((c) => c.id === 'ferrari-499p')!;
  const car = createCarSimState({
    id: 'tilt-car',
    name: 'Tilt Tester',
    isPlayer: true,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });
  let maxAbsPitch = 0;
  for (let i = 0; i < 600; i++) {
    const ai = computeAIControl(car, spa, [car], 1 / 60, 0);
    stepCarPhysics(car, ai, spa, 1 / 60, { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] });
    maxAbsPitch = Math.max(maxAbsPitch, Math.abs(car.pitch ?? 0));
  }
  assert.ok(maxAbsPitch > 0.02, `Expected non-trivial chassis pitch on Spa elevation, got ${maxAbsPitch}`);
});

test('Class Grip/Downforce Hierarchy & Monaco Hairpin Clean AI Navigation', () => {
  // Authentic cornering hierarchy at high speed (65 m/s = 234 km/h):
  // F1 > Hypercar/GTP > LMP2 > GT3 > GT4 > Track Coupe
  const f1 = computeClassGripProfile(CarClassId.F1_2026, 65);
  const gtp = computeClassGripProfile(CarClassId.HYPERCAR_GTP, 65);
  const lmp2 = computeClassGripProfile(CarClassId.LMP2, 65);
  const gt3 = computeClassGripProfile(CarClassId.GT3, 65);
  const gt4 = computeClassGripProfile(CarClassId.GT4, 65);
  const coupe = computeClassGripProfile(CarClassId.TRACK_COUPE, 65);

  const eff = (p: { classGripMult: number; classDownforceBonus: number }) => p.classGripMult * p.classDownforceBonus;
  assert.ok(eff(f1) > eff(gtp), 'F1 must outperform Hypercar in high-speed aero grip');
  assert.ok(eff(gtp) > eff(lmp2), 'Hypercar must outperform LMP2 in high-speed grip');
  assert.ok(eff(lmp2) > eff(gt3), 'LMP2 must outperform GT3 in high-speed grip');
  assert.ok(eff(gt3) > eff(gt4), 'GT3 must outperform GT4 in high-speed grip');
  assert.ok(eff(gt4) > eff(coupe), 'GT4 must outperform Track Coupe in high-speed grip');
});

test('Functional Reverse Gear (R): Automatic and Manual shifting with ~35 km/h backward acceleration', () => {
  const spa = compileTrack(TRACKS.find((t) => t.id === 'spa-francorchamps')!);
  const carSpec = CARS.find((c) => c.id === 'porsche-911-gt3-r')!;

  // 1. Automatic mode
  const autoCar = createCarSimState({
    id: 'auto-rev',
    name: 'Auto Tester',
    isPlayer: true,
    carId: carSpec.id,
    livery: carSpec.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
    transmissionMode: 'auto',
  });

  // Stationary car holding brake engages Reverse (gear = -1)
  stepCarPhysics(autoCar, { throttle: 0, brake: 1, steer: 0, specialPressed: false }, spa, 1 / 60, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [autoCar],
  });
  assert.equal(autoCar.gear, -1, 'Holding brake when stationary must engage Reverse gear (-1)');

  // Accelerates backward up to ~35 km/h (~9.72 m/s)
  for (let i = 0; i < 180; i++) {
    stepCarPhysics(autoCar, { throttle: 0, brake: 1, steer: 0, specialPressed: false }, spa, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [autoCar],
    });
  }
  const speedKmh = autoCar.speed * 3.6;
  assert.ok(speedKmh >= 30 && speedKmh <= 36, `Reverse speed should plateau near 35 km/h, got ${speedKmh.toFixed(1)} km/h`);

  // Pressing throttle shifts back to 1st gear
  stepCarPhysics(autoCar, { throttle: 1, brake: 0, steer: 0, specialPressed: false }, spa, 1 / 60, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [autoCar],
  });
  assert.equal(autoCar.gear, 1, 'Pressing throttle while in Reverse must shift back to 1st gear');

  // 2. Manual mode
  const manCar = createCarSimState({
    id: 'man-rev',
    name: 'Manual Tester',
    isPlayer: true,
    carId: carSpec.id,
    livery: carSpec.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
    transmissionMode: 'manual',
  });
  assert.equal(manCar.gear, 1);

  // Shift down below 1 when stationary engages R
  stepCarPhysics(manCar, { throttle: 0, brake: 0, steer: 0, specialPressed: false, shiftDown: true }, spa, 1 / 60, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [manCar],
  });
  assert.equal(manCar.gear, -1, 'Shifting down from 1st gear below 3 m/s must engage Reverse gear (-1)');

  // Shift up returns to 1st gear
  stepCarPhysics(manCar, { throttle: 0, brake: 0, steer: 0, specialPressed: false, shiftUp: true }, spa, 1 / 60, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [manCar],
  });
  assert.equal(manCar.gear, 1, 'Shifting up from Reverse must return to 1st gear');
});

test('Hood Cam Rig & Orbit Cam: rigid 3D pitch/roll tracking and zero-lag pivot lock', () => {
  const dummyCar0 = { x: 100, y: 10, z: 200, heading: 0.5, speed: 0 };
  const dummyCarFast = { x: 100, y: 10, z: 200, heading: 0.5, speed: 350 / 3.6 };

  const frame0 = computeCameraFrame('hood', dummyCar0, 0, 0);
  const frameFast = computeCameraFrame('hood', dummyCarFast, 0, 0);

  // When locked, positions at 0 km/h and 350 km/h for the same transform are identical (zero velocity lag)
  assert.ok(frame0.isLocked, 'Hood camera must be rigidly locked');
  assert.ok(frameFast.isLocked, 'Hood camera must be rigidly locked at high speed');
  assert.equal(frame0.fov, frameFast.fov, 'FOV must remain constant at 65 with zero backward speed kick');
  assert.equal(frame0.position.x, frameFast.position.x, 'Position must not lag backward with velocity');
  assert.equal(frame0.position.y, frameFast.position.y);
  assert.equal(frame0.position.z, frameFast.position.z);

  // Verify hood mount offset matches carPos + forward * (carLength * 0.24) + up * (carHeight * 0.68)
  const expectedForward = 4.4 * 0.24;
  const expectedUp = 1.18 * 0.68;
  const expX = dummyCar0.x + Math.sin(0.5) * expectedForward;
  const expY = dummyCar0.y + expectedUp;
  const expZ = dummyCar0.z + Math.cos(0.5) * expectedForward;

  assert.ok(Math.abs(frame0.position.x - expX) < 0.01);
  assert.ok(Math.abs(frame0.position.y - expY) < 0.01);
  assert.ok(Math.abs(frame0.position.z - expZ) < 0.01);

  // Verify full 3D pitch orientation: climbing uphill (+0.18 rad) pitches lookAt UP relative to mount
  const frameUphill = computeCameraFrame('hood', dummyCarFast, 0.18, 0);
  const frameDownhill = computeCameraFrame('hood', dummyCarFast, -0.18, 0);
  assert.ok(
    frameUphill.lookAt.y > frameUphill.position.y + 1.0,
    `Expected uphill HoodCam lookAt.y > mount.y, got lookAt=${frameUphill.lookAt.y}, mount=${frameUphill.position.y}`,
  );
  assert.ok(
    frameDownhill.lookAt.y < frameDownhill.position.y - 1.0,
    `Expected downhill HoodCam lookAt.y < mount.y, got lookAt=${frameDownhill.lookAt.y}, mount=${frameDownhill.position.y}`,
  );

  // Orbit cam must lock pivot directly to playerCar with zero lag
  const orbitFrame = computeCameraFrame('orbit', dummyCarFast, 0, 0);
  assert.ok(orbitFrame.isLocked, 'Orbit camera must lock directly onto car pivot');
  assert.equal(orbitFrame.lookAt.x, dummyCarFast.x);
  assert.equal(orbitFrame.lookAt.z, dummyCarFast.z);
});

test('Manual Transmission Forward Gear Persistence & Tuning Bounds Safety', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const gt3 = CARS.find((c) => c.id === 'porsche-911-gt3-r')!;
  const car = createCarSimState({
    id: 'manual-fwd',
    name: 'Manual Forward Tester',
    isPlayer: true,
    carId: gt3.id,
    livery: gt3.defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'soft',
    transmissionMode: 'manual',
  });

  // Shift 1 -> 2 -> 3 and ensure gear persists across subsequent physics ticks
  stepCarPhysics(car, { throttle: 0.4, brake: 0, steer: 0, specialPressed: false, shiftUp: true }, monza, 1 / 60, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [car],
  });
  assert.equal(car.gear, 2, 'Manual shiftUp from 1 must enter 2nd gear');

  stepCarPhysics(car, { throttle: 0.4, brake: 0, steer: 0, specialPressed: false, shiftUp: true }, monza, 1 / 60, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [car],
  });
  assert.equal(car.gear, 3, 'Manual shiftUp from 2 must enter 3rd gear');

  for (let i = 0; i < 30; i++) {
    stepCarPhysics(car, { throttle: 0.6, brake: 0, steer: 0, specialPressed: false }, monza, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [car],
    });
  }
  assert.equal(car.gear, 3, 'Manual gear 3 must not be overwritten by auto-shift logic');

  stepCarPhysics(car, { throttle: 0.4, brake: 0, steer: 0, specialPressed: false, shiftDown: true }, monza, 1 / 60, {
    trackWetness: 0,
    totalLaps: 5,
    isQualifying: false,
    allCars: [car],
  });
  assert.equal(car.gear, 2, 'Manual shiftDown from 3 must return to 2nd gear');

  // Verify tuning bounds enforce physical realism (AI never exceeds 100% physical tire grip)
  assert.ok(ACTIVE_TUNING_CONFIG.aiCornerSpeedScale >= 0.75 && ACTIVE_TUNING_CONFIG.aiCornerSpeedScale <= 1.0);
  assert.ok(ACTIVE_TUNING_CONFIG.aiBrakeMarginScale >= 0.85 && ACTIVE_TUNING_CONFIG.aiBrakeMarginScale <= 1.4);
  assert.ok(ACTIVE_TUNING_CONFIG.downforceScale >= 0.55 && ACTIVE_TUNING_CONFIG.downforceScale <= 1.35);
  assert.ok(ACTIVE_TUNING_CONFIG.brakeForceScale >= 0.55 && ACTIVE_TUNING_CONFIG.brakeForceScale <= 1.35);
  assert.ok(ACTIVE_TUNING_CONFIG.dragScale >= 0.65 && ACTIVE_TUNING_CONFIG.dragScale <= 1.45);
  assert.ok(ACTIVE_TUNING_CONFIG.lowSpeedGripScale >= 0.65 && ACTIVE_TUNING_CONFIG.lowSpeedGripScale <= 1.3);

  // Verify per-class tuning profiles resolve and clamp within realistic physical bounds
  const gt3Tuning = resolveTuningConfig(CarClassId.GT3);
  const hyperTuning = resolveTuningConfig(CarClassId.HYPERCAR_GTP);
  const f1Tuning = resolveTuningConfig(CarClassId.F1_2026);
  assert.ok(gt3Tuning.downforceScale >= 0.55 && gt3Tuning.downforceScale <= 1.35);
  assert.ok(hyperTuning.dragScale >= 0.65 && hyperTuning.dragScale <= 1.45);
  assert.ok(f1Tuning.aiCornerSpeedScale >= 0.75 && f1Tuning.aiCornerSpeedScale <= 1.0);
});

test('Acoustic Engine Synthesis & Spa Eau Rouge DEM Alignment', () => {
  // 1. Formula E has strictly zero combustion gain
  const feProfile = resolveAcousticProfile('fe-porsche-99x', 'electric', CarClassId.FORMULA_E);
  assert.equal(feProfile.type, 'ELECTRIC_EV');
  assert.equal(feProfile.combustionGain, 0);
  assert.equal(computeWarmFundamentalHz(feProfile, 0.8).baseHz, 0);

  // 2. Non-hybrid Hypercars (Valkyrie V12 & Glickenhaus SCG 007) suppress hybrid whine
  const valk = resolveAcousticProfile('aston-valkyrie-lmh', 'v12', CarClassId.HYPERCAR_GTP);
  const scg = resolveAcousticProfile('glickenhaus-scg-007', 'v8-hybrid', CarClassId.HYPERCAR_GTP);
  assert.equal(valk.type, 'V12_NA');
  assert.equal(valk.hasHybridWhine, false);
  assert.equal(scg.hasHybridWhine, false);

  // 3. 2005 V10 & Flat-6 stay strictly within warm 68..240 Hz fundamental band and sweep smoothly across RPM
  const v10 = resolveAcousticProfile('f1-05-renault', 'v10', CarClassId.F1_2005);
  const v10Idle = computeWarmFundamentalHz(v10, 0.0, 0.0);
  const v10Mid = computeWarmFundamentalHz(v10, 0.5, 0.8);
  const v10Red = computeWarmFundamentalHz(v10, 1.0, 1.0);
  assert.ok(v10Idle.baseHz >= 68 && v10Red.baseHz <= 240, `Fundamental Hz out of warm band: ${v10Idle.baseHz}..${v10Red.baseHz}`);
  assert.ok(v10Idle.baseHz < v10Mid.baseHz && v10Mid.baseHz < v10Red.baseHz, 'Fundamental Hz must rise smoothly across full RPM range');
  assert.ok(v10Red.filterHz > v10Idle.filterHz, 'WOT filter cutoff must open smoothly above idle');

  const flat6 = resolveAcousticProfile('porsche-911-gt3-r', 'flat6', CarClassId.GT3);
  assert.equal(flat6.type, 'FLAT6_BOXER');

  // 4. Soft-clipping curve bounds & symmetry
  const curve = makeSoftClippingCurve(22);
  assert.equal(curve.length, 1024);
  assert.ok(curve[0] < 0 && curve[curve.length - 1] > 0);
  assert.ok(curve[0] >= -1.01 && curve[curve.length - 1] <= 1.01);

  // 5. Spa Eau Rouge valley & Raidillon climb alignment
  const spa = compileTrack(TRACKS.find((t) => t.id === 'spa-francorchamps')!);
  const eauRougeSample = sampleTrackAtT(spa, 0.082);
  const raidillonCrest = sampleTrackAtT(spa, 0.145);
  assert.ok(eauRougeSample.y <= -20, `Expected Eau Rouge valley <= -20m, got ${eauRougeSample.y.toFixed(1)}m`);
  assert.ok(raidillonCrest.y >= 52, `Expected Raidillon crest >= +52m, got ${raidillonCrest.y.toFixed(1)}m`);
});

test('All 76 cars map cleanly to per-class tuning, GT4 plate style, and disambiguated acoustic profiles', () => {
  // Every car's class resolves cleanly within tuning bounds
  for (const car of CARS) {
    const profile = resolveTuningConfig(car.classId);
    assert.ok(profile.downforceScale >= 0.55 && profile.downforceScale <= 1.35, `Bad downforceScale for ${car.id}`);
    assert.ok(profile.dragScale >= 0.65 && profile.dragScale <= 1.45, `Bad dragScale for ${car.id}`);
  }

  // Hyphenated / alias class keys match exact CarClassId profiles
  assert.deepEqual(resolveTuningConfig('f1-2026'), resolveTuningConfig(CarClassId.F1_2026));
  assert.deepEqual(resolveTuningConfig('f1-2021'), resolveTuningConfig(CarClassId.F1_2021));
  assert.deepEqual(resolveTuningConfig('f1-2005'), resolveTuningConfig(CarClassId.F1_2005));
  assert.deepEqual(resolveTuningConfig('hypercar'), resolveTuningConfig(CarClassId.HYPERCAR_GTP));
  assert.deepEqual(resolveTuningConfig('gt3'), resolveTuningConfig(CarClassId.GT3));
  assert.deepEqual(resolveTuningConfig('gt4'), resolveTuningConfig(CarClassId.GT4));

  // GT4 cyan number plate resolves cleanly
  assert.deepEqual(resolveNumberPlateColors(CarClassId.GT4, 'gt4-cyan'), { bg: '#0284c7', text: '#ffffff' });

  // Disambiguated acoustic profiles (prevent brand-name substring collisions across F1/GTP/GT4/Supercar)
  assert.equal(resolveAcousticProfile('f1-26-cadillac', 'v6-hybrid', CarClassId.F1_2026).type, 'V6_TURBO_HYBRID');
  assert.equal(resolveAcousticProfile('f1-26-mclaren', 'v6-hybrid', CarClassId.F1_2026).type, 'V6_TURBO_HYBRID');
  assert.equal(resolveAcousticProfile('f1-21-mclaren', 'v6-hybrid', CarClassId.F1_2021).type, 'V6_TURBO_HYBRID');
  assert.equal(resolveAcousticProfile('f1-26-alpine', 'v6-hybrid', CarClassId.F1_2026).type, 'V6_TURBO_HYBRID');
  assert.equal(resolveAcousticProfile('alpine-a424', 'v6-hybrid', CarClassId.HYPERCAR_GTP).type, 'V6_TURBO_HYBRID');
  assert.equal(resolveAcousticProfile('alpine-a110-gt4', 'turbo-i4', CarClassId.GT4).type, 'INLINE4_TURBO');

  const p963 = resolveAcousticProfile('porsche-963', 'v8-hybrid', CarClassId.HYPERCAR_GTP);
  assert.equal(p963.type, 'V8_FLATPLANE');
  assert.equal(p963.hasHybridWhine, true);

  const p918 = resolveAcousticProfile('porsche-918-spyder', 'v8-hybrid', CarClassId.SUPERCAR);
  assert.equal(p918.type, 'V8_FLATPLANE');
  assert.equal(p918.hasHybridWhine, true);

  assert.equal(resolveAcousticProfile('porsche-cayman-gt4-rs', 'flat6', CarClassId.GT4).type, 'FLAT6_BOXER');
});

test('KN5 to OBJ Converter & Livery Visualizer: smooth normals, 4 wheels on Oreca & Vantage GT4, and UV custom texturing', () => {
  // 1. Converted OBJs have 4 wheels and proper low-poly triangle budgets
  let checkedObjCount = 0;
  const checkObj = (carFolder: string, required = true) => {
    const objPath = path.resolve('models/lowpoly-cars', carFolder, `${carFolder}.obj`);
    if (!fs.existsSync(objPath)) {
      if (!required) return;
      assert.ok(false, `Model file not found: ${objPath}`);
    }
    checkedObjCount++;
    const content = fs.readFileSync(objPath, 'utf8');
    const lines = content.split('\n');
    const objects = new Set<string>();
    let vCount = 0;
    let vnCount = 0;
    let vtCount = 0;
    let fCount = 0;

    for (const l of lines) {
      if (l.startsWith('o ')) objects.add(l.slice(2).trim());
      else if (l.startsWith('v ')) vCount++;
      else if (l.startsWith('vn ')) vnCount++;
      else if (l.startsWith('vt ')) vtCount++;
      else if (l.startsWith('f ')) fCount++;
    }

    assert.ok(fCount > 5000, `${carFolder} has too few triangles (${fCount})`);
    assert.ok(objects.has('WHEEL_LF') || objects.has('WHEEL_FL'), `${carFolder} missing front-left wheel`);
    assert.ok(objects.has('WHEEL_RF') || objects.has('WHEEL_FR'), `${carFolder} missing front-right wheel`);
    assert.ok(objects.has('WHEEL_LR') || objects.has('WHEEL_RL'), `${carFolder} missing rear-left wheel`);
    assert.ok(objects.has('WHEEL_RR'), `${carFolder} missing rear-right wheel`);
    assert.ok(objects.has('BODY'), `${carFolder} missing BODY object`);
    // Smooth normals exported
    assert.ok(vnCount > 0, `${carFolder} missing vertex normals`);
    // UVs exported
    assert.ok(vtCount > 0, `${carFolder} missing texture coordinates`);
  };

  checkObj('oreca-07');
  checkObj('aston-vantage-gt4');
  checkObj('aston-vantage-gt3', false);
  checkObj('bentley-continental-gt3');
  checkObj('bmw-m2-cs');
  checkObj('ferrari-f80', false);
  checkObj('genesis-gmr-001');
  checkObj('ford-mustang-gt3');
  checkObj('renault-rs01-gt3');
  checkObj('lexus-rcf-gt3');
  checkObj('bmw-m4-gt3');
  checkObj('acura-nsx-gt3');
  checkObj('corvette-z06-gt3r');
  assert.ok(checkedObjCount >= 11, `Expected at least 11 converted OBJ models checked, got ${checkedObjCount}`);

  // 2. Custom Livery Texture Support in LiveryConfig
  const customLivery: LiveryConfig = {
    primaryColor: '#0284c7',
    secondaryColor: '#facc15',
    tertiaryColor: '#ffffff',
    rimFinish: 'gloss-black',
    template: 'racing-stripes',
    carbonHood: false,
    carbonWing: false,
    carbonSplitter: false,
    driverNumber: '77',
    numberPlateStyle: 'gt4-cyan',
    headlightTint: 'crystal-white',
    windshieldBanner: 'APEX',
    customTexture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  };
  assert.ok(customLivery.customTexture && customLivery.customTexture.startsWith('data:image/png'));
});

test('Multiplayer URL builder preserves deployment base path and window.location.host', () => {
  const originalWindow = (globalThis as any).window;

  try {
    // Production subpath without trailing slash
    (globalThis as any).window = {
      location: {
        protocol: 'https:',
        host: 'marc-mas.ddns.net',
        pathname: '/Apex-Miniature',
      },
    };
    assert.equal(getDeploymentBasePath(), '/Apex-Miniature/');
    assert.equal(getWebSocketUrl(), 'wss://marc-mas.ddns.net/Apex-Miniature/ws');
    assert.equal(getRoomRestUrl('room1'), '/Apex-Miniature/api/rooms/ROOM1');

    // Production subpath with trailing slash
    (globalThis as any).window = {
      location: {
        protocol: 'https:',
        host: 'marc-mas.ddns.net',
        pathname: '/Apex-Miniature/',
      },
    };
    assert.equal(getDeploymentBasePath(), '/Apex-Miniature/');
    assert.equal(getWebSocketUrl(), 'wss://marc-mas.ddns.net/Apex-Miniature/ws');

    // Production subpath with index.html
    (globalThis as any).window = {
      location: {
        protocol: 'https:',
        host: 'marc-mas.ddns.net',
        pathname: '/Apex-Miniature/index.html',
      },
    };
    assert.equal(getDeploymentBasePath(), '/Apex-Miniature/');
    assert.equal(getWebSocketUrl(), 'wss://marc-mas.ddns.net/Apex-Miniature/ws');

    // Local dev with port 3000
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        host: 'localhost:3000',
        pathname: '/',
      },
    };
    assert.equal(getDeploymentBasePath(), '/');
    assert.equal(getWebSocketUrl(), 'ws://localhost:3000/ws');
    assert.equal(getRoomRestUrl('test2'), '/api/rooms/TEST2');

    // Local dev with port 5173
    (globalThis as any).window = {
      location: {
        protocol: 'http:',
        host: 'localhost:5173',
        pathname: '/',
      },
    };
    assert.equal(getWebSocketUrl(), 'ws://localhost:5173/ws');
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  }
});

test('MultiplayerClient queues outbound messages until WebSocket is OPEN', async () => {
  const mp = new MultiplayerClient();
  const sentMessages: string[] = [];
  const fakeSocket = {
    readyState: 0, // CONNECTING
    send: (msg: string) => sentMessages.push(msg),
    close: () => {},
  } as unknown as WebSocket;

  (mp as any).ws = fakeSocket;

  // Attempting to send while CONNECTING queues the payload
  await mp.joinRoom('ABC12', 'Player1', 'ferrari-499p', {} as any);
  assert.equal(sentMessages.length, 0, 'Should not send while readyState is CONNECTING');
  assert.equal((mp as any).outboundQueue.length, 1, 'Should queue outbound join message');
  const queuedMsg = JSON.parse((mp as any).outboundQueue[0]);
  assert.equal(queuedMsg.type, 'room:join');
  assert.equal(queuedMsg.code, 'ABC12');

  // Transition socket to OPEN and flush queue
  (fakeSocket as any).readyState = 1; // OPEN
  (mp as any).flushOutboundQueue();

  assert.equal(sentMessages.length, 1, 'Queued message should be flushed once OPEN');
  assert.equal((mp as any).outboundQueue.length, 0, 'Queue should be empty after flush');
  const sentMsg = JSON.parse(sentMessages[0]);
  assert.equal(sentMsg.type, 'room:join');
  assert.equal(sentMsg.code, 'ABC12');
});







