import { buildObservationVector } from './aiNeuralPolicy';
import { CarSimState, ControlInput } from './physics';
import { CompiledTrack, sampleTrackAtT } from './tracks';

export interface TelemetryLapDemo {
  carId: string;
  trackId: string;
  lapTime: number;
  samples: number[][]; // Each sample: [...obs43, steer, throttleAct, brakeAct] (46 floats)
}

export interface RecordedBcLap {
  id: string;
  lapNumber: number;
  carId: string;
  trackId: string;
  lapTime: number;
  sampleCount: number;
  isClean: boolean;
  offTrackCount: number;
  hadDamage: boolean;
  included: boolean;
  recordedAt: number;
  demo: TelemetryLapDemo;
}

/**
 * Valid-lap human telemetry recorder sampling at 30 Hz for Behavioral Cloning.
 * Tracks all completed laps in-session (flagging clean vs. off-track/damaged laps)
 * so the player can inspect, filter clean laps, and export a trainPPO.py-compatible
 * JSONL dataset bundle with one click.
 */
export class HumanTelemetryRecorder {
  private sampleInterval = 1 / 30; // 30 Hz
  private sampleTimer = 0;
  private currentLapBuffer: number[][] = [];
  private isLapValid = true;
  private currentOffTrackCount = 0;
  private wasOffTrack = false;
  private currentHadDamage = false;
  private prevAeroDamage = 0;
  private prevTrackT = 0;
  private sessionBestLap: number | null = null;
  private lastCarId = '';
  private lastTrackId = '';
  private lastLapTime = 0;
  private lastCompletedDemo: TelemetryLapDemo | null = null;
  private recordedLaps: RecordedBcLap[] = [];
  private listeners = new Set<() => void>();
  public onLapRecorded?: (demo: TelemetryLapDemo) => void;

  /**
   * Resets recorder state for a new driving session.
   */
  public resetSession(): void {
    this.sampleTimer = 0;
    this.currentLapBuffer = [];
    this.isLapValid = true;
    this.currentOffTrackCount = 0;
    this.wasOffTrack = false;
    this.currentHadDamage = false;
    this.prevAeroDamage = 0;
    this.prevTrackT = 0;
    this.sessionBestLap = null;
    this.lastCompletedDemo = null;
    this.recordedLaps = [];
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // ignore listener errors
      }
    }
  }

  public getRecordedLaps(): RecordedBcLap[] {
    return this.recordedLaps.map((l) => ({ ...l }));
  }

  public toggleLapIncluded(lapId: string): void {
    const target = this.recordedLaps.find((l) => l.id === lapId);
    if (!target) return;
    target.included = !target.included;
    this.notify();
  }

  public selectCleanLapsOnly(): void {
    for (const lap of this.recordedLaps) {
      lap.included = lap.isClean;
    }
    this.notify();
  }

  public clearRecordedLaps(): void {
    this.recordedLaps = [];
    this.notify();
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

    this.lastCarId = car.carSpec.id;
    this.lastTrackId = compiledTrack.spec.id;
    this.lastLapTime = car.currentLapTime;

    const currentSample = sampleTrackAtT(compiledTrack, car.trackT);
    const halfW = (currentSample.width ?? compiledTrack.spec.trackWidth) * 0.5;

    // 1. Track limits check
    const isOffTrackNow = Math.abs(car.lateralOffset) > halfW + 1.2;
    if (isOffTrackNow) {
      this.isLapValid = false;
      if (!this.wasOffTrack) {
        this.currentOffTrackCount += 1;
      }
    }
    this.wasOffTrack = isOffTrackNow;

    // 2. Wall or vehicle impact causing damage accumulation
    if (car.aeroDamage > this.prevAeroDamage + 0.05) {
      this.isLapValid = false;
      this.currentHadDamage = true;
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
        const roundedLap = Math.round(car.currentLapTime * 1000) / 1000;
        const demo: TelemetryLapDemo = {
          carId: car.carSpec.id,
          trackId: compiledTrack.spec.id,
          lapTime: roundedLap,
          samples: [...this.currentLapBuffer],
        };

        const isClean = this.isLapValid && !this.currentHadDamage && this.currentOffTrackCount === 0;
        const entry: RecordedBcLap = {
          id: `bc-lap-${Date.now()}-${this.recordedLaps.length + 1}`,
          lapNumber: Math.max(1, car.lap - 1),
          carId: demo.carId,
          trackId: demo.trackId,
          lapTime: demo.lapTime,
          sampleCount: demo.samples.length,
          isClean,
          offTrackCount: this.currentOffTrackCount,
          hadDamage: this.currentHadDamage,
          included: isClean,
          recordedAt: Date.now(),
          demo,
        };
        this.recordedLaps.push(entry);
        // Keep up to 24 laps in memory
        if (this.recordedLaps.length > 24) {
          this.recordedLaps.shift();
        }
        this.notify();

        if (isClean) {
          const isCompetitive =
            this.sessionBestLap === null || car.currentLapTime <= this.sessionBestLap * 1.03;

          if (isCompetitive) {
            if (this.sessionBestLap === null || car.currentLapTime < this.sessionBestLap) {
              this.sessionBestLap = car.currentLapTime;
            }
            this.lastCompletedDemo = demo;
            this.exportDemo(demo);
          }
        }
      }

      // Reset buffer for the new lap
      this.isLapValid = true;
      this.currentOffTrackCount = 0;
      this.wasOffTrack = false;
      this.currentHadDamage = false;
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
   * Builds a datasets/-compatible JSONL bundle string from selected (or clean) laps
   * ready for `python scripts/trainPPO.py --bc-dataset <file.jsonl>`.
   */
  public buildDatasetBundleJsonl(options?: { cleanOnly?: boolean }): {
    jsonl: string;
    lapCount: number;
    sampleCount: number;
  } {
    const cleanOnly = options?.cleanOnly ?? false;
    const selected = this.recordedLaps.filter((l) => l.included && (!cleanOnly || l.isClean));
    const lines = selected.map((l) => JSON.stringify(l.demo));
    const sampleCount = selected.reduce((sum, l) => sum + l.sampleCount, 0);
    return {
      jsonl: lines.length > 0 ? lines.join('\n') + '\n' : '',
      lapCount: selected.length,
      sampleCount,
    };
  }

  /**
   * Downloads the selected session laps as a Behavioral Cloning JSONL dataset bundle.
   */
  public downloadDatasetBundle(options?: { cleanOnly?: boolean }): {
    lapCount: number;
    sampleCount: number;
  } {
    const bundle = this.buildDatasetBundleJsonl(options);
    if (bundle.lapCount === 0) return { lapCount: 0, sampleCount: 0 };

    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const trackTag = this.lastTrackId || 'session';
        const blob = new Blob([bundle.jsonl], { type: 'application/x-ndjson' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bc_dataset_${trackTag}_${bundle.lapCount}laps.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // Safe headless fallback
      }
    }

    return { lapCount: bundle.lapCount, sampleCount: bundle.sampleCount };
  }

  /**
   * Manually exports the current telemetry buffer (or last valid completed lap) on demand (e.g. F9).
   */
  public exportManual(download = false): TelemetryLapDemo | null {
    const demo: TelemetryLapDemo | null =
      this.currentLapBuffer.length > 0 && this.lastCarId && this.lastTrackId
        ? {
            carId: this.lastCarId,
            trackId: this.lastTrackId,
            lapTime: Math.round(this.lastLapTime * 1000) / 1000,
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
   * Exports valid demonstration lap JSONL record via relative POST api/telemetry or callback.
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
