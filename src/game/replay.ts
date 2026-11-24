import { CarSimState } from './physics';

export type ReplayBookmarkType = 'overtake' | 'fastest-lap' | 'incident';

export interface ReplayBookmark {
  time: number;
  type: ReplayBookmarkType;
  label: string;
}

export interface ReplayCarFrame {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
  steerAngle: number;
  lap: number;
  trackT: number;
  prevTrackT: number;
  totalDistance: number;
  lateralOffset: number;
  currentLapTime: number;
  totalTime: number;
  gear: number;
  rpmNormalized: number;
  tireWear: number;
  tireTemp: number;
  fuel: number;
  specialCharge: number;
  specialActive: boolean;
  ersBattery: number;
  aeroDamage: number;
}

interface ReplaySnapshot {
  time: number;
  cars: ReplayCarFrame[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function captureCarFrame(c: CarSimState): ReplayCarFrame {
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    z: c.z,
    vx: c.vx,
    vz: c.vz,
    heading: c.heading,
    pitch: c.pitch ?? 0,
    roll: c.roll ?? 0,
    speed: c.speed,
    steerAngle: c.steerAngle,
    lap: c.lap,
    trackT: c.trackT,
    prevTrackT: c.prevTrackT,
    totalDistance: c.totalDistance,
    lateralOffset: c.lateralOffset,
    currentLapTime: c.currentLapTime,
    totalTime: c.totalTime,
    gear: c.gear,
    rpmNormalized: c.rpmNormalized,
    tireWear: c.tireWear,
    tireTemp: c.tireTemp,
    fuel: c.fuel,
    specialCharge: c.specialCharge,
    specialActive: c.specialActive,
    ersBattery: c.ersBattery,
    aeroDamage: c.aeroDamage,
  };
}

export class RaceReplayRecorder {
  private readonly sampleIntervalSec: number;
  private readonly maxFrames: number;
  private frames: ReplaySnapshot[] = [];
  private bookmarks: ReplayBookmark[] = [];
  private accumSec = 0;
  private lastPlayerRank: number | null = null;
  private lastOvertakeBookmarkTime = -10;
  private lastIncidentBookmarkTime = -10;

  constructor(sampleHz = 20, maxDurationSec = 180) {
    this.sampleIntervalSec = 1 / Math.max(5, sampleHz);
    this.maxFrames = Math.max(200, Math.round(sampleHz * maxDurationSec));
  }

  public reset(): void {
    this.frames = [];
    this.bookmarks = [];
    this.accumSec = 0;
    this.lastPlayerRank = null;
    this.lastOvertakeBookmarkTime = -10;
    this.lastIncidentBookmarkTime = -10;
  }

  public recordStep(
    dt: number,
    raceElapsed: number,
    cars: ReadonlyArray<CarSimState>,
    playerRank?: number,
    collisionImpact = 0,
  ): void {
    if (cars.length === 0) return;

    // Track automatic overtake & incident highlight bookmarks
    if (typeof playerRank === 'number' && Number.isFinite(playerRank) && playerRank > 0) {
      if (
        this.lastPlayerRank !== null &&
        playerRank < this.lastPlayerRank &&
        raceElapsed >= 3.0 &&
        raceElapsed - this.lastOvertakeBookmarkTime >= 3.0
      ) {
        this.addBookmark({
          time: raceElapsed,
          type: 'overtake',
          label: `Overtake for P${playerRank}`,
        });
        this.lastOvertakeBookmarkTime = raceElapsed;
      }
      this.lastPlayerRank = playerRank;
    }

    if (collisionImpact >= 6.0 && raceElapsed - this.lastIncidentBookmarkTime >= 4.0) {
      this.addBookmark({
        time: raceElapsed,
        type: 'incident',
        label: 'Heavy Contact',
      });
      this.lastIncidentBookmarkTime = raceElapsed;
    }

    this.accumSec += Math.max(0, dt);
    const shouldCapture =
      this.frames.length === 0 || this.accumSec >= this.sampleIntervalSec - 1e-6;
    if (!shouldCapture) return;

    this.accumSec = this.frames.length === 0 ? 0 : this.accumSec % this.sampleIntervalSec;

    const snapshot: ReplaySnapshot = {
      time: raceElapsed,
      cars: cars.map(captureCarFrame),
    };

    // Guard against non-monotonic timestamps
    if (this.frames.length > 0 && raceElapsed < this.frames[this.frames.length - 1].time) {
      this.frames = this.frames.filter((f) => f.time <= raceElapsed);
    }

    this.frames.push(snapshot);
    if (this.frames.length > this.maxFrames) {
      this.frames.splice(0, this.frames.length - this.maxFrames);
      const minTime = this.frames[0].time;
      if (this.bookmarks.length > 0) {
        this.bookmarks = this.bookmarks.filter((bm) => bm.time >= minTime);
      }
    }
  }

  public addBookmark(bookmark: ReplayBookmark): void {
    this.bookmarks.push({ ...bookmark });
    if (this.bookmarks.length > 64) {
      this.bookmarks.splice(0, this.bookmarks.length - 64);
    }
  }

  public getBookmarks(): ReplayBookmark[] {
    return this.bookmarks.slice();
  }

  public hasFrames(): boolean {
    return this.frames.length >= 2;
  }

