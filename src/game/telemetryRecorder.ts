import { buildObservationVector } from './aiNeuralPolicy';
import { CarSimState, ControlInput } from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';

export interface TelemetryLapDemo {
  carId: string;
  trackId: string;
  lapTime: number;
  isValid: boolean;
  samples: number[][]; // Each sample: [...obs43, steer, throttleAct, brakeAct] (46 floats)
}

/**
 * Human telemetry recorder sampling at 30 Hz for Behavioral Cloning.
 * Exports every completed lap (>= 5s of data) and tags `isValid` for optional filtering.
 */
export class HumanTelemetryRecorder {
  private sampleInterval = 1 / 30; // 30 Hz
  private sampleTimer = 0;
  private currentLapBuffer: number[][] = [];
  private isLapValid = true;
  private prevAeroDamage = 0;
  private prevTrackT = 0;
  private sessionBestLap: number | null = null;
  private lastCarId = '';
  private lastTrackId = '';
  private lastLapTime = 0;
  private lastCompletedDemo: TelemetryLapDemo | null = null;
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
    this.lastCompletedDemo = null;
  }

  /**
   * Evaluates telemetry frame and buffers samples at 30 Hz.
   */
  public recordStep(
    car: CarSimState,
    compiledTrack: CompiledTrack,
    allCars: CarSimState[],
    input: ControlInput,
    dt: number,
  ): void {
    if (!car.isPlayer) return;

    this.lastCarId = car.carSpec.id;
    this.lastTrackId = compiledTrack.spec.id;
    this.lastLapTime = car.currentLapTime;

    const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
    const halfW = (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5;

    // Check Lap Invalidation Criteria (tagged via isValid):
    // 1. Exceeded track limits outside road boundary + kerb margin
    if (Math.abs(car.lateralOffset) > halfW + 1.2) {
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
    if (crossedStartFinish && car.currentLapTime > 15 && car.pitStopRemaining <= 0) {
      const minFrames = 150; // At least ~5 seconds of data
      if (this.currentLapBuffer.length >= minFrames) {
        if (this.sessionBestLap === null || car.currentLapTime < this.sessionBestLap) {
          this.sessionBestLap = car.currentLapTime;
        }

        const demo: TelemetryLapDemo = {
          carId: car.carSpec.id,
          trackId: compiledTrack.spec.id,
          lapTime: Math.round(car.currentLapTime * 1000) / 1000,
          isValid: this.isLapValid,
          samples: [...this.currentLapBuffer],
        };

        this.lastCompletedDemo = demo;
        this.exportDemo(demo);
      }

      // Reset buffer for the new lap
      this.isLapValid = true;
      this.currentLapBuffer = [];
    }

    // 30 Hz Frame Sampling (pause while stationary in on-track pit service)
    this.sampleTimer += dt;
    if (this.sampleTimer >= this.sampleInterval) {
      this.sampleTimer -= this.sampleInterval;

      if (car.pitStopRemaining <= 0 && car.speed > 5.0) {
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
   * Manually exports the current telemetry buffer (or last completed lap) on demand (e.g. F9).
   */
  public exportManual(download = false): TelemetryLapDemo | null {
    const demo: TelemetryLapDemo | null =
      this.currentLapBuffer.length > 0 && this.lastCarId && this.lastTrackId
        ? {
            carId: this.lastCarId,
            trackId: this.lastTrackId,
            lapTime: Math.round(this.lastLapTime * 1000) / 1000,
            isValid: this.isLapValid,
            samples: [...this.currentLapBuffer],
          }
        : this.lastCompletedDemo;

    if (!demo || demo.samples.length === 0) return null;

    this.exportDemo(demo);

    if (download && typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const blob = new Blob([JSON.stringify(demo) + '\n'], { type: 'application/x-ndjson' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `telemetry_${demo.trackId}_${demo.carId}.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // Safe headless fallback
      }
    }

    return demo;
  }

  /**
   * Exports demonstration lap JSONL record via relative POST api/telemetry or callback.
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
      fetch('api/telemetry', {
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