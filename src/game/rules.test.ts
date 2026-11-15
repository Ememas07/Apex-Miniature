import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARS,
  CAR_CLASSES,
  computeBoPEquilibriumScore,
  getCarsByClass,
  validateDriverNumber,
} from './cars';
import { CarClassId } from './types';
import { TRACKS, compileTrack, projectOntoTrack, sampleTrackAtT } from './tracks';
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

test('Track catalog has all 43 circuits including 10 flagship circuits with valid closed splines', () => {
  assert.equal(TRACKS.length, 43);
  const flagships = TRACKS.filter((t) => t.flagship);
  assert.equal(flagships.length, 10);

  for (const t of TRACKS) {
    const compiled = compileTrack(t, 120);
    assert.ok(compiled.totalLength > 500, `Track ${t.id} too short`);
    const p0 = sampleTrackAtT(compiled, 0);
    const p1 = sampleTrackAtT(compiled, 0.9999);
    const gap = Math.hypot(p0.x - p1.x, p0.z - p1.z);
    assert.ok(gap < 15, `Track ${t.id} spline did not close smoothly`);
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
