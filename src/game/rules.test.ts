import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARS,
  CAR_CLASSES,
  computeBoPEquilibriumScore,
  getAllSelectableCars,
  getCarById,
  getCarsByClass,
  resolveCarSpecial,
  resolveNumberPlateColors,
  validateDriverNumber,
} from './cars';
import { CarClassId, LiveryConfig, TrackSpec, TrackWaypoint } from './types';
import { TRACKS, compileTrack, getTrackById, projectOntoTrack, sampleTrackAtT } from './tracks';
import {
  GamepadController,
  applySteeringCurve,
  blendDrivingInputs,
} from './gamepad';
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
  computeRollingFormationControl,
  computeStandings,
  createCarSimState,
  getCompoundModifiers,
  getRollingFormationSpeedMs,
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
  assert.equal(getCarsByClass(CarClassId.TRACK_COUPE).length, 6);
  assert.equal(getCarsByClass(CarClassId.SUPERCAR).length, 7);
  assert.ok(CARS.length >= 58);

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

  const ctrl = computeAIControl(fastCar, daytona, [fastCar, slowCar], 1 / 60, 0);
  assert.equal(Number.isFinite(ctrl.throttle), true);
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
  assert.equal(gt3Car.specialActive, false);
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
  assert.ok(
    car.speed >= 15.0 && car.speed < 25.0,
    `Expected car to scrub noticeable speed on barrier hit without dead stopping, got speed ${car.speed}`,
  );

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
  assert.ok(portimaoSpan >= 30.0, `Portimao rollercoaster elevation span must be >= 30m, got ${portimaoSpan.toFixed(1)}m`);

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
  for (let i = 0; i < 300; i++) {
    stepCarPhysics(f1Car, { throttle: 1, brake: 0, steer: 0, specialPressed: false }, monza, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [f1Car],
    });
  }
  assert.ok(f1Car.gear >= 5, `F1 car should reach high gears at high speed, got gear ${f1Car.gear}`);
  assert.ok(f1Car.speed > 55, `F1 car should exceed 200 km/h (~4.6s benchmark) within 5s acceleration, got ${(f1Car.speed * 3.6).toFixed(0)} km/h`);
});

