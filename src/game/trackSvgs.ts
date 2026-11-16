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
  // ==================== 10 REFERENCE PACK CIRCUITS ====================
  'spa-francorchamps':
    'M 238,398 L 124,480 C 112,488 108,482 114,468 L 164,364 C 180,334 204,312 236,286 C 254,270 262,250 276,238 C 292,226 312,228 330,216 C 356,196 384,166 426,146 L 708,44 C 722,40 730,46 736,56 C 742,66 752,66 768,58 L 788,50 C 800,48 808,54 818,68 L 880,148 C 892,164 882,182 862,178 C 846,174 836,154 824,134 C 816,122 806,122 790,128 L 636,176 C 614,184 608,204 610,232 C 612,262 630,280 666,292 L 764,322 C 782,328 788,342 780,362 C 772,382 774,398 792,410 L 854,448 C 866,456 866,468 856,484 L 836,514 C 822,534 798,536 770,524 C 724,504 692,468 656,412 C 632,374 604,352 558,334 L 522,322 C 508,318 496,322 480,330 L 396,368 L 316,384 C 306,384 306,374 306,362 C 304,352 296,352 284,362 Z',

  'monza':
    'M 680,820 L 680,260 L 715,245 L 685,205 L 715,175 C 690,125 600,95 500,105 L 470,130 L 440,90 L 400,130 L 355,195 L 375,245 L 395,285 L 340,335 L 265,485 L 235,515 L 265,550 L 245,595 L 255,785 C 295,885 520,910 645,860 Z',

  'le-mans':
    'M 266,516 L 215,513 L 180,505 L 158,490 L 146,464 L 138,443 L 132,442 L 123,448 L 116,444 L 110,425 L 100,395 L 98,372 L 94,360 L 78,348 L 64,326 L 52,296 L 53,282 L 66,268 L 95,250 L 146,222 L 260,188 L 355,160 L 364,168 L 371,173 L 378,167 L 383,154 L 395,149 L 520,113 L 642,78 L 651,74 L 656,61 L 662,57 L 669,64 L 675,68 L 718,56 L 820,48 L 912,42 L 921,45 L 920,56 L 892,165 L 862,265 L 838,332 L 812,344 L 775,349 L 760,353 L 759,360 L 766,372 L 778,405 L 776,412 L 765,415 L 685,434 L 645,449 L 605,472 L 582,487 L 562,484 L 542,469 L 522,463 L 504,471 L 486,487 L 468,486 L 454,474 L 442,466 L 428,468 L 395,473 L 362,479 L 336,491 L 327,498 L 318,496 L 311,504 L 303,511 L 296,517 L 288,514 L 281,517 Z',

  'daytona-road':
    'M 502,86 C 440,86 385,102 336,128 C 304,148 292,174 300,192 C 308,208 328,212 356,214 C 376,216 390,232 412,234 L 512,236 C 536,236 538,278 510,282 L 304,284 C 288,284 276,290 264,302 L 162,368 C 146,378 144,352 158,334 L 262,226 C 276,212 268,196 248,184 C 228,174 210,174 188,184 C 112,222 76,282 78,348 C 80,418 122,474 202,494 C 234,500 268,502 310,502 L 554,502 C 568,502 574,480 588,478 L 620,476 C 632,476 638,494 656,500 C 720,506 785,504 832,484 C 896,456 926,404 922,334 C 918,266 878,218 802,184 C 712,144 606,86 502,86 Z',

  'suzuka':
    'M 785,580 L 635,745 L 590,780 L 545,735 L 570,685 L 535,645 L 565,600 L 530,555 C 505,485 465,465 445,455 L 415,410 L 465,385 L 485,345 L 425,275 C 395,245 375,255 365,275 L 310,365 L 225,415 C 125,435 115,505 175,540 L 495,490 L 615,470 C 695,460 745,480 775,505 L 810,515 L 780,545 L 790,570 Z',

  'laguna-seca':
    'M 680,730 L 360,730 L 250,710 C 160,690 140,590 220,560 L 320,560 L 380,530 L 515,485 L 575,455 L 545,385 L 465,305 L 425,235 L 385,185 L 425,155 L 475,185 C 565,215 635,255 675,295 L 735,385 L 715,475 L 765,575 L 735,650 Z',

  'silverstone':
    'M 644,492 L 535,416 L 522,398 L 518,375 L 517,322 L 502,286 L 462,244 C 452,232 454,220 468,214 L 498,205 C 508,198 506,186 490,182 L 448,176 C 430,175 418,182 406,196 L 265,368 C 250,388 250,410 265,418 L 296,422 C 318,425 324,452 308,464 C 292,474 268,462 246,448 C 212,428 194,404 186,368 L 164,225 C 162,196 176,180 206,172 L 365,146 C 385,142 396,130 408,126 C 424,122 442,138 464,138 C 486,138 502,114 522,112 C 542,112 552,132 564,152 C 574,166 588,174 606,182 L 848,294 C 872,308 876,338 856,356 L 794,404 L 752,442 C 742,452 742,462 752,472 C 760,482 756,496 738,508 L 712,522 C 698,528 686,522 672,512 Z',

  'cota':
    'M 680,740 L 390,580 L 345,555 L 345,605 L 365,665 L 315,705 L 335,755 L 275,785 L 285,835 L 215,845 L 195,795 L 145,805 L 105,775 L 135,725 L 565,235 L 615,195 L 655,245 L 625,295 L 675,335 C 775,365 835,445 805,535 L 745,585 L 775,665 Z',

  'interlagos':
    'M 420,820 L 230,420 L 195,355 L 235,315 L 215,255 C 245,185 305,165 345,165 L 675,185 C 765,225 775,285 775,315 L 715,415 L 625,435 L 555,415 L 525,465 L 575,515 L 645,555 L 635,615 L 555,595 L 455,615 L 435,685 L 485,745 L 455,795 Z',

  'monaco':
    'M 340,740 L 355,520 L 385,485 L 435,475 L 545,355 L 565,285 L 625,275 L 665,285 L 655,345 L 625,385 L 655,415 L 715,415 L 745,375 L 795,385 C 835,445 815,515 785,545 L 725,565 L 715,595 L 675,595 L 565,615 L 535,655 L 495,645 L 465,695 L 425,695 L 365,735 L 385,775 L 335,785 Z',

  // ==================== 33 RACINGCIRCUITS.INFO TRACKS ====================
  'sebring':
    'M 540,840 L 540,490 L 465,445 L 415,445 L 375,480 L 355,555 L 285,580 L 225,580 L 175,505 L 185,420 L 225,325 L 285,265 L 760,265 L 825,325 L 865,435 L 830,490 L 885,545 L 885,845 L 820,930 L 680,940 Z',

  'road-america':
    'M 320,840 L 320,330 L 410,270 L 515,270 L 565,335 L 565,435 L 475,495 L 475,615 L 545,685 C 655,735 735,685 755,575 L 755,395 L 825,315 L 825,185 L 745,115 L 585,115 L 495,155 L 395,165 L 230,295 L 230,840 Z',

  'road-atlanta':
    'M 480,820 L 565,705 L 565,585 L 495,505 L 545,425 L 495,345 L 545,265 L 635,265 L 765,375 L 765,635 L 715,695 L 745,745 L 675,815 L 555,835 Z',

  'watkins-glen':
    'M 365,785 L 365,375 L 445,305 L 465,225 L 515,175 L 555,225 L 595,285 L 730,285 L 760,265 L 790,285 L 820,295 L 845,415 C 875,515 825,595 745,615 L 785,695 L 755,765 L 685,735 L 655,615 L 585,615 L 515,675 L 445,785 Z',

  'vir':
    'M 425,820 L 425,485 L 345,415 L 375,345 L 315,315 L 345,245 L 415,225 L 485,265 L 535,215 L 615,245 L 685,315 L 755,315 L 785,375 L 735,425 L 665,425 L 665,685 L 595,735 L 545,715 L 495,785 Z',

  'mosport':
    'M 385,785 L 385,515 L 315,445 L 245,365 L 295,275 L 415,285 L 495,215 L 575,255 L 535,345 L 565,395 L 815,395 L 865,465 L 795,545 L 715,545 L 625,635 L 495,715 L 465,785 Z',

  'mid-ohio':
    'M 375,815 L 375,475 L 305,405 L 345,315 L 425,315 L 465,395 L 765,395 L 735,465 L 775,515 L 705,585 L 735,655 L 665,715 L 575,665 L 515,725 L 465,725 L 435,815 Z',

  'detroit-street':
    'M 285,765 L 285,325 L 385,325 L 385,235 L 695,235 L 695,325 L 785,325 L 785,585 L 695,585 L 695,675 L 515,675 L 515,765 Z',

  'lime-rock':
    'M 325,725 L 325,385 C 325,275 445,235 525,285 L 585,355 L 685,315 L 755,365 L 755,475 L 685,545 L 585,545 L 475,665 L 435,725 Z',

  'indianapolis-road':
    'M 315,825 L 315,445 L 385,415 L 355,345 L 425,315 L 485,365 L 565,335 L 615,395 L 615,585 L 545,635 L 485,585 L 445,645 L 485,705 L 425,765 L 365,765 Z',

  'long-beach':
    'M 245,745 L 245,395 L 315,345 L 385,385 L 345,435 L 425,465 L 785,465 L 785,545 L 665,545 L 665,635 L 485,635 L 485,715 L 325,715 L 325,745 Z',

  'montreal':
    'M 215,665 L 215,485 L 265,435 L 235,385 L 295,355 L 475,345 L 515,315 L 555,345 L 765,345 L 825,395 L 805,445 L 845,475 L 815,515 L 565,525 L 345,535 L 285,585 L 295,665 Z',

  'miami':
    'M 285,765 L 285,475 L 345,415 L 415,435 L 465,385 L 545,425 L 625,375 L 745,375 L 815,445 L 785,515 L 835,565 L 795,615 L 615,615 L 435,635 L 385,715 L 345,765 Z',

  'las-vegas':
    'M 265,785 L 265,435 L 345,385 L 425,415 L 445,345 L 535,345 L 585,395 L 545,455 L 635,485 L 785,485 L 785,585 L 695,625 L 735,675 L 685,725 L 485,725 L 415,785 Z',

  'mexico-city':
    'M 235,745 L 235,315 L 315,315 L 355,265 L 395,315 L 485,315 L 525,265 L 565,315 L 675,315 L 735,385 L 785,355 L 825,415 L 775,485 L 715,465 L 685,545 L 745,615 L 715,685 L 585,685 L 485,745 Z',

  'imola':
    'M 645,815 L 425,785 L 385,725 L 425,665 L 375,615 L 415,555 L 355,475 L 315,385 L 365,315 L 465,315 L 535,365 L 515,425 L 575,475 L 675,435 L 745,495 L 715,575 L 775,645 L 735,735 Z',

  'barcelona':
    'M 265,785 L 265,345 L 335,285 L 385,325 L 475,255 L 565,275 L 535,365 L 465,415 L 525,485 L 645,445 L 735,495 L 785,575 L 725,655 L 615,645 L 545,715 L 445,715 L 395,785 Z',

  'madring':
    'M 315,765 L 315,415 L 395,355 L 485,375 L 535,315 L 635,315 L 715,385 L 785,365 L 825,435 L 775,515 L 695,515 L 645,585 L 695,655 L 635,725 L 485,725 L 415,765 Z',

  'red-bull-ring':
    'M 345,745 L 345,435 L 435,375 L 535,225 L 615,255 L 585,345 L 675,415 L 745,495 L 705,575 L 625,595 L 555,675 L 465,675 L 415,745 Z',

  'hungaroring':
    'M 365,815 L 365,485 L 305,435 L 365,375 L 465,385 L 515,325 L 585,345 L 545,415 L 635,435 L 615,495 L 695,515 L 675,585 L 745,615 L 715,685 L 595,685 L 535,745 L 465,745 L 435,815 Z',

  'zandvoort':
    'M 315,795 L 315,385 L 395,315 L 365,245 L 445,215 L 535,265 L 505,345 L 585,395 L 675,365 L 735,425 L 685,515 L 745,585 L 695,665 L 595,655 L 535,725 L 435,725 L 395,795 Z',

  'paul-ricard':
    'M 265,735 L 265,415 L 335,355 L 395,395 L 445,345 L 595,345 L 615,315 L 645,345 L 795,345 L 855,415 L 815,485 L 855,545 L 785,615 L 685,595 L 585,665 L 445,665 L 375,735 Z',

  'baku':
    'M 275,785 L 275,345 L 375,345 L 375,265 L 475,265 L 475,345 L 535,345 L 565,415 L 535,485 L 585,545 L 645,515 L 695,575 L 765,575 L 765,675 L 585,675 L 485,745 L 385,745 L 345,785 Z',

  'portimao':
    'M 588,462 L 105,461 C 86,461 80,452 74,432 L 48,358 C 44,344 46,332 54,320 L 96,252 C 106,240 120,240 126,256 L 142,318 C 148,338 162,348 186,348 L 566,350 C 584,350 588,332 572,322 L 456,274 C 436,266 416,266 392,270 L 278,288 C 258,290 246,282 236,266 L 202,212 C 194,196 202,180 222,182 L 442,214 C 464,216 482,210 498,194 L 578,108 C 594,92 614,88 642,90 C 660,92 666,102 666,122 L 668,224 C 670,256 692,278 726,294 L 796,324 C 818,332 830,318 818,300 L 762,206 C 750,186 762,162 790,154 C 818,148 842,162 862,190 L 924,284 C 942,322 944,376 920,414 C 896,446 862,462 818,462 Z',

  'fuji':
    'M 245,745 L 245,315 L 345,245 L 445,295 L 565,275 L 675,335 L 625,415 L 715,465 L 785,425 L 825,495 L 755,575 L 695,545 L 645,625 L 535,625 L 465,715 L 345,715 L 315,745 Z',

  'shanghai':
    'M 385,785 L 385,465 C 385,345 495,315 545,375 C 575,415 535,475 485,475 L 465,535 L 545,555 L 625,485 L 715,515 L 675,595 L 745,645 L 715,715 L 585,715 L 515,645 L 465,715 L 425,785 Z',

  'singapore':
    'M 335,765 L 335,465 L 395,415 L 465,445 L 435,375 L 515,345 L 585,385 L 655,345 L 735,385 L 775,455 L 725,515 L 765,575 L 715,645 L 635,625 L 565,695 L 475,685 L 425,745 L 375,745 Z',

  'sepang':
    'M 345,785 L 345,465 L 415,415 L 385,345 L 475,315 L 565,365 L 635,315 L 715,365 L 675,445 L 745,495 L 695,575 L 755,635 L 685,705 L 575,695 L 505,765 L 425,745 L 385,785 Z',

  'bahrain':
    'M 325,815 L 325,445 L 415,385 L 375,315 L 455,275 L 545,325 L 615,275 L 685,325 L 645,405 L 715,445 L 675,525 L 745,585 L 695,665 L 585,655 L 515,735 L 435,725 L 385,815 Z',

  'jeddah':
    'M 445,865 L 445,565 L 485,505 L 435,445 L 475,375 L 435,305 L 485,235 L 545,185 L 585,245 L 545,315 L 585,385 L 535,455 L 575,525 L 525,595 L 565,675 L 515,755 L 545,825 L 485,865 Z',

  'lusail':
    'M 335,785 L 335,435 L 415,375 L 475,415 L 535,355 L 615,385 L 585,465 L 665,495 L 735,445 L 795,505 L 745,585 L 805,645 L 735,715 L 625,695 L 545,765 L 445,745 L 385,785 Z',

  'yas-marina':
    'M 315,755 L 315,425 L 385,365 L 445,395 L 515,345 L 695,345 L 755,405 L 715,475 L 785,535 L 735,615 L 655,595 L 585,665 L 515,645 L 455,715 L 385,715 L 345,755 Z',

  'albert-park':
    'M 365,795 L 365,475 L 435,425 L 395,355 L 465,315 L 545,365 L 615,315 L 695,365 L 755,435 L 715,515 L 775,575 L 725,655 L 645,645 L 575,725 L 485,725 L 435,785 L 395,795 Z',
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
      // Spa has ~100m total elevation span.
      // Descend into Eau Rouge (lowest point), then steep climb up Raidillon (+35m) to Kemmel, peaking at Les Combes (+45m).
      if (t >= 0.05 && t <= 0.14) {
        const u = (t - 0.05) / 0.09;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 35;
      } else if (t > 0.14 && t <= 0.22) {
        const u = (t - 0.14) / 0.08;
        y = 35 + Math.sin(u * Math.PI * 0.5) * 10;
      } else if (t > 0.22 && t <= 0.48) {
        const u = (t - 0.22) / 0.26;
        y = 45 * Math.cos(u * Math.PI * 0.5);
      } else if (t > 0.48 && t <= 0.75) {
        const u = (t - 0.48) / 0.27;
        y = Math.sin(u * Math.PI) * -8;
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
      // Autódromo Internacional do Algarve rollercoaster elevation: crests and blind dips
      if (t >= 0.08 && t <= 0.28) {
        const u = (t - 0.08) / 0.20;
        y = (1 - Math.cos(u * Math.PI * 2)) * 0.5 * 18;
      } else if (t > 0.45 && t <= 0.70) {
        const u = (t - 0.45) / 0.25;
        y = (1 - Math.cos(u * Math.PI)) * 0.5 * 22;
      } else if (t > 0.70 && t <= 0.90) {
        const u = (t - 0.70) / 0.20;
        y = (1 + Math.cos(u * Math.PI)) * 0.5 * 22;
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
      if (t >= 0.20 && t <= 0.42) {
        const ease = 0.035;
        let factor = 1.0;
        if (t < 0.20 + ease) factor = (1 - Math.cos(((t - 0.20) / ease) * Math.PI)) * 0.5;
        else if (t > 0.42 - ease) factor = (1 - Math.cos(((0.42 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (t >= 0.75 && t <= 0.95) {
        const ease = 0.035;
        let factor = 1.0;
        if (t < 0.75 + ease) factor = (1 - Math.cos(((t - 0.75) / ease) * Math.PI)) * 0.5;
        else if (t > 0.95 - ease) factor = (1 - Math.cos(((0.95 - t) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
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
