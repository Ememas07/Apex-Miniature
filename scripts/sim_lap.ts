import { TRACKS, compileTrack } from '../src/game/tracks';
import { CARS } from '../src/game/cars';
import {
  createCarSimState,
  stepCarPhysics,
  computeAIControl,
  getDifficultyMultiplier,
} from '../src/game/physics';

export function runFlyingLap(carId: string, trackId: string, difficulty: 'Alien' | 'Pro' = 'Alien') {
  const track = TRACKS.find((t) => t.id === trackId)!;
  const compiled = compileTrack(track);
  const carSpec = CARS.find((c) => c.id === carId)!;

  const car = createCarSimState({
    id: 'ai-tester',
    name: 'AI Tester',
    isPlayer: false,
    carId: carSpec.id,
    livery: carSpec.defaultLivery,
    gridSlot: 1,
    compiledTrack: compiled,
    compound: 'soft',
    aiPaceMultiplier: getDifficultyMultiplier(difficulty, 0),
  });

  const dt = 1 / 60;
  // Warmup lap + 1 flying lap
  let completedLaps = 0;
  let lapTimes: number[] = [];
  let maxSpeed = 0;
  let minSpeedInCorner = 999;

  for (let step = 0; step < 60 * 600; step++) {
    const prevLap = car.lap;
    const input = computeAIControl(car, compiled, [car], dt, 0);
    stepCarPhysics(car, input, compiled, dt, {
      trackWetness: 0,
      totalLaps: 5,
      isQualifying: false,
      allCars: [car],
    });

    if (car.speed > maxSpeed) maxSpeed = car.speed;
    if (car.speed < minSpeedInCorner && car.speed > 5) minSpeedInCorner = car.speed;

    if (car.lap > prevLap) {
      completedLaps++;
      if (car.lastLapTime) {
        lapTimes.push(car.lastLapTime);
        console.log(`Lap ${completedLaps} finished: ${car.lastLapTime.toFixed(2)}s (${Math.floor(car.lastLapTime / 60)}:${(car.lastLapTime % 60).toFixed(2).padStart(5, '0')})`);
      }
      if (completedLaps >= 2) break;
    }
  }

  const flyingLap = lapTimes[1] ?? lapTimes[0];
  console.log(`\nFinal Flying Lap for ${carSpec.name} (${carSpec.classId}): ${flyingLap?.toFixed(2)}s`);
  console.log(`Vmax: ${(maxSpeed * 3.6).toFixed(1)} km/h`);
  return flyingLap;
}

console.log('--- Testing Current Ferrari 499P (Hypercar/GTP) at Spa ---');
runFlyingLap('ferrari-499p', 'spa-francorchamps');

console.log('\n--- Testing Current Porsche 911 GT3 R at Spa ---');
runFlyingLap('porsche-911-gt3-r', 'spa-francorchamps');
