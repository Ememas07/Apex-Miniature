import { SceneryTheme, TrackRegion, TrackSpec, TrackWaypoint } from './types';
import { getCustomTrackById } from './customTracks';

type WaypointTuple = [
  x: number,
  z: number,
  y?: number,
  tension?: number,
  banking?: number,
];

function pts(coords: WaypointTuple[], scale = 1.0): TrackWaypoint[] {
  return coords.map(([x, z, y = 0, tension, banking]) => ({
    x: Math.round(x * scale * 10) / 10,
    y: Math.round(y * 10) / 10,
    z: Math.round(z * scale * 10) / 10,
    ...(tension !== undefined ? { tension } : {}),
    ...(banking !== undefined ? { banking } : {}),
  }));
}

export const TRACKS: TrackSpec[] = [
  // ==================== FLAGSHIP 10 STARTER PACK ====================
  {
    id: 'spa-francorchamps',
    name: 'Circuit de Spa-Francorchamps',
    shortName: 'Spa',
    country: 'Belgium',
    region: 'Europe',
    seriesTags: ['F1', 'WEC'],
    flagship: true,
    scenery: 'forest',
    asphaltColor: '#262b33',
    kerbPrimary: '#e11d48',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 70,
    corners: 19,
    // Pit Straight -> La Source Hairpin -> Eau Rouge/Raidillon Climb -> Kemmel Straight -> Les Combes -> Malmedy -> Bruxelles -> Speaker's Corner -> Pouhon -> Fagnes -> Stavelot -> Blanchimont -> Bus Stop Chicane
    waypoints: pts([
      [-155, -420, 0, 0.35], // Start / Finish
      [95, -420, 0, 0.3],    // Pit straight braking zone
      [265, -402, 1, 0.25],   // La Source entry
      [292, -352, 1.5, 0.3], // La Source tight hairpin apex
      [252, -295, 2, 0.32],  // La Source exit
      [345, -165, 5, 0.45],  // Downhill run to Eau Rouge
      [390, -75, 4, 0.42],   // Eau Rouge compression dip
      [425, 15, 20, 0.45],   // Raidillon uphill left-right
      [475, 105, 30, 0.42],  // Raidillon crest (+30m)
      [535, 295, 26, 0.35],  // Kemmel Straight end braking
      [518, 392, 22, 0.32],  // Les Combes chicane entry (right)
      [458, 385, 21, 0.32],  // Les Combes chicane apex (left)
      [405, 435, 20, 0.35],  // Malmedy exit
      [292, 355, 16, 0.42],  // Bruxelles hairpin entry
      [218, 314, 15, 0.48],  // Bruxelles hairpin apex
      [210, 400, 13, 0.42],  // Speaker's Corner
      [140, 465, 10, 0.45],  // Pouhon entry
      [10, 485, 8, 0.55],    // Pouhon double-left apex
      [-125, 460, 7, 0.45],  // Pouhon exit
      [-210, 395, 5, 0.32],  // Fagnes (Pif-Paf) chicane right
      [-265, 415, 5, 0.32],  // Fagnes chicane left
      [-325, 330, 4, 0.38],  // Stavelot
      [-405, 145, 3, 0.5],   // Blanchimont 1
      [-395, -95, 2, 0.45],  // Blanchimont 2 flat-out
      [-335, -280, 0.5, 0.3], // Bus Stop braking zone
      [-282, -335, 0, 0.28], // Bus Stop right
      [-312, -395, 0, 0.28], // Bus Stop left
      [-245, -420, 0, 0.32], // Pit straight entry
    ]),
  },
  {
    id: 'daytona-road',
    name: 'Daytona International Speedway (Road)',
    shortName: 'Daytona',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: true,
    scenery: 'stadium',
    asphaltColor: '#272b34',
    kerbPrimary: '#facc15',
    kerbSecondary: '#2563eb',
    trackWidth: 19,
    targetLapSeconds: 46,
    corners: 12,
    // Tri-oval Frontstretch -> T1 Infield Dive -> International Horseshoe -> West Horseshoe -> Oval Banking 1-2 -> Backstretch -> Le Mans Bus Stop Chicane -> Oval Banking 3-4
    waypoints: pts([
      [-120, -270, 0, 0.3],
      [90, -270, 0, 0.3],
      [230, -245, 3, 0.24, 10], // T1 entry braking
      [265, -175, 1, 0.2, 4],   // T1 infield dive
      [195, -130, 0, 0.24],     // T2 infield exit
      [155, -75, 0, 0.18],      // International Horseshoe hairpin
      [205, -20, 0, 0.25],      // Horseshoe exit
      [180, 65, 0, 0.24],       // T5 kink
      [105, 125, 0, 0.2],       // West Horseshoe entry
      [50, 100, 0, 0.2],        // West Horseshoe exit
      [-25, 65, 0, 0.25],       // Infield exit chute
      [-95, 195, 5, 0.4, 15],   // Oval Banking T1
      [-225, 225, 7, 0.5, 16],  // Oval Banking T2
      [-310, 125, 6, 0.35, 6],  // Superstretch start
      [-312, 30, 4, 0.44],      // Le Mans Bus Stop chicane entry
      [-250, -22, 4, 0.46],     // Bus Stop apex 1
      [-316, -82, 4, 0.44],     // Bus Stop apex 2
      [-300, -160, 7, 0.45, 16],// Oval Banking T3-T4
      [-225, -255, 3, 0.35, 10],// Tri-oval exit onto frontstretch
    ]),
  },
  {
    id: 'laguna-seca',
    name: 'WeatherTech Raceway Laguna Seca',
    shortName: 'Laguna Seca',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: true,
    scenery: 'desert',
    asphaltColor: '#2f333b',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#f8fafc',
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 11,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Front Straight -> T1 Crest -> Andretti Hairpin (L) -> T3-T4 (R) -> T5-T6 Uphill (L) -> Rahal Crest -> CORKSCREW Plunge (L-R) -> Rainey (L) -> T10 (R) -> T11 (L)
    waypoints: pts([
      [-100, 230, 0, 0.35],
      [85, 230, 0, 0.3],       // Pit straight braking zone
      [205, 212, 2, 0.28],     // Andretti Hairpin entry (left)
      [228, 162, 2.5, 0.3],    // Andretti Hairpin double apex
      [155, 132, 3, 0.3],      // Andretti exit
      [172, 58, 4.5, 0.32],    // Turn 3 right
      [222, -20, 7.5, 0.35],   // Turn 4 right
      [165, -130, 14, 0.35],   // Turn 5 uphill left
      [85, -210, 19, 0.35],    // Turn 6 fast left
      [15, -255, 24, 0.32],    // Rahal Straight steep crest (+24m)
      [-65, -250, 23, 0.26],   // Corkscrew blind entry left (+23m)
      [-98, -202, 14, 0.26],   // Corkscrew plunge drop right!
      [-130, -152, 7, 0.32],   // Corkscrew bottom exit
      [-215, -95, 5, 0.38],    // Rainey Curve left
      [-255, 25, 3, 0.32],     // Turn 10 right
      [-232, 152, 0.5, 0.28],  // Turn 11 braking zone
      [-212, 212, 0, 0.28],    // Turn 11 sharp 90° left hairpin
      [-160, 230, 0, 0.32],    // Front straight exit
    ]),
  },
  {
    id: 'le-mans',
    name: 'Circuit de la Sarthe (Le Mans)',
    shortName: 'Le Mans',
    country: 'France',
    region: 'Europe',
    seriesTags: ['WEC'],
    flagship: true,
    scenery: 'forest',
    asphaltColor: '#242933',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#facc15',
    trackWidth: 18.5,
    targetLapSeconds: 72,
    corners: 21,
    // Pit Straight -> Dunlop Curve & Chicane -> Tertre Rouge -> Mulsanne Straight (Forza & Michelin Chicanes) -> Mulsanne Corner -> Indianapolis -> Arnage -> Porsche Curves -> Ford Chicanes
    waypoints: pts([
      [-170, -475, 0, 0.3],
      [155, -475, 0, 0.3],     // Pit straight
      [310, -445, 4, 0.35],    // Dunlop Curve
      [385, -365, 8, 0.22],    // Dunlop Chicane entry
      [420, -320, 7, 0.22],    // Dunlop Chicane exit
      [430, -165, 3, 0.25],    // Esses entry
      [405, -75, 2, 0.22],     // Tertre Rouge right onto Mulsanne
      [485, 75, 0, 0.35],       // Mulsanne Straight 1
      [525, 225, 0, 0.28],     // Forza Chicane entry
      [485, 255, 0, 0.28],     // Forza Chicane apex
      [512, 315, 0, 0.32],     // Mulsanne Straight 2
      [430, 440, 0, 0.28],     // Michelin Chicane entry
      [402, 472, 0, 0.28],     // Michelin Chicane apex
      [345, 520, 0, 0.32],     // Mulsanne Straight 3
      [215, 575, 0, 0.28],     // Mulsanne Corner braking
      [140, 560, 0, 0.28],     // Mulsanne Corner 90° right hairpin
      [-30, 495, 1, 0.38],     // Blast to Indianapolis
      [-195, 445, 2, 0.32, 7], // Indianapolis banked left
      [-285, 395, 2, 0.28],    // Arnage 90° slow right
      [-345, 295, 3, 0.38],    // Approach to Porsche Curves
      [-415, 165, 5, 0.45],    // Porsche Curves right-left
      [-465, 30, 5, 0.45],     // Porsche Curves fast sweep
      [-425, -135, 3, 0.38],   // Maison Blanche / Karting
      [-370, -305, 0.5, 0.28], // Ford Chicane 1
      [-328, -338, 0, 0.28],   // Ford Chicane 2
      [-345, -405, 0, 0.28],   // Ford Chicane 3
      [-265, -465, 0, 0.32],   // Onto Pit Straight
    ]),
  },
  {
    id: 'monza',
    name: 'Autodromo Nazionale Monza',
    shortName: 'Monza',
    country: 'Italy',
    region: 'Europe',
    seriesTags: ['F1', 'WEC'],
    flagship: true,
    scenery: 'parkland',
    asphaltColor: '#252a32',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 40,
    corners: 11,
    // Rettifilo Straight -> T1 Rettifilo Chicane -> Curva Grande -> Roggia Chicane -> Lesmo 1 & 2 -> Serraglio -> Ascari Chicane -> Back Straight -> Parabolica
    waypoints: pts([
      [-145, -270, 0, 0.3],
      [135, -270, 0, 0.3],     // Rettifilo main straight
      [212, -268, 0, 0.28],    // Variante del Rettifilo brake zone
      [238, -234, 0, 0.28],    // Rettifilo chicane right-left
      [274, -225, 0, 0.32],    // Rettifilo exit
      [295, -110, 0, 0.55],    // Curva Grande flat-out sweep
      [255, 25, 0, 0.36],      // Variante della Roggia entry
      [214, 56, 0, 0.36],      // Roggia chicane left-right
      [235, 102, 0, 0.34],     // Roggia exit
      [225, 195, 2, 0.3],      // Curva di Lesmo 1
      [150, 235, 2, 0.3],      // Short chute
      [85, 265, 2, 0.3],       // Curva di Lesmo 2
      [-45, 215, 0, 0.35],     // Curva del Serraglio straight
      [-155, 225, 0, 0.28],    // Variante Ascari left entry
      [-190, 260, 0, 0.28],    // Ascari right mid
      [-235, 230, 0, 0.32],    // Ascari left exit
      [-285, 65, 0, 0.35],     // Back straight braking zone
      [-300, -105, 0, 0.45],   // Parabolica / Alboreto entry
      [-275, -225, 0, 0.45],   // Parabolica sweeping apex
      [-205, -265, 0, 0.35],   // Parabolica exit onto main straight
    ]),
  },
  {
    id: 'silverstone',
    name: 'Silverstone Grand Prix Circuit',
    shortName: 'Silverstone',
    country: 'United Kingdom',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: true,
    scenery: 'parkland',
    asphaltColor: '#282d36',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#f8fafc',
    trackWidth: 18.5,
    targetLapSeconds: 46,
    corners: 18,
    // Hamilton Straight -> Abbey -> Farm -> Village -> The Loop -> Wellington Straight -> Brooklands -> Luffield -> Woodcote -> Copse -> Maggotts/Becketts/Chapel -> Hangar Straight -> Stowe -> Vale -> Club
    waypoints: pts([
      [-115, -275, 0, 0.3],
      [95, -275, 0, 0.3],      // Hamilton straight
      [205, -260, 0, 0.35],    // Abbey right
      [255, -205, 0, 0.3],     // Farm left
      [222, -148, 0, 0.38],    // Village right
      [272, -102, 0, 0.42],    // The Loop tight hairpin entry
      [228, -58, 0, 0.4],      // The Loop apex exit
      [165, -45, 0, 0.35],     // Wellington straight
      [215, 75, 0, 0.25],      // Brooklands left
      [285, 110, 0, 0.35],     // Luffield long right
      [255, 185, 1, 0.4],      // Woodcote
      [175, 235, 2, 0.32],     // Copse high-speed 90° right
      [85, 265, 3, 0.35],      // Maggotts left
      [25, 215, 3, 0.3],       // Becketts right
      [-35, 255, 3, 0.3],      // Becketts left
      [-95, 210, 2, 0.32],     // Chapel curve
      [-175, 275, 1, 0.3],     // Hangar Straight
      [-265, 230, 0, 0.25],    // Stowe right braking
      [-285, 105, 0, 0.3],     // Run down to Vale
      [-245, 25, 0, 0.22],     // Vale chicane left
      [-285, -45, 0, 0.24],    // Club right
      [-225, -220, 0, 0.3],    // Club exit onto Hamilton straight
    ]),
  },
  {
    id: 'suzuka',
    name: 'Suzuka International Racing Course',
    shortName: 'Suzuka',
    country: 'Japan',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: true,
    scenery: 'stadium',
    asphaltColor: '#242931',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#f8fafc',
    trackWidth: 17.5,
    targetLapSeconds: 52,
    corners: 18,
    // TRUE 3D FIGURE-8 CROSSOVER!
    // Front Straight -> T1-2 -> Esses -> Dunlop -> Degner 1 -> Degner 2 -> Underpass (0m at -20, 65) -> Hairpin -> 200R -> Spoon -> Back Straight OVERPASS (10m at -20, 65) -> 130R -> Casio Triangle Chicane
    waypoints: pts([
      [-125, -210, 0, 0.32],   // Start / Finish line
      [140, -210, 0, 0.32],    // Front straight
      [255, -190, 2, 0.35],    // Turn 1 fast right
      [290, -105, 2.5, 0.32],  // Turn 2 exit
      [230, -45, 3.5, 0.35],   // Esses T3 left
      [275, 20, 4.5, 0.35],    // Esses T4 right
      [215, 75, 5.5, 0.35],    // Esses T5 left
      [255, 145, 6.5, 0.35],   // Esses T6 right
      [210, 225, 7, 0.4],      // Dunlop Curve climbing
      [125, 235, 5, 0.28],     // Degner 1 right
      [90, 165, 2, 0.28],      // Degner 2 tight right
      [30, 95, 0, 0.35],       // Approach underpass
      [-20, 65, 0, 0.35],      // UNDERPASS SPAN (0m) - crossed directly above by Back Straight!
      [-75, 30, 0, 0.32],      // Hairpin approach
      [-135, -10, 1, 0.28],    // Hairpin tight 180° entry
      [-188, 22, 1.5, 0.28],   // Hairpin apex
      [-155, 82, 2, 0.32],     // Hairpin exit
      [-225, 140, 4, 0.42],    // 200R sweeping right
      [-310, 195, 5.5, 0.35],  // Spoon Curve entry
      [-362, 245, 6, 0.35],    // Spoon apex 1
      [-335, 285, 6.5, 0.35],  // Spoon apex 2
      [-265, 248, 7, 0.35],    // Spoon exit
      [-130, 150, 9, 0.35],    // West Back Straight climbing
      [-20, 65, 10, 0.35],     // OVERPASS BRIDGE (10m) directly over Degner-Hairpin underpass!
      [60, 0, 8, 0.38],        // Back straight downhill blast
      [95, -60, 4, 0.38],      // Approach to 130R
      [75, -130, 2, 0.4],      // 130R legendary high-speed left
      [-35, -165, 0.5, 0.42],   // Straight into Casio Triangle
      [-142, -162, 0, 0.48],   // Casio Triangle chicane entry (right)
      [-218, -172, 0, 0.5],    // Casio Triangle mid (left)
      [-238, -222, 0, 0.5],    // Casio Triangle exit
      [-175, -228, 0, 0.44],   // Final corner onto Front Straight
    ], 0.85),
  },
  {
    id: 'monaco',
    name: 'Circuit de Monaco',
    shortName: 'Monaco',
    country: 'Monaco',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: true,
    scenery: 'coastal',
    asphaltColor: '#2a2f3a',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#ffffff',
    trackWidth: 14.5,
    targetLapSeconds: 38,
    corners: 19,
    // Blvd Albert 1er -> Sainte-Devote -> Beau Rivage -> Casino -> Mirabeau -> Fairmont Hairpin -> Portier -> Tunnel -> Nouvelle Chicane -> Tabac -> Swimming Pool -> Rascasse -> Anthony Noghes
    waypoints: pts([
      [-85, -230, 0, 0.3],
      [95, -230, 0, 0.25],     // Blvd Albert 1er
      [185, -225, 2, 0.18],    // Sainte-Devote sharp 90° right
      [215, -150, 8, 0.35],    // Beau Rivage uphill climb
      [245, -35, 15, 0.3],     // Massenet left
      [240, 35, 16, 0.25],     // Casino Square (+16m)
      [185, 95, 12, 0.32],     // Mirabeau Haute downhill right
      [238, 162, 7, 0.35],     // Fairmont Hairpin approach
      [256, 208, 6, 0.36],     // Fairmont Hairpin slowest corner in F1!
      [198, 222, 5, 0.36],     // Fairmont exit
      [165, 202, 4, 0.32],     // Mirabeau Bas
      [125, 240, 3, 0.3],      // Portier double-right into tunnel
      [0, 235, 2, 0.45],       // Tunnel flat-out curve
      [-115, 225, 0.5, 0.3],   // Nouvelle Chicane braking
      [-145, 200, 0, 0.3],     // Nouvelle Chicane left-right
      [-185, 215, 0, 0.32],    // Harbour straight
      [-235, 145, 0, 0.3],     // Tabac left
      [-240, 65, 0, 0.3],      // Swimming Pool entry
      [-265, 20, 0, 0.3],      // Swimming Pool exit chicane
      [-225, -70, 0, 0.32],    // Approach to Rascasse
      [-242, -145, 0, 0.36],   // La Rascasse 160° hairpin
      [-192, -180, 0, 0.34],   // Anthony Noghes 90° right
      [-155, -225, 0, 0.3],    // Onto Pit Straight
    ]),
  },
  {
    id: 'cota',
    name: 'Circuit of the Americas (Austin)',
    shortName: 'COTA',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['F1', 'WEC'],
    flagship: true,
    scenery: 'stadium',
    asphaltColor: '#272c35',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#2563eb',
    trackWidth: 18,
    targetLapSeconds: 48,
    corners: 20,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Pit Straight -> Steep Uphill T1 Left Hairpin (+22m) -> Esses -> Hairpin T11 (L) -> 1km Back Straight -> T12 (L) -> Stadium -> Carousel (R) -> T19-20 (L)
    waypoints: pts([
      [-105, 270, 0, 0.32],
      [95, 270, 2, 0.28],      // Uphill pit straight
      [215, 265, 21, 0.26],    // Turn 1 steep blind uphill hairpin (+22m!)
      [238, 218, 22, 0.28],    // Turn 1 exit
      [270, 140, 15, 0.35],    // Turn 2 fast left
      [210, 75, 12, 0.32],     // Esses T3-T4
      [275, 15, 9, 0.32],      // Esses T5
      [225, -55, 6, 0.32],     // Esses T6-T8
      [270, -130, 4, 0.3],     // Turn 9-10 crest
      [225, -200, 2, 0.26],    // Turn 11 tight left hairpin
      [165, -225, 1, 0.3],     // T11 exit onto 1km straight
      [-75, -270, 1, 0.3],     // 1km Back straight braking
      [-125, -265, 1.5, 0.26], // Turn 12 sharp 90° left
      [-145, -195, 2.5, 0.48], // Turn 13 right
      [-198, -168, 3, 0.52],   // Turn 14-15 Stadium chicane
      [-265, -215, 4, 0.42],   // Turn 16-18 triple-apex Carousel
      [-295, -130, 4, 0.38],   // Carousel exit
      [-285, -25, 3, 0.3],     // Turn 19 90° left
      [-235, 135, 1, 0.3],     // Approach to T20
      [-205, 235, 0, 0.28],    // Turn 20 90° left onto pit straight
    ]),
  },
  {
    id: 'sebring',
    name: 'Sebring International Raceway',
    shortName: 'Sebring',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA', 'WEC'],
    flagship: true,
    scenery: 'desert',
    asphaltColor: '#363940',
    kerbPrimary: '#facc15',
    kerbSecondary: '#111827',
    trackWidth: 18,
    targetLapSeconds: 45,
    corners: 17,
    waypoints: pts([
      [-115, -260, 0, 0.3],
      [95, -260, 0, 0.3],      // Front concrete straight
      [225, -235, 0, 0.35],    // Turn 1 fast sweeping left
      [270, -140, 0, 0.28],    // Turn 3
      [230, -65, 0, 0.24],     // Turn 4-5
      [185, 5, 0, 0.28],       // Big Bend
      [245, 85, 0, 0.25],      // Approach to Hairpin
      [265, 150, 0, 0.18],     // Hairpin Turn 7!
      [195, 175, 0, 0.24],     // Hairpin exit
      [145, 235, 0, 0.22],     // Fangio Chicane entry
      [85, 220, 0, 0.2],       // Fangio Chicane exit
      [-15, 260, 0, 0.25],     // Tower Turn
      [-165, 240, 0, 0.25],    // Ulmann Straight
      [-265, 165, 0, 0.25],    // Bishop Bend
      [-245, 20, 0, 0.3],      // Le Mans Straight
      [-285, -135, 0, 0.35],   // Sunset Bend entry
      [-255, -225, 0, 0.28],   // Sunset Bend bumpy concrete exit
      [-185, -255, 0, 0.28],
    ]),
  },

  // ==================== REMAINING AMERICAS (15 tracks) ====================
  {
    id: 'long-beach',
    name: 'Long Beach Street Circuit',
    shortName: 'Long Beach',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'coastal',
    asphaltColor: '#282d36',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#ffffff',
    trackWidth: 15.5,
    targetLapSeconds: 38,
    corners: 11,
    // Shoreline Dr curved straight -> T1 90° left -> Fountain Roundabout -> Pine Ave 90° -> Aquarium -> Seaside Way -> Final Hairpin
    waypoints: pts([
      [-115, -225, 0, 0.32],
      [95, -215, 0, 0.32],     // Curved Shoreline Drive straight
      [215, -185, 0, 0.2],     // Turn 1 sharp 90° left
      [225, -90, 0, 0.24],     // Fountain Roundabout entry
      [175, -55, 0, 0.28],     // Roundabout right
      [215, 25, 0, 0.22],      // Pine Ave 90° right
      [175, 125, 0, 0.22],     // Turn 6 90° left
      [60, 145, 0, 0.22],      // Aquarium right
      [-45, 185, 0, 0.25],     // Seaside Way back straight
      [-190, 165, 0, 0.22],    // Turn 9 right-left
      [-245, 45, 0, 0.25],     // Turn 10
      [-235, -145, 0, 0.18],   // Iconic Final Hairpin (Turn 11)
      [-190, -190, 0, 0.18],   // Hairpin exit onto Shoreline Dr
    ]),
  },
  {
    id: 'detroit-street',
    name: 'Detroit Grand Prix (Street & Belle Isle)',
    shortName: 'Detroit',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#262b33',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#ffffff',
    trackWidth: 15,
    targetLapSeconds: 39,
    corners: 14,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Jefferson Ave Straight -> 90° Left Street Grid -> Tight Hairpin -> Riverfront Chicane -> 90° Left onto Jefferson
    waypoints: pts([
      [-120, 220, 0, 0.3],
      [115, 220, 0, 0.28],     // Long Jefferson Ave straight
      [215, 210, 0, 0.26],     // T1 90° left
      [215, 80, 0, 0.26],      // T2 90° left
      [115, 75, 0, 0.26],      // T3 90° right
      [115, -45, 0, 0.26],     // T4 chicane
      [205, -95, 0, 0.26],     // T5 left
      [185, -195, 0, 0.26],    // T6 90° hairpin
      [25, -195, 0, 0.3],      // Atwater Riverfront straight
      [-85, -155, 0, 0.28],    // Riverfront chicane
      [-175, -185, 0, 0.26],   // T9 right
      [-225, -65, 0, 0.28],    // T10-11
      [-215, 145, 0, 0.26],    // Final 90° left onto Jefferson
      [-180, 210, 0, 0.28],
    ]),
  },
  {
    id: 'mid-ohio',
    name: 'Mid-Ohio Sports Car Course',
    shortName: 'Mid-Ohio',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#292e36',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#facc15',
    trackWidth: 16.5,
    targetLapSeconds: 38,
    corners: 13,
    // Front Straight -> T1 Left -> Keyhole Hairpin -> Back Straight -> Madness -> Thunder Valley -> Carousel
    waypoints: pts([
      [-105, -210, 0, 0.3],
      [85, -210, 1, 0.28],     // Pit straight
      [195, -185, 3, 0.26],    // Turn 1 fast left
      [245, -105, 5, 0.22],    // Keyhole entry
      [220, -40, 4, 0.18],     // Keyhole tight hairpin
      [120, -25, 2, 0.28],     // Back straight acceleration
      [-65, 35, 1, 0.28],      // Back straight braking
      [-165, 85, 6, 0.42],     // China Beach / Madness crest
      [-92, 168, 8, 0.5],      // Turn 7-8
      [-195, 195, 4, 0.42],    // Thunder Valley plunge
      [-245, 85, 2, 0.3],      // Thunder Valley sweep
      [-235, -65, 1, 0.32],    // The Carousel
      [-195, -185, 0, 0.24],   // Final turn onto pit straight
    ]),
  },
  {
    id: 'watkins-glen',
    name: 'Watkins Glen International',
    shortName: 'Watkins Glen',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#252a33',
    kerbPrimary: '#0284c7',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 11,
    // Pit Straight -> Turn 1 90° -> Uphill Esses -> Back Straight -> Inner Loop Bus Stop -> Outer Loop Carousel -> The Boot -> Turn 10-11
    waypoints: pts([
      [-95, -220, 0, 0.3],
      [85, -220, 0, 0.25],     // Front straight
      [195, -205, 1, 0.18],    // Turn 1 (The 90)
      [245, -105, 6, 0.38],    // Uphill Esses T2
      [215, -15, 10, 0.35],    // Esses T3-4 crest
      [235, 105, 11, 0.34],     // Back straight
      [175, 165, 10, 0.36],    // Inner Loop (Bus Stop) chicane
      [125, 145, 9, 0.36],     // Bus Stop exit
      [75, 225, 8, 0.42],      // Outer Loop (Carousel)
      [-45, 240, 5, 0.25],     // Turn 6 into The Boot
      [-155, 255, 2, 0.2],     // The Toe hairpin
      [-215, 175, 3, 0.22],    // The Heel
      [-175, 85, 4, 0.25],     // Exiting The Boot
      [-245, -15, 2, 0.26],    // Turn 10 left
      [-215, -155, 0, 0.28],   // Turn 11 fast right onto front straight
    ]),
  },
  {
    id: 'mosport',
    name: 'Canadian Tire Motorsport Park (Mosport)',
    shortName: 'Mosport',
    country: 'Canada',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#262b33',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 17,
    targetLapSeconds: 38,
    corners: 10,
    // Pit Straight -> T1 Fast Right -> T2 Blind Downhill Left -> T3 -> Moss Corner Double Hairpin -> Mario Andretti Straight -> T8-9-10
    waypoints: pts([
      [-115, -220, 6, 0.3],
      [95, -220, 7, 0.32],     // Front straight
      [215, -195, 6, 0.38],    // Turn 1 fast right
      [245, -85, 1, 0.4],      // Turn 2 steep blind downhill sweep
      [175, 25, 0, 0.32],      // Turn 3
      [125, 145, 2, 0.34],     // Turn 4 downhill plunge to Moss
      [194, 198, 2, 0.36],     // Turn 5A Moss Corner hairpin
      [162, 240, 2.5, 0.36],   // Turn 5A/B hairpin arc
      [100, 232, 3, 0.34],     // Turn 5B Moss exit
      [-95, 195, 7, 0.3],      // Andretti Back Straight uphill
      [-235, 125, 10, 0.28],   // Turn 8 high-speed braking
      [-245, -15, 8, 0.24],    // Turn 9
      [-215, -165, 6, 0.24],   // Turn 10 uphill onto front straight
    ]),
  },
  {
    id: 'lime-rock',
    name: 'Lime Rock Park',
    shortName: 'Lime Rock',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#2b3038',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 15.5,
    targetLapSeconds: 35,
    corners: 7,
    // Sam Posey Straight -> Big Bend -> Left-Hander -> Right-Hander -> No-Name Straight -> Uphill Crest (+8m) -> West Bend -> Diving Turn
    waypoints: pts([
      [-125, -210, 0, 0.3],
      [115, -210, 0, 0.28],    // Sam Posey Straight
      [235, -175, 0, 0.35],    // Big Bend double-apex right
      [225, -55, 0, 0.25],     // Big Bend exit
      [115, -15, 0, 0.24],     // Left-Hander (T3)
      [75, 75, 0, 0.24],       // Right-Hander (T4)
      [-45, 135, 1, 0.3],      // No Name Straight
      [-175, 185, 9, 0.26],    // The Uphill steep crest (+9m)
      [-255, 95, 6, 0.28],     // West Bend downhill right
      [-245, -85, 1, 0.32],    // The Diving Turn
      [-195, -190, 0, 0.3],    // Onto Sam Posey Straight
    ]),
  },
  {
    id: 'road-america',
    name: 'Road America',
    shortName: 'Road America',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#252a32',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 42,
    corners: 14,
    // Pit Straight -> T1 90° -> T3 90° -> Moraine Sweep -> T5 Steep Downhill -> Hurry Downs -> T8 -> Carousel -> Kink -> Kettle Bottoms -> Canada Corner -> T14
    waypoints: pts([
      [-125, -265, 4, 0.3],
      [115, -265, 4, 0.25],    // Main straight
      [235, -245, 4, 0.2],     // Turn 1 90° right
      [245, -135, 3, 0.2],     // Turn 3 90° right
      [135, -110, 4, 0.3],     // Moraine Sweep
      [115, 5, 0, 0.18],       // Turn 5 steep downhill hairpin
      [195, 65, 5, 0.24],      // Turn 6 uphill crest
      [225, 165, 6, 0.25],     // Hurry Downs -> Turn 8
      [125, 245, 6, 0.45],     // The Carousel 180° sweeper
      [5, 215, 5, 0.32],       // The Kink fast right
      [-125, 255, 3, 0.3],     // Kettle Bottoms blast
      [-245, 220, 2, 0.18],    // Canada Corner 90° right
      [-265, 65, 4, 0.28],     // Thunder Valley
      [-255, -95, 5, 0.22],    // Turn 14 right
      [-215, -230, 4, 0.28],   // Uphill run to pit straight
    ]),
  },
  {
    id: 'vir',
    name: 'VIRginia International Raceway',
    shortName: 'VIR',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#272c34',
    kerbPrimary: '#facc15',
    kerbSecondary: '#16a34a',
    trackWidth: 16.5,
    targetLapSeconds: 38,
    corners: 17,
    // Front Straight -> T1 Hairpin -> NASCAR Bend -> Snake -> Climbing Esses -> Oak Tree -> Long Back Straight -> Rollercoaster -> Hog Pen
    waypoints: pts([
      [-115, -230, 0, 0.3],
      [95, -230, 0, 0.34],     // Front straight
      [220, -214, 1, 0.44],    // Turn 1 hairpin entry
      [222, -174, 1, 0.48],    // Turn 1 hairpin exit
      [152, -112, 1, 0.56],    // Turn 3 Left Hook
      [226, -54, 2, 0.48],     // NASCAR Bend
      [165, -5, 3, 0.42],      // The Snake
      [225, 75, 7, 0.3],       // Climbing Esses 1
      [175, 145, 9, 0.3],      // Climbing Esses 2
      [115, 215, 8, 0.2],      // Oak Tree slow hairpin!
      [-55, 235, 5, 0.3],      // Long Back Straight
      [-195, 215, 6, 0.22],    // Rollercoaster downhill chicane
      [-245, 125, 2, 0.24],    // Hog Pen 1
      [-215, 20, 3, 0.26],     // Hog Pen 2
      [-255, -110, 2, 0.28],   // Fast approach
      [-205, -210, 0, 0.25],
    ]),
  },
  {
    id: 'indianapolis-road',
    name: 'Indianapolis Motor Speedway (Road)',
    shortName: 'Indy Road',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#252932',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 35,
    corners: 14,
    // Brickyard Front Straight -> T1-2-3-4 Infield -> Hulman Blvd -> T7 -> T10 Hairpin -> T12-13-14 onto Oval T1 Banking!
    waypoints: pts([
      [-125, -220, 0, 0.3],
      [115, -220, 0, 0.24],    // Brickyard frontstretch
      [215, -205, 0, 0.18],    // T1 90° right braking
      [215, -115, 0, 0.2],     // T2-T3 left-right
      [125, -85, 0, 0.22],     // T4 right
      [115, 25, 0, 0.22],      // T5-T6
      [195, 115, 0, 0.2],      // Hulman Blvd straight -> T7 braking
      [95, 195, 0, 0.22],      // T8-T9
      [-45, 165, 0, 0.18],     // T10 hairpin
      [-115, 115, 0, 0.24],    // T11
      [-195, 165, 0, 0.24],    // T12-13 infield exit
      [-265, 65, 2, 0.42, 9],  // Oval Turn 1 banking!
      [-245, -135, 1, 0.35, 6],// Final chicane onto Brickyard
      [-195, -210, 0, 0.28],
    ]),
  },
  {
    id: 'road-atlanta',
    name: 'Michelin Raceway Road Atlanta',
    shortName: 'Road Atlanta',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['IMSA'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#262b33',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#facc15',
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 12,
    // Pit Straight -> T1 Uphill -> T2-3-4 Esses -> T5 Uphill Crest -> T6-7 Hairpin -> Back Straight -> T10A/10B Chicane -> Gravity Dip under bridge T12
    waypoints: pts([
      [-110, -215, 2, 0.3],
      [95, -215, 2, 0.28],     // Pit straight
      [210, -185, 8, 0.28],    // T1 fast uphill right
      [245, -95, 11, 0.28],    // T2 crest
      [185, -20, 6, 0.28],     // T3-T4 downhill Esses
      [235, 65, 4, 0.26],      // T5 uphill left
      [175, 155, 7, 0.24],     // T6 right
      [95, 205, 5, 0.18],      // T7 tight 90° right onto Back Straight
      [-85, 215, 2, 0.3],      // Long downhill Back Straight
      [-205, 185, 1, 0.2],     // T10A chicane left
      [-235, 145, 1, 0.2],     // T10B chicane right
      [-255, 25, 10, 0.3],     // Steep hill climb under Suzuki bridge (+10m)
      [-235, -135, 2, 0.32],   // T12 Gravity Cavity plunge onto front straight!
      [-185, -205, 2, 0.28],
    ]),
  },
  {
    id: 'montreal',
    name: 'Circuit Gilles Villeneuve (Montreal)',
    shortName: 'Montreal',
    country: 'Canada',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#242931',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 17,
    targetLapSeconds: 40,
    corners: 14,
    // Pit Straight -> Senna S (T1-2) -> T3-4 Chicane -> T6-7 Chicane -> T8-9 Chicane -> L'Epingle Hairpin -> Casino Straight -> Wall of Champions Chicane
    waypoints: pts([
      [-125, -215, 0, 0.3],
      [105, -215, 0, 0.32],    // Pit straight
      [182, -192, 0, 0.34],    // T1 Senna S left
      [230, -222, 0, 0.36],    // T2 Senna S right
      [272, -158, 0, 0.34],    // T3-4 chicane
      [255, -25, 0, 0.24],     // T5 sweep
      [285, 85, 0, 0.2],       // T6-7 chicane
      [235, 165, 0, 0.22],     // T8-9 chicane
      [115, 195, 0, 0.34],     // Run to Hairpin
      [35, 225, 0, 0.36],      // L'Epingle 180° hairpin!
      [-115, 165, 0, 0.32],    // Casino Straight
      [-265, 85, 0, 0.32],     // Casino Straight high speed
      [-285, -55, 0, 0.34],    // Braking for Wall of Champions
      [-265, -145, 0, 0.34],   // Wall of Champions chicane right-left
      [-215, -195, 0, 0.32],   // Exit past Wall of Champions!
    ]),
  },
  {
    id: 'miami',
    name: 'Miami International Autodrome',
    shortName: 'Miami',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#282d37',
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#f97316',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 19,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Hard Rock Stadium Pit Straight -> T1 90° Left -> T4-8 Marina Sweepers -> Straight -> T11-16 Chicane Underpass -> Long Back Straight -> T17 Left Hairpin
    waypoints: pts([
      [-115, 225, 0, 0.32],
      [95, 225, 0, 0.28],      // Stadium straight
      [195, 210, 0, 0.28],     // Turn 1 90° left
      [235, 115, 0, 0.35],     // Turn 2-3 sweeping
      [195, 25, 0, 0.35],      // Marina esses T4-T6
      [265, -65, 0, 0.3],      // T7-T8 Marina hairpin
      [185, -145, 0, 0.32],    // Straightaway
      [65, -175, 0, 0.3],      // T11 heavy brake
      [5, -220, 2, 0.32],      // T12-13 chicane under overpass
      [-65, -185, 4, 0.32],    // T14-15 tight chicane crest
      [-135, -215, 1, 0.3],    // T16 exit onto 1.2km straight
      [-275, -145, 0, 0.35],   // Long back straight
      [-285, 35, 0, 0.3],      // T17 braking
      [-265, 145, 0, 0.28],    // Turn 17 tight left hairpin
      [-205, 215, 0, 0.3],     // T18-19 kink onto front straight
    ]),
  },
  {
    id: 'las-vegas',
    name: 'Las Vegas Strip Circuit',
    shortName: 'Las Vegas',
    country: 'USA',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#1f242d',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#f8fafc',
    trackWidth: 17.5,
    targetLapSeconds: 38,
    corners: 17,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Pit Straight -> T1 Left Hairpin -> Sphere Right Sweeper -> Koval Straight -> T5 90° Left -> Long Las Vegas Blvd Strip -> T14 Chicane -> T17 Fast Left
    waypoints: pts([
      [-125, 210, 0, 0.32],
      [95, 210, 0, 0.28],      // Pit lane straight
      [195, 195, 0, 0.28],     // T1 tight 90° left hairpin
      [235, 110, 0, 0.38],     // The Sphere sweeping arc
      [275, -15, 0, 0.3],      // Koval straight
      [235, -135, 0, 0.28],    // Turn 5 90° left
      [105, -175, 0, 0.3],     // Turn 6-9 chicane onto The Strip
      [-105, -205, 0, 0.35],   // Iconic Las Vegas Blvd Strip flat-out!
      [-265, -165, 0, 0.3],    // T12 heavy braking
      [-285, -65, 0, 0.28],    // T14-15 chicane
      [-245, 65, 0, 0.32],     // T17 fast sweeping left
      [-205, 195, 0, 0.3],
    ]),
  },
  {
    id: 'mexico-city',
    name: 'Autódromo Hermanos Rodríguez',
    shortName: 'Mexico City',
    country: 'Mexico',
    region: 'Americas',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#262b33',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#dc2626',
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 17,
    // 1.2km Pit Straight -> T1-3 Chicane -> T4-6 Hairpin/Chicane -> Rapid Esses 7-11 -> Foro Sol Baseball Stadium Hairpin -> Peraltada
    waypoints: pts([
      [-135, -225, 0, 0.3],
      [125, -225, 0, 0.24],    // Long pit straight
      [235, -215, 0, 0.18],    // T1 braking -> right-left-right
      [255, -165, 0, 0.2],     // T2-T3
      [185, -115, 0, 0.22],    // Short straight
      [235, -25, 0, 0.18],     // T4-T6 tight chicane
      [165, 65, 0, 0.3],       // Esses T7
      [225, 145, 0, 0.28],     // Esses T8-T11
      [115, 205, 0, 0.26],     // Back straight
      [-35, 215, 0, 0.3],      // T12 Stadium entry braking
      [-115, 175, 0, 0.34],    // Foro Sol Baseball Stadium hairpin!
      [-165, 215, 0, 0.3],     // Stadium exit
      [-245, 95, 0, 0.35],     // Peraltada half-curve
      [-225, -165, 0, 0.32],   // Peraltada exit onto pit straight
    ]),
  },
  {
    id: 'interlagos',
    name: 'Autódromo José Carlos Pace (Interlagos)',
    shortName: 'Interlagos',
    country: 'Brazil',
    region: 'Americas',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#262b33',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#facc15',
    trackWidth: 17.5,
    targetLapSeconds: 35,
    corners: 15,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Steep Uphill Arquibancadas -> Senna S Downhill (L-R) -> Curva do Sol (L) -> Reta Oposta -> Descida do Lago (L) -> Ferradura (R) -> Laranjinha -> Bico de Pato (R) -> Mergulho (L) -> Junção (L)
    waypoints: pts([
      [-115, 215, 8, 0.35],
      [85, 226, 11, 0.45],     // Steep uphill pit straight (+11m)
      [222, 214, 9, 0.48],     // Senna S entry left downhill
      [230, 178, 7, 0.46],     // Senna S mid transition
      [154, 128, 5, 0.48],     // Senna S exit right
      [238, 52, 2, 0.48],      // Curva do Sol sweeping left
      [215, -85, 0, 0.32],     // Reta Oposta back straight
      [145, -185, 1, 0.28],    // Descida do Lago double-left
      [55, -155, 3, 0.28],     // Ferradura right
      [-25, -195, 4, 0.28],    // Laranjinha
      [-115, -145, 2, 0.26],   // Pinheirinho & Bico de Pato hairpin!
      [-195, -175, 1, 0.28],   // Mergulho
      [-245, -55, 1, 0.26],    // Junção heavy braking uphill left!
      [-215, 145, 6, 0.35],    // Subida dos Boxes steep climb!
    ]),
  },

  // ==================== REMAINING EUROPE (9 tracks) ====================
  {
    id: 'imola',
    name: 'Autodromo Enzo e Dino Ferrari (Imola)',
    shortName: 'Imola',
    country: 'Italy',
    region: 'Europe',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#262b33',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#dc2626',
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 19,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Pit Straight -> Tamburello Chicane (L-R-L) -> Villeneuve -> Tosa Hairpin (L) -> Piratella (L) -> Acque Minerali (R-R) -> Variante Alta -> Rivazza 1-2 (L)
    waypoints: pts([
      [-115, 215, 0, 0.32],
      [95, 215, 0, 0.3],       // Pit straight
      [215, 185, 0, 0.26],     // Tamburello chicane left-right-left
      [255, 115, 0, 0.28],     // Villeneuve chicane
      [225, 15, 1, 0.26],      // Tosa hairpin!
      [135, -35, 6, 0.34],     // Uphill to Piratella
      [195, -125, 7, 0.32],    // Piratella fast left
      [125, -195, 2, 0.26],    // Acque Minerali downhill double-right!
      [15, -215, 6, 0.3],      // Climb to Variante Alta
      [-65, -235, 7, 0.26],    // Variante Alta tight chicane!
      [-155, -165, 4, 0.32],   // Downhill blast
      [-245, -75, 1, 0.26],    // Rivazza 1 downhill left
      [-235, 35, 0, 0.28],     // Rivazza 2 left
      [-195, 185, 0, 0.3],     // Onto pit straight
    ]),
  },
  {
    id: 'barcelona',
    name: 'Circuit de Barcelona-Catalunya',
    shortName: 'Barcelona',
    country: 'Spain',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#272c35',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#facc15',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 14,
    // Pit Straight -> Elf Chicane (T1-2) -> Renault T3 -> Repsol T4 -> T5 Hairpin -> T7-8 -> Campsa T9 -> Back Straight -> La Caixa T10 Hairpin -> T12-14
    waypoints: pts([
      [-125, -225, 2, 0.3],
      [105, -225, 2, 0.25],    // Main straight
      [215, -210, 1, 0.2],     // T1-2 Elf chicane
      [265, -125, 3, 0.42],    // Turn 3 long fast Renault right
      [215, -25, 4, 0.24],     // Repsol T4 right
      [135, 25, 1, 0.18],      // Turn 5 downhill hairpin
      [195, 115, 3, 0.25],     // Turn 7-8 chicane uphill
      [165, 215, 6, 0.32],     // Campsa T9 crest
      [-35, 235, 4, 0.28],     // Back straight
      [-145, 215, 2, 0.18],    // La Caixa Turn 10 tight hairpin!
      [-195, 145, 2, 0.26],    // Stadium T11-12
      [-255, 15, 1, 0.26],     // T13-14 fast sweepers
      [-215, -185, 2, 0.3],
    ]),
  },
  {
    id: 'madring',
    name: 'Madring (Madrid GP)',
    shortName: 'Madring',
    country: 'Spain',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#232831',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#facc15',
    trackWidth: 17,
    targetLapSeconds: 37,
    corners: 20,
    // IFEMA Straight -> T1-2 Chicane -> High-Speed Banked Monumental Bowl -> Tunnel Underpass -> Chicane -> Street Section
    waypoints: pts([
      [-115, -220, 0, 0.3],
      [95, -220, 0, 0.25],     // IFEMA pit straight
      [205, -205, 0, 0.2],     // T1-2 chicane
      [255, -105, 3, 0.35],    // Fast street section
      [245, 35, 5, 0.4, 10],   // La Monumental banked sweeping hairpin!
      [155, 125, 4, 0.35, 8],
      [55, 195, 0, 0.25],      // Underpass exit
      [-55, 225, 1, 0.22],     // Technical chicane
      [-155, 165, 2, 0.22],    // 90° street corners
      [-235, 115, 2, 0.22],
      [-245, -15, 1, 0.22],
      [-215, -155, 0, 0.22],   // Final 90° onto IFEMA straight
    ]),
  },
  {
    id: 'red-bull-ring',
    name: 'Red Bull Ring (Spielberg)',
    shortName: 'Spielberg',
    country: 'Austria',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#252a33',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#f8fafc',
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 10,
    // Steep Climb Front Straight -> Niki Lauda T1 90° -> Steep Uphill Blast -> Remus T3 Hairpin -> Downhill to Rauch T4 -> T6-7-8 -> Rindt T9-10
    waypoints: pts([
      [-125, -210, 2, 0.3],
      [105, -210, 8, 0.25],    // Steep uphill pit straight
      [215, -205, 10, 0.18],   // Turn 1 Niki Lauda 90° right
      [255, -55, 19, 0.28],    // Steepest uphill drag in F1 (+19m)
      [245, 105, 20, 0.16],    // Turn 3 Remus sharp uphill hairpin!
      [135, 95, 16, 0.26],     // Downhill blast to T4
      [25, 195, 8, 0.18],      // Turn 4 Rauch 90° right braking
      [-115, 175, 5, 0.3],     // Turn 6-7 fast lefts
      [-235, 95, 3, 0.28],     // Turn 9 Rindt fast right
      [-235, -65, 1, 0.28],    // Turn 10 final right
      [-195, -195, 1, 0.26],
    ]),
  },
  {
    id: 'hungaroring',
    name: 'Hungaroring',
    shortName: 'Hungaroring',
    country: 'Hungary',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#262b33',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#ef4444',
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 14,
    // Pit Straight -> T1 Hairpin -> T2 Downhill Hairpin -> T4 Blind Crest -> T5 -> T6-7 Chicane -> T8-11 Flowing Esses -> T12-14 Stadium Hairpins
    waypoints: pts([
      [-115, -225, 4, 0.3],
      [105, -225, 4, 0.24],    // Pit straight
      [215, -215, 3, 0.18],    // Turn 1 hairpin right
      [195, -115, 0, 0.2],     // Turn 2 downhill hairpin left
      [255, -25, 3, 0.3],      // Turn 4 blind uphill left
      [185, 55, 6, 0.42],      // Turn 5 right
      [110, 88, 5, 0.48],      // Turn 6-7 tight chicane!
      [175, 165, 4, 0.4],      // Turn 8-9 sweeping right-left
      [55, 225, 3, 0.3],       // Turn 11 fast right
      [-85, 195, 2, 0.28],     // Turn 12 90° right
      [-145, 125, 2, 0.3],     // Turn 13 long 180° hairpin left
      [-235, 25, 3, 0.28],     // Turn 14 final hairpin right!
      [-205, -175, 4, 0.3],
    ]),
  },
  {
    id: 'zandvoort',
    name: 'Circuit Zandvoort',
    shortName: 'Zandvoort',
    country: 'Netherlands',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'coastal',
    asphaltColor: '#292e36',
    kerbPrimary: '#f97316',
    kerbSecondary: '#ffffff',
    trackWidth: 16,
    targetLapSeconds: 39,
    corners: 14,
    // Pit Straight -> Tarzanbocht 180° Hairpin -> Gerlach -> Hugenholtz Banked Bowl (18°) -> Scheivlak Blind Crest -> Marlboro/Hans Ernst Hairpin -> Arie Luyendyk 18° Banked Final Bowl!
    waypoints: pts([
      [-115, -225, 0, 0.32],
      [95, -225, 0, 0.32],     // Pit straight
      [205, -215, 1, 0.36],    // Tarzanbocht 180° hairpin entry!
      [212, -168, 1.5, 0.36],  // Tarzanbocht hairpin exit
      [142, -142, 2, 0.32],    // Gerlachbocht
      [95, -92, 3, 0.32, 16],  // Hugenholtzbocht banked 16° bowl!
      [175, -15, 7, 0.3],      // Hunzerug uphill
      [235, 95, 10, 0.35],     // Scheivlak blind downhill crest
      [165, 195, 4, 0.3],      // Mastersbocht
      [45, 225, 3, 0.24],      // Turn 9-10 hairpin
      [-85, 195, 2, 0.2],      // Hans Ernst chicane
      [-205, 135, 2, 0.32],    // Kumho corner
      [-265, -25, 5, 0.45, 18],// Arie Luyendykbocht steep 18° banked bowl!
      [-215, -195, 2, 0.38, 12],
    ]),
  },
  {
    id: 'paul-ricard',
    name: 'Circuit Paul Ricard (Le Castellet)',
    shortName: 'Paul Ricard',
    country: 'France',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#262b35',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#ef4444',
    trackWidth: 18.5,
    targetLapSeconds: 38,
    corners: 15,
    // Pit Straight -> Verrerie S-Chicane -> Sainte-Baume -> Mistral Straight -> North Chicane -> Signes High-Speed Right -> Beausset Double-Right
    waypoints: pts([
      [-125, -225, 0, 0.3],
      [105, -225, 0, 0.25],    // Pit straight
      [215, -205, 0, 0.22],    // Verrerie S-chicane
      [245, -125, 1, 0.22],    // T3-T4
      [175, -45, 2, 0.24],     // Sainte-Baume hairpin
      [245, 75, 2, 0.28],      // Mistral Straight pt 1
      [265, 185, 2, 0.2],      // Mistral North Chicane!
      [155, 235, 2, 0.3],      // Mistral Straight pt 2
      [-45, 255, 2, 0.35],     // Signes ultra-fast right!
      [-165, 205, 2, 0.3],     // Double-Right du Beausset
      [-125, 105, 1, 0.24],    // Bendor
      [-225, 45, 1, 0.24],     // Virage du Pont chicane
      [-235, -145, 0, 0.24],   // Final turn onto pit straight
    ]),
  },
  {
    id: 'baku',
    name: 'Baku City Circuit',
    shortName: 'Baku',
    country: 'Azerbaijan',
    region: 'Europe',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'coastal',
    asphaltColor: '#242932',
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#ef4444',
    trackWidth: 15,
    targetLapSeconds: 40,
    corners: 20,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // 2.2km Main Straight -> T1 90° Left -> T2 90° Left -> T3 90° Left -> Old City Narrow Uphill Castle Chicane (T8-11) -> Long Coastal Kink Straight!
    waypoints: pts([
      [-155, 220, 0, 0.32],
      [135, 220, 0, 0.28],     // Iconic 2.2km Main Straight
      [235, 210, 0, 0.26],     // T1 90° left braking
      [235, 95, 0, 0.26],      // T2 90° left
      [135, 95, 0, 0.26],      // T3 90° left
      [135, -15, 1, 0.26],     // T4-T6 chicane
      [215, -75, 2, 0.26],     // T7 90° right
      [165, -165, 7, 0.26],    // T8-T10 Ultra-narrow uphill Old Castle section!
      [65, -205, 8, 0.28],     // T11-T12 castle exit
      [-25, -175, 5, 0.3],     // Fast downhill kinks (T13-15)
      [-135, -185, 1, 0.26],   // T16 90° left onto Caspian Coastal blast!
      [-255, -85, 0, 0.35],    // Flat-out coastal kinks T17-20
      [-235, 155, 0, 0.3],     // Back onto 2.2km main straight
    ]),
  },
  {
    id: 'portimao',
    name: 'Autódromo Internacional do Algarve (Portimão)',
    shortName: 'Portimão',
    country: 'Portugal',
    region: 'Europe',
    seriesTags: ['WEC', 'F1'],
    flagship: false,
    scenery: 'desert',
    asphaltColor: '#282d36',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#facc15',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 15,
    // Rollercoaster Main Straight -> T1 Blind Crest -> T3 Hairpin -> Steep Plunge T5 Hairpin -> Blind Uphill T8 -> T10-13 -> T15 Long Sweeper
    waypoints: pts([
      [-125, -220, 8, 0.3],
      [105, -220, 12, 0.26],   // Steep rollercoaster front straight
      [215, -195, 10, 0.24],   // T1-2 downhill right
      [235, -95, 2, 0.18],     // T3 steep hairpin!
      [145, -35, 7, 0.28],     // T4 uphill crest
      [185, 55, 1, 0.18],      // T5 bottom of valley hairpin
      [225, 155, 13, 0.3],     // Steep climb to T8 blind crest (+13m)
      [115, 225, 10, 0.24],    // T10-11 double right
      [-15, 185, 5, 0.22],     // T13 hairpin
      [-155, 215, 2, 0.32],    // T14
      [-255, 95, 4, 0.42],     // T15 massive sweeping final right
      [-215, -175, 8, 0.35],   // Onto pit straight over crest
    ]),
  },

  // ==================== ASIA, MIDDLE EAST & OCEANIA (9 tracks) ====================
  {
    id: 'fuji',
    name: 'Fuji Speedway',
    shortName: 'Fuji',
    country: 'Japan',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['WEC'],
    flagship: false,
    scenery: 'forest',
    asphaltColor: '#252a33',
    kerbPrimary: '#2563eb',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 16,
    // Iconic 1.5km Pit Straight -> T1 Hairpin -> Coca-Cola Left -> 100R Long Sweeper -> Hairpin -> 300R -> Dunlop Chicane -> Technical Sector 3
    waypoints: pts([
      [-155, -225, 0, 0.3],
      [145, -225, 0, 0.32],    // Massive 1.5km Fuji front straight
      [246, -210, 0, 0.36],    // T1 tight hairpin right
      [214, -125, 1, 0.32],    // Coca-Cola Corner
      [275, -15, 3, 0.45],     // 100R long high-speed sweeper
      [215, 105, 5, 0.34],     // Advan Hairpin!
      [95, 155, 6, 0.34],      // 300R fast sweep
      [-25, 225, 4, 0.32],     // Dunlop Chicane
      [-115, 185, 3, 0.32],    // Sector 3 technical hairpin 1
      [-185, 215, 2, 0.32],    // Technical hairpin 2
      [-245, 115, 1, 0.3],     // Panasonic Corner
      [-225, -175, 0, 0.3],    // Onto 1.5km front straight
    ]),
  },
  {
    id: 'shanghai',
    name: 'Shanghai International Circuit',
    shortName: 'Shanghai',
    country: 'China',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#262b33',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#facc15',
    trackWidth: 18,
    targetLapSeconds: 39,
    corners: 16,
    // Pit Straight -> Iconic Snail Spiral T1-2-3-4 -> T6 Hairpin -> High-Speed T7-8 -> T11-12 -> 1.1km Back Straight -> T14 Hairpin -> T16
    waypoints: pts([
      [-125, -225, 0, 0.32],
      [105, -225, 2, 0.32],    // Pit straight
      [235, -195, 3, 0.38],    // Iconic Snail Corner T1 entry
      [265, -115, 2, 0.34],    // Snail tightening T2
      [205, -85, 1, 0.34],     // Snail T3-T4 exit
      [145, -135, 1, 0.36],    // T5
      [95, -55, 2, 0.34],      // T6 Hairpin!
      [185, 35, 3, 0.35],      // T7-T8 sweeping esses
      [225, 145, 2, 0.24],     // T9-T10
      [115, 195, 1, 0.2],      // T11-T13 banked snail onto Back Straight
      [-85, 235, 0, 0.28],     // 1.1km Back Straight
      [-225, 205, 0, 0.18],    // Turn 14 tight hairpin!
      [-265, 65, 0, 0.26],     // T15
      [-225, -175, 0, 0.22],   // T16 90° left onto pit straight
    ]),
  },
  {
    id: 'singapore',
    name: 'Marina Bay Street Circuit',
    shortName: 'Singapore',
    country: 'Singapore',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#1f242c',
    kerbPrimary: '#ef4444',
    kerbSecondary: '#f8fafc',
    trackWidth: 15.5,
    targetLapSeconds: 40,
    corners: 19,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Pit Straight -> T1-3 Sheares Chicane -> Memorial T5 (R) -> Raffles Blvd -> T7 90° Left -> Esplanade Bridge -> Bayfront Street Grid
    waypoints: pts([
      [-125, 220, 0, 0.32],
      [95, 220, 0, 0.28],      // Pit straight
      [205, 205, 0, 0.26],     // Sheares T1-3 chicane
      [245, 115, 0, 0.28],     // T5 90° right onto Raffles Blvd
      [235, -35, 0, 0.3],      // Raffles Blvd straight
      [175, -115, 0, 0.26],    // T7 90° left braking!
      [115, -75, 0, 0.26],     // T8-9 90° street sequence
      [55, -165, 0, 0.28],     // Anderson Bridge
      [-45, -195, 0, 0.26],    // T13 Hairpin!
      [-135, -155, 0, 0.28],   // Esplanade Waterfront straight
      [-235, -125, 0, 0.26],   // T16-17 Stadium chicane
      [-245, 15, 0, 0.28],     // T18-19 under grandstand
      [-205, 175, 0, 0.28],    // Final kink onto pit straight
    ]),
  },
  {
    id: 'sepang',
    name: 'Petronas Sepang International Circuit',
    shortName: 'Sepang',
    country: 'Malaysia',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'stadium',
    asphaltColor: '#272c35',
    kerbPrimary: '#06b6d4',
    kerbSecondary: '#facc15',
    trackWidth: 18.5,
    targetLapSeconds: 39,
    corners: 15,
    // Twin Parallel Straights (Pit Straight + Back Straight) connected by T15 Hairpin & T1-2 Hairpin!
    waypoints: pts([
      [-135, -225, 0, 0.3],
      [125, -225, 0, 0.32],    // Main Pit Straight
      [238, -216, 1, 0.58],    // T1 Pangkor Laut tight hairpin entry
      [254, -170, 1, 0.66],    // T1/T2 hairpin arc
      [164, -120, 1, 0.78],    // T2 downhill left
      [280, -40, 2, 0.60],     // T3 fast right
      [215, 45, 3, 0.32],      // T4 90° right
      [245, 165, 3, 0.38],     // T5-T6 ultra-fast S-curves
      [125, 225, 2, 0.32],     // T7-T8 double-right
      [-15, 185, 1, 0.32],     // T9 tight hairpin left
      [-115, 215, 2, 0.32],    // T11-12
      [-245, 145, 1, 0.32],    // Back straight braking zone
      [-265, -25, 0, 0.32],    // Back straight parallel to pit straight!
      [-244, -178, 0, 0.36],   // T15 tight hairpin onto pit straight!
      [-202, -218, 0, 0.34],   // T15 exit
    ]),
  },
  {
    id: 'bahrain',
    name: 'Bahrain International Circuit (Sakhir)',
    shortName: 'Bahrain',
    country: 'Bahrain',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'desert',
    asphaltColor: '#2a2e36',
    kerbPrimary: '#dc2626',
    kerbSecondary: '#ffffff',
    trackWidth: 18,
    targetLapSeconds: 38,
    corners: 15,
    // Pit Straight -> T1 Tight Hairpin -> T4 Hairpin -> T5-7 Esses -> T8 Hairpin -> T9-10 Off-Camber Lockup Hairpin -> Back Straight -> T11 -> T13 -> T14
    waypoints: pts([
      [-135, -225, 0, 0.32],
      [125, -225, 0, 0.32],    // Pit straight
      [230, -214, 0, 0.36],    // Turn 1 tight right hairpin!
      [236, -166, 0.5, 0.36],  // T1/T2 hairpin exit
      [185, -135, 1, 0.32],    // Turn 2-3 blast
      [255, -25, 2, 0.3],      // Turn 4 90° right braking
      [195, 65, 2, 0.32],      // Turn 5-7 flowing esses
      [242, 152, 1, 0.36],     // Turn 8 hairpin entry
      [202, 184, 1, 0.36],     // Turn 8 hairpin apex
      [125, 155, 1, 0.32],     // Turn 9
      [35, 215, 0, 0.3],       // Turn 10 iconic off-camber hairpin!
      [-115, 215, 1, 0.28],    // Back straight
      [-225, 155, 2, 0.26],    // Turn 11 fast left
      [-255, 35, 2, 0.24],     // Turn 12-13 right
      [-225, -145, 0, 0.2],    // Turn 14 braking onto pit straight
      [-185, -215, 0, 0.24],
    ]),
  },
  {
    id: 'jeddah',
    name: 'Jeddah Corniche Circuit',
    shortName: 'Jeddah',
    country: 'Saudi Arabia',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#21262f',
    kerbPrimary: '#16a34a',
    kerbSecondary: '#ffffff',
    trackWidth: 16.5,
    targetLapSeconds: 39,
    corners: 27,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Pit Straight -> T1-2 Chicane -> High-Speed Flowing Corniche Kinks (T4-12) -> T13 Banked 180° Left Hairpin -> T16-26 Blind Street Sweepers -> T27 Left Hairpin
    waypoints: pts([
      [-125, 210, 0, 0.32],
      [105, 210, 0, 0.28],     // Pit straight
      [205, 195, 0, 0.26],     // T1-2 chicane
      [255, 115, 0, 0.35],     // High-speed flowing T4-T6
      [235, 15, 0, 0.35],      // T7-T9 blind wall kinks
      [275, -95, 0, 0.35],     // T10-T12
      [225, -205, 1, 0.28, 12], // T13 iconic 12° banked 180° left hairpin!
      [125, -175, 0, 0.32],    // T14-T15
      [15, -215, 0, 0.35],     // High-speed sweepers T16-T21
      [-115, -175, 0, 0.35],   // T22-T24 fast chicane
      [-225, -115, 0, 0.34],   // T25-T26
      [-255, 75, 0, 0.28],     // Long straight to T27
      [-225, 195, 0, 0.26],    // T27 final left hairpin onto pit straight!
    ]),
  },
  {
    id: 'lusail',
    name: 'Lusail International Circuit',
    shortName: 'Lusail',
    country: 'Qatar',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1', 'WEC'],
    flagship: false,
    scenery: 'desert',
    asphaltColor: '#282c34',
    kerbPrimary: '#9f1239',
    kerbSecondary: '#f8fafc',
    trackWidth: 18,
    targetLapSeconds: 37,
    corners: 16,
    // 1.06km Pit Straight -> T1 90° -> T2 -> T4-5 -> T6 Hairpin -> T10 Hairpin -> T12-14 Triple-Apex Right -> T16
    waypoints: pts([
      [-135, -225, 0, 0.3],
      [125, -225, 0, 0.28],    // 1.06km pit straight
      [235, -205, 0, 0.26],    // Turn 1 90° right
      [205, -115, 0, 0.28],    // Turn 2 left
      [265, -15, 0, 0.35],     // Turn 4-5 fast sweepers
      [225, 105, 0, 0.26],     // Turn 6 hairpin!
      [115, 145, 0, 0.28],     // T7-T9
      [35, 215, 0, 0.26],      // Turn 10 tight left hairpin
      [-115, 215, 0, 0.42],    // Iconic Triple-Apex Right (T12-T13-T14)!
      [-235, 125, 0, 0.38],
      [-255, -45, 0, 0.3],     // T15
      [-215, -195, 0, 0.28],   // T16 right onto main straight
    ]),
  },
  {
    id: 'yas-marina',
    name: 'Yas Marina Circuit',
    shortName: 'Yas Marina',
    country: 'UAE',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'street-night',
    asphaltColor: '#232831',
    kerbPrimary: '#0284c7',
    kerbSecondary: '#ffffff',
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 16,
    // Counter-Clockwise layout matching RacingCircuits.info:
    // Pit Straight -> T1 90° Left -> T2-4 Esses -> T5 Left Hairpin -> 1.2km Back Straight -> T6-7 Chicane -> T9 Banked Left Hairpin -> W Hotel Section -> T16
    waypoints: pts([
      [-125, 220, 0, 0.32],
      [95, 220, 0, 0.28],      // Pit straight
      [195, 205, 0, 0.26],     // Turn 1 90° left
      [245, 115, 2, 0.34],     // T2-T4 high-speed esses
      [225, -15, 1, 0.26],     // Turn 5 hairpin!
      [185, -135, 0, 0.3],     // 1.2km Back straight
      [25, -215, 0, 0.26],     // T6-T7 tight chicane!
      [-115, -215, 0, 0.32],   // Second straight
      [-225, -165, 1, 0.3, 7], // Turn 9 banked Marsa hairpin
      [-255, -45, 0, 0.26],    // W Hotel Marina underpass section
      [-215, 75, 0, 0.26],     // T13-14 90° hotel bends
      [-205, 195, 0, 0.28],    // T16 onto pit straight
    ]),
  },
  {
    id: 'albert-park',
    name: 'Albert Park Circuit (Melbourne)',
    shortName: 'Melbourne',
    country: 'Australia',
    region: 'Asia-Pacific & Middle East',
    seriesTags: ['F1'],
    flagship: false,
    scenery: 'parkland',
    asphaltColor: '#262b34',
    kerbPrimary: '#facc15',
    kerbSecondary: '#16a34a',
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 14,
    // Pit Straight -> Jones Chicane (T1-2) -> T3 Hairpin -> T6 Fast Right -> Lakeside Straight -> High-Speed T9-10 Chicane -> T11 -> T13 -> T14
    waypoints: pts([
      [-115, -220, 0, 0.3],
      [95, -220, 0, 0.24],     // Pit straight
      [195, -205, 0, 0.2],     // T1-2 Jones chicane
      [245, -115, 0, 0.18],    // T3-4 tight hairpin complex
      [215, -15, 0, 0.26],     // T5-6 fast right
      [235, 115, 0, 0.3],      // Lakeside curved straight
      [145, 195, 0, 0.28],     // Ultra-fast T9-T10 chicane!
      [15, 225, 0, 0.24],      // T11 90° left braking
      [-115, 195, 0, 0.22],    // T12
      [-225, 125, 0, 0.2],     // T13 90° right
      [-235, -35, 0, 0.26],    // T14
      [-195, -185, 0, 0.24],   // Final bend onto pit straight
    ]),
  },
];

export function getTrackById(id: string): TrackSpec {
  const custom = getCustomTrackById(id);
  if (custom) return custom;
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

export function getTracksByRegion(region: TrackRegion): TrackSpec[] {
  return TRACKS.filter((t) => t.region === region);
}

export interface SampledSplinePoint {
  x: number;
  y: number;
  z: number;
  tx: number; // unit tangent x
  ty: number;
  tz: number; // unit tangent z
  nx: number; // unit right normal x (in XZ plane)
  nz: number; // unit right normal z
  s: number; // cumulative arc length
  t: number; // normalized 0..1 progress
  curvature: number; // signed horizontal curvature
  banking?: number; // banking angle in radians
  width?: number; // local track width
}

export interface CompiledTrack {
  spec: TrackSpec;
  samples: SampledSplinePoint[];
  totalLength: number;
  pitEntryT: number;
  pitExitT: number;
  pitOffset: number; // lateral offset of pit lane (+right / -left)
}

/**
 * C^1-continuous Hermite Catmull-Rom with per-node tension support (0.15 tight .. 0.85 sweeping).
 * When tau1 = tau2 = 0.5, matches classic uniform Catmull-Rom identically.
 */
function hermiteCatmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
  tau1 = 0.5,
  tau2 = 0.5,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const m1 = tau1 * (p2 - p0);
  const m2 = tau2 * (p3 - p1);
  return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
}

function centripetalHermitePoint(
  p0: { x: number; z: number },
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  p3: { x: number; z: number },
  t: number,
  tau1 = 0.5,
  tau2 = 0.5,
): { x: number; z: number } {
  const dt0 = Math.sqrt(Math.max(12, Math.hypot(p1.x - p0.x, p1.z - p0.z)));
  const dt1 = Math.sqrt(Math.max(12, Math.hypot(p2.x - p1.x, p2.z - p1.z)));
  const dt2 = Math.sqrt(Math.max(12, Math.hypot(p3.x - p2.x, p3.z - p2.z)));

  const k1 = 0.72 + tau1 * 0.68;
  const k2 = 0.72 + tau2 * 0.68;

  const m1x =
    k1 *
    dt1 *
    ((p1.x - p0.x) / dt0 - (p2.x - p0.x) / (dt0 + dt1) + (p2.x - p1.x) / dt1);
  const m1z =
    k1 *
    dt1 *
    ((p1.z - p0.z) / dt0 - (p2.z - p0.z) / (dt0 + dt1) + (p2.z - p1.z) / dt1);

  const m2x =
    k2 *
    dt1 *
    ((p2.x - p1.x) / dt1 - (p3.x - p1.x) / (dt1 + dt2) + (p3.x - p2.x) / dt2);
  const m2z =
    k2 *
    dt1 *
    ((p2.z - p1.z) / dt1 - (p3.z - p1.z) / (dt1 + dt2) + (p3.z - p2.z) / dt2);

  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return {
    x: h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x,
    z: h00 * p1.z + h10 * m1z + h01 * p2.z + h11 * m2z,
  };
}

/**
 * Compiles track waypoints into a dense, arc-length-uniformly-resampled closed racing spline.
 * Uses >= 1,200 arc-length divisions + centripetal Catmull-Rom so hairpins never cusp or pinch.
 */
export function compileTrack(spec: TrackSpec, sampleCount = 480): CompiledTrack {
  let ptsArr = spec.waypoints;
  if (spec.startNodeIndex !== undefined && spec.startNodeIndex > 0 && spec.startNodeIndex < ptsArr.length) {
    const head = ptsArr.slice(spec.startNodeIndex);
    const tail = ptsArr.slice(0, spec.startNodeIndex);
    ptsArr = [...head, ...tail];
  }
  const n = ptsArr.length;
  const denseCount = Math.max(1200, n * 60);
  const dense: Array<{ x: number; y: number; z: number; banking: number; width: number }> = [];

  for (let i = 0; i < denseCount; i++) {
    const u = (i / denseCount) * n;
    const seg = Math.floor(u) % n;
    const localT = u - Math.floor(u);
    const p0 = ptsArr[(seg - 1 + n) % n];
    const p1 = ptsArr[seg];
    const p2 = ptsArr[(seg + 1) % n];
    const p3 = ptsArr[(seg + 2) % n];

    const tau1 = Math.max(0.15, Math.min(0.85, p1.tension ?? 0.5));
    const tau2 = Math.max(0.15, Math.min(0.85, p2.tension ?? 0.5));

    const bank0 = (p0.banking || 0) * (Math.PI / 180);
    const bank1 = (p1.banking || 0) * (Math.PI / 180);
    const bank2 = (p2.banking || 0) * (Math.PI / 180);
    const bank3 = (p3.banking || 0) * (Math.PI / 180);

    const w0 = p0.width || spec.trackWidth;
    const w1 = p1.width || spec.trackWidth;
    const w2 = p2.width || spec.trackWidth;
    const w3 = p3.width || spec.trackWidth;

    const xz = centripetalHermitePoint(p0, p1, p2, p3, localT, tau1, tau2);
    dense.push({
      x: xz.x,
      y: hermiteCatmullRom(p0.y, p1.y, p2.y, p3.y, localT, 0.5, 0.5),
      z: xz.z,
      banking: hermiteCatmullRom(bank0, bank1, bank2, bank3, localT, 0.5, 0.5),
      width: hermiteCatmullRom(w0, w1, w2, w3, localT, 0.5, 0.5),
    });
  }

  // Cumulative 3D arc length table across dense points (closing back to index 0)
  const denseCumLen: number[] = [0];
  let totalLength = 0;
  for (let i = 1; i <= denseCount; i++) {
    const a = dense[i - 1];
    const b = dense[i % denseCount];
    totalLength += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    denseCumLen.push(totalLength);
  }

  // Uniform arc-length resampling into `sampleCount` points
  const raw: Array<{ x: number; y: number; z: number; banking: number; width: number; s: number }> = [];
  let cursor = 0;
  for (let k = 0; k < sampleCount; k++) {
    const targetS = (k / sampleCount) * totalLength;
    while (cursor < denseCount - 1 && denseCumLen[cursor + 1] < targetS) {
      cursor++;
    }
    const s0 = denseCumLen[cursor];
    const s1 = denseCumLen[cursor + 1];
    const alpha = s1 > s0 ? (targetS - s0) / (s1 - s0) : 0;
    const a = dense[cursor];
    const b = dense[(cursor + 1) % denseCount];
    raw.push({
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
      banking: a.banking + (b.banking - a.banking) * alpha,
      width: a.width + (b.width - a.width) * alpha,
      s: targetS,
    });
  }

  const samples: SampledSplinePoint[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const prev = raw[(i - 1 + sampleCount) % sampleCount];
    const curr = raw[i];
    const next = raw[(i + 1) % sampleCount];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const tx = dx / len;
    const ty = dy / len;
    const tz = dz / len;

    // Right-hand normal in XZ plane
    const xzLen = Math.hypot(tx, tz) || 1;
    const nx = -tz / xzLen;
    const nz = tx / xzLen;

    // True geometric inverse-radius curvature (1/R in 1/m) in XZ plane
    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const crossY = ax * bz - az * bx;
    const segLen = (Math.hypot(ax, az) + Math.hypot(bx, bz)) * 0.5 || 1;
    const curvature = crossY / (segLen * segLen * segLen);

    samples.push({
      x: curr.x,
      y: curr.y,
      z: curr.z,
      tx,
      ty,
      tz,
      nx,
      nz,
      s: curr.s,
      t: curr.s / totalLength,
      curvature,
      banking: curr.banking,
      width: curr.width,
    });
  }

  const pitSign = spec.pitSide === 'right' ? 1 : -1;
  const pitOffset = pitSign * (spec.trackWidth * 0.5 + 8.5);

  return {
    spec,
    samples,
    totalLength,
    pitEntryT: 0.90,
    pitExitT: 0.08,
    pitOffset,
  };
}

export function sampleTrackAtT(compiled: CompiledTrack, tRaw: number): SampledSplinePoint {
  const t = ((tRaw % 1) + 1) % 1;
  const n = compiled.samples.length;
  const fIdx = t * n;
  const i0 = Math.floor(fIdx) % n;
  const i1 = (i0 + 1) % n;
  const alpha = fIdx - Math.floor(fIdx);
  const a = compiled.samples[i0];
  const b = compiled.samples[i1];
  const tx = a.tx + (b.tx - a.tx) * alpha;
  const ty = a.ty + (b.ty - a.ty) * alpha;
  const tz = a.tz + (b.tz - a.tz) * alpha;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  const utx = tx / tLen;
  const utz = tz / tLen;
  const xzLen = Math.hypot(utx, utz) || 1;
  const banking = (a.banking || 0) + ((b.banking || 0) - (a.banking || 0)) * alpha;
  const width =
    (a.width || compiled.spec.trackWidth) +
    ((b.width || compiled.spec.trackWidth) - (a.width || compiled.spec.trackWidth)) * alpha;

  return {
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    z: a.z + (b.z - a.z) * alpha,
    tx: utx,
    ty: ty / tLen,
    tz: utz,
    nx: -utz / xzLen,
    nz: utx / xzLen,
    s: t * compiled.totalLength,
    t,
    curvature: a.curvature + (b.curvature - a.curvature) * alpha,
    banking,
    width,
  };
}

/**
 * Projects a world XZ position onto the closest compiled track spline sample.
 */
export function projectOntoTrack(
  compiled: CompiledTrack,
  x: number,
  z: number,
  hintT?: number,
): {
  sample: SampledSplinePoint;
  lateralOffset: number; // positive = right of centerline, negative = left
  distanceSq: number;
} {
  const samples = compiled.samples;
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintT !== undefined) {
    const centerIdx = Math.floor((((hintT % 1) + 1) % 1) * n);
    const windowRadius = 34;
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      const i = (centerIdx + offset + n) % n;
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    if (bestDistSq > 1600) {
      for (let i = 0; i < n; i++) {
        const dx = x - samples[i].x;
        const dz = z - samples[i].z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
  }

  const s = samples[bestIdx];
  const dx = x - s.x;
  const dz = z - s.z;
  const lateralOffset = dx * s.nx + dz * s.nz;
  return { sample: s, lateralOffset, distanceSq: bestDistSq };
}
