import * as THREE from 'three';
import { TrackWaypoint } from './types';
import { REAL_DEM_ELEVATIONS } from './trackElevations';

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
  "baku",
  "cota",
  "daytona-road",
  "imola",
  "interlagos",
  "jeddah",
  "laguna-seca",
  "las-vegas",
  "miami",
  "singapore",
  "yas-marina",
]);

export const TRACK_SVG_PATHS: Record<string, string> = {
  // 1. Albert Park (Melbourne) — Clockwise, S/F bottom right->left
  "albert-park": "M 755 805 L 430 805 L 415 745 L 365 735 L 250 725 L 155 685 L 185 595 L 120 490 L 130 375 L 165 215 L 200 205 L 245 145 L 295 145 L 365 225 L 415 390 L 475 505 L 555 530 L 625 515 L 655 445 L 775 430 L 925 565 L 875 705 L 775 685 L 770 785 Z",

  // 2. Bahrain International Circuit (Sakhir) — Clockwise, S/F bottom right->left
  "bahrain": "M 775 870 L 115 870 L 145 785 L 125 675 L 175 105 L 295 275 L 350 315 L 345 435 L 460 595 L 245 585 L 210 665 L 625 675 L 635 585 L 515 445 L 500 345 L 565 165 L 820 820 Z",

  // 3. Baku City Circuit — Counter-Clockwise, S/F bottom-right left->right
  "baku": "M 505 518 L 958 518 L 955 280 L 605 282 L 602 442 L 535 445 L 465 465 L 465 505 L 310 572 L 312 435 L 282 412 L 280 355 L 205 345 L 120 365 L 65 475 L 32 625 L 128 812 L 195 725 L 282 678 L 312 588 L 455 522 Z",

  // 4. Circuit de Barcelona-Catalunya — Clockwise, S/F bottom right->left
  "barcelona": "M 865 668 L 195 668 L 180 575 L 95 515 L 70 405 L 115 305 L 185 272 L 335 272 L 362 325 L 345 385 L 305 415 L 175 415 L 165 455 L 245 545 L 305 588 L 385 588 L 402 495 L 485 305 L 525 292 L 735 465 L 818 555 L 832 515 L 812 425 L 762 405 L 750 335 L 785 298 L 892 355 L 912 425 L 912 585 Z",

  // 5. Circuit of the Americas (COTA) — Counter-Clockwise, S/F bottom-left top-left->bottom-right
  "cota": "M 60 485 L 350 885 L 332 705 L 435 565 L 452 485 L 492 465 L 502 375 L 545 332 L 608 372 L 655 295 L 692 295 L 705 335 L 798 302 L 915 52 L 362 232 L 418 375 L 408 392 L 372 388 L 335 298 L 312 298 L 355 445 L 345 525 L 295 558 L 245 538 L 185 392 L 165 392 Z",

  // 6. Daytona International Speedway (Road Course) — Counter-Clockwise, S/F top right->left
  "daytona-road": "M 645 195 L 495 138 L 385 165 L 325 215 L 300 295 L 315 345 L 395 365 L 410 392 L 515 395 L 532 435 L 505 472 L 295 472 L 172 622 L 148 585 L 165 525 L 268 365 L 252 325 L 215 295 L 145 355 L 82 515 L 88 665 L 165 795 L 265 835 L 555 835 L 585 795 L 622 795 L 655 835 L 765 835 L 875 785 L 922 635 L 912 475 L 835 345 Z",

  // 7. Detroit Street Circuit — Clockwise, S/F top right->left
  "detroit-street": "M 915 395 L 252 392 L 255 428 L 362 432 L 360 648 L 428 648 L 442 702 L 668 705 L 678 575 L 915 578 L 922 415 Z",

  // 8. Fuji Speedway — Clockwise, S/F top left->right
  "fuji": "M 105 245 L 775 248 L 782 278 L 732 342 L 575 398 L 548 538 L 498 592 L 452 562 L 445 388 L 415 395 L 355 522 L 272 592 L 145 582 L 155 535 L 122 495 L 112 405 L 125 385 L 175 392 L 198 338 L 185 305 L 135 315 L 100 282 Z",

  // 9. Hungaroring — Clockwise, S/F bottom right->left
  "hungaroring": "M 665 845 L 250 845 L 245 815 L 305 752 L 355 742 L 458 742 L 468 692 L 445 665 L 395 622 L 358 345 L 355 225 L 278 135 L 275 65 L 315 48 L 418 65 L 422 105 L 492 182 L 548 138 L 568 155 L 608 265 L 692 315 L 702 365 L 692 678 L 675 688 L 585 672 L 568 705 L 582 742 L 665 745 L 682 795 Z",

  // 10. Autodromo Enzo e Dino Ferrari (Imola) — Counter-Clockwise, S/F top right->left
  "imola": "M 745 175 L 615 175 L 475 138 L 315 162 L 295 215 L 242 258 L 165 582 L 168 648 L 82 795 L 92 825 L 245 798 L 355 818 L 388 705 L 372 522 L 402 448 L 428 462 L 625 462 L 642 478 L 765 395 L 845 252 L 918 182 L 905 102 L 882 95 Z",

  // 11. Indianapolis Motor Speedway (Road Course) — Clockwise, S/F top left->right
  "indianapolis-road": "M 255 155 L 735 155 L 745 245 L 805 248 L 855 305 L 865 385 L 835 418 L 762 418 L 745 452 L 332 452 L 325 585 L 285 615 L 288 735 L 255 758 L 135 712 L 92 615 L 88 422 L 165 418 L 178 385 L 155 275 L 175 195 Z",

  // 12. Autódromo José Carlos Pace (Interlagos) — Counter-Clockwise, S/F top-left top-right->bottom-left
  "interlagos": "M 475 168 L 145 475 L 135 518 L 178 565 L 172 685 L 215 782 L 285 798 L 628 792 L 652 755 L 645 615 L 605 572 L 405 432 L 392 355 L 405 292 L 478 232 L 502 255 L 492 332 L 515 358 L 545 335 L 575 245 L 628 198 L 642 225 L 602 335 L 598 405 L 625 452 L 745 518 L 765 475 L 762 375 L 715 235 L 665 172 L 615 158 Z",

  // 13. Jeddah Corniche Circuit — Counter-Clockwise, S/F top-right northeast->southwest
  "jeddah": "M 885 215 L 612 452 L 612 485 L 572 488 L 472 538 L 462 592 L 432 605 L 402 588 L 372 605 L 352 652 L 308 658 L 288 615 L 225 608 L 145 628 L 82 665 L 78 708 L 115 718 L 158 662 L 205 655 L 235 668 L 265 665 L 285 708 L 345 698 L 395 638 L 458 615 L 518 538 L 572 512 L 622 508 L 645 455 L 675 442 L 748 475 L 815 452 L 885 355 L 925 205 Z",

  // 14. WeatherTech Raceway Laguna Seca — Counter-Clockwise, S/F bottom right->left
  "laguna-seca": "M 515 858 L 228 702 L 228 682 L 332 525 L 325 475 L 278 325 L 288 265 L 375 215 L 382 162 L 438 162 L 585 112 L 662 138 L 732 445 L 718 498 L 575 492 L 475 535 L 462 585 L 462 785 L 485 802 L 545 785 L 595 752 L 615 778 L 605 818 Z",

  // 15. Las Vegas Strip Circuit — Counter-Clockwise, S/F top-right southeast->northwest
  "las-vegas": "M 845 295 L 732 132 L 715 152 L 725 215 L 748 258 L 742 308 L 705 348 L 382 355 L 375 335 L 372 195 L 345 135 L 298 118 L 288 152 L 262 145 L 235 128 L 228 385 L 205 458 L 122 522 L 92 595 L 85 672 L 105 685 L 265 828 L 415 885 L 825 898 L 835 862 L 852 842 L 855 348 Z",

  // 16. Circuit de la Sarthe (Le Mans) — Clockwise, S/F bottom right->left
  "le-mans": "M 305 808 L 195 805 L 152 752 L 135 735 L 92 645 L 52 525 L 82 465 L 145 412 L 365 288 L 382 295 L 392 278 L 652 125 L 665 105 L 715 92 L 918 78 L 918 95 L 885 285 L 845 425 L 785 535 L 758 565 L 778 645 L 685 682 L 582 778 L 555 775 L 535 742 L 505 745 L 482 778 L 465 775 L 448 748 L 382 755 L 315 795 Z",

  // 17. Lime Rock Park — Clockwise, S/F bottom right->left
  "lime-rock": "M 695 868 L 185 872 L 125 815 L 118 715 L 145 648 L 185 638 L 285 655 L 335 615 L 335 552 L 305 432 L 312 365 L 392 242 L 495 182 L 595 82 L 635 82 L 755 215 L 855 365 L 862 455 L 815 685 L 775 795 Z",

  // 18. Grand Prix of Long Beach — Clockwise, S/F bottom-right northeast->southwest
  "long-beach": "M 775 645 L 615 812 L 525 822 L 445 775 L 225 588 L 198 635 L 142 668 L 128 695 L 115 682 L 112 655 L 52 585 L 65 495 L 98 438 L 332 658 L 352 615 L 355 335 L 368 322 L 585 318 L 775 345 L 782 365 L 782 495 L 815 532 L 855 525 L 868 505 L 865 535 L 822 588 Z",

  // 19. Lusail International Circuit — Clockwise, S/F bottom right->left
  "lusail": "M 775 852 L 255 852 L 228 815 L 235 768 L 315 692 L 325 635 L 298 605 L 235 532 L 182 245 L 192 205 L 248 175 L 268 195 L 305 375 L 325 385 L 335 365 L 348 125 L 375 92 L 402 112 L 425 205 L 472 288 L 468 355 L 452 448 L 468 488 L 515 472 L 582 392 L 635 162 L 672 128 L 738 128 L 762 162 L 792 275 L 782 315 L 702 475 L 702 515 L 805 785 L 802 828 Z",

  // 20. Madring (Madrid F1 Circuit) — Clockwise, S/F bottom-left south->north
  "madring": "M 192 645 L 168 468 L 148 455 L 148 385 L 168 345 L 328 188 L 388 158 L 435 168 L 465 195 L 475 182 L 492 192 L 525 165 L 598 118 L 615 152 L 645 138 L 668 122 L 718 128 L 745 178 L 768 178 L 812 152 L 845 168 L 855 225 L 842 285 L 798 308 L 758 285 L 675 175 L 662 185 L 628 258 L 555 268 L 525 305 L 525 405 L 535 458 L 462 525 L 458 635 L 435 685 L 325 725 L 335 815 L 215 865 L 202 745 Z",

  // 21. Autódromo Hermanos Rodríguez (Mexico City) — Clockwise, S/F top left->right
  "mexico-city": "M 225 75 L 758 192 L 758 255 L 775 272 L 762 355 L 615 782 L 625 795 L 642 782 L 665 728 L 642 692 L 618 665 L 628 552 L 592 522 L 582 465 L 555 445 L 498 435 L 492 385 L 465 345 L 415 308 L 268 272 L 262 155 L 248 148 L 238 175 L 215 162 L 188 155 L 195 112 Z",

  // 22. Miami International Autodrome — Counter-Clockwise, S/F top-center southeast->northwest
  "miami": "M 455 318 L 208 218 L 202 242 L 258 302 L 322 262 L 372 252 L 422 292 L 592 478 L 562 548 L 558 625 L 492 678 L 428 662 L 315 538 L 285 542 L 245 582 L 212 562 L 178 522 L 125 538 L 112 605 L 125 645 L 172 645 L 245 668 L 385 665 L 515 728 L 605 718 L 832 532 L 798 475 L 802 428 L 855 422 L 875 358 L 862 342 L 872 265 L 455 245 Z",

  // 23. Mid-Ohio Sports Car Course — Clockwise, S/F center-north north->south
  "mid-ohio": "M 488 282 L 478 618 L 512 708 L 855 695 L 872 745 L 848 795 L 575 808 L 292 638 L 282 585 L 305 512 L 298 455 L 205 452 L 192 415 L 192 318 L 135 225 L 132 105 L 165 72 L 295 72 L 388 158 L 418 152 L 498 85 L 535 115 L 532 168 L 492 205 Z",

  // 24. Circuit de Monaco (Monte Carlo) — Clockwise, S/F left southwest->northeast
  "monaco": "M 185 375 L 352 178 L 372 192 L 505 405 L 615 532 L 665 538 L 682 485 L 692 408 L 835 412 L 842 442 L 818 468 L 815 542 L 822 542 L 838 475 L 885 528 L 825 605 L 725 665 L 625 612 L 502 452 L 488 458 L 475 432 L 368 242 L 348 242 L 278 295 L 278 342 L 218 452 L 192 445 L 155 545 L 158 635 L 122 575 L 145 485 Z",

  // 25. Circuit Gilles Villeneuve (Montreal) — Clockwise, S/F top-right west->east
  "montreal": "M 745 342 L 882 392 L 902 348 L 918 355 L 915 418 L 832 542 L 812 528 L 725 618 L 685 622 L 615 595 L 608 665 L 572 678 L 425 638 L 328 558 L 325 518 L 195 405 L 78 392 L 75 372 L 125 372 L 288 325 L 585 322 L 595 345 Z",

  // 26. Autodromo Nazionale Monza — Clockwise, S/F bottom right->left
  "monza": "M 645 738 L 368 742 L 362 718 L 325 745 L 245 745 L 178 665 L 155 518 L 138 375 L 125 368 L 85 192 L 105 162 L 185 138 L 245 278 L 422 558 L 455 552 L 482 588 L 795 588 L 822 632 L 798 695 L 725 732 Z",

  // 27. Canadian Tire Motorsport Park (Mosport) — Clockwise, S/F right northeast->southwest
  "mosport": "M 852 552 L 795 725 L 732 762 L 575 562 L 525 542 L 468 575 L 422 815 L 368 848 L 315 798 L 245 538 L 185 472 L 118 465 L 112 388 L 185 392 L 445 188 L 625 125 L 738 118 L 798 182 L 802 325 L 828 368 L 875 425 L 865 485 Z",

  // 28. Circuit Paul Ricard — Clockwise, S/F center-left southeast->northwest
  "paul-ricard": "M 515 508 L 368 338 L 322 368 L 288 338 L 245 278 L 152 205 L 152 128 L 105 128 L 118 62 L 152 65 L 182 155 L 555 395 L 585 368 L 645 452 L 868 585 L 885 655 L 882 835 L 835 875 L 812 835 L 855 685 L 845 655 L 775 682 L 725 655 L 685 612 L 662 635 L 658 698 L 622 678 Z",

  // 29. Autódromo Internacional do Algarve (Portimão) — Clockwise, S/F bottom right->left
  "portimao": "M 645 768 L 88 765 L 48 572 L 98 408 L 122 415 L 145 552 L 178 582 L 575 582 L 578 542 L 425 442 L 268 478 L 235 448 L 198 328 L 218 302 L 455 358 L 495 335 L 588 162 L 642 148 L 662 172 L 668 395 L 705 462 L 795 538 L 822 512 L 755 315 L 775 262 L 828 262 L 925 465 L 935 615 L 885 735 Z",

  // 30. Red Bull Ring — Clockwise, S/F bottom-right northeast->southwest
  "red-bull-ring": "M 805 645 L 555 785 L 415 395 L 315 195 L 345 182 L 675 238 L 682 268 L 625 345 L 502 332 L 475 385 L 518 535 L 555 545 L 615 455 L 845 452 L 868 485 L 885 605 Z",

  // 31. Road America — Clockwise, S/F bottom right->left
  "road-america": "M 535 898 L 195 898 L 175 865 L 158 552 L 185 515 L 395 565 L 685 712 L 692 695 L 688 502 L 575 495 L 462 252 L 445 252 L 382 325 L 335 322 L 302 245 L 308 165 L 355 125 L 525 82 L 655 265 L 748 345 L 852 405 L 855 445 L 825 552 L 788 615 L 812 855 L 785 898 Z",

  // 32. Michelin Raceway Road Atlanta — Clockwise, S/F right northeast->southwest
  "road-atlanta": "M 902 395 L 835 745 L 785 788 L 675 715 L 618 712 L 585 628 L 485 622 L 442 548 L 388 515 L 372 462 L 92 568 L 62 552 L 48 435 L 68 422 L 185 405 L 468 212 L 585 178 L 738 185 L 758 128 L 842 152 L 912 315 Z",

  // 33. Sebring International Raceway — Clockwise, S/F bottom-left west->east
  "sebring": "M 355 768 L 555 768 L 585 735 L 572 505 L 515 468 L 482 545 L 415 612 L 265 615 L 265 595 L 308 492 L 382 462 L 455 338 L 488 382 L 512 382 L 555 355 L 602 358 L 605 585 L 625 665 L 665 752 L 642 885 L 315 895 L 278 835 L 295 778 Z",

  // 34. Sepang International Circuit — Clockwise, S/F center-left east->west
  "sepang": "M 615 465 L 255 505 L 245 462 L 265 445 L 298 462 L 298 432 L 272 365 L 285 225 L 335 175 L 505 72 L 535 285 L 575 335 L 622 332 L 655 268 L 692 272 L 795 478 L 775 558 L 552 595 L 548 618 L 595 668 L 595 765 L 562 835 L 448 682 L 415 685 L 355 725 L 308 692 L 302 628 L 715 502 L 718 455 Z",

  // 35. Shanghai International Circuit — Clockwise, S/F center-left southwest->northeast
  "shanghai": "M 445 385 L 482 182 L 525 165 L 555 205 L 542 252 L 515 245 L 505 222 L 492 238 L 518 298 L 652 275 L 765 322 L 762 342 L 712 362 L 615 352 L 572 395 L 568 465 L 602 575 L 585 635 L 522 638 L 512 662 L 525 725 L 738 738 L 735 675 L 768 665 L 798 725 L 782 785 L 752 812 L 198 812 L 198 785 L 235 768 L 358 762 Z",

  // 36. Silverstone Circuit (GP Wing) — Clockwise, S/F bottom-center southeast->northwest
  "silverstone": "M 685 868 L 522 678 L 518 525 L 455 385 L 502 335 L 495 312 L 425 298 L 252 675 L 265 722 L 315 732 L 315 785 L 285 788 L 195 712 L 165 345 L 185 305 L 415 208 L 475 232 L 525 185 L 548 205 L 575 275 L 865 512 L 872 565 L 825 632 L 742 768 L 755 812 L 705 872 Z",

  // 37. Marina Bay Street Circuit (Singapore) — Counter-Clockwise, S/F right south->north
  "singapore": "M 885 452 L 852 115 L 818 112 L 785 62 L 768 85 L 768 175 L 798 365 L 792 432 L 545 412 L 372 248 L 358 258 L 302 408 L 288 408 L 228 295 L 205 305 L 98 632 L 112 668 L 158 715 L 165 795 L 235 915 L 245 895 L 285 495 L 308 432 L 418 575 L 688 608 L 695 678 L 725 688 L 858 695 L 892 622 Z",

  // 38. Circuit de Spa-Francorchamps — Clockwise, S/F bottom-left northeast->southwest
  "spa-francorchamps": "M 285 625 L 122 802 L 115 788 L 165 622 L 262 455 L 278 405 L 328 382 L 425 255 L 715 72 L 745 105 L 798 85 L 885 255 L 872 292 L 848 288 L 812 208 L 622 308 L 612 355 L 615 435 L 648 475 L 778 548 L 785 588 L 775 655 L 862 765 L 825 878 L 785 882 L 695 795 L 625 605 L 515 535 L 415 612 L 312 638 L 305 588 Z",

  // 39. Suzuka International Racing Course — Figure-8 (Clockwise S1 -> Overpass -> Counter-Clockwise West Loop -> Underpass -> S3), S/F right southeast->northwest
  "suzuka": "M 772 418 L 715 315 L 655 282 L 612 318 L 585 298 L 492 465 L 478 525 L 425 532 L 392 275 L 408 205 L 392 188 L 332 325 L 275 342 L 165 252 L 115 98 L 62 105 L 55 165 L 165 325 L 425 472 L 468 462 L 585 375 L 635 378 L 685 432 L 675 552 L 698 598 L 752 608 L 775 722 L 832 738 L 885 875 L 922 868 L 925 785 L 835 585 Z",

  // 40. Virginia International Raceway (VIR) — Clockwise, S/F left south->north
  "vir": "M 35 345 L 45 122 L 75 112 L 92 175 L 68 315 L 98 418 L 182 385 L 185 315 L 228 255 L 268 282 L 305 285 L 318 292 L 425 288 L 535 308 L 595 288 L 635 298 L 682 288 L 788 345 L 932 268 L 958 318 L 415 778 L 385 832 L 348 792 L 255 835 L 235 885 L 175 885 L 145 812 L 45 485 Z",

  // 41. Watkins Glen International (GP Boot) — Clockwise, S/F bottom-left east->west
  "watkins-glen": "M 385 708 L 122 668 L 115 635 L 142 448 L 195 365 L 262 348 L 325 235 L 395 182 L 662 175 L 685 205 L 718 205 L 742 172 L 798 178 L 832 235 L 825 308 L 715 475 L 712 525 L 742 558 L 892 552 L 915 585 L 902 642 L 855 655 L 635 678 L 615 648 L 625 585 L 662 452 L 642 405 L 495 452 L 475 495 L 468 672 L 435 715 Z",

  // 42. Yas Marina Circuit (Abu Dhabi) — Counter-Clockwise, S/F center south->north
  "yas-marina": "M 455 475 L 455 295 L 435 282 L 355 335 L 352 545 L 335 568 L 292 565 L 288 475 L 272 465 L 218 475 L 178 552 L 155 725 L 122 768 L 85 745 L 85 698 L 178 485 L 295 295 L 348 258 L 405 245 L 408 192 L 902 595 L 905 632 L 875 638 L 718 625 L 648 582 L 615 605 L 582 708 L 545 722 L 468 732 L 458 715 Z",

  // 43. Circuit Zandvoort — Clockwise, S/F bottom right->left
  "zandvoort": "M 535 868 L 198 868 L 195 795 L 315 785 L 355 758 L 405 828 L 432 805 L 372 645 L 352 495 L 255 325 L 238 152 L 285 88 L 432 128 L 452 215 L 442 308 L 415 322 L 345 192 L 312 215 L 325 325 L 418 545 L 472 645 L 458 698 L 485 725 L 615 595 L 645 605 L 672 745 L 645 835 L 598 868 Z",
};

