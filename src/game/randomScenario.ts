import { CAR_CLASSES } from './cars';
import { CarClassId, CarSpec, LiveryConfig, TrackSpec } from './types';

export interface RandomScenarioResult {
  activeClasses: CarClassId[];
  track: TrackSpec;
  isCustomTrack: boolean;
  car: CarSpec;
  livery: LiveryConfig;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Generates a random racing scenario (1-3 car classes, a track, and a matching car + livery)
 * without starting the session.
 */
export function generateRandomScenario(
  builtInTracks: readonly TrackSpec[],
  customTracks: readonly TrackSpec[],
  selectableCars: readonly CarSpec[],
  currentDriverNumber?: string,
): RandomScenarioResult {
  const allClassIds = (Object.keys(CAR_CLASSES) as CarClassId[]).filter((cid) =>
    selectableCars.some((c) => c.classId === cid),
  );

  // Weighted class count: 45% single-class, 35% 2-class, 20% 3-class multiclass
  const roll = Math.random();
  const targetClassCount = Math.min(
    allClassIds.length,
    roll < 0.45 ? 1 : roll < 0.8 ? 2 : 3,
  );

  const shuffledClasses = [...allClassIds];
  for (let i = shuffledClasses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledClasses[i], shuffledClasses[j]] = [shuffledClasses[j], shuffledClasses[i]];
  }
  const activeClasses = shuffledClasses.slice(0, Math.max(1, targetClassCount));

  // Pick a car belonging to one of the active classes
  const matchingCars = selectableCars.filter((c) => activeClasses.includes(c.classId));
  const car = pickRandom(matchingCars.length > 0 ? matchingCars : selectableCars);

  // Pick a track across built-in and saved custom tracks
  const customIds = new Set(customTracks.map((t) => t.id));
  const trackPool = [...builtInTracks, ...customTracks];
  const track = pickRandom(trackPool);
  const isCustomTrack = customIds.has(track.id);

  const livery: LiveryConfig = {
    ...car.defaultLivery,
    driverNumber: currentDriverNumber || car.defaultLivery.driverNumber,
  };

  return {
    activeClasses,
    track,
    isCustomTrack,
    car,
    livery,
  };
}
