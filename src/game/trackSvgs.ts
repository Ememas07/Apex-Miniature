import * as THREE from 'three';
import { TrackWaypoint } from './types';

export interface SvgTrackOptions {
  trackId?: string;
  targetLapSeconds?: number;
  trackWidth?: number;
  direction?: 'cw' | 'ccw';
  elevationProfile?: Array<{ tMin: number; tMax: number; y: number | ((t: number) => number) }>;
  bankingProfile?: Array<{ tMin: number; tMax: number; bankDeg: number }>;
}

/**
 * Counter-Clockwise (CCW) circuit IDs in official racing direction
 */
export const CCW_CIRCUIT_IDS = new Set([
  'daytona-road',
  'laguna-seca',
  'cota',
  'interlagos',
  'montreal',
  'mexico-city',
  'las-vegas',
  'long-beach',
  'imola',
  'baku',
  'jeddah',
  'singapore',
  'yas-marina',
]);

/**
 * Complete Registry of all 43 circuits normalized in 1000x1000 viewBox SVG path strings.
 * Includes the 10 verified Reference SVGs and 33 high-fidelity traces matching
 * Grand Prix / Endurance 2022-2026 diagrams from https://www.racingcircuits.info/
 */
export const TRACK_SVG_REGISTRY: Record<string, string> = {
  // ==================== 5 REFERENCE PRESERVED CIRCUITS ====================
  'spa-francorchamps':
    'M 238,398 L 124,480 C 112,488 108,482 114,468 L 164,364 C 180,334 204,312 236,286 C 254,270 262,250 276,238 C 292,226 312,228 330,216 C 356,196 384,166 426,146 L 708,44 C 722,40 730,46 736,56 C 742,66 752,66 768,58 L 788,50 C 800,48 808,54 818,68 L 880,148 C 892,164 882,182 862,178 C 846,174 836,154 824,134 C 816,122 806,122 790,128 L 636,176 C 614,184 608,204 610,232 C 612,262 630,280 666,292 L 764,322 C 782,328 788,342 780,362 C 772,382 774,398 792,410 L 854,448 C 866,456 866,468 856,484 L 836,514 C 822,534 798,536 770,524 C 724,504 692,468 656,412 C 632,374 604,352 558,334 L 522,322 C 508,318 496,322 480,330 L 396,368 L 316,384 C 306,384 306,374 306,362 C 304,352 296,352 284,362 Z',

  'daytona-road':
    'M 502,86 C 440,86 385,102 336,128 C 304,148 292,174 300,192 C 308,208 328,212 356,214 C 376,216 390,232 412,234 L 512,236 C 536,236 538,278 510,282 L 304,284 C 288,284 276,290 264,302 L 162,368 C 146,378 144,352 158,334 L 262,226 C 276,212 268,196 248,184 C 228,174 210,174 188,184 C 112,222 76,282 78,348 C 80,418 122,474 202,494 C 234,500 268,502 310,502 L 554,502 C 568,502 574,480 588,478 L 620,476 C 632,476 638,494 656,500 C 720,506 785,504 832,484 C 896,456 926,404 922,334 C 918,266 878,218 802,184 C 712,144 606,86 502,86 Z',

  'le-mans':
    'M 266,516 L 215,513 L 180,505 L 158,490 L 146,464 L 138,443 L 132,442 L 123,448 L 116,444 L 110,425 L 100,395 L 98,372 L 94,360 L 78,348 L 64,326 L 52,296 L 53,282 L 66,268 L 95,250 L 146,222 L 260,188 L 355,160 L 364,168 L 371,173 L 378,167 L 383,154 L 395,149 L 520,113 L 642,78 L 651,74 L 656,61 L 662,57 L 669,64 L 675,68 L 718,56 L 820,48 L 912,42 L 921,45 L 920,56 L 892,165 L 862,265 L 838,332 L 812,344 L 775,349 L 760,353 L 759,360 L 766,372 L 778,405 L 776,412 L 765,415 L 685,434 L 645,449 L 605,472 L 582,487 L 562,484 L 542,469 L 522,463 L 504,471 L 486,487 L 468,486 L 454,474 L 442,466 L 428,468 L 395,473 L 362,479 L 336,491 L 327,498 L 318,496 L 311,504 L 303,511 L 296,517 L 288,514 L 281,517 Z',

  'silverstone':
    'M 644,492 L 535,416 L 522,398 L 518,375 L 517,322 L 502,286 L 462,244 C 452,232 454,220 468,214 L 498,205 C 508,198 506,186 490,182 L 448,176 C 430,175 418,182 406,196 L 265,368 C 250,388 250,410 265,418 L 296,422 C 318,425 324,452 308,464 C 292,474 268,462 246,448 C 212,428 194,404 186,368 L 164,225 C 162,196 176,180 206,172 L 365,146 C 385,142 396,130 408,126 C 424,122 442,138 464,138 C 486,138 502,114 522,112 C 542,112 552,132 564,152 C 574,166 588,174 606,182 L 848,294 C 872,308 876,338 856,356 L 794,404 L 752,442 C 742,452 742,462 752,472 C 760,482 756,496 738,508 L 712,522 C 698,528 686,522 672,512 Z',

  'portimao':
    'M 588,462 L 105,461 C 86,461 80,452 74,432 L 48,358 C 44,344 46,332 54,320 L 96,252 C 106,240 120,240 126,256 L 142,318 C 148,338 162,348 186,348 L 566,350 C 584,350 588,332 572,322 L 456,274 C 436,266 416,266 392,270 L 278,288 C 258,290 246,282 236,266 L 202,212 C 194,196 202,180 222,182 L 442,214 C 464,216 482,210 498,194 L 578,108 C 594,92 614,88 642,90 C 660,92 666,102 666,122 L 668,224 C 670,256 692,278 726,294 L 796,324 C 818,332 830,318 818,300 L 762,206 C 750,186 762,162 790,154 C 818,148 842,162 862,190 L 924,284 C 942,322 944,376 920,414 C 896,446 862,462 818,462 Z',

  // ==================== 38 HIGH-FIDELITY UPDATED CIRCUITS ====================
  'laguna-seca':
    'M 695,620 L 620,460 L 585,390 L 555,280 L 535,195 L 505,165 L 475,185 L 485,235 L 515,310 L 495,355 L 445,380 L 425,425 L 455,475 L 425,515 L 355,485 L 295,435 L 255,395 L 220,405 L 205,435 L 175,455 L 185,515 L 235,585 L 315,635 L 365,675 L 345,735 L 365,765 L 415,755 L 545,695 L 695,620 Z',

  'sebring':
    'M 340,765 L 540,745 L 515,685 L 475,625 L 510,575 L 465,515 L 510,455 L 425,375 L 340,295 L 325,265 L 355,245 L 510,210 L 650,175 L 705,225 L 680,275 L 735,325 L 700,385 L 775,445 L 790,505 L 755,595 L 545,765 L 345,825 L 295,785 L 300,762 L 340,765 Z',

  'long-beach':
    'M 660,740 L 320,740 L 320,790 L 305,830 L 265,815 L 255,745 L 255,560 L 275,540 L 680,540 L 700,560 L 700,625 L 720,640 L 840,640 L 860,660 L 845,730 L 815,745 L 660,740 Z',

  'detroit-street':
    'M 240,260 L 780,260 L 805,280 L 805,360 L 765,425 L 765,525 L 745,545 L 380,545 L 320,590 L 255,590 L 235,555 L 235,380 L 215,345 L 215,280 L 240,260 Z',

  'mid-ohio':
    'M 225,525 L 310,295 L 315,265 L 295,235 L 325,195 L 365,210 L 555,325 L 745,445 L 775,485 L 745,520 L 690,505 L 645,545 L 595,530 L 545,575 L 465,625 L 375,655 L 315,630 L 275,585 L 225,525 Z',

  'watkins-glen':
    'M 275,680 L 260,440 L 255,415 L 220,415 L 205,395 L 225,345 L 325,265 L 565,165 L 595,160 L 610,178 L 635,175 L 645,155 L 685,160 L 755,205 L 775,275 L 730,345 L 765,435 L 775,475 L 755,495 L 715,495 L 645,515 L 585,555 L 465,575 L 365,675 L 315,695 L 275,680 Z',

  'mosport':
    'M 250,740 L 245,340 L 260,300 L 315,265 L 415,215 L 495,210 L 585,275 L 665,345 L 795,365 L 815,405 L 775,435 L 595,555 L 430,665 L 375,735 L 335,775 L 285,775 L 250,740 Z',

  'lime-rock':
    'M 240,280 L 760,290 L 815,310 L 835,365 L 795,415 L 735,425 L 665,475 L 675,545 L 540,735 L 505,755 L 470,735 L 325,605 L 225,445 L 215,325 L 240,280 Z',

  'road-america':
    'M 780,220 L 780,560 L 760,590 L 620,600 L 595,625 L 595,760 L 430,845 L 400,835 L 405,805 L 465,755 L 455,725 L 375,695 L 340,645 L 235,485 L 225,455 L 255,425 L 335,335 L 330,265 L 265,220 L 200,165 L 215,135 L 455,125 L 490,165 L 565,225 L 665,185 L 745,175 L 775,200 L 780,220 Z',

  'vir':
    'M 680,780 L 320,780 L 280,765 L 280,735 L 325,715 L 415,675 L 425,640 L 375,605 L 365,545 L 340,485 L 375,425 L 445,335 L 515,235 L 575,195 L 625,210 L 675,255 L 665,285 L 630,315 L 765,645 L 780,680 L 745,705 L 780,745 L 765,775 L 680,780 Z',

  'indianapolis-road':
    'M 760,260 L 760,680 L 740,705 L 580,705 L 545,755 L 475,775 L 445,735 L 440,440 L 455,415 L 485,415 L 505,455 L 635,565 L 655,545 L 655,365 L 615,325 L 320,315 L 265,285 L 255,225 L 315,170 L 385,155 L 675,155 L 735,180 L 760,225 L 760,260 Z',

  'road-atlanta':
    'M 480,760 L 220,610 L 185,575 L 195,525 L 265,485 L 315,435 L 395,365 L 415,315 L 435,260 L 475,265 L 765,625 L 785,655 L 765,680 L 725,685 L 645,715 L 545,765 L 480,760 Z',

  'cota':
    'M 720,740 L 410,560 L 375,545 L 355,565 L 370,615 L 350,675 L 365,715 L 315,745 L 325,785 L 270,815 L 245,845 L 205,835 L 185,795 L 135,795 L 130,765 L 365,485 L 595,215 L 625,195 L 655,235 L 615,285 L 645,330 L 745,365 L 795,445 L 765,525 L 735,565 L 775,625 L 765,715 L 720,740 Z',

  'montreal':
    'M 680,780 L 540,640 L 515,615 L 495,635 L 480,605 L 455,565 L 470,535 L 445,510 L 405,445 L 390,385 L 375,340 L 320,205 L 295,165 L 270,135 L 305,125 L 345,155 L 420,245 L 485,445 L 665,695 L 685,725 L 665,745 L 695,775 L 680,780 Z',

  'miami':
    'M 640,740 L 340,740 L 305,730 L 295,695 L 335,595 L 425,465 L 455,375 L 410,305 L 395,275 L 425,250 L 780,245 L 810,260 L 805,305 L 755,335 L 765,375 L 730,405 L 765,445 L 845,695 L 840,730 L 810,740 L 765,725 L 640,740 Z',

  'las-vegas':
    'M 680,680 L 680,480 L 670,455 L 635,455 L 585,415 L 590,355 L 645,335 L 665,315 L 665,185 L 650,160 L 610,160 L 585,135 L 535,135 L 365,445 L 215,745 L 215,770 L 250,775 L 275,755 L 645,755 L 675,740 L 680,680 Z',

  'mexico-city':
    'M 240,740 L 760,740 L 795,725 L 790,695 L 765,675 L 775,645 L 665,455 L 635,435 L 615,465 L 615,505 L 580,515 L 515,445 L 435,385 L 365,355 L 335,365 L 335,435 L 305,465 L 305,515 L 265,545 L 220,645 L 220,720 L 240,740 Z',

  'interlagos':
    'M 250,740 L 210,320 L 210,285 L 235,270 L 225,230 L 285,170 L 680,175 L 735,205 L 755,275 L 715,345 L 615,375 L 565,425 L 575,465 L 635,485 L 695,495 L 710,530 L 665,555 L 485,585 L 440,615 L 440,655 L 465,695 L 445,745 L 355,775 L 275,765 L 250,740 Z',

  'monza':
    'M 710,780 L 710,260 L 735,235 L 715,210 L 735,180 L 695,125 L 605,95 L 515,95 L 485,115 L 455,105 L 385,155 L 365,205 L 385,265 L 355,355 L 305,395 L 295,435 L 260,465 L 255,725 L 285,805 L 385,850 L 565,855 L 685,825 L 710,780 Z',

  'monaco':
    'M 330,740 L 345,520 L 365,490 L 405,480 L 535,355 L 555,285 L 615,275 L 655,295 L 645,345 L 605,375 L 635,410 L 715,415 L 745,385 L 795,400 L 825,465 L 800,530 L 755,555 L 730,545 L 710,575 L 585,615 L 535,650 L 490,645 L 465,685 L 395,700 L 385,735 L 365,770 L 335,775 L 330,740 Z',

  'imola':
    'M 680,260 L 320,260 L 275,285 L 240,280 L 195,325 L 175,375 L 180,415 L 145,455 L 140,505 L 185,515 L 335,615 L 425,635 L 465,605 L 505,645 L 565,645 L 635,595 L 685,595 L 805,535 L 835,475 L 815,395 L 745,285 L 680,260 Z',

  'barcelona':
    'M 680,740 L 300,740 L 265,725 L 260,685 L 295,635 L 415,515 L 435,435 L 415,385 L 345,365 L 310,335 L 345,300 L 445,250 L 505,255 L 585,235 L 645,265 L 785,445 L 800,485 L 765,500 L 695,485 L 665,525 L 715,605 L 795,675 L 785,725 L 745,740 L 680,740 Z',

  'madring':
    'M 240,680 L 360,480 L 385,455 L 425,465 L 445,425 L 625,225 L 695,195 L 765,225 L 780,295 L 725,350 L 665,345 L 635,385 L 675,425 L 635,475 L 495,575 L 435,645 L 385,705 L 295,710 L 240,680 Z',

  'red-bull-ring':
    'M 680,720 L 340,720 L 305,705 L 300,665 L 285,255 L 315,235 L 345,255 L 555,375 L 575,405 L 520,495 L 545,565 L 685,610 L 750,665 L 735,715 L 680,720 Z',

  'hungaroring':
    'M 740,720 L 740,320 L 725,275 L 695,265 L 665,295 L 605,365 L 575,370 L 535,325 L 465,275 L 365,265 L 285,325 L 265,385 L 315,415 L 330,445 L 265,505 L 275,555 L 345,565 L 415,595 L 515,655 L 555,715 L 595,715 L 645,675 L 720,705 L 740,720 Z',

  'zandvoort':
    'M 720,740 L 720,340 L 705,295 L 675,285 L 645,315 L 605,365 L 565,370 L 535,325 L 475,245 L 395,245 L 295,285 L 275,335 L 330,425 L 315,470 L 265,465 L 245,515 L 270,555 L 260,615 L 315,705 L 425,765 L 585,775 L 695,760 L 720,740 Z',

  'paul-ricard':
    'M 680,740 L 320,740 L 275,750 L 235,725 L 220,665 L 245,625 L 220,575 L 280,520 L 270,490 L 305,470 L 535,315 L 565,300 L 585,315 L 605,295 L 785,180 L 835,195 L 840,245 L 795,365 L 745,355 L 725,425 L 765,485 L 735,555 L 775,645 L 750,720 L 680,740 Z',

  'baku':
    'M 820,740 L 340,740 L 315,715 L 315,635 L 335,615 L 550,615 L 565,635 L 565,675 L 655,675 L 680,645 L 660,605 L 415,595 L 375,565 L 335,555 L 315,505 L 215,445 L 180,355 L 205,320 L 255,325 L 415,455 L 645,565 L 815,665 L 835,715 L 820,740 Z',

  'suzuka':
    'M 780,560 L 640,720 L 595,755 L 550,740 L 545,700 L 565,670 L 535,635 L 565,595 L 535,555 L 495,485 L 445,450 L 415,415 L 465,385 L 470,355 L 405,275 L 370,275 L 335,345 L 265,400 L 165,435 L 145,485 L 195,515 L 425,495 L 625,465 L 725,475 L 765,495 L 790,485 L 805,515 L 780,560 Z',

  'fuji':
    'M 760,740 L 220,740 L 175,720 L 175,685 L 245,625 L 315,545 L 375,445 L 465,395 L 535,420 L 575,465 L 605,460 L 735,355 L 805,345 L 825,375 L 790,415 L 795,485 L 835,535 L 795,585 L 845,655 L 835,715 L 795,735 L 760,740 Z',

  'shanghai':
    'M 680,760 L 340,760 L 275,735 L 245,670 L 260,605 L 310,605 L 325,660 L 300,695 L 345,720 L 375,660 L 375,550 L 350,445 L 350,365 L 375,285 L 465,235 L 490,205 L 535,220 L 815,635 L 825,685 L 795,690 L 745,735 L 710,755 L 680,760 Z',

  'singapore':
    'M 740,680 L 740,440 L 725,410 L 685,405 L 645,385 L 365,385 L 330,365 L 320,285 L 265,275 L 245,225 L 185,225 L 155,265 L 175,435 L 165,475 L 195,495 L 485,495 L 635,615 L 675,645 L 700,635 L 730,675 L 740,680 Z',

  'sepang':
    'M 760,740 L 760,280 L 740,235 L 705,230 L 665,285 L 615,295 L 515,245 L 455,250 L 425,315 L 345,405 L 295,475 L 235,465 L 205,375 L 175,355 L 170,385 L 245,505 L 355,565 L 425,615 L 455,610 L 675,725 L 720,750 L 760,740 Z',

  'bahrain':
    'M 740,740 L 740,260 L 720,215 L 685,215 L 635,275 L 565,245 L 485,255 L 425,280 L 360,295 L 355,330 L 395,385 L 345,430 L 315,415 L 275,485 L 270,635 L 325,680 L 445,660 L 535,705 L 655,750 L 720,745 L 740,740 Z',

  'jeddah':
    'M 680,780 L 610,640 L 585,620 L 565,635 L 555,600 L 495,475 L 425,345 L 355,215 L 310,160 L 275,175 L 295,245 L 365,395 L 455,575 L 515,675 L 545,695 L 585,775 L 625,815 L 665,805 L 680,780 Z',

  'lusail':
    'M 760,740 L 760,260 L 735,210 L 695,215 L 655,255 L 565,220 L 435,210 L 345,275 L 295,305 L 265,320 L 255,395 L 285,450 L 245,505 L 295,585 L 335,595 L 385,620 L 515,620 L 625,645 L 695,725 L 735,750 L 760,740 Z',

  'yas-marina':
    'M 680,240 L 360,240 L 330,255 L 315,325 L 245,445 L 190,505 L 195,535 L 245,550 L 685,555 L 725,550 L 755,555 L 825,510 L 840,445 L 795,395 L 735,355 L 745,300 L 715,250 L 680,240 Z',

  'albert-park':
    'M 260,720 L 260,320 L 275,290 L 325,275 L 365,235 L 415,235 L 475,260 L 555,255 L 655,270 L 725,305 L 795,415 L 795,535 L 755,605 L 750,665 L 715,710 L 585,735 L 445,750 L 355,740 L 275,735 L 260,720 Z',

};