export const TRACK_SVG_REGISTRY = TRACK_SVG_PATHS;

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
  'spa-francorchamps': { lengthMeters: 7004, trackWidth: 14.0, targetLapSeconds: 106 },
  'daytona-road': { lengthMeters: 5729, trackWidth: 14.5, targetLapSeconds: 96 },
  'laguna-seca': { lengthMeters: 3602, trackWidth: 12.0, targetLapSeconds: 76 },
  'le-mans': { lengthMeters: 13626, trackWidth: 13.0, targetLapSeconds: 208 },
  'monza': { lengthMeters: 5793, trackWidth: 13.5, targetLapSeconds: 81 },
  'silverstone': { lengthMeters: 5891, trackWidth: 14.5, targetLapSeconds: 87 },
  'suzuka': { lengthMeters: 5807, trackWidth: 13.0, targetLapSeconds: 89 },
  'monaco': { lengthMeters: 3337, trackWidth: 9.5, targetLapSeconds: 72 },
  'cota': { lengthMeters: 5513, trackWidth: 15.5, targetLapSeconds: 94 },
  'sebring': { lengthMeters: 6019, trackWidth: 14.0, targetLapSeconds: 107 },
  'long-beach': { lengthMeters: 3167, trackWidth: 11.0, targetLapSeconds: 67 },
  'detroit-street': { lengthMeters: 2735, trackWidth: 10.5, targetLapSeconds: 62 },
  'mid-ohio': { lengthMeters: 3634, trackWidth: 12.0, targetLapSeconds: 74 },
  'watkins-glen': { lengthMeters: 5472, trackWidth: 13.0, targetLapSeconds: 88 },
  'mosport': { lengthMeters: 3957, trackWidth: 12.5, targetLapSeconds: 75 },
  'lime-rock': { lengthMeters: 2414, trackWidth: 10.5, targetLapSeconds: 50 },
  'road-america': { lengthMeters: 6515, trackWidth: 13.5, targetLapSeconds: 110 },
  'vir': { lengthMeters: 5260, trackWidth: 12.0, targetLapSeconds: 98 },
  'indianapolis-road': { lengthMeters: 3925, trackWidth: 14.0, targetLapSeconds: 76 },
  'road-atlanta': { lengthMeters: 4088, trackWidth: 12.5, targetLapSeconds: 72 },
  'montreal': { lengthMeters: 4361, trackWidth: 13.0, targetLapSeconds: 73 },
  'miami': { lengthMeters: 5412, trackWidth: 13.5, targetLapSeconds: 89 },
  'las-vegas': { lengthMeters: 6201, trackWidth: 14.5, targetLapSeconds: 93 },
  'mexico-city': { lengthMeters: 4304, trackWidth: 13.5, targetLapSeconds: 77 },
  'interlagos': { lengthMeters: 4309, trackWidth: 13.0, targetLapSeconds: 70 },
  'imola': { lengthMeters: 4909, trackWidth: 12.5, targetLapSeconds: 75 },
  'barcelona': { lengthMeters: 4657, trackWidth: 13.5, targetLapSeconds: 73 },
  'madring': { lengthMeters: 5474, trackWidth: 13.5, targetLapSeconds: 88 },
  'red-bull-ring': { lengthMeters: 4318, trackWidth: 13.0, targetLapSeconds: 65 },
  'hungaroring': { lengthMeters: 4381, trackWidth: 12.5, targetLapSeconds: 76 },
  'zandvoort': { lengthMeters: 4259, trackWidth: 12.0, targetLapSeconds: 71 },
  'paul-ricard': { lengthMeters: 5842, trackWidth: 15.0, targetLapSeconds: 92 },
  'baku': { lengthMeters: 6003, trackWidth: 10.5, targetLapSeconds: 102 },
  'portimao': { lengthMeters: 4653, trackWidth: 14.0, targetLapSeconds: 78 },
  'fuji': { lengthMeters: 4563, trackWidth: 15.5, targetLapSeconds: 74 },
  'shanghai': { lengthMeters: 5451, trackWidth: 15.5, targetLapSeconds: 93 },
  'singapore': { lengthMeters: 4940, trackWidth: 11.0, targetLapSeconds: 91 },
  'sepang': { lengthMeters: 5543, trackWidth: 16.0, targetLapSeconds: 92 },
  'bahrain': { lengthMeters: 5412, trackWidth: 15.0, targetLapSeconds: 90 },
  'jeddah': { lengthMeters: 6174, trackWidth: 12.5, targetLapSeconds: 88 },
  'lusail': { lengthMeters: 5419, trackWidth: 15.0, targetLapSeconds: 83 },
  'yas-marina': { lengthMeters: 5281, trackWidth: 14.5, targetLapSeconds: 83 },
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

  // All 43 TRACK_SVG_PATHS are already strictly ordered in true racing direction starting from M x0 y0
  // Never reverse or re-index vertices so points[0] aligns strictly with Start/Finish line straight

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

    // Real-World Satellite Digital Elevation Model (DEM) Interpolation
    const demProfile = trackId ? REAL_DEM_ELEVATIONS[trackId] : undefined;
    if (demProfile && demProfile.length > 0) {
      const N = demProfile.length;
      const pos = t * N;
      const i0 = Math.floor(pos) % N;
      const i1 = (i0 + 1) % N;
      const frac = pos - Math.floor(pos);
      y = demProfile[i0] * (1 - frac) + demProfile[i1] * frac;
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
      // Clockwise right-handers: Hugenholtzbocht & Arie Luyendijkbocht must tilt down on inside (right) & up on outside (left)
      if (t >= 0.14 && t <= 0.24) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.14 + ease) factor = (1 - Math.cos(((t - 0.14) / ease) * Math.PI)) * 0.5;
        else if (t > 0.24 - ease) factor = (1 - Math.cos(((0.24 - t) / ease) * Math.PI)) * 0.5;
        banking = -11.0 * factor;
      } else if (t >= 0.88 && t <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.88 + ease) factor = (1 - Math.cos(((t - 0.88) / ease) * Math.PI)) * 0.5;
        else if (t > 0.98 - ease) factor = (1 - Math.cos(((0.98 - t) / ease) * Math.PI)) * 0.5;
        banking = -11.0 * factor;
      }
    } else if (trackId === 'indianapolis-road') {
      // Oval Turn 1 / final road course right-hander onto frontstretch: 9.2° tilt down on right (inside) & up on left (outside)
      if (t >= 0.88 && t <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (t < 0.88 + ease) factor = (1 - Math.cos(((t - 0.88) / ease) * Math.PI)) * 0.5;
        else if (t > 0.98 - ease) factor = (1 - Math.cos(((0.98 - t) / ease) * Math.PI)) * 0.5;
        banking = -9.2 * factor;
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
