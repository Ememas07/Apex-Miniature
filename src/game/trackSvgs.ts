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
  "detroit-street",
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

  // 7. Detroit Street Circuit — Counter-Clockwise, S/F Franklin St west->east
  "detroit-street": "M 678 575 L 915 578 L 922 415 L 915 395 L 252 392 L 255 428 L 362 432 L 360 648 L 428 648 L 442 702 L 668 705 Z",

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

  // 14. WeatherTech Raceway Laguna Seca — Counter-Clockwise, S/F bottom left->right (Main Straight -> Andretti -> Corkscrew -> Rainey -> T11)
  "laguna-seca": "M 372 780 L 515 858 L 605 818 L 615 778 L 595 752 L 545 785 L 485 802 L 462 785 L 462 585 L 475 535 L 575 492 L 718 498 L 732 445 L 662 138 L 585 112 L 438 162 L 382 162 L 375 215 L 288 265 L 278 325 L 325 475 L 332 525 L 228 682 L 228 702 Z",

  // 15. Las Vegas Strip Circuit — Counter-Clockwise, S/F top-right southeast->northwest
  "las-vegas": "M 845 295 L 732 132 L 715 152 L 725 215 L 748 258 L 742 308 L 705 348 L 382 355 L 375 335 L 372 195 L 345 135 L 298 118 L 288 152 L 262 145 L 235 128 L 228 385 L 205 458 L 122 522 L 92 595 L 85 672 L 105 685 L 265 828 L 415 885 L 825 898 L 835 862 L 852 842 L 855 348 Z",

  // 16. Circuit de la Sarthe (Le Mans) — Clockwise, S/F bottom right->left
  "le-mans": "M 305 808 L 195 805 L 152 752 L 135 735 L 92 645 L 52 525 L 82 465 L 145 412 L 365 288 L 382 295 L 392 278 L 652 125 L 665 105 L 715 92 L 918 78 L 918 95 L 885 285 L 845 425 L 785 535 L 758 565 L 778 645 L 685 682 L 582 778 L 555 775 L 535 742 L 505 745 L 482 778 L 465 775 L 448 748 L 382 755 L 315 795 Z",

  // 17. Lime Rock Park — Clockwise, S/F bottom right->left
  "lime-rock": "M 695 868 L 185 872 L 125 815 L 118 715 L 145 648 L 185 638 L 285 655 L 335 615 L 335 552 L 305 432 L 312 365 L 392 242 L 495 182 L 595 82 L 635 82 L 755 215 L 855 365 L 862 455 L 815 685 L 775 795 Z",

  // 18. Grand Prix of Long Beach — Clockwise, S/F bottom-right northeast->southwest
  "long-beach": "M 775 645 L 615 812 L 525 822 L 445 775 L 225 588 L 198 655 L 142 685 L 128 695 L 115 682 L 112 655 L 52 585 L 65 495 L 98 438 L 335 638 L 352 615 L 355 335 L 368 322 L 585 318 L 775 345 L 782 365 L 782 495 L 815 532 L 858 502 L 882 524 L 864 560 L 822 588 Z",

  // 19. Lusail International Circuit — Clockwise, S/F bottom right->left
  "lusail": "M 775 852 L 255 852 L 228 815 L 235 768 L 315 692 L 325 635 L 298 605 L 235 532 L 182 245 L 192 205 L 248 175 L 268 195 L 305 375 L 325 385 L 335 365 L 348 125 L 375 92 L 402 112 L 425 205 L 472 288 L 468 355 L 452 448 L 468 488 L 515 472 L 582 392 L 635 162 L 672 128 L 738 128 L 762 162 L 792 275 L 782 315 L 702 475 L 702 515 L 805 785 L 802 828 Z",

  // 20. Madring (Madrid F1 Circuit) — Clockwise, S/F bottom-left south->north
  "madring": "M 192 645 L 168 468 L 148 455 L 148 385 L 168 345 L 328 188 L 388 158 L 435 168 L 465 195 L 475 182 L 492 192 L 525 165 L 598 118 L 615 152 L 645 138 L 668 122 L 718 128 L 745 178 L 768 178 L 812 152 L 845 168 L 855 225 L 842 285 L 798 308 L 758 285 L 675 175 L 662 185 L 628 258 L 555 268 L 525 305 L 525 405 L 535 458 L 462 525 L 458 635 L 435 685 L 325 725 L 335 815 L 215 865 L 202 745 Z",

  // 21. Autódromo Hermanos Rodríguez (Mexico City) — Clockwise, S/F top left->right
  "mexico-city": "M 220.7 194.8 L 713.2 258.7 L 874.9 282.7 L 908.2 289.5 L 913.9 291.7 L 916.9 294.3 L 913.5 345.8 L 940 364.9 L 940 368.7 L 936.6 393.7 L 931.3 416.1 L 923 437.8 L 913.5 457.3 L 839.3 583.3 L 750.3 723 L 744.6 732.6 L 743.8 738.4 L 745 743.2 L 747.7 746.7 L 774.2 763 L 776.8 765.6 L 777.2 769.7 L 775.3 773.2 L 770.8 777.4 L 721.1 814.8 L 716.2 817 L 712.1 817.6 L 708.3 816.4 L 699.2 810.6 L 720 616.5 L 717.7 611.4 L 714.4 607.2 L 667.4 572.7 L 642.8 529.6 L 635.2 524.8 L 625 520.3 L 543.2 507.8 L 534.1 505 L 528.4 500.1 L 525.8 496.9 L 523.5 492.5 L 512.9 459.6 L 509.5 453.1 L 504.2 447.1 L 490.9 439.1 L 430.4 406.5 L 412.9 399.1 L 387.6 393 L 184.6 363.6 L 180.4 362 L 178.2 359.5 L 176.2 355.3 L 175.9 349.9 L 172.5 297.7 L 168.3 261.6 L 166.8 257.5 L 163.8 254.6 L 159.6 252.7 L 154.3 253.3 L 132.3 274.4 L 105.4 265.4 L 71 261.6 L 65.3 259.7 L 62.6 257.5 L 60.4 253.3 L 73.6 215.3 L 83.1 202.2 L 94.1 193.2 L 108.1 186.2 L 121 182.7 L 133.4 182.4 L 151.6 184.6 L 220.7 194.8 Z",

  // 22. Miami International Autodrome — Counter-Clockwise, S/F top-center southeast->northwest
  "miami": "M 494.3 422.7 L 614.5 497.8 L 616.6 503.3 L 615.7 508.4 L 612.1 515.3 L 586.5 534.3 L 578.5 542.9 L 575.9 558.4 L 578.5 574.8 L 576 595.1 L 569.9 608.1 L 546.7 626.7 L 520.2 635.8 L 503.1 639.6 L 477.8 640.2 L 457.9 636.6 L 434.6 626.2 L 316.6 555.4 L 299.7 545.2 L 291 543.7 L 281.1 542.9 L 271.1 544.2 L 225.5 570.5 L 210.6 573 L 197.2 571.8 L 182.8 564.8 L 169.3 552.7 L 157 540.5 L 143.1 533.7 L 128.9 530.8 L 111.7 533.8 L 96 538.7 L 82.7 545 L 72.9 554.1 L 63.6 568.7 L 60 584.2 L 60.4 597.1 L 63.3 605.9 L 68 611.9 L 77.7 617.1 L 89.4 617.1 L 103.8 613.9 L 119.9 614 L 153.1 621 L 213.9 633.4 L 276.8 631.5 L 372.8 627.6 L 494.1 668.3 L 531 674.5 L 568.1 674.9 L 607 668.6 L 642.6 656 L 723.9 626.4 L 771 608.4 L 793.8 598.3 L 851.9 567.4 L 883.2 547.4 L 889.4 538.9 L 887.4 531.9 L 881.7 526.4 L 867.3 517.8 L 857.3 510.3 L 851.9 499.3 L 850.7 487.9 L 853.9 474 L 861.7 466.3 L 870.7 462.6 L 897.6 464.3 L 911.1 462.4 L 917 458.6 L 926 449.8 L 940 424.8 L 939.1 419.3 L 932.3 416.6 L 926.1 412 L 925.9 402.7 L 937 366.8 L 936.1 360.6 L 931.1 356.5 L 903.1 354 L 498.6 339.7 L 176.1 325.1 L 166.7 327.5 L 164.7 335 L 167.9 344.2 L 179.1 354.1 L 196.5 367.4 L 215.2 377.4 L 230.4 381.2 L 243.9 380.1 L 260.3 374.2 L 298.5 356.2 L 320 350.5 L 346.3 348.2 L 372.4 351.8 L 396.9 362.1 L 494.3 422.7 Z",

  // 23. Mid-Ohio Sports Car Course — Clockwise, S/F center-north north->south
  "mid-ohio": "M 488 282 L 478 618 L 512 708 L 855 695 L 872 745 L 848 795 L 575 808 L 292 638 L 282 585 L 305 512 L 298 455 L 205 452 L 192 415 L 192 318 L 135 225 L 132 105 L 165 72 L 295 72 L 388 158 L 418 152 L 498 85 L 535 115 L 532 168 L 492 205 Z",

  // 24. Circuit de Monaco (Monte Carlo) — Clockwise, S/F left southwest->northeast
  "monaco": "M 185 375 L 352 178 L 372 192 L 505 405 L 615 532 L 665 538 L 682 485 L 692 408 L 835 412 L 842 442 L 806 472 L 800 546 L 832 548 L 846 476 L 892 528 L 825 605 L 725 665 L 625 612 L 502 452 L 488 458 L 475 432 L 368 242 L 348 242 L 278 295 L 278 342 L 218 452 L 192 445 L 160 545 L 162 642 L 114 580 L 142 485 Z",

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

  // 38. Circuit de Spa-Francorchamps — Clockwise, S/F on main straight before La Source
  "spa-francorchamps": "M 205 715 L 122 802 L 115 788 L 165 622 L 262 455 L 278 405 L 328 382 L 425 255 L 715 72 L 745 105 L 798 85 L 885 255 L 872 292 L 848 288 L 812 208 L 622 308 L 612 355 L 615 435 L 648 475 L 778 548 L 785 588 L 775 655 L 862 765 L 825 878 L 785 882 L 695 795 L 625 605 L 515 535 L 415 612 L 312 638 L 305 588 L 285 625 Z",

  // 39. Suzuka International Racing Course — Figure-8 (Clockwise S1 -> Underpass -> Hairpin -> Counter-Clockwise Spoon -> Backstraight Overpass -> 130R -> Casio), S/F east Main Straight
  "suzuka": "M 811.5 516 L 865.8 581.4 L 929.3 659.2 L 935.1 667.4 L 938.9 697.1 L 931.5 720 L 928 726 L 922.9 730.6 L 918.6 733 L 910.8 734.9 L 903.8 734.7 L 896.1 732.1 L 888.9 726.4 L 881.5 715.3 L 844.1 657.8 L 837 651.8 L 830.9 649.8 L 821.7 648.2 L 802.3 648.1 L 792.6 645.3 L 785.7 640.4 L 759.9 579 L 753.1 574.1 L 744.6 570.1 L 735.9 568.4 L 713.3 568.1 L 702.9 566.1 L 695.8 562.7 L 688.5 557 L 683.1 549.1 L 679.7 541 L 678.2 533.4 L 678.3 526.1 L 692.7 475.5 L 691.5 470.1 L 688.6 462.4 L 684.3 455.8 L 676 449.9 L 665.9 444.4 L 624.4 430.1 L 611.9 429.9 L 602 430.3 L 593.8 432.5 L 553.2 456.2 L 543.4 466.6 L 502 516.7 L 499.9 519.6 L 493.3 521.2 L 433 526.6 L 429.1 526.1 L 425 523.3 L 423.3 518.6 L 422.5 514.6 L 413.4 476.9 L 401.1 406 L 398.8 393 L 398.2 386.4 L 416.9 332.3 L 416.2 329.1 L 414.3 326.3 L 411.2 324.1 L 407.5 323 L 404 323.2 L 400 325.9 L 363.4 384.7 L 357.2 391.9 L 351.8 396.5 L 342.6 403.8 L 332.9 409 L 322.7 412.1 L 305 414.6 L 288.3 415.3 L 275.7 414.4 L 214.1 394.2 L 204 388.1 L 194.5 381 L 184.6 372.1 L 174.3 360.7 L 167.5 350.8 L 161.4 339.9 L 146.3 299.8 L 138.3 282.3 L 134.2 275.2 L 128.6 270 L 121.3 266.7 L 112.6 265.1 L 102.2 265.3 L 92.5 266.7 L 83.1 268.8 L 73.8 272.6 L 66.3 278.4 L 61.8 285.6 L 60 292.8 L 60.5 301.8 L 62.6 308.4 L 65.6 315.2 L 70.7 320.8 L 80.8 330.3 L 93.4 340.8 L 105.8 351.6 L 121.5 363.5 L 139.4 375.7 L 157.8 387.2 L 178.3 397 L 196.6 406.4 L 215.5 413.5 L 433.2 489.9 L 441.5 490.1 L 450.2 488.5 L 458.6 486.1 L 473.9 480.2 L 488 473.2 L 499.8 465.9 L 590.5 388.3 L 611.8 401 L 645.8 380.3 L 657.3 379.3 L 668.1 379.9 L 679.4 382.3 L 690.8 386.7 L 700.5 391.4 L 712.6 399.6 L 723.5 409.7 L 734.7 422.2 L 811.5 516 Z",

  // 40. Virginia International Raceway (VIR) — Clockwise, S/F left south->north
  "vir": "M 35 345 L 45 122 L 75 112 L 92 175 L 68 315 L 98 418 L 182 385 L 185 315 L 228 255 L 268 282 L 305 285 L 318 292 L 425 288 L 535 308 L 595 288 L 635 298 L 682 288 L 788 345 L 932 268 L 958 318 L 415 778 L 385 832 L 348 792 L 255 835 L 235 885 L 175 885 L 145 812 L 45 485 Z",

  // 41. Watkins Glen International (GP Boot) — Clockwise, S/F bottom-left east->west
  "watkins-glen": "M 385 708 L 122 668 L 115 635 L 142 448 L 195 365 L 262 348 L 325 235 L 395 182 L 662 175 L 685 205 L 718 205 L 742 172 L 798 178 L 832 235 L 825 308 L 715 475 L 712 525 L 742 558 L 892 552 L 915 585 L 902 642 L 855 655 L 635 678 L 615 648 L 625 585 L 662 452 L 642 405 L 495 452 L 475 495 L 468 672 L 435 715 Z",

  // 42. Yas Marina Circuit (Abu Dhabi) — Counter-Clockwise, S/F Pit Straight
  "yas-marina": "M 494.9 553 L 617.3 536.4 L 623.7 534.3 L 628.6 529.2 L 632 522.2 L 632.6 515.3 L 630.8 508 L 611.2 424.7 L 607.8 415.6 L 603.2 408.9 L 534.3 376.8 L 511.1 344.3 L 509.2 334.7 L 509 324.2 L 511.2 311.8 L 515.1 298.8 L 523.7 265.7 L 526.8 241.2 L 527.1 223.7 L 508.4 76.2 L 507.2 71.6 L 503.5 66.9 L 497.3 61.8 L 493.5 60.5 L 489.1 60 L 485 60.7 L 480.6 62.4 L 477.2 65.8 L 475.2 68.9 L 472.7 74.1 L 293.5 634.2 L 294.1 636.9 L 296.4 639.5 L 301.7 639.7 L 321.2 637.4 L 325.5 637.4 L 349.3 708.9 L 355.6 721.4 L 369.3 741.3 L 384.9 759.5 L 404.6 776.4 L 487.9 842.1 L 506.9 857.5 L 521.8 868.2 L 541.8 881.1 L 558.9 891 L 586.6 904.3 L 611.8 915.7 L 649.4 933.5 L 665.5 939.9 L 674.6 940 L 684.1 938.1 L 692.9 933 L 697.5 928.5 L 700.6 924.1 L 703.7 917.6 L 705.5 911.2 L 706.5 905.3 L 705.7 895.5 L 703.7 888.4 L 700.9 881.5 L 696.9 875.4 L 691.1 869.8 L 683.9 865 L 676.3 861.7 L 562.1 850.6 L 502.1 811.7 L 498.7 803 L 487.7 751.7 L 488.4 747.6 L 491 744.9 L 494.8 743.8 L 533.9 738 L 538.5 736 L 541.4 734.5 L 544.5 731.3 L 547.6 725.5 L 548.3 718.3 L 548.5 682.8 L 545.6 676.7 L 542.1 673 L 514.6 668.3 L 506.3 668.9 L 424.7 681.5 L 393.9 678.1 L 349.4 605.2 L 347.7 597.8 L 347.1 591.6 L 347 584.1 L 348.3 579 L 351.3 575.3 L 355 573.4 L 363.5 571.9 L 494.9 553 Z",

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
 * Solves a uniform periodic C2 cubic spline for second derivatives M_i at sample indices 0..N-1.
 */