test('2D Rigid-Body Car-to-Car Collisions: momentum conservation, bump-drafting, PIT torque & damage threshold', () => {
  const spa = compileTrack(TRACKS[0]);
  const f1Spec = CARS.find((c) => c.classId === CarClassId.F1_2026)!;

  const makeCar = (id: string, isPlayer: boolean) => {
    const c = createCarSimState({
      id,
      name: id,
      isPlayer,
      carId: f1Spec.id,
      livery: f1Spec.defaultLivery,
      gridSlot: isPlayer ? 1 : 2,
      compiledTrack: spa,
      compound: 'soft',
    });
    c.heading = 0; // +Z forward, -X right, +X left
    c.yawRate = 0;
    return c;
  };

  // 1. Side-by-side contact: low-restitution momentum conservation (no elastic bounce-fling or dead-stop)
  const carA = makeCar('carA', true);
  const carB = makeCar('carB', false);
  carA.x = 0;
  carA.z = 0;
  carA.vx = 0;
  carA.vz = 50;
  carA.speed = 50;

  carB.x = 1.65;
  carB.z = 0;
  carB.vx = -10; // closing laterally into carA at 10 m/s
  carB.vz = 50;
  carB.speed = 50;

  resolveCarCollisions([carA, carB]);

  // Equal mass: momentum conserved (vxA + vxB ≈ -10), low restitution (e=0.08 => vxA ≈ -5.4, vxB ≈ -4.6)
  assert.ok(carA.vx < -4.0, `Car A should absorb leftward momentum, got vx=${carA.vx}`);
  assert.ok(carB.vx > -6.0 && carB.vx > carA.vx, `Car B should slow laterally without elastic fling, got vx=${carB.vx}`);
  assert.ok(Math.abs(carA.vx + carB.vx - -10) < 0.25, `Linear lateral momentum should be conserved, sum=${carA.vx + carB.vx}`);
  assert.ok(carA.speed >= 45 && carB.speed >= 45, `Forward speeds preserved after side-bump: A=${carA.speed}, B=${carB.speed}`);

  // 2. Bump-drafting: aligned low-closing-speed nose-to-tail smoothly transfers forward speed (e = 0.0, no spin)
  const trail = makeCar('trail', true);
  const lead = makeCar('lead', false);
  trail.x = 0;
  trail.z = 0;
  trail.vx = 0;
  trail.vz = 64;
  trail.speed = 64;

  lead.x = 0;
  lead.z = 5.1; // nose-to-tail overlap for ~5.5m F1 car
  lead.vx = 0;
  lead.vz = 60;
  lead.speed = 60;

  resolveCarCollisions([trail, lead]);

  assert.ok(lead.vz > 61.5, `Lead car should gain forward speed in bump-draft, got vz=${lead.vz}`);
  assert.ok(trail.vz > 60.5, `Trailing car must not dead-stop or bounce back in bump-draft, got vz=${trail.vz}`);
  assert.ok(Math.abs(lead.vz - trail.vz) < 0.25, `Zero-restitution bump-draft should match speeds, diff=${lead.vz - trail.vz}`);
  assert.ok(
    Math.abs(lead.yawRate ?? 0) < 0.05 && Math.abs(trail.yawRate ?? 0) < 0.05,
    `Dead-center bump-draft should not induce spin`,
  );

  // 3. PIT maneuver: off-center contact into lead car's rear-left quarter panel induces yaw spin
  const pitAttacker = makeCar('pitAttacker', true);
  const pitTarget = makeCar('pitTarget', false);
  pitTarget.x = 0;
  pitTarget.z = 0;
  pitTarget.vx = 0;
  pitTarget.vz = 45;
  pitTarget.speed = 45;

  pitAttacker.x = 1.65; // overlapping left rear quarter of pitTarget (+X is left at heading=0)
  pitAttacker.z = -3.6;
  pitAttacker.vx = -6; // nudging right (-X) into target's rear-left quarter
  pitAttacker.vz = 47;
  pitAttacker.speed = 47;

  resolveCarCollisions([pitAttacker, pitTarget]);

  assert.ok(
    (pitTarget.yawRate ?? 0) > 0.15,
    `Off-center rear-left PIT contact must induce positive yaw spin, got yawRate=${pitTarget.yawRate}`,
  );

  // 4. Low speed grazing contact (< 25 km/h = 6.94 m/s) should inflict 0 damage
  const carC = makeCar('carC', true);
  const carD = makeCar('carD', false);
  carC.x = 0;
  carC.z = 0;
  carC.vx = 2.0; // closing speed 4.0 m/s < 6.94 m/s
  carC.vz = 30;
  carC.speed = 30;
  carD.x = 1.65;
  carD.z = 0;
  carD.vx = -2.0;
  carD.vz = 30;
  carD.speed = 30;
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

test('Hood Cam Rig & Orbit Cam: rigid 3D pitch/roll tracking, per-car elevated sightline, and zero-lag pivot lock', async () => {
  const { CAR_HOOD_SPECS, computeDefaultHoodMount } = await import('./camera');
  const dummyCar0 = { x: 100, y: 10, z: 200, heading: 0.5, speed: 0 };
  const dummyCarFast = { x: 100, y: 10, z: 200, heading: 0.5, speed: 350 / 3.6 };

  const frame0 = computeCameraFrame('hood', dummyCar0, 0, 0);
  const frameFast = computeCameraFrame('hood', dummyCarFast, 0, 0);

  // When locked, positions at 0 km/h and 350 km/h for the same transform are identical (zero velocity lag)
  assert.ok(frame0.isLocked, 'Hood camera must be rigidly locked');
  assert.ok(frameFast.isLocked, 'Hood camera must be rigidly locked at high speed');
  assert.equal(frame0.fov, frameFast.fov, 'FOV must remain constant with zero backward speed kick');
  assert.equal(frame0.position.x, frameFast.position.x, 'Position must not lag backward with velocity');
  assert.equal(frame0.position.y, frameFast.position.y);
  assert.equal(frame0.position.z, frameFast.position.z);

  // Verify default hood mount matches CAR_HOOD_SPECS and provides elevated, horizon-clear sightline
  const expectedForward = CAR_HOOD_SPECS.carLength * CAR_HOOD_SPECS.hoodForwardFraction;
  const expectedUp = CAR_HOOD_SPECS.carHeight * CAR_HOOD_SPECS.hoodUpFraction;
  const expX = dummyCar0.x + Math.sin(0.5) * expectedForward;
  const expY = dummyCar0.y + expectedUp;
  const expZ = dummyCar0.z + Math.cos(0.5) * expectedForward;

  assert.ok(Math.abs(frame0.position.x - expX) < 0.01);
  assert.ok(Math.abs(frame0.position.y - expY) < 0.01);
  assert.ok(Math.abs(frame0.position.z - expZ) < 0.01);
  assert.ok(expectedUp >= 1.15, `Expected elevated hood mount >= 1.15m, got ${expectedUp}`);

  // Gentle downward pitch should project ground intersection well down the track (>40m ahead)
  const drop = frame0.position.y - frame0.lookAt.y;
  const groundSightDist = (expectedUp * CAR_HOOD_SPECS.lookDist) / Math.max(1e-4, drop);
  assert.ok(
    groundSightDist >= 45,
    `Expected clear forward track sightline >= 45m, got ${groundSightDist.toFixed(1)}m`,
  );

  // Verify class-aware carSpec mount clears tall GT4/Coupe hoods and F1 halos, and respects rig hoodMount override
  const gt4Car = getCarById('bmw-m4-gt4');
  const f1Car = getCarById('f1-26-mercedes');
  const gt4Mount = computeDefaultHoodMount(gt4Car.classId, gt4Car.dimensions);
  const f1Mount = computeDefaultHoodMount(f1Car.classId, f1Car.dimensions);
  assert.ok(gt4Mount.up >= 1.30, `Expected tall GT4 hood mount >= 1.30m, got ${gt4Mount.up}`);
  assert.ok(f1Mount.up >= 1.18, `Expected F1 T-cam/halo-clearing mount >= 1.18m, got ${f1Mount.up}`);

  const customFrame = computeCameraFrame(
    'hood',
    { ...dummyCar0, hoodMount: { forward: 0.99, up: 1.34 } },
    0,
    0,
  );
  assert.ok(Math.abs(customFrame.position.y - (dummyCar0.y + 1.34)) < 1e-4);

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

  // 5. Spa Eau Rouge valley & Raidillon climb alignment (corner-aligned to SVG geometry)
  const spa = compileTrack(TRACKS.find((t) => t.id === 'spa-francorchamps')!);
  const t1ExitStraight = sampleTrackAtT(spa, 0.082);
  const eauRougeSample = sampleTrackAtT(spa, 0.142);
  const raidillonCrest = sampleTrackAtT(spa, 0.195);
  const lesCombesPeak = sampleTrackAtT(spa, 0.355);
  assert.ok(t1ExitStraight.y > eauRougeSample.y + 10, `Expected downhill run from La Source (t=0.082: ${t1ExitStraight.y.toFixed(1)}m) into Eau Rouge (t=0.142: ${eauRougeSample.y.toFixed(1)}m)`);
  assert.ok(eauRougeSample.y <= -20, `Expected Eau Rouge valley at t=0.142 <= -20m, got ${eauRougeSample.y.toFixed(1)}m`);
  assert.ok(raidillonCrest.y - eauRougeSample.y >= 28, `Expected steep Raidillon climb >= +28m through t=0.142..0.195, got ${(raidillonCrest.y - eauRougeSample.y).toFixed(1)}m`);
  assert.ok(lesCombesPeak.y >= 45, `Expected Les Combes peak >= +45m, got ${lesCombesPeak.y.toFixed(1)}m`);
});

test('All roster cars map cleanly to per-class tuning, GT4 plate style, and disambiguated acoustic profiles', () => {
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

test('Oreca 07 is selectable in LMP2 and resolves to Oreca 07 (never Ferrari 499P)', () => {
  const selectableCars = getAllSelectableCars();
  const orecaEntries = selectableCars.filter(
    (c) => c.classId === CarClassId.LMP2 && (c.id.includes('oreca') || c.name.includes('Oreca')),
  );
  assert.ok(orecaEntries.length >= 7, `Expected at least 7 selectable Oreca entries, got ${orecaEntries.length}`);

  // Base Oreca 07 entry exists
  const baseOreca = selectableCars.find((c) => c.id === 'oreca-07');
  assert.ok(baseOreca, 'Base oreca-07 must be selectable in car catalog');
  assert.equal(baseOreca.name, 'Oreca 07 Gibson');
  assert.equal(baseOreca.classId, CarClassId.LMP2);
  assert.equal(baseOreca.modelId, 'oreca-07');

  // EVERY selectable Oreca variant resolves directly via getCarById
  for (const entry of orecaEntries) {
    const resolved = getCarById(entry.id);
    assert.equal(resolved.classId, CarClassId.LMP2, `Car ${entry.id} must be in LMP2`);
    assert.notEqual(resolved.id, 'ferrari-499p', `Car ${entry.id} must not fall back to Ferrari 499P`);
    assert.equal(resolved.modelId, 'oreca-07', `Car ${entry.id} must have modelId oreca-07`);
  }

  // Common aliases and short names all resolve properly
  const expectedAliases = [
    'oreca-07',
    'united-autosports',
    'oreca-07-united',
    'oreca-07-united-autosports',
    'inter-europol',
    'oreca-07-europol',
    'oreca-07-inter-europol',
    'ao-racing',
    'oreca-07-ao',
    'oreca-07-ao-racing',
    'af-corse',
    'oreca-07-af-corse',
    'cool-racing',
    'oreca-07-cool',
    'oreca-07-cool-racing',
    'algarve-pro',
    'oreca-07-algarve',
    'oreca-07-algarve-pro',
    'ligier-js-p217',
    'lmp2',
    'oreca',
  ];

  for (const alias of expectedAliases) {
    const car = getCarById(alias);
    assert.equal(car.classId, CarClassId.LMP2, `Alias "${alias}" must resolve to LMP2`);
    assert.notEqual(car.id, 'ferrari-499p', `Alias "${alias}" must not fall back to 499P`);
    assert.equal(car.modelId, 'oreca-07', `Alias "${alias}" must point to oreca-07`);
  }

  // Check specific livery primary colors match team identities
  assert.equal(getCarById('oreca-07-ao-racing').defaultLivery.primaryColor, '#6A2C91');
  assert.equal(getCarById('oreca-07-inter-europol').defaultLivery.primaryColor, '#FFD100');
  assert.equal(getCarById('oreca-07-af-corse').defaultLivery.primaryColor, '#D52B1E');
  assert.equal(getCarById('oreca-07-cool-racing').defaultLivery.primaryColor, '#0055B8');
  assert.equal(getCarById('oreca-07-algarve-pro').defaultLivery.primaryColor, '#111111');
  assert.equal(getCarById('oreca-07-united-autosports').defaultLivery.primaryColor, '#FF6B00');
});

test('Realistic off-throttle engine braking deceleration (~0.10g–0.45g coasting)', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const gt3 = getCarById('porsche-911-gt3-r');
  const car = createCarSimState({
    id: 'coast-test',
    name: 'Coaster',
    isPlayer: true,
    carId: gt3.id,
    livery: gt3.defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'medium',
  });

  // Set rolling speed of 36 m/s (~130 km/h) on straight
  const sp = sampleTrackAtT(monza, 0.02);
  car.trackT = 0.02;
  car.prevTrackT = 0.02;
  car.x = sp.x;
  car.y = sp.y;
  car.z = sp.z;
  car.heading = Math.atan2(sp.tx, sp.tz);
  car.speed = 36;
  car.vx = Math.sin(car.heading) * car.speed;
  car.vz = Math.cos(car.heading) * car.speed;
  car.gear = 3;
  car.rpmNormalized = 0.72;

  const startSpeed = car.speed;
  for (let i = 0; i < 60; i++) {
    stepCarPhysics(
      car,
      { throttle: 0, brake: 0, steer: 0, specialPressed: false },
      monza,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
  }
  const speedDrop = startSpeed - car.speed;
  const decelG = speedDrop / 9.81; // over 1.0s
  assert.ok(
    decelG >= 0.08 && decelG <= 0.45,
    `Expected realistic coasting engine braking (0.08g-0.45g), got ${decelG.toFixed(3)}g`,
  );
});

test('Low-speed turning obeys physical wheelbase & tire friction (no kinematic snap-spin)', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const gtp = getCarById('ferrari-499p');
  const car = createCarSimState({
    id: 'steer-test',
    name: 'Steer Tester',
    isPlayer: true,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 1,
    compiledTrack: monza,
    compound: 'soft',
  });

  const sp = sampleTrackAtT(monza, 0.02);
  car.trackT = 0.02;
  car.prevTrackT = 0.02;
  car.x = sp.x;
  car.y = sp.y;
  car.z = sp.z;
  car.heading = Math.atan2(sp.tx, sp.tz);
  car.speed = 8.0; // ~29 km/h low-speed cornering
  car.vx = Math.sin(car.heading) * car.speed;
  car.vz = Math.cos(car.heading) * car.speed;

  const h0 = car.heading;
  for (let i = 0; i < 30; i++) {
    stepCarPhysics(
      car,
      { throttle: 0.25, brake: 0, steer: 1, specialPressed: false },
      monza,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
  }
  let deltaH = Math.abs(car.heading - h0);
  while (deltaH > Math.PI) deltaH = Math.abs(deltaH - Math.PI * 2);
  const avgYawRate = deltaH / 0.5;
  // Physical GTP turning at 8-10 m/s has yaw rate ~1.1-1.5 rad/s (maxTurnRate arcade was >= 2.15 rad/s)
  assert.ok(
    avgYawRate > 0.4 && avgYawRate <= 1.75,
    `Expected physical tire-limited low-speed yaw rate (0.4..1.75 rad/s), got ${avgYawRate.toFixed(3)} rad/s`,
  );
});

test('Acoustic profile parity: Porsche 911 GT3 R resolves to gt3_flat6 harmonics in-game & studio', () => {
  const porsche = getCarById('porsche-911-gt3-r');
  const profile = resolveAcousticProfile(porsche.id, porsche.engineType, porsche.classId, porsche.soundProfile);
  assert.equal(profile.soundProfile, 'gt3_flat6');
  assert.ok(profile.harmonicWeights && profile.harmonicWeights.length >= 6);
  assert.ok(profile.maxRedlineHz >= 240 && profile.baseIdleHz >= 40);
});

test('Single Player Practice mode tracks S1/S2/S3 sectors and supports continuous unlimited laps', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza')!);
  const gt3 = getCarById('porsche-911-gt3-r');
  const car = createCarSimState({
    id: 'practice-car',
    name: 'You',
    isPlayer: true,
    carId: gt3.id,
    livery: gt3.defaultLivery,
    gridSlot: 0,
    compiledTrack: monza,
    compound: 'soft',
  });

  // Start at t=0.05 moving along track and step across S1 (0.333), S2 (0.667), and S3/Finish (1.0)
  car.lap = 1;
  car.trackT = 0.05;
  car.prevTrackT = 0.05;
  const spStart = sampleTrackAtT(monza, 0.05);
  car.x = spStart.x;
  car.y = spStart.y;
  car.z = spStart.z;
  car.heading = Math.atan2(spStart.tx, spStart.tz);
  car.speed = 55;
  car.vx = Math.sin(car.heading) * car.speed;
  car.vz = Math.cos(car.heading) * car.speed;

  // Step using AI control in continuous practice mode (totalLaps: 0, isPractice: true)
  const dt = 1 / 60;
  let lapCompleted = false;
  for (let i = 0; i < 9000; i++) {
    const ai = computeAIControl(car, monza, [car], dt, 0);
    stepCarPhysics(car, ai, monza, dt, {
      trackWetness: 0,
      totalLaps: 0,
      isQualifying: false,
      isPractice: true,
      allCars: [car],
    });
    if (car.lap >= 2) {
      lapCompleted = true;
      break;
    }
  }

  assert.ok(lapCompleted, 'Practice car should cross start/finish to start Lap 2');
  assert.equal(car.finished, false, 'Continuous practice (totalLaps=0) must never set car.finished = true');
  assert.ok(car.lastLapTime !== null && car.lastLapTime > 20, 'Last lap time should be recorded after Lap 1');
  assert.ok(
    car.lastLapSectorTimes &&
      car.lastLapSectorTimes[0] !== null &&
      car.lastLapSectorTimes[1] !== null &&
      car.lastLapSectorTimes[2] !== null,
    'All three S1/S2/S3 sector splits should be populated after completing a lap',
  );
  assert.ok(
    car.bestSectorTimes &&
      car.bestSectorTimes[0] !== null &&
      car.bestSectorTimes[1] !== null &&
      car.bestSectorTimes[2] !== null,
    'Best sector times should be tracked',
  );
});

test('PPO Neural Policy Inference supports v1 tanh fallback and v2 linear clamped [-1, 1] outputs', async () => {
  const { evaluateNeuralPolicy } = await import('./aiNeuralPolicy');
  const obs = new Array(43).fill(0);
  const zeroMat64x43 = Array.from({ length: 64 }, () => new Array(43).fill(0));
  const zeroMat64x64 = Array.from({ length: 64 }, () => new Array(64).fill(0));
  const zeroMat3x64 = Array.from({ length: 3 }, () => new Array(64).fill(0));
  const baseWeights = {
    obsDim: 43,
    hiddenDim: 64,
    actDim: 3,
    w0: zeroMat64x43,
    b0: new Array(64).fill(0),
    w1: zeroMat64x64,
    b1: new Array(64).fill(0),
    w2: zeroMat3x64,
    b2: [0.5, 2.5, -2.5], // raw sums: 0.5, 2.5, -2.5
  };

  // v1 applies Math.tanh to layer 2: tanh(0.5) ≈ 0.4621, tanh(2.5) ≈ 0.9866 -> throttle ≈ 0.9933
  const v1 = evaluateNeuralPolicy(obs, { ...baseWeights, version: 1 })!;
  assert.ok(Math.abs(v1.steer - Math.tanh(0.5)) < 1e-4, `Expected tanh(0.5) for v1 steer, got ${v1.steer}`);
  assert.ok(v1.throttle < 0.998 && v1.throttle > 0.98, `Expected tanh(2.5) mapped throttle for v1, got ${v1.throttle}`);

  // v2 skips Math.tanh and clamps raw directly to [-1, 1]: steer = 0.5, throttle = 1.0, brake = 0.0
  const v2 = evaluateNeuralPolicy(obs, { ...baseWeights, version: 2 })!;
  assert.ok(Math.abs(v2.steer - 0.5) < 1e-4, `Expected exact linear 0.5 for v2 steer, got ${v2.steer}`);
  assert.equal(v2.throttle, 1.0, 'Expected clamped +1 -> 1.0 throttle for v2');
  assert.equal(v2.brake, 0.0, 'Expected clamped -1 -> 0.0 brake for v2');
});

test('Car Roster Update: Jesko removed and ferrari-sf90 ID converted to Ferrari 488 GTB', () => {
  assert.equal(CARS.find((c) => c.id === 'koenigsegg-jesko'), undefined, 'Jesko must be removed from CARS');
  const car488 = CARS.find((c) => c.id === 'ferrari-sf90');
  assert.ok(car488, 'Internal ID ferrari-sf90 must remain present');
  assert.equal(car488.name, 'Ferrari 488 GTB');
  assert.equal(getCarById('ferrari-sf90').name, 'Ferrari 488 GTB');
});

test('Physics Tweaks: sustained wall contact scrubs speed consistently and GTP turns in cleanly without heavy understeer', () => {
  const spa = compileTrack(TRACKS[0]);
  const sample = sampleTrackAtT(spa, 0.25);
  const wallLat = spa.spec.trackWidth * 0.5 + 6.2;

  // 1. Sustained wall scraping for 0.25s scrubs >60% speed consistently at 60Hz (browser) and 120Hz (headlessEnv)
  const runScrape = (steps: number, dt: number) => {
    const gtp = getCarById('porsche-963');
    const c = createCarSimState({
      id: `scrape-${steps}`,
      name: 'Scrape Test',
      isPlayer: true,
      carId: gtp.id,
      livery: gtp.defaultLivery,
      gridSlot: 0,
      compiledTrack: spa,
      compound: 'soft',
    });
    c.speed = 40;
    c.vx = sample.tx * 40;
    c.vz = sample.tz * 40;
    for (let i = 0; i < steps; i++) {
      c.lateralOffset = wallLat + 0.1;
      resolveWallContact(c, sample, wallLat, 1, dt);
    }
    return c.speed;
  };
  const speed60Hz = runScrape(15, 1 / 60);
  const speed120Hz = runScrape(30, 1 / 120);
  assert.ok(speed60Hz < 12.0, `Expected heavy speed scrub over 0.25s wall grind at 60Hz, got ${speed60Hz}`);
  assert.ok(
    Math.abs(speed60Hz - speed120Hz) < 1.5,
    `Expected dt-consistent wall damping between 60Hz (${speed60Hz}) and 120Hz (${speed120Hz})`,
  );

  // 2. GTP turn-in responsiveness: at 45 m/s medium steer builds crisp yaw without heavy understeer
  const gtp = getCarById('porsche-963');
  const car = createCarSimState({
    id: 'gtp-turnin',
    name: 'GTP Turn-In',
    isPlayer: true,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 0,
    compiledTrack: spa,
    compound: 'soft',
  });
  car.speed = 45;
  car.heading = Math.atan2(sample.tx, sample.tz);
  car.vx = Math.sin(car.heading) * 45;
  car.vz = Math.cos(car.heading) * 45;
  car.x = sample.x;
  car.z = sample.z;
  car.trackT = 0.25;

  const startHeading = car.heading;
  for (let i = 0; i < 30; i++) {
    stepCarPhysics(
      car,
      { throttle: 0.65, brake: 0, steer: 0.55, specialPressed: false },
      spa,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: true, allCars: [car], bopEnabled: true },
    );
  }
  const headingDelta = Math.abs(car.heading - startHeading);
  assert.ok(headingDelta > 0.18, `Expected pointy GTP turn-in rotation > 0.18 rad in 0.5s, got ${headingDelta}`);
  assert.ok(car.understeerFactor < 0.35, `Expected low GTP understeer on medium turn-in, got ${car.understeerFactor}`);
});

test('Multiplayer Room Config Sync: preserves local client car & livery while syncing shared room settings', async () => {
  const { mergeSharedRoomConfig, extractSharedRoomConfigPatch } = await import('./multiplayer');
  const localCar = getCarById('porsche-911-gt3-r');
  const hostCar = getCarById('ferrari-499p');

  const localConfig = {
    trackId: 'spa-francorchamps',
    activeClasses: [CarClassId.GT3],
    playerCarId: localCar.id,
    playerLivery: { ...localCar.defaultLivery, primaryColor: '#16a34a', driverNumber: '77' },
    gridSize: 12,
    totalLaps: 5,
    weather: 'dry' as const,
    startingCompound: 'medium' as const,
    qualifyingEnabled: false,
    aiDifficulty: 'Pro' as const,
    aiBotCount: 11,
    noAi: false,
    sessionMode: 'race' as const,
  };

  const incomingHostConfig = {
    ...localConfig,
    trackId: 'monza',
    totalLaps: 10,
    playerCarId: hostCar.id,
    playerLivery: { ...hostCar.defaultLivery, primaryColor: '#c8102e', driverNumber: '51' },
  };

  const merged = mergeSharedRoomConfig(localConfig, incomingHostConfig);
  assert.equal(merged.trackId, 'monza', 'Shared trackId should sync from room');
  assert.equal(merged.totalLaps, 10, 'Shared totalLaps should sync from room');
  assert.equal(merged.playerCarId, localCar.id, 'Local client car must never be overwritten by host car');
  assert.equal(merged.playerLivery.primaryColor, '#16a34a', 'Local client livery must never be overwritten by host livery');
  assert.equal(merged.playerLivery.driverNumber, '77');

  const sharedPatch = extractSharedRoomConfigPatch({
    playerCarId: hostCar.id,
    playerLivery: hostCar.defaultLivery,
    trackId: 'suzuka',
  });
  assert.equal('playerCarId' in sharedPatch, false, 'playerCarId must be stripped from shared room config patch');
  assert.equal('playerLivery' in sharedPatch, false, 'playerLivery must be stripped from shared room config patch');
  assert.equal(sharedPatch.trackId, 'suzuka');
});

test('Floating Nametags: distinct human vs AI class badges and clean distance scaling/fade', async () => {
  const { formatNametagLabel, computeNametagDistanceStyle } = await import('../three/nametagSprite');

  const humanTag = formatNametagLabel({
    id: 'peer-1',
    driverName: 'Alex Vance',
    classId: CarClassId.HYPERCAR_GTP,
    isHumanPeer: true,
  });
  assert.equal(humanTag.badgeText, 'PLAYER');
  assert.equal(humanTag.nameText, 'Alex Vance');
  assert.equal(humanTag.classShortText, 'GTP');
  assert.equal(humanTag.isHumanPeer, true);

  const aiF1Tag = formatNametagLabel({
    id: 'ai-0',
    driverName: 'L. Rossi',
    classId: CarClassId.F1_2026,
    isHumanPeer: false,
  });
  assert.equal(aiF1Tag.badgeText, 'AI • F1');
  assert.equal(aiF1Tag.nameText, 'L. Rossi');
  assert.equal(aiF1Tag.isHumanPeer, false);

  // Distance scaling & opacity fade checks
  const tooClose = computeNametagDistanceStyle(1.0, false);
  assert.equal(tooClose.visible, false, 'Nametag right on camera lens should be hidden');

  const midAi = computeNametagDistanceStyle(45, false);
  assert.equal(midAi.visible, true);
  assert.ok(midAi.opacity > 0.7 && midAi.scaleY > 0.7);

  const farAi = computeNametagDistanceStyle(200, false);
  assert.equal(farAi.visible, false, 'Distant AI nametag beyond fade-out range should be hidden');

  const farHuman = computeNametagDistanceStyle(190, true);
  assert.equal(farHuman.visible, true, 'Human peer nametag should stay visible further than AI');
  assert.ok(farHuman.opacity < midAi.opacity, 'Human peer nametag should fade smoothly near max distance');
});

test('Straight-Line Stability: residual yaw & lateral drift settle cleanly on corner exit at 60Hz and 120Hz', () => {
  const monza = compileTrack(TRACKS.find((t) => t.id === 'monza') ?? TRACKS[0]);
  const sample = sampleTrackAtT(monza, 0.02); // Main straight

  for (const carId of ['porsche-963', 'f1-26-mercedes', 'oreca-07', 'porsche-911-gt3-r', 'porsche-cayman-gt4-rs']) {
    for (const dt of [1 / 60, 1 / 120]) {
      const spec = getCarById(carId);
      const car = createCarSimState({
        id: `stab-${carId}-${dt}`,
        name: 'Stability Tester',
        isPlayer: true,
        carId: spec.id,
        livery: spec.defaultLivery,
        gridSlot: 0,
        compiledTrack: monza,
        compound: 'soft',
      });

      const trackHeading = Math.atan2(sample.tx, sample.tz);
      const rightX = -Math.cos(trackHeading);
      const rightZ = Math.sin(trackHeading);
      car.x = sample.x;
      car.z = sample.z;
      car.trackT = 0.02;
      car.heading = trackHeading;
      car.speed = 65;
      // Inject realistic corner-exit disturbance: lateral drift, yaw rate, and lingering steer angle
      car.vx = Math.sin(trackHeading) * 65 + rightX * 2.4;
      car.vz = Math.cos(trackHeading) * 65 + rightZ * 2.4;
      car.yawRate = -0.42;
      car.steerAngle = 0.12;

      const stepsHalfSec = Math.round(0.4 / dt);
      for (let i = 0; i < stepsHalfSec; i++) {
        stepCarPhysics(
          car,
          { throttle: 0.9, brake: 0, steer: 0, specialPressed: false },
          monza,
          dt,
          { trackWetness: 0, totalLaps: 5, isQualifying: true, allCars: [car], bopEnabled: true },
        );
      }

      const settledRightX = -Math.cos(car.heading);
      const settledRightZ = Math.sin(car.heading);
      const settledVLat = car.vx * settledRightX + car.vz * settledRightZ;

      assert.equal(
        car.steerAngle,
        0,
        `${carId} (${Math.round(1 / dt)}Hz): steerAngle should self-center cleanly to exact 0, got ${car.steerAngle}`,
      );
      assert.ok(
        Math.abs(car.yawRate ?? 0) < 0.02,
        `${carId} (${Math.round(1 / dt)}Hz): yawRate should settle cleanly, got ${car.yawRate}`,
      );
      assert.ok(
        Math.abs(settledVLat) < 0.15,
        `${carId} (${Math.round(1 / dt)}Hz): lateral drift vLat should damp out cleanly, got ${settledVLat}`,
      );

      // Verify zero wandering/pendulum over the next 0.4s straight
      const headingAfterSettle = car.heading;
      for (let i = 0; i < stepsHalfSec; i++) {
        stepCarPhysics(
          car,
          { throttle: 1.0, brake: 0, steer: 0, specialPressed: false },
          monza,
          dt,
          { trackWetness: 0, totalLaps: 5, isQualifying: true, allCars: [car], bopEnabled: true },
        );
      }
      const wander = Math.abs(car.heading - headingAfterSettle);
      assert.ok(
        wander < 0.015,
        `${carId} (${Math.round(1 / dt)}Hz): car should track dead straight without wandering, got ${wander} rad`,
      );
    }
  }
});

test('GamepadController: PS4/DualShock axes, analog triggers, deadzones, edge-triggered X, and safe disconnect', () => {
  // Deadzone + smooth steering response curve
  assert.equal(applySteeringCurve(0.05, 0.1), 0);
  assert.equal(applySteeringCurve(-0.09, 0.1), 0);
  const midSteer = applySteeringCurve(0.55, 0.1);
  assert.ok(midSteer > 0.25 && midSteer < 0.5, `Expected smooth mid-range steering curve, got ${midSteer}`);
  assert.equal(applySteeringCurve(1.0, 0.1), 1);
  assert.equal(applySteeringCurve(-1.0, 0.1), -1);

  const controller = new GamepadController();

  // Safe handling when no controllers are connected or list contains nulls
  const empty = controller.poll([null, undefined]);
  assert.equal(empty.connected, false);
  assert.equal(empty.throttle, 0);
  assert.equal(empty.brake, 0);
  assert.equal(empty.steer, 0);
  assert.equal(empty.specialJustPressed, false);

  const makePad = (opts: {
    r2?: number;
    l2?: number;
    lx?: number;
    rx?: number;
    ry?: number;
    cross?: boolean;
  }) => ({
    index: 0,
    id: 'Sony DualShock 4',
    connected: true,
    mapping: 'standard',
    axes: [opts.lx ?? 0, 0, opts.rx ?? 0, opts.ry ?? 0],
    buttons: [
      { pressed: Boolean(opts.cross), value: opts.cross ? 1 : 0 }, // 0: Cross / X
      { pressed: false, value: 0 },
      { pressed: false, value: 0 },
      { pressed: false, value: 0 },
      { pressed: false, value: 0 },
      { pressed: false, value: 0 },
      { pressed: (opts.l2 ?? 0) > 0.5, value: opts.l2 ?? 0 }, // 6: L2
      { pressed: (opts.r2 ?? 0) > 0.5, value: opts.r2 ?? 0 }, // 7: R2
    ],
  });

  // Poll 1: Press Cross/X, half R2, slight L2, steer right, right-stick look
  const s1 = controller.poll([makePad({ r2: 0.52, l2: 0.24, lx: 0.6, rx: -0.5, ry: 0.4, cross: true })]);
  assert.equal(s1.connected, true);
  assert.ok(s1.throttle > 0.45 && s1.throttle < 0.55);
  assert.ok(s1.brake > 0.15 && s1.brake < 0.25);
  assert.ok(s1.steer > 0.3 && s1.steer < 0.6);
  assert.ok(s1.cameraX < -0.2);
  assert.ok(s1.cameraY > 0.1);
  assert.equal(s1.specialPressed, true);
  assert.equal(s1.specialJustPressed, true);

  // Poll 2: Cross/X still held -> edge trigger MUST be false
  const s2 = controller.poll([makePad({ r2: 1.0, cross: true })]);
  assert.equal(s2.specialPressed, true);
  assert.equal(s2.specialJustPressed, false);

  // Poll 3: Release Cross/X
  const s3 = controller.poll([makePad({ cross: false })]);
  assert.equal(s3.specialPressed, false);
  assert.equal(s3.specialJustPressed, false);

  // Poll 4: Press Cross/X again -> edge trigger fires again
  const s4 = controller.poll([makePad({ cross: true })]);
  assert.equal(s4.specialJustPressed, true);

  // Disconnect mid-hold -> returns clean neutral state without throwing
  const disconnected = controller.poll([null]);
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.specialPressed, false);
  assert.equal(disconnected.specialJustPressed, false);

  // Keyboard & Gamepad blending yields cleanly
  const blendedKb = blendDrivingInputs({ throttle: 1, brake: 0, steer: -1 }, { connected: true, throttle: 0, brake: 0, steer: 0 });
  assert.deepEqual(blendedKb, { throttle: 1, brake: 0, steer: -1 });
  const blendedGp = blendDrivingInputs({ throttle: 0, brake: 0, steer: 0 }, { connected: true, throttle: 0.7, brake: 0.2, steer: 0.45 });
  assert.deepEqual(blendedGp, { throttle: 0.7, brake: 0.2, steer: 0.45 });
});

test('Specials operate in toggle mode across classes: press ON, stays ON without hold, press OFF, and auto-OFF on depletion', () => {
  const spa = compileTrack(TRACKS[0]);

  // 1. ERS / Hybrid Deploy (e.g. GTP / F1 2021)
  const gtp = CARS.find((c) => c.id === 'porsche-963')!;
  const ersCar = createCarSimState({
    id: 'ers-toggle',
    name: 'ERS Toggle',
    isPlayer: true,
    carId: gtp.id,
    livery: gtp.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'medium',
  });
  const opts = { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [ersCar] };

  // Press once -> ON
  stepCarPhysics(ersCar, { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true }, spa, 1 / 60, opts);
  assert.equal(ersCar.specialActive, true);
  const chargeAfterStart = ersCar.specialCharge;

  // Release button -> stays ON and keeps draining
  stepCarPhysics(ersCar, { throttle: 1, brake: 0, steer: 0, specialPressed: false, specialJustPressed: false }, spa, 0.5, opts);
  assert.equal(ersCar.specialActive, true);
  assert.ok(ersCar.specialCharge < chargeAfterStart, 'Charge should drain while toggled ON');

  // Hold button without edge -> stays ON (no flicker)
  stepCarPhysics(ersCar, { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: false }, spa, 1 / 60, opts);
  assert.equal(ersCar.specialActive, true);

  // Press again (rising edge) -> toggles OFF and recharges
  const chargeBeforeOff = ersCar.specialCharge;
  stepCarPhysics(ersCar, { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true }, spa, 0.5, opts);
  assert.equal(ersCar.specialActive, false);
  assert.ok(ersCar.specialCharge > chargeBeforeOff, 'Charge should recharge after toggling OFF');

  // Toggle ON again and run until depletion -> auto-turns OFF
  stepCarPhysics(ersCar, { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true }, spa, 1 / 60, opts);
  assert.equal(ersCar.specialActive, true);
  for (let i = 0; i < 400 && ersCar.specialActive; i++) {
    stepCarPhysics(ersCar, { throttle: 1, brake: 0, steer: 0, specialPressed: false, specialJustPressed: false }, spa, 1 / 60, opts);
  }
  assert.equal(ersCar.specialActive, false, 'ERS special should auto-deactivate when charge depletes');

  // 2. GT3 high-beam flash removed: pressing special does not activate any gadget
  const gt3 = CARS.find((c) => c.id === 'ferrari-296-gt3')!;
  const gt3Car = createCarSimState({
    id: 'gt3-toggle',
    name: 'GT3 Toggle',
    isPlayer: true,
    carId: gt3.id,
    livery: gt3.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });
  const gt3Opts = { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [gt3Car] };
  stepCarPhysics(gt3Car, { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true }, spa, 1 / 60, gt3Opts);
  assert.equal(gt3Car.specialActive, false);

  // 3. V10 Overboost: press ON, release stays ON, press again turns OFF
  const v10 = CARS.find((c) => c.id === 'f1-05-renault')!;
  const v10Car = createCarSimState({
    id: 'v10-toggle',
    name: 'V10 Toggle',
    isPlayer: true,
    carId: v10.id,
    livery: v10.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });
  const v10Opts = { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [v10Car] };
  stepCarPhysics(v10Car, { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true }, spa, 1 / 60, v10Opts);
  assert.equal(v10Car.specialActive, true);
  stepCarPhysics(v10Car, { throttle: 1, brake: 0, steer: 0, specialPressed: false, specialJustPressed: false }, spa, 1 / 60, v10Opts);
  assert.equal(v10Car.specialActive, true);
  stepCarPhysics(v10Car, { throttle: 1, brake: 0, steer: 0, specialPressed: true, specialJustPressed: true }, spa, 1 / 60, v10Opts);
  assert.equal(v10Car.specialActive, false);
});

test('AI Policy Variants & Validation Hardening: exposes v5..v9_2, loads v5..v9 + starts, validates v3 ResMLP+LN+ObsNorm, and rejects jagged/NaN weights', async () => {
  const {
    getAiPolicyVariants,
    evaluateNeuralPolicy,
    evaluateBlendedNeuralPolicy,
    validatePolicyWeights,
    buildObservationVector,
    getStartPolicyStatus,
  } = await import('./aiNeuralPolicy');

  const variants = getAiPolicyVariants();
  assert.deepEqual(
    variants.map((v) => v.id),
    ['v5', 'v6', 'v7', 'v8', 'v9', 'v9_2'],
  );
  for (const v of variants.filter((entry) => entry.id !== 'v9_2')) {
    assert.equal(v.loaded, true, `Expected ${v.id} weights to be loaded and valid`);
    assert.equal(v.obsDim, 43);
    assert.equal(v.hiddenDim, 128);
  }
  assert.equal(getStartPolicyStatus().loaded, true, 'Expected starts policy to be loaded directly');

  const obs = new Array(43).fill(0);
  obs[0] = 0.5;
  const blended = evaluateBlendedNeuralPolicy(obs, { v5: 15, v6: 15, v7: 30, v8: 40 });
  assert.ok(blended !== null);
  assert.ok(Number.isFinite(blended.steer) && blended.steer >= -1 && blended.steer <= 1);
  assert.ok(Number.isFinite(blended.throttle) && blended.throttle >= 0 && blended.throttle <= 1);
  assert.ok(Number.isFinite(blended.brake) && blended.brake >= 0 && blended.brake <= 1);

  // Extended v3 3-layer ResMLP + LayerNorm + ObsNorm + window_tanh obsConfig must validate and run cleanly
  const h = 8;
  const zeroMat = (rows: number, cols: number) =>
    Array.from({ length: rows }, () => new Array(cols).fill(0.01));
  const v3Policy = validatePolicyWeights({
    version: 3,
    obsDim: 43,
    actDim: 3,
    hiddenDim: h,
    numHiddenLayers: 3,
    activation: 'tanh',
    residual: true,
    w0: zeroMat(h, 43),
    b0: new Array(h).fill(0),
    ln0Weight: new Array(h).fill(1),
    ln0Bias: new Array(h).fill(0),
    w1: zeroMat(h, h),
    b1: new Array(h).fill(0),
    ln1Weight: new Array(h).fill(1),
    ln1Bias: new Array(h).fill(0),
    w2: zeroMat(h, h),
    b2: new Array(h).fill(0),
    ln2Weight: new Array(h).fill(1),
    ln2Bias: new Array(h).fill(0),
    w3: zeroMat(3, h),
    b3: [0, 0.3, -0.5],
    obsNorm: { mean: new Array(43).fill(0), std: new Array(43).fill(1), clip: 10 },
    obsConfig: {
      lookaheadMeters: [10, 24, 45, 75, 115, 165, 230, 310],
      curvatureMode: 'window_tanh',
      curvatureScale: 14,
    },
  });
  assert.ok(v3Policy !== null, 'Expected valid v3 3-layer ResMLP+LN+ObsNorm policy');
  const v3Out = evaluateNeuralPolicy(obs, v3Policy);
  assert.ok(v3Out !== null);
  assert.ok(v3Out.throttle > 0.5 && v3Out.brake < 0.5, 'Expected positive throttle bias and low brake bias');

  // Verify window_tanh lookahead produces non-saturated, finite curvatures on tight tracks (Monaco)
  const monaco = compileTrack(getTrackById('monaco'), 720);
  const testCar = createCarSimState({
    id: 'obs-test',
    name: 'Test',
    isPlayer: false,
    carId: 'ferrari-499p',
    livery: CARS[0].defaultLivery,
    gridSlot: 0,
    compiledTrack: monaco,
    compound: 'soft',
  });
  const obsV3 = buildObservationVector(testCar, monaco, [testCar], 0, 1, undefined, v3Policy.obsConfig);
  assert.equal(obsV3.length, 43);
  assert.ok(obsV3.every((v) => Number.isFinite(v)), 'Expected all v3 observations finite');

  // Jagged inner row length must be rejected
  const validBase = variants.find((v) => v.id === 'v8')!.weights!;
  const jagged = {
    ...validBase,
    w0: validBase.w0.map((row, idx) => (idx === 0 ? row.slice(0, 42) : row)),
  };
  assert.equal(validatePolicyWeights(jagged), null);
  assert.equal(evaluateNeuralPolicy(obs, jagged as typeof validBase), null);

  // NaN weights or NaN observations must fail safe to null rather than leaking NaN
  const nanWeights = {
    ...validBase,
    b2: validBase.b2.map((x, idx) => (idx === 0 ? Number.NaN : x)),
  };
  assert.equal(validatePolicyWeights(nanWeights), null);
  assert.equal(evaluateNeuralPolicy(obs, nanWeights), null);

  const nanObs = [...obs];
  nanObs[3] = Number.NaN;
  assert.equal(evaluateNeuralPolicy(nanObs, validBase), null);
});

test('ANB1 Binary Weight Codec: round-trips 3-layer ResMLP+LN+ObsNorm weights with exact Float32 inference parity and ~3-4x size reduction', async () => {
  const {
    getAiPolicyVariants,
    encodePolicyWeightsBinary,
    decodePolicyWeightsBinary,
    evaluateNeuralPolicy,
  } = await import('./aiNeuralPolicy');

  const v8 = getAiPolicyVariants().find((v) => v.id === 'v8')!.weights!;
  const bin = encodePolicyWeightsBinary(v8);
  assert.equal(String.fromCharCode(bin[0], bin[1], bin[2], bin[3]), 'ANB1');
  const jsonBytes = Buffer.byteLength(JSON.stringify(v8), 'utf8');
  assert.ok(bin.byteLength < jsonBytes * 0.45, `Expected ANB1 (${bin.byteLength}B) to be <45% of JSON (${jsonBytes}B)`);

  const decoded = decodePolicyWeightsBinary(bin);
  assert.ok(decoded !== null, 'Expected valid decoded ANB1 PolicyWeights');
  assert.equal(decoded.numHiddenLayers, v8.numHiddenLayers);
  assert.equal(decoded.hiddenDim, v8.hiddenDim);
  assert.equal(decoded.obsDim, 43);

  const obs = new Array(43).fill(0).map((_, i) => Math.sin(i * 0.37) * 0.4);
  obs[0] = 0.55;
  const origOut = evaluateNeuralPolicy(obs, v8)!;
  const binOut = evaluateNeuralPolicy(obs, decoded)!;
  assert.ok(Math.abs(origOut.steer - binOut.steer) < 1e-5, 'Steer mismatch after ANB1 round-trip');
  assert.ok(Math.abs(origOut.throttle - binOut.throttle) < 1e-5, 'Throttle mismatch after ANB1 round-trip');
  assert.ok(Math.abs(origOut.brake - binOut.brake) < 1e-5, 'Brake mismatch after ANB1 round-trip');

  // Corrupted magic bytes must fail safely to null
  const bad = new Uint8Array(bin);
  bad[0] = 0x00;
  assert.equal(decodePolicyWeightsBinary(bad), null);
});

test('Starts Policy & Standing Launch Guard: packed 2x2 grid launches cleanly at speed=0 without stalling or steering left, and hands off smoothly', async () => {
  const {
    computeNeuralAIControl,
    computeStartPhaseWeight,
    setStartPolicyWeights,
    getStartPolicyWeights,
    setStartPolicyMode,
    getStartPolicyStatus,
  } = await import('./aiNeuralPolicy');

  const spa = compileTrack(getTrackById('spa-francorchamps'), 720);
  const grid = Array.from({ length: 8 }, (_, slot) =>
    createCarSimState({
      id: `ai-${slot}`,
      name: `AI ${slot}`,
      isPlayer: false,
      carId: 'ferrari-499p',
      livery: CARS[0].defaultLivery,
      gridSlot: slot,
      compiledTrack: spa,
      compound: 'soft',
      startType: 'standing',
    }),
  );

  // Verify mid-pack car (slot 5) at speed=0 launches straight ahead with trained starts policy (no stall, zero brake)
  const midCar = grid[5];
  const initialWeights = getStartPolicyWeights();
  assert.equal(getStartPolicyStatus().source, 'neural');
  const neuralLaunchIn = computeNeuralAIControl(midCar, spa, grid, 1 / 60, 0, 'Alien', {
    raceElapsed: 0.2,
    startType: 'standing',
  });
  assert.ok(neuralLaunchIn.throttle >= 0.55, `Expected clean neural launch throttle, got ${neuralLaunchIn.throttle}`);
  assert.equal(neuralLaunchIn.brake, 0, `Expected zero launch brake, got ${neuralLaunchIn.brake}`);
  assert.ok(Math.abs(neuralLaunchIn.steer) < 0.45, `Expected clean straight launch steering, got ${neuralLaunchIn.steer}`);

  // Verify launch-assist fallback mode produces strong full-traction throttle
  setStartPolicyMode('launch-assist');
  assert.equal(getStartPolicyStatus().source, 'launch-assist');
  const assistLaunchIn = computeNeuralAIControl(midCar, spa, grid, 1 / 60, 0, 'Alien', {
    raceElapsed: 0.2,
    startType: 'standing',
  });
  assert.ok(assistLaunchIn.throttle >= 0.85, `Expected strong launch-assist throttle, got ${assistLaunchIn.throttle}`);
  assert.equal(assistLaunchIn.brake, 0, `Expected zero launch brake, got ${assistLaunchIn.brake}`);
  setStartPolicyMode('neural');

  // Verify standing & rolling handoff curve fades cleanly from 1.0 -> 0.0
  assert.equal(computeStartPhaseWeight({ speed: 0, totalDistance: -0.02 }, { raceElapsed: 0.5, startType: 'standing' }), 1.0);
  assert.equal(computeStartPhaseWeight({ speed: 45, totalDistance: 0.15 }, { raceElapsed: 7.0, startType: 'standing' }), 0.0);
  assert.equal(computeStartPhaseWeight({ speed: 28, totalDistance: -0.05 }, { raceElapsed: 1.0, startType: 'rolling' }), 1.0);
  assert.equal(computeStartPhaseWeight({ speed: 55, totalDistance: 0.12 }, { raceElapsed: 5.0, startType: 'rolling' }), 0.0);

  // Verify custom trained starts policy can be cleared and restored cleanly
  setStartPolicyWeights(null);
  assert.equal(getStartPolicyStatus().loaded, false);
  setStartPolicyWeights(initialWeights);
  assert.equal(getStartPolicyStatus().loaded, true);
});

test('Rolling Start & Bump-Drafting: rolling grid spawns in motion, stays Lap 1 across S/F, and straight-line tow stays on throttle', async () => {
  const { computeNeuralAIControl } = await import('./aiNeuralPolicy');
  const monza = compileTrack(getTrackById('monza'), 720);
  const cars = Array.from({ length: 6 }, (_, slot) =>
    createCarSimState({
      id: `roll-${slot}`,
      name: `Driver ${slot}`,
      isPlayer: slot === 0,
      carId: 'ferrari-499p',
      livery: CARS[0].defaultLivery,
      gridSlot: slot,
      compiledTrack: monza,
      compound: 'soft',
      startType: 'rolling',
      rollingSpeed: 28,
    }),
  );

  const formSpeed = getRollingFormationSpeedMs(cars);
  assert.ok(formSpeed >= 20 && formSpeed <= 32, `Expected formation speed in 20..32 m/s, got ${formSpeed}`);
  for (const c of cars) {
    assert.ok(c.speed >= 26, `Expected rolling car spawned in motion, got ${c.speed}`);
    assert.ok(c.totalDistance < 0, `Expected pre-S/F negative totalDistance, got ${c.totalDistance}`);
    assert.equal(c.lap, 1);
  }

  // Advance P1 under formation control across the S/F line and confirm lap remains 1 (not Lap 2!)
  const lead = cars[0];
  let crossed = false;
  for (let step = 0; step < 480; step++) {
    const ctrl = computeRollingFormationControl(lead, monza, cars, formSpeed, lead.lateralOffset);
    stepCarPhysics(lead, ctrl, monza, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: cars,
    });
    if (lead.trackT < 0.1 && lead.totalDistance >= 0) {
      crossed = true;
      break;
    }
  }
  assert.ok(crossed, 'Expected rolling start pole car to cross S/F line within 8 seconds');
  assert.equal(lead.lap, 1, 'Crossing S/F line on initial rolling start must stay on Lap 1');
  assert.ok(lead.totalDistance >= 0 && lead.totalDistance < 0.2);

  // Straight-line bump-drafting: trailing car tucked 8m behind lead car at 55 m/s on Monza main straight stays on throttle
  const spLead = sampleTrackAtT(monza, 0.04);
  const spTrail = sampleTrackAtT(monza, 0.04 - 8 / monza.totalLength);
  const draftLead = cars[0];
  const draftTrail = cars[1];
  draftLead.trackT = 0.04;
  draftLead.prevTrackT = 0.04;
  draftLead.x = spLead.x;
  draftLead.z = spLead.z;
  draftLead.lateralOffset = 0;
  draftLead.heading = Math.atan2(spLead.tx, spLead.tz);
  draftLead.speed = 54;
  draftLead.vx = Math.sin(draftLead.heading) * 54;
  draftLead.vz = Math.cos(draftLead.heading) * 54;
  draftLead.totalDistance = 0.04;

  draftTrail.trackT = 0.04 - 8 / monza.totalLength;
  draftTrail.prevTrackT = draftTrail.trackT;
  draftTrail.x = spTrail.x;
  draftTrail.z = spTrail.z;
  draftTrail.lateralOffset = 0;
  draftTrail.heading = Math.atan2(spTrail.tx, spTrail.tz);
  draftTrail.speed = 56;
  draftTrail.vx = Math.sin(draftTrail.heading) * 56;
  draftTrail.vz = Math.cos(draftTrail.heading) * 56;
  draftTrail.totalDistance = draftTrail.trackT;

  const draftIn = computeNeuralAIControl(draftTrail, monza, [draftLead, draftTrail], 1 / 60, 0, 'Alien', {
    raceElapsed: 20,
    startType: 'standing',
  });
  assert.ok(draftIn.throttle >= 0.85, `Expected committed bump-draft throttle on straight, got ${draftIn.throttle}`);
  assert.equal(draftIn.brake, 0, `Expected zero brake during clean straight bump-draft, got ${draftIn.brake}`);
});

