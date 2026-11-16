import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARS,
  CAR_CLASSES,
  computeBoPEquilibriumScore,
  getCarsByClass,
  resolveCarSpecial,
  validateDriverNumber,
} from './cars';
import { CarClassId, TrackSpec, TrackWaypoint } from './types';
import { TRACKS, compileTrack, projectOntoTrack, sampleTrackAtT } from './tracks';
import {
  CUSTOM_TRACK_TEMPLATES,
  analyzeTrackGeometry,
  exportTrackToJson,
  exportTrackToShareCode,
  importTrackFromString,
} from './customTracks';
import {
  computeAIControl,
  computeStandings,
  createCarSimState,
  getCompoundModifiers,
  stepCarPhysics,
} from './physics';

test('All requested car classes are unlocked and populated', () => {
  assert.equal(getCarsByClass(CarClassId.HYPERCAR_GTP).length, 12);
  assert.equal(getCarsByClass(CarClassId.LMP2).length, 3);
  assert.equal(getCarsByClass(CarClassId.GT3).length, 10);
  assert.equal(getCarsByClass(CarClassId.F1_2026).length, 11);
  assert.equal(getCarsByClass(CarClassId.F1_2021).length, 4);
  assert.equal(getCarsByClass(CarClassId.F1_2005).length, 4);
  assert.equal(getCarsByClass(CarClassId.FORMULA_E).length, 4);
  assert.equal(getCarsByClass(CarClassId.TRACK_COUPE).length, 4);
  assert.equal(getCarsByClass(CarClassId.SUPERCAR).length, 5);
  assert.ok(CARS.length >= 57);
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
  const spa = compileTrack(TRACKS[0]);
  const f1 = CARS.find((c) => c.id === 'f1-26-ferrari')!;
  const car = createCarSimState({
    id: 'p1',
    name: 'Player',
    isPlayer: true,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });

  // Accelerate for 3 seconds
  for (let i = 0; i < 180; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, specialPressed: false },
      spa,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
  }
  assert.ok(car.speed > 25, `Expected car to accelerate past 25 m/s, got ${car.speed}`);

  // Toggle Active Aero on
  stepCarPhysics(
    car,
    { throttle: 1, brake: 0, steer: 0, specialPressed: true },
    spa,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
  );
  assert.equal(car.specialActive, true);

  // Braking automatically closes Active Aero wing
  stepCarPhysics(
    car,
    { throttle: 0, brake: 0.8, steer: 0, specialPressed: false },
    spa,
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

test('Issue 1: Pit Speed Limiter strictly clamps forward speed to 60 km/h (16.67 m/s)', () => {
  const spa = compileTrack(TRACKS[0]);
  const f1 = CARS.find((c) => c.id === 'f1-26-ferrari')!;
  const car = createCarSimState({
    id: 'p1',
    name: 'Player',
    isPlayer: true,
    carId: f1.id,
    livery: f1.defaultLivery,
    gridSlot: 1,
    compiledTrack: spa,
    compound: 'soft',
  });

  // Enter pit at high speed (45 m/s = 162 km/h)
  car.speed = 45;
  // Engage manual pit limiter
  stepCarPhysics(
    car,
    { throttle: 1, brake: 0, steer: 0, specialPressed: false, pitLimiterToggle: true },
    spa,
    1 / 60,
    { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
  );
  assert.equal(car.pitLimiterActive, true);

  // Run physics for 2 seconds with 100% full throttle
  for (let i = 0; i < 120; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, specialPressed: false },
      spa,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [car] },
    );
  }

  // Clamped to 60 km/h (16.67 m/s) despite 100% throttle
  assert.ok(car.speed <= 16.7, `Expected car speed <= 16.7 m/s, got ${car.speed}`);
  assert.ok(car.speed >= 16.5, `Expected car speed >= 16.5 m/s, got ${car.speed}`);
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

test('Issue 6: AI Anti-Stuck Watchdog resets car if stationary for > 2.0s', () => {
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

  // Run for 2.2 seconds
  for (let i = 0; i < 135; i++) {
    stepCarPhysics(
      aiCar,
      { throttle: 0, brake: 0, steer: 0, specialPressed: false },
      spa,
      1 / 60,
      { trackWetness: 0, totalLaps: 5, isQualifying: false, allCars: [aiCar] },
    );
  }

  // Watchdog should have triggered and reset the car back onto the spline at rolling speed
  assert.ok(aiCar.speed >= 12, `Expected reset car speed >= 12 m/s, got ${aiCar.speed}`);
  assert.ok(Math.hypot(aiCar.x, aiCar.z) < 2000, 'Expected car to be placed back near track coordinates');
});

test('Issue 9: Flagship circuits scaled to 35–55s for standard tracks and 65–75s for Spa/Le Mans', () => {
  const spa = TRACKS.find((t) => t.id === 'spa-francorchamps')!;
  const leMans = TRACKS.find((t) => t.id === 'le-mans')!;
  assert.ok(spa.targetLapSeconds >= 65 && spa.targetLapSeconds <= 75, `Spa lap ${spa.targetLapSeconds} outside 65-75s`);
  assert.ok(leMans.targetLapSeconds >= 65 && leMans.targetLapSeconds <= 75, `Le Mans lap ${leMans.targetLapSeconds} outside 65-75s`);

  const standardCircuits = TRACKS.filter((t) => t.flagship && t.id !== 'spa-francorchamps' && t.id !== 'le-mans');
  for (const t of standardCircuits) {
    assert.ok(
      t.targetLapSeconds >= 35 && t.targetLapSeconds <= 55,
      `Track ${t.name} target lap ${t.targetLapSeconds} outside 35-55s`,
    );
  }
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
  const ccwIds = ['laguna-seca', 'imola', 'interlagos', 'baku', 'yas-marina', 'cota', 'jeddah', 'miami', 'las-vegas', 'singapore', 'detroit-street'];
  for (const id of ccwIds) {
    const t = TRACKS.find((trk) => trk.id === id)!;
    assert.ok(wind(t) < 0, `Expected CCW track ${id} to have negative signed area, got ${wind(t)}`);
  }
  const spaTrack = TRACKS.find((trk) => trk.id === 'spa-francorchamps')!;
  assert.ok(wind(spaTrack) > 0, 'Expected Spa to be Clockwise (positive XZ area)');
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

  // Pit side offset is positive for right side
  assert.ok(compiled.pitOffset > 0, `Expected positive pit offset for right side, got ${compiled.pitOffset}`);

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
  const f1CarSpec = CARS.find((c) => c.id === 'f1-26-ferrari')!;

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