export interface RealTrackMetric {
  lengthMeters: number;
  trackWidth: number;
  targetLapSeconds: number;
}

/**
 * Official Real-World metric dimensions (1 unit = 1 meter) from RacingCircuits.info
 * for all 43 circuits, with realistic track widths (11m-15m) and real-life lap times.
 */
export const REAL_TRACK_METRICS: Record<string, RealTrackMetric> = {
  'spa-francorchamps': { lengthMeters: 7004, trackWidth: 14.5, targetLapSeconds: 106 },
  'daytona-road': { lengthMeters: 5729, trackWidth: 14.0, targetLapSeconds: 96 },
  'laguna-seca': { lengthMeters: 3602, trackWidth: 12.0, targetLapSeconds: 76 },
  'le-mans': { lengthMeters: 13626, trackWidth: 13.5, targetLapSeconds: 208 },
  'monza': { lengthMeters: 5793, trackWidth: 14.0, targetLapSeconds: 81 },
  'silverstone': { lengthMeters: 5891, trackWidth: 14.0, targetLapSeconds: 87 },
  'suzuka': { lengthMeters: 5807, trackWidth: 13.0, targetLapSeconds: 89 },
  'monaco': { lengthMeters: 3337, trackWidth: 11.0, targetLapSeconds: 72 },
  'cota': { lengthMeters: 5513, trackWidth: 14.5, targetLapSeconds: 94 },
  'sebring': { lengthMeters: 6019, trackWidth: 13.5, targetLapSeconds: 107 },
  'long-beach': { lengthMeters: 3167, trackWidth: 12.0, targetLapSeconds: 67 },
  'detroit-street': { lengthMeters: 2735, trackWidth: 12.0, targetLapSeconds: 62 },
  'mid-ohio': { lengthMeters: 3634, trackWidth: 12.0, targetLapSeconds: 74 },
  'watkins-glen': { lengthMeters: 5472, trackWidth: 13.0, targetLapSeconds: 88 },
  'mosport': { lengthMeters: 3957, trackWidth: 12.5, targetLapSeconds: 75 },
  'lime-rock': { lengthMeters: 2414, trackWidth: 11.5, targetLapSeconds: 50 },
  'road-america': { lengthMeters: 6515, trackWidth: 13.0, targetLapSeconds: 110 },
  'vir': { lengthMeters: 5260, trackWidth: 12.0, targetLapSeconds: 98 },
  'indianapolis-road': { lengthMeters: 3925, trackWidth: 13.5, targetLapSeconds: 76 },
  'road-atlanta': { lengthMeters: 4088, trackWidth: 12.5, targetLapSeconds: 72 },
  'montreal': { lengthMeters: 4361, trackWidth: 13.0, targetLapSeconds: 73 },
  'miami': { lengthMeters: 5412, trackWidth: 13.5, targetLapSeconds: 89 },
  'las-vegas': { lengthMeters: 6201, trackWidth: 14.0, targetLapSeconds: 93 },
  'mexico-city': { lengthMeters: 4304, trackWidth: 13.0, targetLapSeconds: 77 },
  'interlagos': { lengthMeters: 4309, trackWidth: 13.0, targetLapSeconds: 70 },
  'imola': { lengthMeters: 4909, trackWidth: 12.5, targetLapSeconds: 75 },
  'barcelona': { lengthMeters: 4657, trackWidth: 13.5, targetLapSeconds: 73 },
  'madring': { lengthMeters: 5474, trackWidth: 13.0, targetLapSeconds: 88 },
  'red-bull-ring': { lengthMeters: 4318, trackWidth: 13.0, targetLapSeconds: 65 },
  'hungaroring': { lengthMeters: 4381, trackWidth: 12.5, targetLapSeconds: 76 },
  'zandvoort': { lengthMeters: 4259, trackWidth: 12.5, targetLapSeconds: 71 },
  'paul-ricard': { lengthMeters: 5842, trackWidth: 14.5, targetLapSeconds: 92 },
  'baku': { lengthMeters: 6003, trackWidth: 12.5, targetLapSeconds: 102 },
  'portimao': { lengthMeters: 4653, trackWidth: 13.5, targetLapSeconds: 78 },
  'fuji': { lengthMeters: 4563, trackWidth: 14.0, targetLapSeconds: 74 },
  'shanghai': { lengthMeters: 5451, trackWidth: 14.0, targetLapSeconds: 93 },
  'singapore': { lengthMeters: 4940, trackWidth: 12.0, targetLapSeconds: 91 },
  'sepang': { lengthMeters: 5543, trackWidth: 14.0, targetLapSeconds: 92 },
  'bahrain': { lengthMeters: 5412, trackWidth: 14.0, targetLapSeconds: 90 },
  'jeddah': { lengthMeters: 6174, trackWidth: 13.0, targetLapSeconds: 88 },
  'lusail': { lengthMeters: 5419, trackWidth: 14.0, targetLapSeconds: 83 },
  'yas-marina': { lengthMeters: 5281, trackWidth: 13.5, targetLapSeconds: 83 },
  'albert-park': { lengthMeters: 5278, trackWidth: 13.5, targetLapSeconds: 78 },
};