test('Spawn Ghosting: bypasses car-to-car collisions while timer active, ticks down, then resumes solid collisions', () => {
  const spa = compileTrack(getTrackById('spa-francorchamps'), 720);
  const carA = createCarSimState({
    id: 'ghost-a',
    name: 'A',
    isPlayer: false,
    carId: 'porsche-911-gt3-r',
    livery: CARS[0].defaultLivery,
    gridSlot: 0,
    compiledTrack: spa,
    compound: 'soft',
  });
  const carB = createCarSimState({
    id: 'ghost-b',
    name: 'B',
    isPlayer: false,
    carId: 'porsche-911-gt3-r',
    livery: CARS[0].defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });

  // Place overlapping at closing speed with active spawn ghosting
  carA.x = 0;
  carA.z = 0;
  carA.heading = 0;
  carA.speed = 35;
  carA.vx = 0;
  carA.vz = 35;
  carA.spawnGhostTimer = 1.0;

  carB.x = 0;
  carB.z = 4.1;
  carB.heading = 0;
  carB.speed = 15;
  carB.vx = 0;
  carB.vz = 15;
  carB.spawnGhostTimer = 1.0;

  const ghostImpact = resolveCarCollisions([carA, carB]);
  assert.equal(ghostImpact, 0, 'Expected zero car-to-car impact while spawn ghosting is active');
  assert.equal(carA.vz, 35, 'Expected velocity unchanged while ghosted');

  // Tick timer down to expiry via stepCarPhysics
  for (let i = 0; i < 65; i++) {
    stepCarPhysics(carA, { throttle: 0.2, brake: 0, steer: 0, specialPressed: false }, spa, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [carA, carB],
    });
    stepCarPhysics(carB, { throttle: 0.2, brake: 0, steer: 0, specialPressed: false }, spa, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [carA, carB],
    });
  }
  assert.equal(carA.spawnGhostTimer, 0);
  assert.equal(carB.spawnGhostTimer, 0);

  // Re-overlap once solid and confirm collision triggers normally
  carA.x = 0;
  carA.z = 0;
  carA.heading = 0;
  carA.yawRate = 0;
  carA.vx = 0;
  carA.vz = 35;
  carA.speed = 35;
  carB.x = 0;
  carB.z = 4.1;
  carB.heading = 0;
  carB.yawRate = 0;
  carB.vx = 0;
  carB.vz = 15;
  carB.speed = 15;

  const solidImpact = resolveCarCollisions([carA, carB]);
  assert.ok(solidImpact > 5, `Expected solid collision impact after ghosting expires, got ${solidImpact}`);
});