function solveUniformPeriodicCubicM(vals: number[]): Float64Array {
  const n = vals.length;
  const M = new Float64Array(n);
  if (n < 3) return M;
  const h = 1 / n;
  const a = h / 6;
  const b = (2 * h) / 3;
  const c = h / 6;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const im = (i - 1 + n) % n;
    const ip = (i + 1) % n;
    d[i] = (vals[ip] - 2 * vals[i] + vals[im]) / h;
  }
  const gamma = -b;
  const bMod = new Float64Array(n).fill(b);
  bMod[0] = b - gamma;
  bMod[n - 1] = b - (a * c) / gamma;

  const solveTri = (rhs: Float64Array): Float64Array => {
    const cp = new Float64Array(n);
    const dp = new Float64Array(n);
    cp[0] = c / bMod[0];
    dp[0] = rhs[0] / bMod[0];
    for (let i = 1; i < n; i++) {
      const denom = bMod[i] - a * cp[i - 1];
      cp[i] = i < n - 1 ? c / denom : 0;
      dp[i] = (rhs[i] - a * dp[i - 1]) / denom;
    }
    const x = new Float64Array(n);
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      x[i] = dp[i] - cp[i] * x[i + 1];
    }
    return x;
  };

  const u = new Float64Array(n);
  u[0] = gamma;
  u[n - 1] = c;
  const z1 = solveTri(d);
  const z2 = solveTri(u);
  const factor = (z1[0] + (a / gamma) * z1[n - 1]) / (1 + z2[0] + (a / gamma) * z2[n - 1]);
  for (let i = 0; i < n; i++) {
    M[i] = z1[i] - factor * z2[i];
  }
  return M;
}