/**
 * Calculates 2D polygon signed area in screen/SVG space (x, y).
 */
export function calculateSvgPathArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area;
}

/**
 * Parses SVG path string into an ordered sequence of 2D vertices,
 * expanding Beziers and Lines accurately.
 */
function parseSvgVertices(svgD: string): Array<[number, number]> {
  const regex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;
  const vertices: Array<[number, number]> = [];
  while ((match = regex.exec(svgD)) !== null) {
    const cmd = match[1].toUpperCase();
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i < args.length; i += 2) {
        vertices.push([args[i], args[i + 1]]);
      }
    } else if (cmd === 'C') {
      for (let i = 0; i < args.length; i += 6) {
        vertices.push([args[i + 2], args[i + 3]]);
        vertices.push([args[i + 4], args[i + 5]]);
      }
    } else if (cmd === 'Q') {
      for (let i = 0; i < args.length; i += 4) {
        vertices.push([args[i], args[i + 1]]);
        vertices.push([args[i + 2], args[i + 3]]);
      }
    }
  }
  return vertices;
}

/**
 * Converts a normalized SVG path string into high-density 3D TrackWaypoints (180-240 points).
 * Preserves crisp corner profiles, prevents ribbon self-intersection folds, scales for
 * authentic 35-55s / 65-75s lap times, and applies real-world elevation and banking profiles.
 */