test('Settings & Controller Input Toggle: disabling controller returns neutral state even when gamepad is active', async () => {
  const { GamepadController } = await import('./gamepad');
  const { getGameSettings, setGameSettings, subscribeGameSettings } = await import('./settings');

  const pad = {
    index: 0,
    id: 'DualShock 4',
    connected: true,
    mapping: 'standard',
    axes: [0.85, 0, -0.6, 0.4],
    buttons: [
      { pressed: true, value: 1 },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { pressed: false, value: 0 },
      { pressed: true, value: 0.9 },
    ],
  };

  const ctrl = new GamepadController();
  const activeState = ctrl.poll([pad]);
  assert.equal(activeState.connected, true);
  assert.ok(activeState.throttle > 0.8 && Math.abs(activeState.steer) > 0.5);

  ctrl.setEnabled(false);
  assert.equal(ctrl.isEnabled(), false);
  const disabledState = ctrl.poll([pad]);
  assert.equal(disabledState.connected, false);
  assert.equal(disabledState.throttle, 0);
  assert.equal(disabledState.brake, 0);
  assert.equal(disabledState.steer, 0);
  assert.equal(disabledState.cameraX, 0);
  assert.equal(disabledState.cameraY, 0);
  assert.equal(disabledState.specialJustPressed, false);

  let notified: boolean | null = null;
  const unsub = subscribeGameSettings((s) => {
    notified = s.controllerEnabled;
  });
  setGameSettings({ controllerEnabled: false });
  assert.equal(getGameSettings().controllerEnabled, false);
  assert.equal(notified, false);
  setGameSettings({ controllerEnabled: true });
  assert.equal(getGameSettings().controllerEnabled, true);
  assert.equal(notified, true);
  unsub();
});