  public getDuration(): { start: number; end: number; frameCount: number } {
    if (this.frames.length === 0) {
      return { start: 0, end: 0, frameCount: 0 };
    }
    return {
      start: this.frames[0].time,
      end: this.frames[this.frames.length - 1].time,
      frameCount: this.frames.length,
    };
  }

  public sampleAtTime(timeSec: number): ReplayCarFrame[] | null {
    const n = this.frames.length;
    if (n === 0) return null;
    if (n === 1 || timeSec <= this.frames[0].time) {
      return this.frames[0].cars.map((c) => ({ ...c }));
    }
    if (timeSec >= this.frames[n - 1].time) {
      return this.frames[n - 1].cars.map((c) => ({ ...c }));
    }

    // Binary search for bracketing snapshots [lo, lo + 1]
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].time <= timeSec) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const a = this.frames[lo];
    const b = this.frames[hi];
    const span = Math.max(1e-6, b.time - a.time);
    const alpha = Math.max(0, Math.min(1, (timeSec - a.time) / span));

    const bById = new Map<string, ReplayCarFrame>();
    for (const c of b.cars) {
      bById.set(c.id, c);
    }

    return a.cars.map((ca) => {
      const cb = bById.get(ca.id);
      if (!cb) return { ...ca };
      const useB = alpha >= 0.5;
      return {
        id: ca.id,
        x: lerp(ca.x, cb.x, alpha),
        y: lerp(ca.y, cb.y, alpha),
        z: lerp(ca.z, cb.z, alpha),
        vx: lerp(ca.vx, cb.vx, alpha),
        vz: lerp(ca.vz, cb.vz, alpha),
        heading: lerpAngle(ca.heading, cb.heading, alpha),
        pitch: lerp(ca.pitch, cb.pitch, alpha),
        roll: lerp(ca.roll, cb.roll, alpha),
        speed: lerp(ca.speed, cb.speed, alpha),
        steerAngle: lerp(ca.steerAngle, cb.steerAngle, alpha),
        lap: useB ? cb.lap : ca.lap,
        trackT: useB ? cb.trackT : ca.trackT,
        prevTrackT: useB ? cb.prevTrackT : ca.prevTrackT,
        totalDistance: lerp(ca.totalDistance, cb.totalDistance, alpha),
        lateralOffset: lerp(ca.lateralOffset, cb.lateralOffset, alpha),
        currentLapTime: lerp(ca.currentLapTime, cb.currentLapTime, alpha),
        totalTime: lerp(ca.totalTime, cb.totalTime, alpha),
        gear: useB ? cb.gear : ca.gear,
        rpmNormalized: lerp(ca.rpmNormalized, cb.rpmNormalized, alpha),
        tireWear: lerp(ca.tireWear, cb.tireWear, alpha),
        tireTemp: lerp(ca.tireTemp, cb.tireTemp, alpha),
        fuel: lerp(ca.fuel, cb.fuel, alpha),
        specialCharge: lerp(ca.specialCharge, cb.specialCharge, alpha),
        specialActive: useB ? cb.specialActive : ca.specialActive,
        ersBattery: lerp(ca.ersBattery, cb.ersBattery, alpha),
        aeroDamage: lerp(ca.aeroDamage, cb.aeroDamage, alpha),
      };
    });
  }

  public canFlashback(): boolean {
    if (this.frames.length < 10) return false;
    const dur = this.getDuration();
    return dur.end - dur.start >= 1.5;
  }

  public applyFlashback(cars: CarSimState[], rewindSec = 5.5): number | null {
    if (!this.canFlashback()) return null;
    const dur = this.getDuration();
    const targetTime = Math.max(dur.start, dur.end - Math.max(0.5, rewindSec));
    const sampled = this.sampleAtTime(targetTime);
    if (!sampled || sampled.length === 0) return null;

    const byId = new Map<string, ReplayCarFrame>();
    for (const f of sampled) {
      byId.set(f.id, f);
    }

    for (const c of cars) {
      const f = byId.get(c.id);
      if (!f) continue;
      c.x = f.x;
      c.y = f.y;
      c.z = f.z;
      c.vx = f.vx;
      c.vz = f.vz;
      c.heading = f.heading;
      c.pitch = f.pitch;
      c.roll = f.roll;
      c.speed = f.speed;
      c.steerAngle = f.steerAngle;
      c.lap = f.lap;
      c.trackT = f.trackT;
      c.prevTrackT = f.prevTrackT;
      c.totalDistance = f.totalDistance;
      c.lateralOffset = f.lateralOffset;
      c.currentLapTime = f.currentLapTime;
      c.totalTime = f.totalTime;
      c.gear = f.gear;
      c.rpmNormalized = f.rpmNormalized;
      c.tireWear = f.tireWear;
      c.tireTemp = f.tireTemp;
      c.fuel = f.fuel;
      c.specialCharge = f.specialCharge;
      c.specialActive = f.specialActive;
      c.ersBattery = f.ersBattery;
      c.aeroDamage = f.aeroDamage;
      c.finished = false;
      c.lastCollisionImpact = 0;
      c.lastWallImpact = 0;
      c.spawnGhostTimer = Math.max(c.spawnGhostTimer ?? 0, 1.2);
    }

    // Truncate frames and bookmarks beyond targetTime
    this.frames = this.frames.filter((snap) => snap.time <= targetTime + 1e-4);
    this.bookmarks = this.bookmarks.filter((bm) => bm.time <= targetTime + 1e-4);
    this.accumSec = 0;
    return targetTime;
  }
}