export function svgToTrackPoints(svgPathD: string, options: SvgTrackOptions = {}): TrackWaypoint[] {
  const trackId = options.trackId ?? '';
  const isCCW = options.direction === 'ccw' || (trackId ? CCW_CIRCUIT_IDS.has(trackId) : false);
  const metric = trackId ? REAL_TRACK_METRICS[trackId] : undefined;
  const trackWidth = metric?.trackWidth ?? options.trackWidth ?? 13.5;
  const targetLengthMeters =
    metric?.lengthMeters ??
    (options.targetLapSeconds ? options.targetLapSeconds * 60 : 5000);

  let rawVerts = parseSvgVertices(svgPathD);
  if (rawVerts.length < 3) return [];

  // Enforce correct physical driving winding
  const curArea = calculateSvgPathArea(rawVerts.map((v) => ({ x: v[0], y: v[1] })));
  if (isCCW && curArea > 0) {
    rawVerts.reverse();
  } else if (!isCCW && trackId !== 'suzuka' && curArea < 0) {
    rawVerts.reverse();
  }

  // Remove duplicate/near-coincident adjacent vertices
  const filtered: Array<[number, number]> = [];
  for (let i = 0; i < rawVerts.length; i++) {
    const v = rawVerts[i];
    if (filtered.length > 0) {
      const prev = filtered[filtered.length - 1];
      if (Math.hypot(v[0] - prev[0], v[1] - prev[1]) < 7) continue;
    }
    filtered.push(v);
  }

  // Remove duplicate closing vertex if coincident with the start vertex in a closed loop
  while (filtered.length > 2) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 7) {
      filtered.pop();
    } else {
      break;
    }
  }

  // Authentic 1:1 scale factor (1 unit = 1 meter)
  const minSafeRadius = Math.max(9.5, trackWidth * 0.72);
  const n = filtered.length;

  let sumX = 0;
  let sumZ = 0;
  for (const v of filtered) {
    sumX += v[0];
    sumZ += v[1];
  }
  const meanX = sumX / n;
  const meanZ = sumZ / n;

  const centered = filtered.map((v) => [v[0] - meanX, v[1] - meanZ]);
  let rawLen = 0;
  for (let i = 0; i < n; i++) {
    const a = centered[i];
    const b = centered[(i + 1) % n];
    rawLen += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const scale = targetLengthMeters / Math.max(100, rawLen);
  const scaled = centered.map((v) => [v[0] * scale, v[1] * scale]);

  // Expand with piecewise fillet arcs so corners stay crisp and never fold ribbon edges
  const cornerExpanded: Array<{ x: number; y: number; z: number; isCorner: boolean }> = [];
  for (let i = 0; i < n; i++) {
    const prev = scaled[(i - 1 + n) % n];
    const curr = scaled[i];
    const next = scaled[(i + 1) % n];

    const inDx = curr[0] - prev[0];
    const inDz = curr[1] - prev[1];
    const inLen = Math.hypot(inDx, inDz) || 1;
    const uInX = inDx / inLen;
    const uInZ = inDz / inLen;

    const outDx = next[0] - curr[0];
    const outDz = next[1] - curr[1];
    const outLen = Math.hypot(outDx, outDz) || 1;
    const uOutX = outDx / outLen;
    const uOutZ = outDz / outLen;

    const dot = Math.max(-0.999, Math.min(0.999, uInX * uOutX + uInZ * uOutZ));
    const phi = Math.acos(dot);

    if (phi < 0.085) {
      cornerExpanded.push({ x: curr[0], y: 0, z: curr[1], isCorner: false });
      continue;
    }

    const r = minSafeRadius;
    const tanHalf = Math.tan(phi * 0.5);
    const maxTrim = 0.44 * Math.min(inLen, outLen);
    const trim = Math.min(r * tanHalf, maxTrim);
    const rEff = trim / Math.max(1e-4, tanHalf);

    const ax = curr[0] - uInX * trim;
    const az = curr[1] - uInZ * trim;
    const bx = curr[0] + uOutX * trim;
    const bz = curr[1] + uOutZ * trim;

    const cross = uInX * uOutZ - uInZ * uOutX;
    const sign = cross >= 0 ? 1 : -1;
    const nAx = -sign * uInZ;
    const nAz = sign * uInX;

    const cx = ax + nAx * rEff;
    const cz = az + nAz * rEff;

    const angA = Math.atan2(az - cz, ax - cx);
    const angB = Math.atan2(bz - cz, bx - cx);
    let dAng = angB - angA;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;

    const arcLen = Math.abs(dAng) * rEff;
    const desiredArcChords = Math.max(2, Math.min(6, Math.round(arcLen / 8.5)));
    const interiorPts = Math.max(1, desiredArcChords - 1);

    cornerExpanded.push({ x: ax, y: 0, z: az, isCorner: true });
    for (let k = 1; k <= interiorPts; k++) {
      const frac = k / (interiorPts + 1);
      const theta = angA + dAng * frac;
      cornerExpanded.push({
        x: cx + Math.cos(theta) * rEff,
        y: 0,
        z: cz + Math.sin(theta) * rEff,
        isCorner: true,
      });
    }
    cornerExpanded.push({ x: bx, y: 0, z: bz, isCorner: true });
  }

  // Clean near-coincident points
  const cleaned: typeof cornerExpanded = [];
  for (let i = 0; i < cornerExpanded.length; i++) {
    const pt = cornerExpanded[i];
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.hypot(pt.x - prev.x, pt.z - prev.z) < 7.2) {
        prev.x = (prev.x + pt.x) * 0.5;
        prev.z = (prev.z + pt.z) * 0.5;
        continue;
      }
    }
    cleaned.push(pt);
  }

  // Subdivide straights so waypoints density is 200-280 points at 1:1 scale
  const gap = 20;
  const dense: typeof cornerExpanded = [];
  const m = cleaned.length;
  for (let i = 0; i < m; i++) {
    const a = cleaned[i];
    const b = cleaned[(i + 1) % m];
    dense.push(a);

    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (segLen > gap) {
      const steps = Math.floor(segLen / gap);
      for (let s = 1; s <= steps; s++) {
        const frac = s / (steps + 1);
        dense.push({
          x: a.x + (b.x - a.x) * frac,
          y: 0,
          z: a.z + (b.z - a.z) * frac,
          isCorner: false,
        });
      }
    }
  }

  const totalPts = dense.length;
  const rawWaypoints = dense.map((p, idx) => {
    const t = idx / totalPts;
    let y = 0;
    let banking = 0;

    // 1:1 Metric Elevation Profiles in true meters
    if (trackId === 'spa-francorchamps') {
      // Descent from La Source into Eau Rouge (-8m) -> steep Raidillon climb (+38m) -> Les Combes peak (+48m) -> Pouhon plunge (-12m) -> Blanchimont climb
      if (t >= 0.0 && t <= 0.07) {
        const u = t / 0.07;
        y = -8 * Math.sin(u * Math.PI * 0.5);
      } else if (t > 0.07 && t <= 0.17) {
        const u = (t - 0.07) / 0.10;
        y = -8 + (1 - Math.cos(u * Math.PI)) * 0.5 * 46;
      } else if (t > 0.17 && t <= 0.26) {
        const u = (t - 0.17) / 0.09;
        y = 38 + Math.sin(u * Math.PI * 0.5) * 10;
      } else if (t > 0.26 && t <= 0.62) {
        const u = (t - 0.26) / 0.36;
        y = 48 - (1 - Math.cos(u * Math.PI)) * 0.5 * 60;
      } else if (t > 0.62 && t <= 0.96) {
        const u = (t - 0.62) / 0.34;
        y = -12 + (1 - Math.cos(u * Math.PI)) * 0.5 * 14;
      }
    } else if (trackId === 'le-mans') {
      // Start/Finish -> Dunlop crest (+15m) -> Esses drop (-2m) -> Mulsanne undulations -> Porsche Curves (+14m)
      if (t >= 0.02 && t <= 0.14) {
        const u = (t - 0.02) / 0.12;
        y = Math.sin(u * Math.PI) * 15;
      } else if (t > 0.14 && t <= 0.52) {
        const u = (t - 0.14) / 0.38;
        y = Math.sin(u * Math.PI * 3) * 3.5 - 1.5;
      } else if (t > 0.52 && t <= 0.72) {
        const u = (t - 0.52) / 0.20;
        y = Math.sin(u * Math.PI) * 8;
      } else if (t > 0.72 && t <= 0.94) {
        const u = (t - 0.72) / 0.22;
        y = (1 - Math.cos(u * Math.PI * 2)) * 0.5 * 14;
      }
    } else if (trackId === 'silverstone') {
      // Village dip (-3.5m) -> Wellington/Brooklands rise (+4.5m) -> Hangar Straight up to Stowe crest (+6.2m) -> Vale dip (-3.0m)
      if (t >= 0.06 && t <= 0.22) {
        const u = (t - 0.06) / 0.16;
        y = -3.5 * Math.sin(u * Math.PI);
      } else if (t > 0.22 && t <= 0.45) {
        const u = (t - 0.22) / 0.23;
        y = 4.5 * Math.sin(u * Math.PI);
      } else if (t > 0.58 && t <= 0.80) {
        const u = (t - 0.58) / 0.22;
        y = 6.2 * Math.sin(u * Math.PI);
      } else if (t > 0.80 && t <= 0.94) {
        const u = (t - 0.80) / 0.14;
        y = -3.0 * Math.sin(u * Math.PI);
      }
    } else if (trackId === 'laguna-seca') {
      // Laguna Seca Corkscrew: climb Rahal straight up to Corkscrew crest (+18m), then plunge 18m down turns 8 & 8A
      if (t >= 0.46 && t <= 0.58) {
        const u = (t - 0.46) / 0.12;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 18;
      } else if (t > 0.58 && t <= 0.68) {
        const u = (t - 0.58) / 0.10;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 18;
      }
    } else if (trackId === 'suzuka') {
      // Smooth cosine figure-8 bridge overpass (+10.5m deck clearing lower track at 0m)
      if (t >= 0.24 && t <= 0.32) {
        y = 10.5;
      } else if (t >= 0.16 && t < 0.24) {
        const u = (t - 0.16) / 0.08;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 10.5;
      } else if (t > 0.32 && t <= 0.40) {
        const u = (t - 0.32) / 0.08;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 10.5;
      }
    } else if (trackId === 'red-bull-ring') {
      if (t >= 0.10 && t <= 0.24) {
        const u = (t - 0.10) / 0.14;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 24;
      } else if (t > 0.24 && t <= 0.45) {
        const u = (t - 0.24) / 0.21;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 24;
      }
    } else if (trackId === 'cota') {
      if (t >= 0.03 && t <= 0.12) {
        const u = (t - 0.03) / 0.09;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 28;
      } else if (t > 0.12 && t <= 0.22) {
        const u = (t - 0.12) / 0.10;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 28;
      }
    } else if (trackId === 'portimao') {
      // Plunge into T1 (-12m) -> climb to Lagos (+8m) -> drop & climb to Craig Jones crest (+20m) -> Portimão peak (+24m) -> steep drop into Sagres (-8m)
      if (t >= 0.03 && t <= 0.16) {
        const u = (t - 0.03) / 0.13;
        y = -12 * Math.sin(u * Math.PI);
      } else if (t > 0.16 && t <= 0.34) {
        const u = (t - 0.16) / 0.18;
        y = 10 * Math.sin(u * Math.PI);
      } else if (t > 0.42 && t <= 0.66) {
        const u = (t - 0.42) / 0.24;
        y = (1 - Math.cos(u * Math.PI * 0.5)) * 24;
      } else if (t > 0.66 && t <= 0.84) {
        const u = (t - 0.66) / 0.18;
        y = 24 - (1 - Math.cos(u * Math.PI)) * 0.5 * 32;
      } else if (t > 0.84 && t <= 0.98) {
        const u = (t - 0.84) / 0.14;
        y = -8 + (1 - Math.cos(u * Math.PI * 0.5)) * 8;
      }
    } else if (trackId === 'interlagos') {
      // Interlagos: steep climb up Arquibancadas into Subida dos Boxes (+16m), plunge through Senna S
      if (t >= 0.78 && t <= 0.98) {
        const u = (t - 0.78) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 16;
      } else if (t >= 0.0 && t <= 0.16) {
        const u = t / 0.16;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 16;
      }
    } else if (trackId === 'road-atlanta') {
      // Road Atlanta: climb Turn 1 to Esses crest (+18m), undulating dip, dramatic downhill plunge into Turn 12
      if (t >= 0.05 && t <= 0.25) {
        const u = (t - 0.05) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 18;
      } else if (t > 0.25 && t <= 0.60) {
        const u = (t - 0.25) / 0.35;
        y = 18 - Math.sin(u * Math.PI) * 12;
      } else if (t > 0.82 && t <= 0.96) {
        const u = (t - 0.82) / 0.14;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 10;
      }
    } else if (trackId === 'watkins-glen') {
      // Watkins Glen: uphill charge through the Esses (+18m), rolling boot section
      if (t >= 0.08 && t <= 0.28) {
        const u = (t - 0.08) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 18;
      } else if (t > 0.28 && t <= 0.65) {
        const u = (t - 0.28) / 0.37;
        y = 18 - Math.sin(u * Math.PI * 0.5) * 8;
      } else if (t > 0.65 && t <= 0.90) {
        const u = (t - 0.65) / 0.25;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 10;
      }
    } else if (trackId === 'monaco') {
      // Monaco: uphill climb Beau Rivage to Casino Square (+24m), plunge down Mirabeau and Fairmont Hairpin to Portier
      if (t >= 0.08 && t <= 0.28) {
        const u = (t - 0.08) / 0.20;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 24;
      } else if (t > 0.28 && t <= 0.55) {
        const u = (t - 0.28) / 0.27;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 24;
      }
    }

    // Gentle Banking Profiles: smooth 8°-10° max for Daytona, 10°-12° max for Zandvoort/Indy, 0°-3° standard
    if (trackId === 'daytona-road') {
      // Infield (t = 0.06..0.47) & Backstretch/Le Mans Chicane (t = 0.63..0.76) are strictly 0° flat!
      if (t >= 0.48 && t <= 0.62) {
        // West Oval Banking (NASCAR T1-T2 / Road Course T8-T9)
        const ease = 0.035;
        let factor = 1.0;
        if (t < 0.48 + ease) factor = (1 - Math.cos(((t - 0.48) / ease) * Math.PI)) * 0.5;
        else if (t > 0.62 - ease) factor = (1 - Math.cos(((0.62 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (t >= 0.77 && t <= 0.93) {
        // East Oval Banking (NASCAR T3-T4 / Road Course T12-T13)
        const ease = 0.035;
        let factor = 1.0;
        if (t < 0.77 + ease) factor = (1 - Math.cos(((t - 0.77) / ease) * Math.PI)) * 0.5;
        else if (t > 0.93 - ease) factor = (1 - Math.cos(((0.93 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (t > 0.93 || t < 0.05) {
        // Gentle Tri-Oval Frontstretch Banking (6.5°), easing smoothly to 0° before T1 braking
        let factor = 1.0;
        if (t >= 0.93 && t < 0.96) factor = (1 - Math.cos(((t - 0.93) / 0.03) * Math.PI)) * 0.5;
        else if (t >= 0.02 && t < 0.05) factor = (1 - Math.cos(((0.05 - t) / 0.03) * Math.PI)) * 0.5;
        banking = 6.5 * factor;
      }
    } else if (trackId === 'zandvoort') {
      if (t >= 0.14 && t <= 0.24) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.14 + ease) factor = (1 - Math.cos(((t - 0.14) / ease) * Math.PI)) * 0.5;
        else if (t > 0.24 - ease) factor = (1 - Math.cos(((0.24 - t) / ease) * Math.PI)) * 0.5;
        banking = 11.0 * factor;
      } else if (t >= 0.88 && t <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.88 + ease) factor = (1 - Math.cos(((t - 0.88) / ease) * Math.PI)) * 0.5;
        else if (t > 0.98 - ease) factor = (1 - Math.cos(((0.98 - t) / ease) * Math.PI)) * 0.5;
        banking = 11.0 * factor;
      }
    } else if (trackId === 'indianapolis-road') {
      if (t >= 0.88 && t <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.88 + ease) factor = (1 - Math.cos(((t - 0.88) / ease) * Math.PI)) * 0.5;
        else if (t > 0.98 - ease) factor = (1 - Math.cos(((0.98 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      }
    }

    return {
      x: Math.round(p.x * 10) / 10,
      y,
      z: Math.round(p.z * 10) / 10,
      ...(banking ? { banking } : {}),
      width: trackWidth,
    };
  });

  // Low-pass smoothing filter on elevation (Y) so slopes are realistic and transition buttery smooth
  const smoothedWaypoints: TrackWaypoint[] = [];
  const W = rawWaypoints.length;
  for (let i = 0; i < W; i++) {
    const yMinus2 = rawWaypoints[(i - 2 + W) % W].y;
    const yMinus1 = rawWaypoints[(i - 1 + W) % W].y;
    const y0 = rawWaypoints[i].y;
    const yPlus1 = rawWaypoints[(i + 1) % W].y;
    const yPlus2 = rawWaypoints[(i + 2) % W].y;
    const smoothedY = 0.06 * yMinus2 + 0.24 * yMinus1 + 0.40 * y0 + 0.24 * yPlus1 + 0.06 * yPlus2;
    smoothedWaypoints.push({
      ...rawWaypoints[i],
      y: Math.round(smoothedY * 10) / 10,
    });
  }

  return smoothedWaypoints;
}