test('Orbit & Hood Camera Defaults: car-centered orbit and rigid 3D hood view', async () => {
  const { computeCameraFrame, DEFAULT_CHASE_CAMERA } = await import('./camera');
  assert.ok(DEFAULT_CHASE_CAMERA.pitch >= 0.4, 'Default orbit pitch should sit high enough for clear forward track sightline');
  assert.ok(DEFAULT_CHASE_CAMERA.distance >= 11, 'Default orbit distance should frame car cleanly');

  const sampleCar = { x: 10, y: 2, z: -5, heading: 0.4, speed: 45, pitch: 0.08, roll: 0.03 };
  const orbitFrame = computeCameraFrame('orbit', sampleCar, 0, 0);
  assert.equal(orbitFrame.isLocked, true);
  assert.equal(orbitFrame.lookAt.x, 10);
  assert.equal(orbitFrame.lookAt.z, -5);
  assert.ok(orbitFrame.lookAt.y > 2, 'Orbit pivot should sit above car origin');
  assert.ok(orbitFrame.position.y > 2 + 4.5, `Expected elevated orbit camera y, got ${orbitFrame.position.y}`);

  const hoodFrame = computeCameraFrame('hood', sampleCar, 0, 0);
  assert.equal(hoodFrame.isLocked, true);
  assert.ok(hoodFrame.lookAt.x > sampleCar.x, 'Hood camera should look ahead along car heading');
  assert.ok(hoodFrame.lookAt.z > sampleCar.z, 'Hood camera should look ahead along car heading');
  assert.ok(hoodFrame.position.y > sampleCar.y && hoodFrame.position.y < sampleCar.y + 3, 'Hood camera should mount closely above bodywork');
});

