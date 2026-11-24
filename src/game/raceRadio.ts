import { BlindSpotStatus, EngineerVerbosity } from './types';

export interface RadioUpdateContext {
  raceTime: number;
  lap: number;
  totalLaps: number;
  blindSpot: BlindSpotStatus;
  blueFlagActive: boolean;
  trackWetness: number;
  compound: 'soft' | 'medium' | 'hard' | 'wet';
  fuelLapsRemaining: number;
  mecachromeActive: boolean;
  bestSectorAchieved?: number | null; // 1 | 2 | 3
}

/**
 * Dynamic Race Engineer & Spotter radio system.
 * Generates concise motorsport radio callouts, displays accessible subtitle text,
 * and optionally voices messages via Web Speech API + radio chirp hook.
 */
export class RaceEngineerRadio {
  private verbosity: EngineerVerbosity = 'full';
  private volume = 0.85;
  private muted = false;
  private voiceEnabled = false;
  private currentSubtitle: string | null = null;
  private subtitleExpiresAt = 0;
  private lastSpokenAt = -10;
  private lastCalloutByKey = new Map<string, number>();

  private prevLeftAlongside = false;
  private prevRightAlongside = false;
  private prevThreeWide = false;
  private prevMecachrome = false;
  private prevFinalLapCalled = false;
  private prevBlueFlag = false;
  private onRadioChirp?: () => void;

  constructor(onRadioChirp?: () => void) {
    this.onRadioChirp = onRadioChirp;
  }

  public configure(opts: {
    verbosity: EngineerVerbosity;
    volume: number;
    muted: boolean;
    voiceEnabled?: boolean;
  }): void {
    this.verbosity = opts.verbosity;
    this.volume = Math.max(0, Math.min(1, opts.volume));
    this.muted = opts.muted;
    if (typeof opts.voiceEnabled === 'boolean') {
      this.voiceEnabled = opts.voiceEnabled;
    }
  }

  public reset(): void {
    this.currentSubtitle = null;
    this.subtitleExpiresAt = 0;
    this.lastSpokenAt = -10;
    this.lastCalloutByKey.clear();
    this.prevLeftAlongside = false;
    this.prevRightAlongside = false;
    this.prevThreeWide = false;
    this.prevMecachrome = false;
    this.prevFinalLapCalled = false;
    this.prevBlueFlag = false;
  }

  public getSubtitle(nowSec: number): string | null {
    if (this.currentSubtitle && nowSec > this.subtitleExpiresAt) {
      this.currentSubtitle = null;
    }
    return this.currentSubtitle;
  }

  public speak(
    key: string,
    text: string,
    category: 'spotter' | 'engineer',
    nowSec: number,
    cooldownSec = 6.0,
    priority = false,
  ): boolean {
    if (this.verbosity === 'off') return false;
    if (this.verbosity === 'minimal' && category === 'engineer') return false;

    const lastKey = this.lastCalloutByKey.get(key) ?? -999;
    if (nowSec - lastKey < cooldownSec) return false;
    if (!priority && nowSec - this.lastSpokenAt < 2.2) return false;

    this.lastCalloutByKey.set(key, nowSec);
    this.lastSpokenAt = nowSec;
    this.currentSubtitle = text;
    this.subtitleExpiresAt = nowSec + 3.6;

    if (this.voiceEnabled && !this.muted && this.volume > 0.02) {
      this.onRadioChirp?.();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          if (priority) window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.rate = 1.12;
          utter.pitch = 0.94;
          utter.volume = Math.min(1, this.volume);
          window.speechSynthesis.speak(utter);
        } catch {
          // Ignore SpeechSynthesis unavailability in headless browsers
        }
      }
    }
    return true;
  }

  public step(ctx: RadioUpdateContext): string | null {
    const now = ctx.raceTime;

    // 1. Mecachrome sudden engine failure callout (highest priority)
    if (ctx.mecachromeActive && !this.prevMecachrome) {
      this.speak('mecachrome', 'Engine power loss! Hold your line, resetting ECU...', 'engineer', now, 10, true);
    } else if (!ctx.mecachromeActive && this.prevMecachrome) {
      this.speak('mecachrome-ok', 'Power restored — full throttle!', 'engineer', now, 8, false);
    }
    this.prevMecachrome = ctx.mecachromeActive;

    // 2. Spotter cues (car left / car right / three wide / clear)
    const leftSide = ctx.blindSpot === 'left' || ctx.blindSpot === 'both';
    const rightSide = ctx.blindSpot === 'right' || ctx.blindSpot === 'both';
    const threeWide = leftSide && rightSide;

    if (threeWide && !this.prevThreeWide) {
      this.speak('three-wide', 'Three wide! Hold your line!', 'spotter', now, 3.5, true);
    } else if (leftSide && !this.prevLeftAlongside) {
      this.speak('car-left', 'Car left — hold right.', 'spotter', now, 3.2, false);
    } else if (rightSide && !this.prevRightAlongside) {
      this.speak('car-right', 'Car right — hold left.', 'spotter', now, 3.2, false);
    } else if (!leftSide && !rightSide && (this.prevLeftAlongside || this.prevRightAlongside)) {
      this.speak('clear', 'Clear all round.', 'spotter', now, 4.5, false);
    }
    this.prevLeftAlongside = leftSide;
    this.prevRightAlongside = rightSide;
    this.prevThreeWide = threeWide;

    // 3. Blue flag faster class approaching
    if (ctx.blueFlagActive && !this.prevBlueFlag) {
      this.speak('blue-flag', 'Blue flag — faster class approaching.', 'spotter', now, 9.0, false);
    }
    this.prevBlueFlag = ctx.blueFlagActive;

    // 4. Engineer strategy cues (weather crossover, fuel critical, final lap, best sector)
    if (ctx.trackWetness > 0.42 && ctx.compound !== 'wet') {
      this.speak('box-wets', 'Track is getting wet — consider stopping for Wet tyres.', 'engineer', now, 28, false);
    } else if (ctx.trackWetness < 0.14 && ctx.compound === 'wet') {
      this.speak('box-slicks', 'Track is dry now — switch back to slicks.', 'engineer', now, 28, false);
    }

    if (ctx.fuelLapsRemaining > 0 && ctx.fuelLapsRemaining < 1.35 && ctx.totalLaps > 0 && ctx.lap < ctx.totalLaps) {
      this.speak('fuel-low', 'Fuel critical — lift and coast or stop for fuel.', 'engineer', now, 26, false);
    }

    if (ctx.totalLaps > 1 && ctx.lap === ctx.totalLaps && !this.prevFinalLapCalled) {
      this.prevFinalLapCalled = true;
      this.speak('final-lap', 'White flag — final lap! Push now!', 'engineer', now, 60, false);
    }

    if (ctx.bestSectorAchieved) {
      this.speak(`best-s${ctx.bestSectorAchieved}`, `Purple Sector ${ctx.bestSectorAchieved}! Great pace.`, 'engineer', now, 18, false);
    }

    return this.getSubtitle(now);
  }
}
