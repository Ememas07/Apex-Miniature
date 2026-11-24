import test from 'node:test';
import assert from 'node:assert/strict';
import { getCarsByClass } from './cars';
import {
  CarSimState,
  computeAIControl,
  createCarSimState,
  resolveCarCollisions,
  stepCarPhysics,
} from './physics';
import {
  TRACKS,
  compileTrack,
  computeTrackWallHalfWidth,
  preloadTrackGeometry,
  sampleTrackAtT,
} from './tracks';
import { CarClassId, CarSpec } from './types';

function assertFiniteCarState(car: CarSimState, trackId: string, stepIdx: number): void {
  const fields: Array<[string, number]> = [
    ['x', car.x],
    ['y', car.y],
    ['z', car.z],
    ['speed', car.speed],
    ['heading', car.heading],
    ['trackT', car.trackT],
    ['lateralOffset', car.lateralOffset],
    ['totalDistance', car.totalDistance],
    ['tireWear', car.tireWear],
    ['tireTemp', car.tireTemp],
    ['fuel', car.fuel],
    ['brakeTempFront', car.brakeTempFront ?? 0],
    ['brakeTempRear', car.brakeTempRear ?? 0],
    ['rpmNormalized', car.rpmNormalized],
    ['yawRate', car.yawRate ?? 0],
  ];
  for (const [label, value] of fields) {
    assert.ok(
      Number.isFinite(value),
      `Non-finite ${label}=${String(value)} for ${car.carSpec.id} (${car.carSpec.classId}) on ${trackId} at step ${stepIdx}`,
    );
  }
}

test('Soak 43x10: deterministic headless simulation across all 43 circuits and 10 car classes', async () => {
  const allClasses = Object.values(CarClassId);
  assert.equal(TRACKS.length, 43, 'Expected 43 official circuits');
  assert.equal(allClasses.length, 10, 'Expected 10 car classes');

  const representatives: CarSpec[] = allClasses.map((classId) => {
    const group = getCarsByClass(classId);
    assert.ok(group.length >= 1, `Expected at least 1 car in class ${classId}`);
    return group[0];
  });

  const DT = 1 / 60;
  const STEPS_PER_CIRCUIT = 300; // 5.0s simulated time per circuit across all 10 classes (430 car runs)
  let totalCarCircuitRuns = 0;

  for (const trackMeta of TRACKS) {
    const spec = await preloadTrackGeometry(trackMeta.id);
    const compiled = compileTrack(spec, 480);

    let minTrackY = Infinity;
    let maxTrackY = -Infinity;
    for (const s of compiled.samples) {
      assert.ok(Number.isFinite(s.y), `Non-finite sample y on ${spec.id}`);
      if (s.y < minTrackY) minTrackY = s.y;
      if (s.y > maxTrackY) maxTrackY = s.y;
    }

    const cars: CarSimState[] = representatives.map((carSpec, idx) =>
      createCarSimState({
        id: `soak-${spec.id}-${carSpec.classId}`,
        name: `Soak ${carSpec.classId}`,
        isPlayer: false,
        carId: carSpec.id,
        livery: carSpec.defaultLivery,
        gridSlot: idx,
        compiledTrack: compiled,
        compound: 'medium',
        personality: 'Metronome',
      }),
    );
    const initialTotalDistance = cars.map((c) => c.totalDistance);

    for (let step = 0; step < STEPS_PER_CIRCUIT; step++) {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        const ctrl = computeAIControl(car, compiled, cars, DT, 0);
        stepCarPhysics(car, ctrl, compiled, DT, {
          trackWetness: 0,
          totalLaps: 5,
          isQualifying: false,
          allCars: cars,
        });
      }
      resolveCarCollisions(cars);

      // Verify state invariants on every 5th tick plus final tick
      if (step % 5 === 0 || step === STEPS_PER_CIRCUIT - 1) {
        for (const car of cars) {
          assertFiniteCarState(car, spec.id, step);

          const sp = sampleTrackAtT(compiled, car.trackT);
          const bankingOffset =
            Math.abs(Math.sin(sp.banking ?? 0)) * Math.abs(car.lateralOffset) + 1.5;
          const surfaceDeltaY = Math.abs(car.y - sp.y);
          assert.ok(
            surfaceDeltaY <= Math.max(4.5, bankingOffset + 2.5),
            `Surface fall-through / elevation jump on ${spec.id} (${car.carSpec.classId}): car.y=${car.y.toFixed(2)}, sp.y=${sp.y.toFixed(2)}`,
          );
          assert.ok(
            car.y >= minTrackY - 6.0 && car.y <= maxTrackY + 6.0,
            `Elevation out of circuit bounds on ${spec.id} (${car.carSpec.classId}): car.y=${car.y.toFixed(2)} outside [${minTrackY.toFixed(2)}, ${maxTrackY.toFixed(2)}]`,
          );

          const wallLimit = computeTrackWallHalfWidth(
            (sp.width ?? spec.trackWidth) * 0.5,
            sp.curvature,
            car.lateralOffset >= 0 ? 1 : -1,
          );
          assert.ok(
            Math.abs(car.lateralOffset) <= wallLimit + 2.5,
            `Track containment breach on ${spec.id} (${car.carSpec.classId}): lat=${car.lateralOffset.toFixed(2)} > ${wallLimit.toFixed(2)}`,
          );
        }
      }
    }

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const traveledMeters = (car.totalDistance - initialTotalDistance[i]) * compiled.totalLength;
      totalCarCircuitRuns += 1;
      assert.ok(
        traveledMeters >= 45,
        `AI failed to progress cleanly on ${spec.id} (${car.carSpec.classId}): traveled=${traveledMeters.toFixed(1)}m`,
      );
      assert.ok(
        car.speed > 5.0,
        `AI stalled on ${spec.id} (${car.carSpec.classId}): final speed=${car.speed.toFixed(2)} m/s`,
      );
    }
  }

  assert.equal(totalCarCircuitRuns, 430);
});