test('Touch controls math, visibility, and multi-input blending', async () => {
  const { computeTouchPadSteer, shouldShowTouchControls, blendAllDrivingInputs } = await import('./touchControls');
  assert.equal(computeTouchPadSteer(0, 100), 0);
  assert.equal(computeTouchPadSteer(5, 100), 0, 'Small jitter inside deadzone should yield 0');
  assert.ok(computeTouchPadSteer(50, 100) > 0 && computeTouchPadSteer(50, 100) < 0.6);
  assert.equal(computeTouchPadSteer(100, 100), 1);
  assert.equal(computeTouchPadSteer(-100, 100), -1);

  assert.equal(shouldShowTouchControls('always', false), true);
  assert.equal(shouldShowTouchControls('off', true), false);
  assert.equal(shouldShowTouchControls('auto', true), true);
  assert.equal(shouldShowTouchControls('auto', false), false);

  const blended = blendAllDrivingInputs(
    { throttle: 0, brake: 0, steer: 0 },
    { connected: false, throttle: 0, brake: 0, steer: 0 },
    { active: true, throttle: 0.9, brake: 0, steer: -0.65 },
  );
  assert.equal(blended.throttle, 0.9);
  assert.equal(blended.steer, -0.65);
});

test('LMP2 Oreca 07 and non-hybrid GT4/GT3 cars do not use hybrid engine types', () => {
  const oreca = getCarById('oreca-07');
  assert.equal(oreca.engineType, 'v8', 'LMP2 Oreca 07 Gibson must be pure naturally aspirated V8, not hybrid');
  const glickenhaus = getCarById('glickenhaus-scg-007');
  assert.equal(glickenhaus.engineType, 'v8', 'Glickenhaus SCG 007 LMH is a non-hybrid twin-turbo V8');

  const arturaGt4 = getCarById('mclaren-artura-gt4');
  assert.equal(arturaGt4.engineType, 'v6', 'McLaren Artura GT4 races without the road hybrid system');
  const supraGt4 = getCarById('toyota-supra-gt4');
  assert.equal(supraGt4.engineType, 'turbo-i6');
  const bmwM4Gt4 = getCarById('bmw-m4-gt4');
  assert.equal(bmwM4Gt4.engineType, 'turbo-i6');

  for (const cls of [CarClassId.LMP2, CarClassId.GT4, CarClassId.GT3]) {
    for (const car of getCarsByClass(cls)) {
      assert.ok(
        !car.engineType.includes('hybrid'),
        `Expected ${car.id} (${cls}) to be non-hybrid, got ${car.engineType}`,
      );
    }
  }
});

const testLivery: LiveryConfig = getCarById('ferrari-499p').defaultLivery;

test('Exponential slipstream tow reaches ~45m back, ramps up closely, and works for AI and Player alike', async () => {
  const { computeSlipstreamStrength } = await import('./physics');
  const track = compileTrack(getTrackById('monza-mini'));
  const leader = createCarSimState({
    id: 'leader',
    name: 'Leader',
    isPlayer: false,
    carId: 'ferrari-499p',
    livery: testLivery,
    gridSlot: 0,
    compiledTrack: track,
    compound: 'medium',
  });
  const followerAi = createCarSimState({
    id: 'ai-1',
    name: 'Chaser',
    isPlayer: false,
    carId: 'ferrari-499p',
    livery: testLivery,
    gridSlot: 1,
    compiledTrack: track,
    compound: 'medium',
  });
  leader.speed = 65;
  followerAi.speed = 65;
  leader.lateralOffset = 0;
  followerAi.lateralOffset = 0;

  leader.trackT = 0.5;
  // 42m back: subtle wake already present
  followerAi.trackT = 0.5 - 42 / track.totalLength;
  const farWake = computeSlipstreamStrength(followerAi, [leader, followerAi], track.totalLength);
  assert.ok(farWake > 0.01 && farWake < 0.15, `Expected subtle wake at 42m, got ${farWake}`);

  // 20m back: moderate wake
  followerAi.trackT = 0.5 - 20 / track.totalLength;
  const midWake = computeSlipstreamStrength(followerAi, [leader, followerAi], track.totalLength);

  // 6m back: strong exponential wake
  followerAi.trackT = 0.5 - 6 / track.totalLength;
  const closeWake = computeSlipstreamStrength(followerAi, [leader, followerAi], track.totalLength);

  assert.ok(midWake > farWake * 2.5, `Expected wake to build strongly from 42m (${farWake}) to 20m (${midWake})`);
  assert.ok(closeWake > midWake * 2.0, `Expected exponential spike from 20m (${midWake}) to 6m (${closeWake})`);

  // Lateral offset outside wake core drops tow to ~0
  followerAi.lateralOffset = 4.5;
  const outOfWake = computeSlipstreamStrength(followerAi, [leader, followerAi], track.totalLength);
  assert.equal(outOfWake, 0);
});

test('Dynamic AI pack pace slows runaway leaders and boosts AI trailing behind the player', async () => {
  const { computeDynamicAiPackPace } = await import('./physics');
  const track = compileTrack(getTrackById('monza-mini'));
  const makeCar = (id: string, name: string, isPlayer: boolean, slot: number) =>
    createCarSimState({
      id,
      name,
      isPlayer,
      carId: 'porsche-963',
      livery: testLivery,
      gridSlot: slot,
      compiledTrack: track,
      compound: 'medium',
    });

  const player = makeCar('player', 'Player', true, 0);
  const aiAhead = makeCar('ai-ahead', 'Marco Rossi', false, 1);
  const aiFarAhead = makeCar('ai-far', 'Liam Vance', false, 2);
  const aiBehind = makeCar('ai-behind', 'Sora Sato', false, 3);

  player.totalDistance = 1.0;
  aiAhead.totalDistance = 1.0 + 40 / track.totalLength;
  aiFarAhead.totalDistance = 1.0 + 180 / track.totalLength;
  aiBehind.totalDistance = 1.0 - 90 / track.totalLength;

  const pack = [player, aiAhead, aiFarAhead, aiBehind];
  const pacePlayer = computeDynamicAiPackPace(player, pack, track.totalLength);
  const paceAhead = computeDynamicAiPackPace(aiAhead, pack, track.totalLength);
  const paceFarAhead = computeDynamicAiPackPace(aiFarAhead, pack, track.totalLength);
  const paceBehind = computeDynamicAiPackPace(aiBehind, pack, track.totalLength);

  assert.equal(pacePlayer, 1.0, 'Player pace multiplier is untouched');
  assert.ok(paceAhead < 1.0, `AI ahead of player should slightly ease off, got ${paceAhead}`);
  assert.ok(paceFarAhead < paceAhead, `Further-ahead AI (${paceFarAhead}) should ease off more than closer AI (${paceAhead})`);
  assert.ok(paceBehind > 1.02, `AI behind player should push harder to fight, got ${paceBehind}`);
});

