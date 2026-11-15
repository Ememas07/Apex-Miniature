import { SceneryTheme, TrackRegion, TrackSpec, TrackWaypoint } from './types';
import { getCustomTrackById } from './customTracks';

function pts(coords: Array<[number, number, number?]>): TrackWaypoint[] {
  return coords.map(([x, z, y = 0]) => ({ x, y, z }));
}

/**
 * Generates a unique, non-intersecting closed circuit silhouette from a deterministic seed
 * and corner profile for catalog circuits outside the 10 flagship bespoke circuits.
 * Coordinates are scaled so standard circuits average ~1800m length and 38-52s lap time.
 */
function generateCircuitShape(
  seed: number,
  rx: number,
  rz: number,
  lobes: number,
  chicanes: number,
  elevationAmp: number,
): TrackWaypoint[] {
  const scaledRx = rx * 1.52;
  const scaledRz = rz * 1.52;
  const count = 22;
  const out: TrackWaypoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    // Keep indices 0, 1, 2 and count-1 aligned on a clean pit straight along z = -scaledRz * 0.9
    if (i === 0 || i === 1 || i === count - 1) {
      const straightX = i === count - 1 ? -scaledRx * 0.35 : i === 0 ? 0 : scaledRx * 0.35;
      out.push({ x: straightX, y: 0, z: -scaledRz * 0.88 });
      continue;
    }
    const harmonic1 = Math.sin(t * lobes + seed * 1.3) * 0.16;
    const harmonic2 = Math.cos(t * (lobes + 1) - seed * 0.7) * (0.08 + chicanes * 0.018);
    const rScale = 0.86 + harmonic1 + harmonic2;
    const x = Math.sin(t) * scaledRx * rScale;
    const z = -Math.cos(t) * scaledRz * rScale;
    const y = Math.max(0, Math.sin(t * 2 + seed) * elevationAmp * 1.4);
    out.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      z: Math.round(z * 10) / 10,
    });
  }
  return out;
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
    targetLapSeconds: 70, // Authentic endurance/F1 lap scaling (~65-75s)
    corners: 19,
    // Authentic Spa: Pit Straight -> La Source Hairpin -> Eau Rouge/Raidillon Climb -> Kemmel Straight -> Les Combes -> Bruxelles -> Pouhon -> Blanchimont -> Bus Stop
    waypoints: pts([
      [-140, -425, 0],   // Start / Finish line
      [105, -425, 0],    // Pit straight
      [280, -400, 1],    // La Source braking zone
      [335, -295, 2],    // La Source hairpin apex & exit
      [385, -135, 12],   // Downhill plunge to Eau Rouge compression
      [455, 65, 30],     // Raidillon uphill climb crest (+30m)
      [530, 305, 26],    // Kemmel Straight flat-out high speed
      [495, 410, 22],    // Les Combes right-left chicane entry
      [400, 425, 20],    // Les Combes exit / Malmedy
      [235, 335, 16],    // Bruxelles downhill hairpin
      [165, 375, 12],    // Speaker's Corner
      [90, 460, 9],      // Double-left Pouhon entry
      [-110, 470, 7],    // Pouhon exit
      [-230, 390, 5],    // Pif-Paf / Fagnes chicane
      [-305, 330, 5],    // Campus / Stavelot
      [-410, 120, 3],    // Blanchimont fast sweeping entry
      [-375, -170, 2],   // Blanchimont exit
      [-295, -340, 0],   // Bus Stop chicane entry braking
      [-230, -410, 0],   // Bus Stop chicane exit onto pit straight
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
    // Authentic Daytona Road: Tri-oval Front Stretch -> Infield Turn 1-2 -> International Horseshoe -> West Horseshoe -> Oval Banking Turns 1-2 -> Backstretch -> Le Mans Bus Stop -> Oval Banking Turns 3-4
    waypoints: pts([
      [-110, -265, 0],
      [95, -265, 0],     // Tri-oval front stretch
      [240, -230, 4],    // Turn 1 banking entry
      [255, -135, 1],    // Infield dive
      [150, -70, 0],     // International Horseshoe hairpin
      [185, 50, 0],      // Turn 5 dogleg
      [90, 120, 0],      // West Horseshoe
      [-30, 70, 0],      // Infield exit
      [-150, 215, 7],    // NASCAR Oval Banking Turns 1-2!
      [-280, 150, 7],    // Oval Superstretch flat out
      [-305, -25, 5],    // Le Mans Bus Stop Chicane
      [-270, -175, 7],   // NASCAR Oval Banking Turns 3-4!
      [-215, -250, 3],   // Tri-oval chute
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
    // Authentic Laguna Seca: Front Straight -> Andretti Hairpin -> Turn 3-4 -> Uphill Turn 5-6 -> Rahal Straight Crest -> THE CORKSCREW Plunge (-17m drop) -> Rainey Curve -> Turn 10 -> Turn 11 Hairpin
    waypoints: pts([
      [-85, -225, 0],
      [85, -225, 0],     // Front straight
      [205, -195, 2],    // Andretti Hairpin
      [165, -80, 4],     // Turn 3
      [215, 30, 7],      // Turn 4
      [150, 150, 14],    // Turn 5 uphill sweep
      [40, 245, 24],     // Rahal Straight steep uphill crest (+24m)
      [-70, 235, 22],    // The Corkscrew blind turn entry (+22m)
      [-110, 150, 7],    // Violent Corkscrew plunge drop (plunges down to +7m!)
      [-215, 85, 5],     // Rainey Curve fast left
      [-245, -45, 3],    // Turn 10 fast sweep
      [-205, -180, 0],   // Turn 11 90-degree hairpin onto front straight
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
    targetLapSeconds: 72, // Authentic 65-75s scaling for 24h classic
    corners: 21,
    // Authentic Le Mans: Pit Straight -> Dunlop Curve & Chicane -> Tertre Rouge -> Mulsanne Straight (Chicane 1 & 2) -> Mulsanne Corner -> Indianapolis -> Arnage -> Porsche Curves -> Maison Blanche -> Ford Chicanes
    waypoints: pts([
      [-165, -470, 0],
      [165, -470, 0],    // Pit straight
      [365, -430, 5],    // Dunlop Curve right
      [440, -275, 8],    // Dunlop Chicane over the bridge hill
      [418, -90, 2],     // Tertre Rouge right-hander
      [540, 175, 0],     // Mulsanne Straight section 1
      [495, 390, 0],     // First Mulsanne Chicane (Forza)
      [340, 530, 0],     // Mulsanne Straight section 2
      [260, 545, 0],     // Second Mulsanne Chicane (Michelin)
      [100, 565, 0],     // Mulsanne Corner 90-degree right
      [-120, 495, 2],    // Blast to Indianapolis
      [-290, 410, 2],    // Indianapolis bank & Arnage slow right
      [-390, 230, 5],    // Approach to Porsche Curves
      [-460, 35, 5],     // Porsche Curves sweeping esses
      [-400, -190, 2],   // Maison Blanche / Corvette corner
      [-345, -370, 0],   // Ford Chicanes double-chicane entry
      [-245, -450, 0],   // Ford Chicanes exit
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
    // Authentic Monza: Rettifilo Straight -> Variante del Rettifilo Chicane -> Curva Grande -> Variante della Roggia -> Lesmo 1 & 2 -> Curva del Serraglio -> Variante Ascari -> Backstraight -> Curva Parabolica / Alboreto
    waypoints: pts([
      [-110, -260, 0],
      [110, -260, 0],    // Rettifilo straight
      [215, -245, 0],    // Variante del Rettifilo chicane
      [265, -135, 0],    // Curva Grande sweeping right
      [230, 55, 0],      // Variante della Roggia chicane
      [185, 210, 2],     // Curva di Lesmo 1
      [75, 250, 2],      // Curva di Lesmo 2
      [-75, 210, 0],     // Curva del Serraglio straight
      [-185, 240, 0],    // Variante Ascari fast chicane
      [-265, 90, 0],     // Rettifilo back straight
      [-275, -120, 0],   // Curva Parabolica / Alboreto long sweeper
      [-210, -225, 0],   // Parabolica exit
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
    // Authentic Silverstone: Hamilton Straight -> Abbey & Farm -> Village / Loop -> Wellington Straight -> Brooklands / Luffield -> Copse -> Maggotts / Becketts / Chapel -> Hangar Straight -> Stowe -> Vale & Club
    waypoints: pts([
      [-100, -265, 0],
      [100, -265, 0],    // Hamilton Straight
      [220, -240, 0],    // Abbey
      [275, -145, 0],    // Village / The Loop
      [235, -30, 0],     // Wellington Straight
      [280, 105, 0],     // Brooklands / Luffield
      [185, 215, 2],     // Copse
      [55, 265, 3],      // Maggotts
      [-40, 200, 3],     // Becketts & Chapel
      [-120, 270, 2],    // Hangar Straight
      [-250, 210, 0],    // Stowe
      [-280, 55, 0],     // Vale
      [-240, -135, 0],   // Club corner
      [-185, -240, 0],
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
    targetLapSeconds: 48,
    corners: 18,
    // Authentic Suzuka: Front Straight -> First Turn 1-2 -> The Esses (S-Curves 3-4-5-6) -> Dunlop Curve -> Degner 1-2 -> Hairpin -> 200R -> Spoon Curve -> West Straight -> 130R -> Casio Triangle
    waypoints: pts([
      [-100, -270, 0],
      [100, -270, 0],    // Front straight
      [225, -235, 2],    // Turns 1-2 fast right
      [275, -115, 3],    // The S-Curves 1
      [215, -25, 5],     // The S-Curves 2
      [280, 90, 6],      // Dunlop Curve long uphill left
      [230, 210, 5],     // Degner 1 and 2
      [95, 250, 2],      // Hairpin slow turn 11
      [-15, 195, 3],     // 200R sweeping curve
      [-120, 280, 4],    // Spoon Curve double-left
      [-255, 215, 5],    // West Straight high speed
      [-295, 40, 3],     // 130R legendary flat-out kink
      [-255, -135, 1],   // Casio Triangle chicane
      [-200, -230, 0],   // Casio Triangle exit
    ]),
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
    // Authentic Monaco: Boulevard Albert 1er -> Sainte-Devote -> Beau Rivage Climb -> Casino Square -> Mirabeau -> Fairmont Hairpin -> Portier -> Tunnel -> Nouvelle Chicane -> Tabac -> Swimming Pool -> La Rascasse -> Anthony Noghes
    waypoints: pts([
      [-85, -225, 0],
      [85, -225, 0],     // Boulevard Albert 1er pit straight
      [190, -210, 4],    // Sainte-Devote 90-degree right
      [230, -115, 14],   // Montee du Beau Rivage climb (+14m)
      [245, 10, 16],     // Massenet / Casino Square (+16m)
      [190, 110, 12],    // Mirabeau Haute downhill
      [230, 195, 6],     // Fairmont Hairpin (slowest turn in F1!)
      [125, 235, 3],     // Mirabeau Bas & Portier
      [0, 225, 2],       // Fairmont Tunnel fast blind curve
      [-135, 220, 0],    // Nouvelle Chicane hard brake
      [-215, 135, 0],    // Tabac fast left harbour bend
      [-245, 15, 0],     // Swimming Pool S-chicane
      [-220, -120, 0],   // La Rascasse tight wrap
      [-175, -205, 0],   // Anthony Noghes tight right
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
    // Authentic COTA: Pit Straight -> Steep Uphill Hairpin Turn 1 (+22m) -> Esses 2-3-4-5-6 -> Hairpin Turn 11 -> 1km Back Straight -> Turn 12 Brake -> Stadium Section 13-15 -> Carousel 16-18 -> Turns 19-20
    waypoints: pts([
      [-95, -265, 0],
      [95, -265, 0],     // Pit straight
      [230, -245, 22],   // Turn 1 steep uphill hairpin! (+22m climb)
      [270, -120, 14],   // Esses 1
      [210, -40, 9],     // Esses 2
      [280, 55, 6],      // Esses 3
      [225, 185, 3],     // Hairpin Turn 11
      [70, 265, 1],      // 1km Back straight
      [-90, 265, 2],     // Turn 12 heavy braking
      [-175, 185, 4],    // Stadium Twist 13-15
      [-265, 210, 4],    // Carousel Turn 16-18
      [-280, 40, 3],     // Turn 19
      [-230, -150, 1],   // Turn 20 approach
      [-175, -240, 0],
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
    // Authentic Sebring: Concrete Runway Frontstretch -> Turn 1 Sweeper -> Big Bend -> Hairpin Turn 7 -> Fangio Chicane -> Tower Turn -> Ulmann Straight -> Sunset Bend 17
    waypoints: pts([
      [-95, -255, 0],
      [95, -255, 0],     // Front concrete straight
      [230, -225, 0],    // Turn 1 sweeping left
      [265, -95, 0],     // Turn 3-5
      [190, 15, 0],      // Big Bend
      [255, 135, 0],     // Hairpin Turn 7
      [145, 230, 0],     // Fangio Chicane
      [-15, 255, 0],     // Tower Turn
      [-170, 230, 0],    // Ulmann Straight
      [-265, 135, 0],    // Bishop Bend
      [-240, -15, 0],    // Le Mans Straight
      [-270, -150, 0],   // Sunset Bend!
      [-200, -230, 0],
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
    waypoints: generateCircuitShape(1.1, 155, 115, 2, 1, 1),
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
    waypoints: generateCircuitShape(1.7, 150, 120, 3, 2, 0),
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
    waypoints: generateCircuitShape(2.2, 150, 130, 3, 1, 6),
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
    waypoints: generateCircuitShape(2.9, 175, 135, 2, 2, 8),
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
    waypoints: generateCircuitShape(3.4, 165, 125, 2, 1, 10),
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
    waypoints: generateCircuitShape(4.1, 145, 110, 2, 0, 5),
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
    waypoints: generateCircuitShape(4.7, 190, 150, 3, 1, 9),
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
    waypoints: generateCircuitShape(5.3, 170, 140, 4, 1, 7),
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
    waypoints: generateCircuitShape(5.9, 170, 130, 3, 2, 0),
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
    waypoints: generateCircuitShape(6.4, 165, 135, 3, 1, 11),
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
    waypoints: generateCircuitShape(7.1, 185, 110, 2, 3, 0),
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
    waypoints: generateCircuitShape(7.8, 175, 130, 4, 2, 1),
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
    waypoints: generateCircuitShape(8.3, 195, 125, 2, 2, 0),
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
    waypoints: generateCircuitShape(8.9, 175, 130, 3, 2, 0),
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
    waypoints: generateCircuitShape(9.5, 165, 135, 3, 1, 9),
  },

  // ==================== REMAINING EUROPE (10 tracks) ====================
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
    waypoints: generateCircuitShape(10.2, 175, 125, 3, 2, 5),
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
    waypoints: generateCircuitShape(10.8, 175, 135, 3, 1, 4),
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
    waypoints: generateCircuitShape(11.3, 175, 130, 4, 2, 2),
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
    waypoints: generateCircuitShape(11.9, 165, 120, 2, 1, 10),
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
    waypoints: generateCircuitShape(12.4, 160, 140, 4, 1, 5),
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
    waypoints: generateCircuitShape(13.0, 160, 130, 3, 1, 6),
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
    waypoints: generateCircuitShape(13.6, 185, 130, 3, 2, 2),
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
    waypoints: generateCircuitShape(14.2, 195, 120, 3, 3, 3),
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
    waypoints: generateCircuitShape(14.9, 175, 135, 3, 1, 13),
  },

  // ==================== ASIA, MIDDLE EAST & OCEANIA (9 remaining + Suzuka flagship) ====================
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
    waypoints: generateCircuitShape(15.4, 185, 125, 3, 1, 6),
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
    waypoints: generateCircuitShape(16.0, 180, 140, 4, 1, 3),
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
    waypoints: generateCircuitShape(16.6, 170, 135, 4, 2, 0),
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
    waypoints: generateCircuitShape(17.1, 185, 135, 3, 2, 3),
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
    waypoints: generateCircuitShape(17.7, 175, 135, 3, 2, 2),
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
    waypoints: generateCircuitShape(18.3, 195, 115, 4, 2, 0),
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
    waypoints: generateCircuitShape(18.9, 175, 135, 3, 1, 0),
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
    waypoints: generateCircuitShape(19.5, 180, 130, 3, 2, 1),
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
    waypoints: generateCircuitShape(20.1, 175, 125, 3, 1, 0),
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

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function compileTrack(spec: TrackSpec, sampleCount = 320): CompiledTrack {
  let ptsArr = spec.waypoints;
  if (spec.startNodeIndex !== undefined && spec.startNodeIndex > 0 && spec.startNodeIndex < ptsArr.length) {
    const head = ptsArr.slice(spec.startNodeIndex);
    const tail = ptsArr.slice(0, spec.startNodeIndex);
    ptsArr = [...head, ...tail];
  }
  const n = ptsArr.length;
  const raw: Array<{ x: number; y: number; z: number; banking: number; width: number }> = [];

  for (let i = 0; i < sampleCount; i++) {
    const u = (i / sampleCount) * n;
    const seg = Math.floor(u) % n;
    const localT = u - Math.floor(u);
    const p0 = ptsArr[(seg - 1 + n) % n];
    const p1 = ptsArr[seg];
    const p2 = ptsArr[(seg + 1) % n];
    const p3 = ptsArr[(seg + 2) % n];

    const bank0 = (p0.banking || 0) * (Math.PI / 180);
    const bank1 = (p1.banking || 0) * (Math.PI / 180);
    const bank2 = (p2.banking || 0) * (Math.PI / 180);
    const bank3 = (p3.banking || 0) * (Math.PI / 180);

    const w0 = p0.width || spec.trackWidth;
    const w1 = p1.width || spec.trackWidth;
    const w2 = p2.width || spec.trackWidth;
    const w3 = p3.width || spec.trackWidth;

    raw.push({
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, localT),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, localT),
      z: catmullRom(p0.z, p1.z, p2.z, p3.z, localT),
      banking: catmullRom(bank0, bank1, bank2, bank3, localT),
      width: catmullRom(w0, w1, w2, w3, localT),
    });
  }

  let totalLength = 0;
  const cumLen: number[] = [0];
  for (let i = 1; i < sampleCount; i++) {
    const dx = raw[i].x - raw[i - 1].x;
    const dy = raw[i].y - raw[i - 1].y;
    const dz = raw[i].z - raw[i - 1].z;
    totalLength += Math.hypot(dx, dy, dz);
    cumLen.push(totalLength);
  }
  const closeDx = raw[0].x - raw[sampleCount - 1].x;
  const closeDy = raw[0].y - raw[sampleCount - 1].y;
  const closeDz = raw[0].z - raw[sampleCount - 1].z;
  totalLength += Math.hypot(closeDx, closeDy, closeDz);

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

    // Right-hand normal in XZ plane: cross(up=(0,1,0), tangent) or (-tz, tx)
    const xzLen = Math.hypot(tx, tz) || 1;
    const nx = -tz / xzLen;
    const nz = tx / xzLen;

    // Curvature estimate via signed turn angle
    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const crossY = ax * bz - az * bx;
    const segLen = (Math.hypot(ax, az) + Math.hypot(bx, bz)) * 0.5 || 1;
    const curvature = crossY / (segLen * segLen);

    samples.push({
      x: curr.x,
      y: curr.y,
      z: curr.z,
      tx,
      ty,
      tz,
      nx,
      nz,
      s: cumLen[i],
      t: cumLen[i] / totalLength,
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
    const windowRadius = 28;
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
    // Fallback full scan if car jumped far away
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