function evalUniformPeriodicCubic(vals: number[], M: Float64Array, tRaw: number): number {
  const n = vals.length;
  if (n === 0) return 0;
  if (n < 3) return vals[0];
  const t = ((tRaw % 1) + 1) % 1;
  const pos = t * n;
  const i0 = Math.floor(pos) % n;
  const i1 = (i0 + 1) % n;
  const frac = pos - Math.floor(pos);
  const h = 1 / n;
  const A = 1 - frac;
  const B = frac;
  return (
    A * vals[i0] +
    B * vals[i1] +
    (((A * A * A - A) * h * h) / 6) * M[i0] +
    (((B * B * B - B) * h * h) / 6) * M[i1]
  );
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

  // Verify signed area matches expected CW (>0) / CCW (<0) orientation (skipping figure-8 Suzuka),
  // preserving filtered[0] on Start/Finish straight while reversing 1..n-1 if inverted.
  if (trackId !== 'suzuka' && filtered.length > 2) {
    const signedArea = calculateSvgPathArea(filtered.map(([x, y]) => ({ x, y })));
    if ((isCCW && signedArea > 0) || (!isCCW && signedArea < 0)) {
      const rest = filtered.slice(1).reverse();
      filtered.splice(1, rest.length, ...rest);
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

    // Scale fillet radius by corner angle: tight hairpins use minSafeRadius, fast shallow bends get high-speed sweep radii
    const r =
      phi >= 1.55
        ? minSafeRadius
        : phi >= 0.75
        ? minSafeRadius * (1.0 + 1.8 * ((1.55 - phi) / 0.8))
        : Math.min(180, minSafeRadius * 2.8 + ((0.75 - phi) / 0.75) * 95);
    const tanHalf = Math.tan(phi * 0.5);
    const maxTrim = 0.42 * Math.min(inLen, outLen);
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
    const desiredArcChords = Math.max(2, Math.min(8, Math.round(arcLen / 8.5)));
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
      if (Math.hypot(pt.x - prev.x, pt.z - prev.z) < 3.5) {
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
  const cumS = new Float64Array(totalPts);
  let totalXZLen = 0;
  for (let i = 1; i < totalPts; i++) {
    totalXZLen += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
    cumS[i] = totalXZLen;
  }
  totalXZLen += Math.hypot(dense[0].x - dense[totalPts - 1].x, dense[0].z - dense[totalPts - 1].z);

  const demProfile = trackId ? REAL_DEM_ELEVATIONS[trackId] : undefined;
  const demM = demProfile && demProfile.length >= 3 ? solveUniformPeriodicCubicM(demProfile) : null;

  const smoothedWaypoints: TrackWaypoint[] = dense.map((p, idx) => {
    const tArc = totalXZLen > 1e-3 ? cumS[idx] / totalXZLen : idx / totalPts;
    let y = 0;
    let banking = 0;

    // Exact periodic C2 cubic spline interpolation of Real-World Satellite DEM at true XZ arc-length fraction
    if (demProfile && demProfile.length > 0 && demM) {
      y = Math.round(evalUniformPeriodicCubic(demProfile, demM, tArc) * 1000) / 1000;
    }

    // Gentle Banking Profiles: smooth 8°-10° max for Daytona, 10°-12° max for Zandvoort/Indy
    if (trackId === 'daytona-road') {
      if (tArc >= 0.48 && tArc <= 0.62) {
        const ease = 0.035;
        let factor = 1.0;
        if (tArc < 0.48 + ease) factor = (1 - Math.cos(((tArc - 0.48) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.62 - ease) factor = (1 - Math.cos(((0.62 - tArc) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (tArc >= 0.77 && tArc <= 0.93) {
        const ease = 0.035;
        let factor = 1.0;
        if (tArc < 0.77 + ease) factor = (1 - Math.cos(((tArc - 0.77) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.93 - ease) factor = (1 - Math.cos(((0.93 - tArc) / ease) * Math.PI)) * 0.5;
        banking = 9.5 * factor;
      } else if (tArc > 0.93 || tArc < 0.05) {
        let factor = 1.0;
        if (tArc >= 0.93 && tArc < 0.96) factor = (1 - Math.cos(((tArc - 0.93) / 0.03) * Math.PI)) * 0.5;
        else if (tArc >= 0.02 && tArc < 0.05) factor = (1 - Math.cos(((0.05 - tArc) / 0.03) * Math.PI)) * 0.5;
        banking = 6.5 * factor;
      }
    } else if (trackId === 'zandvoort') {
      if (tArc >= 0.14 && tArc <= 0.24) {
        const ease = 0.025;
        let factor = 1.0;
        if (tArc < 0.14 + ease) factor = (1 - Math.cos(((tArc - 0.14) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.24 - ease) factor = (1 - Math.cos(((0.24 - tArc) / ease) * Math.PI)) * 0.5;
        banking = -11.0 * factor;
      } else if (tArc >= 0.88 && tArc <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (tArc < 0.88 + ease) factor = (1 - Math.cos(((tArc - 0.88) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.98 - ease) factor = (1 - Math.cos(((0.98 - tArc) / ease) * Math.PI)) * 0.5;
        banking = -11.0 * factor;
      }
    } else if (trackId === 'indianapolis-road') {
      if (tArc >= 0.88 && tArc <= 0.98) {
        const ease = 0.025;
        let factor = 1.0;
        if (tArc < 0.88 + ease) factor = (1 - Math.cos(((tArc - 0.88) / ease) * Math.PI)) * 0.5;
        else if (tArc > 0.98 - ease) factor = (1 - Math.cos(((0.98 - tArc) / ease) * Math.PI)) * 0.5;
        banking = -9.2 * factor;
      }
    }

    return {
      x: Math.round(p.x * 100) / 100,
      y,
      z: Math.round(p.z * 100) / 100,
      ...(banking ? { banking } : {}),
      width: trackWidth,
    };
  });

  // Final 3D perimeter normalization preserving DEM elevation Y values untouched
  if (smoothedWaypoints.length >= 4) {
    for (let pass = 0; pass < 2; pass++) {
      const curvePts = smoothedWaypoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const checkCurve = new THREE.CatmullRomCurve3(curvePts, true, 'centripetal', 0.5);
      checkCurve.arcLengthDivisions = Math.max(1500, smoothedWaypoints.length * 30, 1800);
      const len3D = checkCurve.getLength();
      if (len3D > 10) {
        const ratio = targetLengthMeters / len3D;
        if (Math.abs(ratio - 1) > 0.0002) {
          for (let i = 0; i < smoothedWaypoints.length; i++) {
            smoothedWaypoints[i].x = Math.round(smoothedWaypoints[i].x * ratio * 100) / 100;
            smoothedWaypoints[i].z = Math.round(smoothedWaypoints[i].z * ratio * 100) / 100;
          }
        }
      }
    }
  }

  return smoothedWaypoints;
}