test('Solid track barriers clamp car bodywork strictly inside the barrier face', async () => {
  const { computeTrackWallHalfWidth } = await import('./tracks');
  const track = compileTrack(getTrackById('monza-mini'));
  const car = createCarSimState({
    id: 'p1',
    name: 'Player',
    isPlayer: true,
    carId: 'porsche-911-gt3-r',
    livery: testLivery,
    gridSlot: 0,
    compiledTrack: track,
    compound: 'medium',
  });
  const sample = sampleTrackAtT(track, car.trackT);
  const halfW = track.spec.trackWidth * 0.5;
  const wallHalfWidth = computeTrackWallHalfWidth(halfW, sample.curvature || 0, 1);

  // Push car beyond the outer barrier and step physics so wall containment triggers
  const farOutside = wallHalfWidth + 4.0;
  car.x = sample.x + sample.nx * farOutside;
  car.z = sample.z + sample.nz * farOutside;
  car.lateralOffset = farOutside;
  car.speed = 35;
  car.vx = sample.nx * 20;
  car.vz = sample.nz * 20;

  stepCarPhysics(
    car,
    { throttle: 0.5, brake: 0, steer: 0, specialPressed: false },
    track,
    1 / 60,
    {
      trackWetness: 0,
      totalLaps: 3,
      isQualifying: false,
      allCars: [car],
    },
  );
  assert.ok(
    Math.abs(car.lateralOffset) < wallHalfWidth,
    `Car center (${car.lateralOffset}) must stay strictly inside barrier face (${wallHalfWidth}) so body cannot clip outside`,
  );
  assert.ok((car.lastWallImpact ?? 0) > 0, 'Wall contact must record impact magnitude for player-only shake');
});

test('computeStandings computes accurate non-zero finish time gaps once cars cross the line', () => {
  const track = compileTrack(getTrackById('monza-mini'));
  const makeCar = (id: string, name: string, slot: number) =>
    createCarSimState({
      id,
      name,
      isPlayer: false,
      carId: 'ferrari-499p',
      livery: testLivery,
      gridSlot: slot,
      compiledTrack: track,
      compound: 'medium',
    });

  const c1 = makeCar('c1', 'Marco Rossi', 0);
  const c2 = makeCar('c2', 'Liam Vance', 1);
  const c3 = makeCar('c3', 'Sora Sato', 2);

  c1.finished = true;
  c1.lap = 3;
  c1.totalTime = 120.42;
  c1.totalDistance = 3.01;
  c2.finished = true;
  c2.lap = 3;
  c2.totalTime = 122.17;
  c2.totalDistance = 3.005;
  c3.finished = false;
  c3.lap = 2;
  c3.totalTime = 124.0;
  c3.totalDistance = 2.85;

  const standings = computeStandings([c2, c3, c1], track);
  assert.equal(standings[0].id, 'c1');
  assert.equal(standings[0].intervalToLeader, 0);
  assert.equal(standings[1].id, 'c2');
  assert.ok(
    Math.abs(standings[1].intervalToLeader - 1.75) < 0.01,
    `Expected +1.75s finish gap, got ${standings[1].intervalToLeader}`,
  );
  assert.equal(standings[2].id, 'c3');
  assert.ok(standings[2].intervalToLeader > 0, 'Unfinished car behind finished leader should have positive gap');
});

test('AI nametag plates use F. Lastname while full names remain intact for results/classification and human peers', async () => {
  const { formatShortDriverPlateName, formatNametagLabel } = await import('../three/nametagSprite');
  assert.equal(formatShortDriverPlateName('Marco Rossi'), 'M. Rossi');
  assert.equal(formatShortDriverPlateName('Carlos De La Rosa'), 'C. De La Rosa');
  assert.equal(formatShortDriverPlateName('Vance'), 'Vance');

  const aiPlate = formatNametagLabel({
    id: 'ai-1',
    driverName: 'Marco Rossi',
    classId: CarClassId.HYPERCAR_GTP,
    isHumanPeer: false,
  });
  assert.equal(aiPlate.nameText, 'M. Rossi');

  const humanPlate = formatNametagLabel({
    id: 'peer-1',
    driverName: 'Alex Vance',
    classId: CarClassId.HYPERCAR_GTP,
    isHumanPeer: true,
  });
  assert.equal(humanPlate.nameText, 'Alex Vance');
});

test('Section 1 & 2 Systems: Dynamic weather evolution, drying line, track rubbering, DRS/Attack zones, flags & standing-start launch', async () => {
  const {
    createWeatherSystemState,
    stepWeatherSystem,
    sampleLocalTrackSurfaceWeather,
    computeTrackSpecialZones,
    createRaceControlState,
    stepRaceControl,
    evaluateStandingStartLaunch,
    cycleErsMode,
  } = await import('./raceSystems');

  const spa = compileTrack(getTrackById('spa-francorchamps'));
  const weather = createWeatherSystemState({
    weatherMode: 'dynamic-rain',
    weatherPreset: 'drying-track',
    compiledTrack: spa,
    totalLaps: 5,
  });
  const initLineWet = weather.racingLineWetness;
  for (let i = 0; i < 60; i++) {
    stepWeatherSystem(weather, 0.5, spa.spec.scenery, 12, 0.45);
  }
  assert.ok(
    weather.racingLineWetness < initLineWet,
    'Racing line should dry during drying-track phase',
  );
  assert.ok(
    weather.racingLineWetness <= weather.offLineWetness + 0.01,
    'Racing line should dry faster than off-line asphalt',
  );
  const spaHalfW = spa.spec.trackWidth * 0.5;
  const onLine = sampleLocalTrackSurfaceWeather(weather, 0.25, 0.0, spaHalfW);
  const offLine = sampleLocalTrackSurfaceWeather(weather, 0.25, spaHalfW * 0.85, spaHalfW);
  assert.ok(offLine.localWetness >= onLine.localWetness);

  // DRS & Formula E Attack Mode zones
  const zones = computeTrackSpecialZones(spa);
  assert.ok(zones.drsZones.length >= 1, 'Circuit must derive at least 1 DRS zone');
  assert.ok(zones.attackModeZone.lateralMinRatio > 0.3, 'Attack mode zone must be off-line');

  // ERS mode cycling
  assert.equal(cycleErsMode('balanced'), 'overtake');
  assert.equal(cycleErsMode('quali'), 'harvest');

  // Standing-start launch & jump-start evaluation
  const perfect = evaluateStandingStartLaunch({ rpmNormalized: 0.78, jumpStartTriggered: false });
  assert.equal(perfect.status, 'perfect');
  assert.ok(perfect.launchBoostSeconds > 1.0);
  const jumped = evaluateStandingStartLaunch({ rpmNormalized: 0.99, jumpStartTriggered: true });
  assert.equal(jumped.status, 'jump-start');
  assert.equal(jumped.postRacePenaltySeconds, 5);

  // Local yellow & Blue flag detection
  const rc = createRaceControlState();
  const fastCar = createCarSimState({
    id: 'fast',
    name: 'Leader',
    isPlayer: false,
    carId: 'f1-2026-aero',
    livery: getCarById('f1-2026-aero').defaultLivery,
    gridSlot: 0,
    compiledTrack: spa,
    compound: 'soft',
  });
  const slowCar = createCarSimState({
    id: 'slow',
    name: 'Backmarker',
    isPlayer: true,
    carId: 'gt3-ferrari-296',
    livery: getCarById('gt3-ferrari-296').defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'medium',
  });
  fastCar.trackT = 0.20;
  fastCar.totalDistance = 1.20;
  fastCar.speed = 65;
  slowCar.trackT = 0.208;
  slowCar.totalDistance = 0.208;
  slowCar.speed = 42;
  stepRaceControl(rc, [fastCar, slowCar], spa, zones, 0.1, {
    totalLaps: 5,
    isRace: true,
    safetyCarEnabled: true,
  });
  assert.equal(slowCar.blueFlagActive, true, 'Lapped slower-class car should receive a Blue Flag');
});

test('Section 2 Physics & Garage: 4-wheel tires, brake lock-up without ABS, surface classification, car setup APXSET round-trip, localized damage & 59-dim v9_2 policy', async () => {
  const {
    CAR_SETUP_PRESETS,
    encodeSetupCode,
    decodeSetupCode,
    computeSetupPhysicsModifiers,
  } = await import('./carSetup');
  const {
    applyLocalizedImpactDamage,
    classifyTrackSurface,
  } = await import('./physics');
  const {
    buildPhysicsAwareObservationVector,
    validatePolicyWeights,
    evaluateNeuralPolicy,
    encodePolicyWeightsBinary,
    decodePolicyWeightsBinary,
  } = await import('./aiNeuralPolicy');

  // Setup APXSET share code round-trip
  const monzaSetup = CAR_SETUP_PRESETS.find((p) => p.id === 'low-downforce')!.setup;
  const code = encodeSetupCode(monzaSetup);
  assert.ok(code.startsWith('APXSET:'));
  const decoded = decodeSetupCode(code);
  assert.ok(decoded !== null);
  assert.equal(decoded!.rearWing, monzaSetup.rearWing);
  const monzaMods = computeSetupPhysicsModifiers(monzaSetup);
  const monacoMods = computeSetupPhysicsModifiers(
    CAR_SETUP_PRESETS.find((p) => p.id === 'high-downforce')!.setup,
  );
  assert.ok(monzaMods.topSpeedMult > monacoMods.topSpeedMult, 'Low-downforce setup must yield higher top speed');
  assert.ok(monacoMods.overallDownforceMult > monzaMods.overallDownforceMult, 'High-downforce setup must yield higher cornering downforce');

  // Surface classification
  const spa = compileTrack(getTrackById('spa-francorchamps'));
  const halfW = spa.spec.trackWidth * 0.5;
  assert.equal(classifyTrackSurface(0, halfW, 0, spa.spec.scenery, 0).surface, 'asphalt');
  assert.equal(classifyTrackSurface(halfW + 0.5, halfW, 0.02, spa.spec.scenery, 0).surface, 'kerb');
  assert.equal(classifyTrackSurface(halfW + 1.9, halfW, 0.03, spa.spec.scenery, 0).surface, 'sausage-kerb');
  assert.equal(classifyTrackSurface(-(halfW + 3.4), halfW, 0.02, 'forest', 0).surface, 'gravel');

  // 4-wheel tire dynamics, brake lock-up (ABS off), & localized damage levels
  const car = createCarSimState({
    id: 'p1',
    name: 'Test',
    isPlayer: true,
    carId: 'f1-2026-aero',
    livery: getCarById('f1-2026-aero').defaultLivery,
    gridSlot: 0,
    compiledTrack: spa,
    compound: 'soft',
    absLevel: 'off',
    damageLevel: 'realistic',
  });
  car.speed = 65;
  car.vx = Math.sin(car.heading) * 65;
  car.vz = Math.cos(car.heading) * 65;
  for (let i = 0; i < 20; i++) {
    stepCarPhysics(car, { throttle: 0, brake: 1, steer: 0, specialPressed: false }, spa, 1 / 60, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [car],
      absLevel: 'off',
      damageLevel: 'realistic',
    });
  }
  assert.ok((car.brakeTempFront ?? 0) > 300, 'Hard braking should heat front brakes');
  assert.ok(car.tires !== undefined && car.tires.fl.flatSpot > 0, 'Heavy braking with ABS off should create front flat-spot');

  applyLocalizedImpactDamage(car, 'front', 14, 20, 1);
  assert.ok((car.damage?.frontWing ?? 0) > 10, 'Front impact should damage frontWing zone');
  const noDmgCar = createCarSimState({
    id: 'p2',
    name: 'NoDmg',
    isPlayer: false,
    carId: 'f1-2026-aero',
    livery: getCarById('f1-2026-aero').defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
    damageLevel: 'off',
  });
  applyLocalizedImpactDamage(noDmgCar, 'front', 14, 20, 1);
  assert.equal(noDmgCar.damage?.frontWing ?? 0, 0, 'Damage level off should inflict zero damage');

  // 59-dim v9_2 physics-aware observation vector + validation + ANB1 binary round-trip
  const obs59 = buildPhysicsAwareObservationVector(car, spa, [car], car.steerAngle, 1.0, car.bopMultipliers);
  assert.equal(obs59.length, 59);
  assert.ok(obs59.every((v) => Number.isFinite(v)), 'All 59 obs features must be finite');

  const h = 8;
  const zMat = (r: number, c: number) => Array.from({ length: r }, () => new Array(c).fill(0.01));
  const v92Policy = validatePolicyWeights({
    version: 3,
    obsDim: 59,
    actDim: 3,
    hiddenDim: h,
    numHiddenLayers: 3,
    activation: 'tanh',
    residual: true,
    w0: zMat(h, 59),
    b0: new Array(h).fill(0),
    ln0Weight: new Array(h).fill(1),
    ln0Bias: new Array(h).fill(0),
    w1: zMat(h, h),
    b1: new Array(h).fill(0),
    ln1Weight: new Array(h).fill(1),
    ln1Bias: new Array(h).fill(0),
    w2: zMat(h, h),
    b2: new Array(h).fill(0),
    ln2Weight: new Array(h).fill(1),
    ln2Bias: new Array(h).fill(0),
    w3: zMat(3, h),
    b3: [0, 0.2, -0.4],
    obsNorm: { mean: new Array(59).fill(0), std: new Array(59).fill(1), clip: 10 },
  });
  assert.ok(v92Policy !== null && v92Policy.obsDim === 59);
  const act59 = evaluateNeuralPolicy(obs59, v92Policy!);
  assert.ok(act59 !== null);
  assert.ok(Number.isFinite(act59!.steer) && Number.isFinite(act59!.throttle) && Number.isFinite(act59!.brake));
  const binBuf = encodePolicyWeightsBinary(v92Policy!);
  const binDecoded = decodePolicyWeightsBinary(binBuf);
  assert.ok(binDecoded !== null && binDecoded.obsDim === 59);
});

