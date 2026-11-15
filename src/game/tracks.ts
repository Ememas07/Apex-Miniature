import { SceneryTheme, TrackRegion, TrackSpec, TrackWaypoint } from './types';

function pts(coords: Array<[number, number, number?]>): TrackWaypoint[] {
  return coords.map(([x, z, y = 0]) => ({ x, y, z }));
}

/**
 * Generates a unique, non-intersecting closed circuit silhouette from a deterministic seed
 * and corner profile for catalog circuits outside the 10 flagship bespoke circuits.
 */
function generateCircuitShape(
  seed: number,
  rx: number,
  rz: number,
  lobes: number,
  chicanes: number,
  elevationAmp: number,
): TrackWaypoint[] {
  const count = 20;
  const out: TrackWaypoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    // Keep indices 0, 1, 2 and count-1 aligned on a clean pit straight along z = -rz * 0.9
    if (i === 0 || i === 1 || i === count - 1) {
      const straightX = i === count - 1 ? -rx * 0.35 : i === 0 ? 0 : rx * 0.35;
      out.push({ x: straightX, y: 0, z: -rz * 0.88 });
      continue;
    }
    const harmonic1 = Math.sin(t * lobes + seed * 1.3) * 0.16;
    const harmonic2 = Math.cos(t * (lobes + 1) - seed * 0.7) * (0.08 + chicanes * 0.018);
    const rScale = 0.86 + harmonic1 + harmonic2;
    const x = Math.sin(t) * rx * rScale;
    const z = -Math.cos(t) * rz * rScale;
    const y = Math.max(0, Math.sin(t * 2 + seed) * elevationAmp);
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
    targetLapSeconds: 42,
    corners: 19,
    // La Source -> Eau Rouge/Raidillon climb -> Kemmel Straight -> Les Combes -> Pouhon -> Blanchimont -> Bus Stop
    waypoints: pts([
      [-55, -170, 0],
      [45, -170, 0],     // Pit straight
      [115, -160, 0],    // La Source hairpin approach
      [135, -120, 1],    // La Source exit
      [155, -55, 6],     // Eau Rouge compression -> Raidillon climb
      [185, 25, 16],     // Kemmel Straight top
      [215, 125, 14],    // Les Combes braking
      [165, 165, 11],    // Malmedy
      [95, 130, 7],      // Bruxelles hairpin
      [40, 185, 4],      // Pouhon double-left
      [-45, 190, 3],     // Campus / Stavelot
      [-120, 135, 2],    // Paul Frere
      [-165, 45, 2],     // Blanchimont sweeping kink
      [-145, -70, 1],    // Blanchimont exit
      [-120, -135, 0],   // Bus Stop chicane entry
      [-95, -165, 0],    // Bus Stop exit
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
    targetLapSeconds: 38,
    corners: 12,
    waypoints: pts([
      [-70, -165, 0],
      [60, -165, 0],     // Tri-oval pit straight
      [150, -145, 3],    // Turn 1 banking entry
      [160, -85, 1],     // Turn 1 infield dive
      [95, -45, 0],      // International Horseshoe
      [115, 30, 0],      // Turn 5 kink
      [55, 75, 0],       // West Horseshoe
      [-20, 45, 0],      // Infield exit onto NASCAR 1-2
      [-95, 135, 5],     // High-speed banking
      [-175, 95, 6],     // Backstretch approach
      [-190, -15, 4],    // Le Mans Bus Stop chicane
      [-170, -110, 5],   // NASCAR Turn 3-4 banking
      [-135, -155, 2],   // Pit entry chute
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
    targetLapSeconds: 33,
    corners: 11,
    waypoints: pts([
      [-55, -145, 0],
      [55, -145, 0],     // Front straight
      [130, -125, 1],    // Andretti Hairpin
      [105, -50, 3],     // Turn 3
      [135, 20, 5],      // Turn 4
      [95, 95, 10],      // Turn 5 uphill
      [25, 155, 18],     // Rahal Straight crest
      [-45, 150, 17],    // The Corkscrew entry!
      [-70, 95, 7],      // Corkscrew plunge
      [-135, 55, 4],     // Rainey Curve
      [-155, -30, 2],    // Turn 10
      [-130, -115, 0],   // Turn 11 hairpin
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
    targetLapSeconds: 48,
    corners: 21,
    waypoints: pts([
      [-65, -185, 0],
      [65, -185, 0],     // Pit straight
      [145, -170, 2],    // Dunlop Curve
      [175, -110, 4],    // Dunlop Chicane
      [165, -35, 1],     // Tertre Rouge
      [215, 70, 0],      // Mulsanne Straight 1
      [195, 155, 0],     // Forza Chicane
      [135, 210, 0],     // Mulsanne Straight 2
      [40, 225, 0],      // Mulsanne Corner
      [-45, 195, 1],     // Indianapolis
      [-115, 165, 1],    // Arnage
      [-155, 90, 2],     // Porsche Curves entry
      [-185, 15, 2],     // Porsche Curves sweep
      [-160, -75, 1],    // Karting / Corvette
      [-140, -145, 0],   // Ford Chicanes
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
    targetLapSeconds: 34,
    corners: 11,
    waypoints: pts([
      [-70, -155, 0],
      [70, -155, 0],     // Rettifilo straight
      [135, -145, 0],    // Prima Variante chicane
      [165, -80, 0],     // Curva Grande
      [145, 35, 0],      // Variante della Roggia
      [115, 130, 1],     // Lesmo 1
      [45, 155, 1],      // Lesmo 2
      [-45, 130, 0],     // Serraglio straight
      [-115, 150, 0],    // Variante Ascari
      [-165, 55, 0],     // Back straight
      [-170, -75, 0],    // Parabolica / Alboreto entry
      [-130, -140, 0],   // Parabolica exit
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
    targetLapSeconds: 39,
    corners: 18,
    waypoints: pts([
      [-60, -165, 0],
      [60, -165, 0],     // Hamilton Straight
      [135, -150, 0],    // Abbey
      [170, -90, 0],     // Village / The Loop
      [145, -20, 0],     // Wellington Straight
      [175, 65, 0],      // Brooklands / Luffield
      [115, 135, 1],     // Copse
      [35, 165, 2],      // Maggotts
      [-25, 125, 2],     // Becketts
      [-75, 170, 1],     // Hangar Straight
      [-155, 130, 0],    // Stowe
      [-175, 35, 0],     // Vale
      [-150, -85, 0],    // Club corner
      [-115, -150, 0],
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
    targetLapSeconds: 41,
    corners: 18,
    // Non-intersecting Suzuka-inspired technical flow preserving iconic S-curves, Degner, Hairpin, Spoon, 130R, Casio Triangle
    waypoints: pts([
      [-60, -165, 0],
      [60, -165, 0],     // Front straight
      [140, -145, 1],    // Turn 1-2
      [170, -70, 2],     // S-Curves 1
      [135, -15, 3],     // S-Curves 2
      [175, 55, 4],      // Dunlop Curve
      [145, 130, 3],     // Degner 1-2
      [60, 155, 1],      // Hairpin
      [-10, 120, 2],     // 200R sweep
      [-75, 175, 3],     // Spoon Curve
      [-160, 135, 4],    // West straight
      [-185, 25, 2],     // 130R flat-out kink
      [-160, -85, 1],    // Casio Triangle chicane
      [-125, -145, 0],
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
    targetLapSeconds: 36,
    corners: 19,
    waypoints: pts([
      [-55, -145, 0],
      [55, -145, 0],     // Boulevard Albert 1er
      [120, -135, 3],    // Sainte Devote
      [145, -75, 10],    // Beau Rivage climb
      [155, 5, 12],      // Massenet / Casino Square
      [120, 70, 9],      // Mirabeau
      [145, 125, 5],     // Fairmont Hairpin
      [80, 150, 2],      // Portier
      [0, 145, 1],       // Tunnel fast kink
      [-85, 140, 0],     // Nouvelle Chicane
      [-135, 85, 0],     // Tabac
      [-155, 10, 0],     // Swimming Pool S-chicane
      [-140, -75, 0],    // La Rascasse
      [-110, -130, 0],   // Anthony Noghes
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
    targetLapSeconds: 43,
    corners: 20,
    waypoints: pts([
      [-60, -165, 0],
      [60, -165, 0],     // Pit straight
      [145, -155, 14],   // Turn 1 steep uphill hairpin!
      [170, -75, 9],     // Esses 1
      [130, -25, 6],     // Esses 2
      [175, 35, 4],      // Esses 3
      [140, 115, 2],     // Hairpin Turn 11
      [45, 165, 1],      // Back straight
      [-55, 165, 2],     // Turn 12 braking
      [-110, 115, 3],    // Stadium Twist 13-15
      [-165, 130, 3],    // Carousel Turn 16-18
      [-175, 25, 2],     // Turn 19
      [-145, -95, 1],    // Turn 20 approach
      [-110, -150, 0],
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
    targetLapSeconds: 39,
    corners: 17,
    waypoints: pts([
      [-60, -160, 0],
      [60, -160, 0],     // Front concrete straight
      [145, -140, 0],    // Turn 1 sweeping left
      [165, -60, 0],     // Turn 3-5
      [120, 10, 0],      // Big Bend
      [160, 85, 0],      // Hairpin Turn 7
      [90, 145, 0],      // Fangio Chicane
      [-10, 160, 0],     // Tower Turn
      [-105, 145, 0],    // Ulmann Straight
      [-165, 85, 0],     // Bishop Bend
      [-150, -10, 0],    // Le Mans Straight
      [-170, -95, 0],    // Sunset Bend!
      [-125, -145, 0],
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
    targetLapSeconds: 33,
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
    targetLapSeconds: 34,
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
    targetLapSeconds: 34,
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
    targetLapSeconds: 34,
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
    targetLapSeconds: 30,
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
    targetLapSeconds: 34,
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
    targetLapSeconds: 31,
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
    targetLapSeconds: 34,
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
  const ptsArr = spec.waypoints;
  const n = ptsArr.length;
  const raw: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < sampleCount; i++) {
    const u = (i / sampleCount) * n;
    const seg = Math.floor(u) % n;
    const localT = u - Math.floor(u);
    const p0 = ptsArr[(seg - 1 + n) % n];
    const p1 = ptsArr[seg];
    const p2 = ptsArr[(seg + 1) % n];
    const p3 = ptsArr[(seg + 2) % n];
    raw.push({
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, localT),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, localT),
      z: catmullRom(p0.z, p1.z, p2.z, p3.z, localT),
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
    });
  }

  return {
    spec,
    samples,
    totalLength,
    pitEntryT: 0.90,
    pitExitT: 0.08,
    pitOffset: -(spec.trackWidth * 0.5 + 8.5), // Pit lane sits inside (left) of start/finish straight
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
