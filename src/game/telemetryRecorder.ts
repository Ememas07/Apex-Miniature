import { buildObservationVector } from './aiNeuralPolicy';
import { CarSimState, ControlInput } from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';

export interface TelemetryLapDemo {
  carId: string;
  trackId: string;
  lapTime: number;
  samples: number[][]; // Each sample: [...obs43, steer, throttleAct, brakeAct] (46 floats)
}

/**
 * Valid-lap human telemetry recorder sampling at 30 Hz for Behavioral Cloning.
 * Only clean laps without track limit violations, wall/car collisions, or resets
 * that finish within <= 103% of the player's session best lap time are exported.
 */
export class HumanTelemetryRecorder {
  private sampleInterval = 1 / 30; // 30 Hz
  private sampleTimer = 0;
  private currentLapBuffer: number[][] = [];
  private isLapValid = true;
  private prevAeroDamage = 0;
  private prevTrackT = 0;
  private sessionBestLap: number | null = null;
  public onLapRecorded?: (demo: TelemetryLapDemo) => void;

  /**
   * Resets recorder state for a new driving session.
   */
  public resetSession(): void {
    this.sampleTimer = 0;
    this.currentLapBuffer = [];
    this.isLapValid = true;
    this.prevAeroDamage = 0;
    this.prevTrackT = 0;
    this.sessionBestLap = null;
  }

  /**
   * Evaluates telemetry frame and buffers valid samples at 30 Hz.
   */
  public recordStep(
    car: CarSimState,
    compiledTrack: CompiledTrack,
    allCars: CarSimState[],
    input: ControlInput,
    dt: number,
  ): void {
    if (!car.isPlayer) return;

    const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
    const halfW = (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5;

    // Check Lap Invalidation Criteria:
    // 1. Exceeded track limits outside road boundary + kerb margin
    if (Math.abs(car.lateralOffset) > halfW + 1.2 && !car.inPitLane) {
      this.isLapValid = false;
    }

    // 2. Wall or vehicle impact causing damage accumulation
    if (car.aeroDamage > this.prevAeroDamage + 0.05) {
      this.isLapValid = false;
    }

    // 3. Rewind / teleport / reset detection
    if (this.prevTrackT - car.trackT > 0.25 && !(this.prevTrackT > 0.85 && car.trackT < 0.15)) {
      this.isLapValid = false;
    }

    // Lap Completion Check: crossed start/finish line
    const crossedStartFinish = this.prevTrackT > 0.85 && car.trackT < 0.15;
    if (crossedStartFinish && car.currentLapTime > 15 && !car.inPitLane) {
      const minFrames = 150; // At least ~5 seconds of data
      if (this.isLapValid && this.currentLapBuffer.length >= minFrames) {
        const isCompetitive =
          this.sessionBestLap === null || car.currentLapTime <= this.sessionBestLap * 1.03;

        if (isCompetitive) {
          if (this.sessionBestLap === null || car.currentLapTime < this.sessionBestLap) {
            this.sessionBestLap = car.currentLapTime;
          }

          const demo: TelemetryLapDemo = {
            carId: car.carSpec.id,
            trackId: compiledTrack.spec.id,
            lapTime: Math.round(car.currentLapTime * 1000) / 1000,
            samples: [...this.currentLapBuffer],
          };

          this.exportDemo(demo);
        }
      }

      // Reset buffer for the new lap
      this.isLapValid = true;
      this.currentLapBuffer = [];
    }

    // 30 Hz Frame Sampling
    this.sampleTimer += dt;
    if (this.sampleTimer >= this.sampleInterval) {
      this.sampleTimer -= this.sampleInterval;

      if (!car.inPitLane && car.speed > 5.0) {
        const obs43 = buildObservationVector(
          car,
          compiledTrack,
          allCars,
          car.steerAngle,
          1.0, // Benchmark skill target for human demonstration
          car.bopMultipliers,
        );

        const steer = Math.max(-1, Math.min(1, input.steer));
        const throttleAct = Math.max(-1, Math.min(1, input.throttle * 2 - 1));
        const brakeAct = Math.max(-1, Math.min(1, input.brake * 2 - 1));

        this.currentLapBuffer.push([...obs43, steer, throttleAct, brakeAct]);
      }
    }

    this.prevTrackT = car.trackT;
    this.prevAeroDamage = car.aeroDamage;
  }

  /**
   * Exports valid demonstration lap JSONL record via POST /api/telemetry or callback.
   */
  private exportDemo(demo: TelemetryLapDemo): void {
    if (this.onLapRecorded) {
      try {
        this.onLapRecorded(demo);
      } catch {
        // Safe callback execution
      }
    }

    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo),
      }).catch(() => {
        // Graceful offline fallback
      });
    }
  }
}

export const telemetryRecorder = new HumanTelemetryRecorder();