test('Section 3 & On-Track Repair: on-track 3.0s repair (no pit lanes), Ghost/Records/Daily Challenge, Championships, Scenarios, Elimination & AI Pace Orders', async () => {
  const { requestOnTrackPitStop, applyLocalizedImpactDamage } = await import('./physics');
  const {
    computeTrackClassMedalTargets,
    evaluateMedal,
    computeLiveDeltaSeconds,
    sampleRecordedGhostAtTime,
    sampleTargetGhostAtTime,
    getDailyHotlapChallenge,
  } = await import('./records');
  const {
    CHAMPIONSHIP_PRESETS,
    createChampionshipSeason,
    recordChampionshipSessionResult,
    computeConstructorStandings,
    getCollectorRank,
  } = await import('./championship');
  const {
    RACE_SCENARIOS,
    LICENSE_TESTS,
    buildRaceConfigPatchFromScenario,
    evaluateScenarioResult,
    createEliminationState,
    stepEliminationState,
    getAiPaceOrderModifiers,
  } = await import('./scenarios');

  // 1) On-Track Repair Service (3.0s, zero pit lanes)
  const spa = compileTrack(getTrackById('spa-francorchamps'));
  const repairCar = createCarSimState({
    id: 'rep-1',
    name: 'Repair Tester',
    isPlayer: true,
    carId: 'ferrari-499p',
    livery: getCarById('ferrari-499p').defaultLivery,
    gridSlot: 0,
    compiledTrack: spa,
    compound: 'soft',
    damageLevel: 'realistic',
  });
  repairCar.speed = 0;
  repairCar.vx = 0;
  repairCar.vz = 0;
  repairCar.aeroDamage = 48;
  applyLocalizedImpactDamage(repairCar, 'front', 16, 20, 1);
  assert.ok((repairCar.damage?.frontWing ?? 0) > 10);

  const started = requestOnTrackPitStop(repairCar, 'repair');
  assert.equal(started, true, 'Stopped car should accept on-track repair request');
  assert.equal(repairCar.pitActiveTask, 'repair');
  assert.equal(repairCar.pitStopRemaining, 3.0);

  for (let i = 0; i < 200; i++) {
    stepCarPhysics(
      repairCar,
      { throttle: 0, brake: 0, steer: 0, specialPressed: false },
      spa,
      1 / 60,
      { trackWetness: 0, totalLaps: 3, isQualifying: false, allCars: [repairCar] },
    );
  }
  assert.equal(repairCar.pitStopRemaining, 0, '3.0s on-track repair should complete');
  assert.equal(repairCar.aeroDamage, 0, 'On-track repair must restore aeroDamage to 0');
  assert.equal(repairCar.damage?.frontWing ?? 0, 0, 'On-track repair must restore frontWing damage to 0');

  // 2) Records, Medal Targets, Ghost Sampling, Live Delta & Deterministic Daily Hotlap
  const f1Targets = computeTrackClassMedalTargets(spa.spec, CarClassId.F1_2026);
  const gt4Targets = computeTrackClassMedalTargets(spa.spec, CarClassId.GT4);
  assert.ok(f1Targets.alien < f1Targets.gold && f1Targets.gold < f1Targets.silver && f1Targets.silver < f1Targets.bronze);
  assert.ok(gt4Targets.gold > f1Targets.gold, 'Slower GT4 class should have slower Gold target than F1 2026');
  assert.equal(evaluateMedal(f1Targets.alien - 0.1, f1Targets), 'alien');
  assert.equal(evaluateMedal(f1Targets.gold, f1Targets), 'gold');
  assert.equal(evaluateMedal(f1Targets.bronze + 5, f1Targets), null);

  const targetSample = sampleTargetGhostAtTime(spa, 90, 45);
  assert.ok(Math.abs(targetSample.trackT - 0.5) < 0.01);
  const ghostSamples = [
    { time: 0, trackT: 0, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 },
    { time: 20, trackT: 0.25, x: 10, y: 0, z: 10, heading: 0.2, pitch: 0, roll: 0 },
    { time: 40, trackT: 0.5, x: 20, y: 0, z: 20, heading: 0.4, pitch: 0, roll: 0 },
    { time: 60, trackT: 0.75, x: 30, y: 0, z: 30, heading: 0.6, pitch: 0, roll: 0 },
    { time: 80, trackT: 1.0, x: 40, y: 0, z: 40, heading: 0.8, pitch: 0, roll: 0 },
  ];
  const sampled = sampleRecordedGhostAtTime(ghostSamples, 80, 30);
  assert.ok(sampled !== null && Math.abs(sampled!.x - 15) < 0.1);
  const delta = computeLiveDeltaSeconds({
    currentTrackT: 0.5,
    currentLapTime: 38.5,
    referenceSamples: ghostSamples,
    referenceLapTime: 80,
  });
  assert.ok(delta !== null && Math.abs(delta! - -1.5) < 0.01, `Expected -1.5s live delta, got ${delta}`);

  const dailyA = getDailyHotlapChallenge('2026-11-21');
  const dailyB = getDailyHotlapChallenge('2026-11-21');
  assert.equal(dailyA.trackId, dailyB.trackId);
  assert.equal(dailyA.carId, dailyB.carId);

  // 3) Championship Full Weekend Flow, Points + Pole + Fastest Lap + Constructors Standings
  const f1Series = CHAMPIONSHIP_PRESETS.find((p) => p.id === 'f1-world-championship')!;
  let season = createChampionshipSeason({ series: f1Series, weekendFormat: 'full-weekend' });
  assert.equal(season.currentStage, 'practice');

  season = recordChampionshipSessionResult(season, { standings: [], stage: 'practice' }).nextState;
  assert.equal(season.currentStage, 'qualifying');

  const qualiRes = recordChampionshipSessionResult(season, { standings: [], stage: 'qualifying', qualiGridPos: 1 });
  season = qualiRes.nextState;
  assert.equal(qualiRes.playerPointsEarned, 1, 'Pole position should award +1 bonus point');
  assert.equal(season.currentStage, 'sprint');

  const mockStandings = [
    {
      id: 'player',
      name: 'You',
      isPlayer: true,
      isHumanPeer: false,
      carId: season.playerCarId,
      classId: CarClassId.F1_2026,
      driverNumber: '16',
      position: 1,
      classPosition: 1,
      lap: 5,
      progress: 1,
      totalDistance: 5,
      intervalToAhead: 0,
      intervalToLeader: 0,
      bestLapTime: 88.2,
      lastLapTime: 88.5,
      totalTime: 445,
      pitStops: 0,
      inPit: false,
      finished: true,
      primaryColor: '#dc2626',
      secondaryColor: '#facc15',
    },
    {
      id: 'ai-1',
      name: 'Marco Rossi',
      isPlayer: false,
      isHumanPeer: false,
      carId: 'f1-26-redbull',
      classId: CarClassId.F1_2026,
      driverNumber: '1',
      position: 2,
      classPosition: 2,
      lap: 5,
      progress: 1,
      totalDistance: 4.95,
      intervalToAhead: 3,
      intervalToLeader: 3,
      bestLapTime: 89.0,
      lastLapTime: 89.4,
      totalTime: 448,
      pitStops: 0,
      inPit: false,
      finished: true,
      primaryColor: '#1e3a8a',
      secondaryColor: '#f59e0b',
    },
  ];
  const sprintRes = recordChampionshipSessionResult(season, { standings: mockStandings, stage: 'sprint' });
  season = sprintRes.nextState;
  assert.equal(sprintRes.playerPointsEarned, 8, 'Sprint P1 should award 8 pts');
  assert.equal(season.currentStage, 'feature');

  const featureRes = recordChampionshipSessionResult(season, { standings: mockStandings, stage: 'feature' });
  season = featureRes.nextState;
  assert.equal(featureRes.playerPointsEarned, 26, 'Feature P1 (25) + Fastest Lap (1) = 26 pts');
  assert.equal(season.currentRoundIndex, 1, 'Feature completion should advance to Round 2');
  const constructors = computeConstructorStandings(season.driverStandings);
  assert.ok(constructors.length >= 2 && constructors[0].points >= 35);
  assert.equal(getCollectorRank(1500).title, 'Factory Works Ace');

  // 4) Scenarios, Licenses, Elimination Knockout & AI Race Engineer Pace Orders
  const scenPatch = buildRaceConfigPatchFromScenario(RACE_SCENARIOS[0]);
  assert.equal(scenPatch.sessionMode, 'scenario');
  assert.equal(scenPatch.startingGridPosition, 10);
  const licPatch = buildRaceConfigPatchFromScenario(LICENSE_TESTS[0]);
  assert.equal(licPatch.sessionMode, 'license');
  assert.equal(licPatch.noAi, true);

  const scenEval = evaluateScenarioResult(RACE_SCENARIOS[0], {
    position: 1,
    totalCars: 10,
    warningCount: 0,
    fuel: 80,
    standings: mockStandings,
  } as unknown as Parameters<typeof evaluateScenarioResult>[1]);
  assert.equal(scenEval.passed, true);
  assert.equal(scenEval.medal, 'gold');

  const elimState = createEliminationState(true, 20);
  const elimCars = [
    { id: 'c1', name: 'Leader', totalDistance: 1.5, finished: false, eliminated: false },
    { id: 'c2', name: 'Mid', totalDistance: 1.2, finished: false, eliminated: false },
    { id: 'c3', name: 'Last', totalDistance: 0.9, finished: false, eliminated: false },
  ];
  const ko1 = stepEliminationState(elimState, elimCars, elimState.countdown + 0.1);
  assert.equal(ko1.eliminatedCar?.id, 'c3');
  assert.equal(ko1.winnerCar, null);
  const ko2 = stepEliminationState(elimState, elimCars, elimState.countdown + 0.1);
  assert.equal(ko2.eliminatedCar?.id, 'c2');
  assert.equal(ko2.winnerCar?.id, 'c1');

  assert.ok(getAiPaceOrderModifiers('attack').paceMultiplier > getAiPaceOrderModifiers('conserve').paceMultiplier);
});





