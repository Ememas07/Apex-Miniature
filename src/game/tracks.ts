import * as THREE from 'three';
import { SceneryTheme, TrackRegion, TrackSpec, TrackWaypoint } from './types';
import { getCustomTrackById } from './customTracks';
import { TRACK_SVG_REGISTRY, svgToTrackPoints } from './trackSvgs';

export const TRACKS: TrackSpec[] = [
  {
    id: "spa-francorchamps",
    name: "Circuit de Spa-Francorchamps",
    shortName: "Spa",
    country: "Belgium",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: true,
    scenery: "forest" as SceneryTheme,
    asphaltColor: "#262b33",
    kerbPrimary: "#e11d48",
    kerbSecondary: "#facc15",
    trackWidth: 18,
    targetLapSeconds: 70,
    corners: 19,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["spa-francorchamps"], {
      trackId: "spa-francorchamps",
      trackWidth: 18,
      targetLapSeconds: 70,
    }),
  },
  {
    id: "daytona-road",
    name: "Daytona International Speedway (Road)",
    shortName: "Daytona",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: true,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#272b34",
    kerbPrimary: "#facc15",
    kerbSecondary: "#2563eb",
    trackWidth: 19,
    targetLapSeconds: 46,
    corners: 12,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["daytona-road"], {
      trackId: "daytona-road",
      trackWidth: 19,
      targetLapSeconds: 46,
    }),
  },
  {
    id: "laguna-seca",
    name: "WeatherTech Raceway Laguna Seca",
    shortName: "Laguna Seca",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: true,
    scenery: "desert" as SceneryTheme,
    asphaltColor: "#2f333b",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#f8fafc",
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 11,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["laguna-seca"], {
      trackId: "laguna-seca",
      trackWidth: 16.5,
      targetLapSeconds: 36,
    }),
  },
  {
    id: "le-mans",
    name: "Circuit de la Sarthe (Le Mans)",
    shortName: "Le Mans",
    country: "France",
    region: "Europe" as TrackRegion,
    seriesTags: ["WEC"],
    flagship: true,
    scenery: "forest" as SceneryTheme,
    asphaltColor: "#252a32",
    kerbPrimary: "#facc15",
    kerbSecondary: "#1d4ed8",
    trackWidth: 18.5,
    targetLapSeconds: 72,
    corners: 21,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["le-mans"], {
      trackId: "le-mans",
      trackWidth: 18.5,
      targetLapSeconds: 72,
    }),
  },
  {
    id: "monza",
    name: "Autodromo Nazionale Monza",
    shortName: "Monza",
    country: "Italy",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: true,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#252930",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#dc2626",
    trackWidth: 18,
    targetLapSeconds: 40,
    corners: 11,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["monza"], {
      trackId: "monza",
      trackWidth: 18,
      targetLapSeconds: 40,
    }),
  },
  {
    id: "silverstone",
    name: "Silverstone Grand Prix Circuit",
    shortName: "Silverstone",
    country: "United Kingdom",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: true,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#2a2e36",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#ffffff",
    trackWidth: 18.5,
    targetLapSeconds: 46,
    corners: 18,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["silverstone"], {
      trackId: "silverstone",
      trackWidth: 18.5,
      targetLapSeconds: 46,
    }),
  },
  {
    id: "suzuka",
    name: "Suzuka International Racing Course",
    shortName: "Suzuka",
    country: "Japan",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1"],
    flagship: true,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#262b33",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#f8fafc",
    trackWidth: 17.5,
    targetLapSeconds: 52,
    corners: 18,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["suzuka"], {
      trackId: "suzuka",
      trackWidth: 17.5,
      targetLapSeconds: 52,
    }),
  },
  {
    id: "monaco",
    name: "Circuit de Monaco",
    shortName: "Monaco",
    country: "Monaco",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: true,
    scenery: "coastal" as SceneryTheme,
    asphaltColor: "#2a2f38",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#ffffff",
    trackWidth: 14.5,
    targetLapSeconds: 38,
    corners: 19,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["monaco"], {
      trackId: "monaco",
      trackWidth: 14.5,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "cota",
    name: "Circuit of the Americas (Austin)",
    shortName: "COTA",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: true,
    scenery: "desert" as SceneryTheme,
    asphaltColor: "#282d35",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#f8fafc",
    trackWidth: 18,
    targetLapSeconds: 48,
    corners: 20,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["cota"], {
      trackId: "cota",
      trackWidth: 18,
      targetLapSeconds: 48,
    }),
  },
  {
    id: "sebring",
    name: "Sebring International Raceway",
    shortName: "Sebring",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA","WEC"],
    flagship: true,
    scenery: "desert" as SceneryTheme,
    asphaltColor: "#373b42",
    kerbPrimary: "#2563eb",
    kerbSecondary: "#facc15",
    trackWidth: 18,
    targetLapSeconds: 45,
    corners: 17,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["sebring"], {
      trackId: "sebring",
      trackWidth: 18,
      targetLapSeconds: 45,
    }),
  },
  {
    id: "long-beach",
    name: "Streets of Long Beach",
    shortName: "Long Beach",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "street-night" as SceneryTheme,
    asphaltColor: "#252932",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#facc15",
    trackWidth: 15.5,
    targetLapSeconds: 38,
    corners: 11,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["long-beach"], {
      trackId: "long-beach",
      trackWidth: 15.5,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "detroit-street",
    name: "Detroit Street Circuit",
    shortName: "Detroit",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "street-night" as SceneryTheme,
    asphaltColor: "#242830",
    kerbPrimary: "#2563eb",
    kerbSecondary: "#ffffff",
    trackWidth: 15,
    targetLapSeconds: 39,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["detroit-street"], {
      trackId: "detroit-street",
      trackWidth: 15,
      targetLapSeconds: 39,
    }),
  },
  {
    id: "mid-ohio",
    name: "Mid-Ohio Sports Car Course",
    shortName: "Mid-Ohio",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#262b33",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#facc15",
    trackWidth: 16.5,
    targetLapSeconds: 38,
    corners: 13,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["mid-ohio"], {
      trackId: "mid-ohio",
      trackWidth: 16.5,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "watkins-glen",
    name: "Watkins Glen International (Full Boot)",
    shortName: "Watkins Glen",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#262a31",
    kerbPrimary: "#2563eb",
    kerbSecondary: "#facc15",
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 11,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["watkins-glen"], {
      trackId: "watkins-glen",
      trackWidth: 18,
      targetLapSeconds: 36,
    }),
  },
  {
    id: "mosport",
    name: "Canadian Tire Motorsport Park (Mosport)",
    shortName: "Mosport",
    country: "Canada",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "forest" as SceneryTheme,
    asphaltColor: "#282c34",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#ffffff",
    trackWidth: 17,
    targetLapSeconds: 38,
    corners: 10,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["mosport"], {
      trackId: "mosport",
      trackWidth: 17,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "lime-rock",
    name: "Lime Rock Park",
    shortName: "Lime Rock",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#272b33",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#facc15",
    trackWidth: 15.5,
    targetLapSeconds: 35,
    corners: 7,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["lime-rock"], {
      trackId: "lime-rock",
      trackWidth: 15.5,
      targetLapSeconds: 35,
    }),
  },
  {
    id: "road-america",
    name: "Road America",
    shortName: "Road America",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "forest" as SceneryTheme,
    asphaltColor: "#272c34",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#ffffff",
    trackWidth: 18,
    targetLapSeconds: 42,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["road-america"], {
      trackId: "road-america",
      trackWidth: 18,
      targetLapSeconds: 42,
    }),
  },
  {
    id: "vir",
    name: "VIRginia International Raceway",
    shortName: "VIR",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#272c34",
    kerbPrimary: "#facc15",
    kerbSecondary: "#16a34a",
    trackWidth: 16.5,
    targetLapSeconds: 38,
    corners: 17,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["vir"], {
      trackId: "vir",
      trackWidth: 16.5,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "indianapolis-road",
    name: "Indianapolis Motor Speedway (Road)",
    shortName: "Indy Road",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#252932",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#ffffff",
    trackWidth: 18,
    targetLapSeconds: 35,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["indianapolis-road"], {
      trackId: "indianapolis-road",
      trackWidth: 18,
      targetLapSeconds: 35,
    }),
  },
  {
    id: "road-atlanta",
    name: "Michelin Raceway Road Atlanta",
    shortName: "Road Atlanta",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["IMSA"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#2b2f38",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#ffffff",
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 12,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["road-atlanta"], {
      trackId: "road-atlanta",
      trackWidth: 17,
      targetLapSeconds: 35,
    }),
  },
  {
    id: "montreal",
    name: "Circuit Gilles Villeneuve (Montreal)",
    shortName: "Montreal",
    country: "Canada",
    region: "Americas" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#262b33",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#ffffff",
    trackWidth: 17,
    targetLapSeconds: 40,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["montreal"], {
      trackId: "montreal",
      trackWidth: 17,
      targetLapSeconds: 40,
    }),
  },
  {
    id: "miami",
    name: "Miami International Autodrome",
    shortName: "Miami",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#262b34",
    kerbPrimary: "#06b6d4",
    kerbSecondary: "#ec4899",
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 19,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["miami"], {
      trackId: "miami",
      trackWidth: 17.5,
      targetLapSeconds: 37,
    }),
  },
  {
    id: "las-vegas",
    name: "Las Vegas Strip Circuit",
    shortName: "Las Vegas",
    country: "USA",
    region: "Americas" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "street-night" as SceneryTheme,
    asphaltColor: "#22262f",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#ffffff",
    trackWidth: 17.5,
    targetLapSeconds: 38,
    corners: 17,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["las-vegas"], {
      trackId: "las-vegas",
      trackWidth: 17.5,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "mexico-city",
    name: "Autódromo Hermanos Rodríguez",
    shortName: "Mexico City",
    country: "Mexico",
    region: "Americas" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#272c35",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#ef4444",
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 17,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["mexico-city"], {
      trackId: "mexico-city",
      trackWidth: 17,
      targetLapSeconds: 35,
    }),
  },
  {
    id: "interlagos",
    name: "Autódromo José Carlos Pace (Interlagos)",
    shortName: "Interlagos",
    country: "Brazil",
    region: "Americas" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: false,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#262b33",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#facc15",
    trackWidth: 17.5,
    targetLapSeconds: 35,
    corners: 15,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["interlagos"], {
      trackId: "interlagos",
      trackWidth: 17.5,
      targetLapSeconds: 35,
    }),
  },
  {
    id: "imola",
    name: "Autodromo Enzo e Dino Ferrari (Imola)",
    shortName: "Imola",
    country: "Italy",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#262b33",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#dc2626",
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 19,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["imola"], {
      trackId: "imola",
      trackWidth: 16.5,
      targetLapSeconds: 36,
    }),
  },
  {
    id: "barcelona",
    name: "Circuit de Barcelona-Catalunya",
    shortName: "Barcelona",
    country: "Spain",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "desert" as SceneryTheme,
    asphaltColor: "#292e36",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#facc15",
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["barcelona"], {
      trackId: "barcelona",
      trackWidth: 17.5,
      targetLapSeconds: 37,
    }),
  },
  {
    id: "madring",
    name: "Circuito de Madring (Madrid)",
    shortName: "Madring",
    country: "Spain",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "street-night" as SceneryTheme,
    asphaltColor: "#242933",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#facc15",
    trackWidth: 17,
    targetLapSeconds: 37,
    corners: 20,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["madring"], {
      trackId: "madring",
      trackWidth: 17,
      targetLapSeconds: 37,
    }),
  },
  {
    id: "red-bull-ring",
    name: "Red Bull Ring (Spielberg)",
    shortName: "Red Bull Ring",
    country: "Austria",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "forest" as SceneryTheme,
    asphaltColor: "#272c34",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#facc15",
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 10,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["red-bull-ring"], {
      trackId: "red-bull-ring",
      trackWidth: 18,
      targetLapSeconds: 36,
    }),
  },
  {
    id: "hungaroring",
    name: "Hungaroring (Budapest)",
    shortName: "Hungaroring",
    country: "Hungary",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#282d35",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#dc2626",
    trackWidth: 16.5,
    targetLapSeconds: 36,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["hungaroring"], {
      trackId: "hungaroring",
      trackWidth: 16.5,
      targetLapSeconds: 36,
    }),
  },
  {
    id: "zandvoort",
    name: "Circuit Zandvoort",
    shortName: "Zandvoort",
    country: "Netherlands",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "coastal" as SceneryTheme,
    asphaltColor: "#292e37",
    kerbPrimary: "#f97316",
    kerbSecondary: "#ffffff",
    trackWidth: 16,
    targetLapSeconds: 39,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["zandvoort"], {
      trackId: "zandvoort",
      trackWidth: 16,
      targetLapSeconds: 39,
    }),
  },
  {
    id: "paul-ricard",
    name: "Circuit Paul Ricard (Le Castellet)",
    shortName: "Paul Ricard",
    country: "France",
    region: "Europe" as TrackRegion,
    seriesTags: ["WEC","F1"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#232833",
    kerbPrimary: "#2563eb",
    kerbSecondary: "#ef4444",
    trackWidth: 18.5,
    targetLapSeconds: 38,
    corners: 15,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["paul-ricard"], {
      trackId: "paul-ricard",
      trackWidth: 18.5,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "baku",
    name: "Baku City Circuit",
    shortName: "Baku",
    country: "Azerbaijan",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "street-night" as SceneryTheme,
    asphaltColor: "#252932",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#06b6d4",
    trackWidth: 15,
    targetLapSeconds: 40,
    corners: 20,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["baku"], {
      trackId: "baku",
      trackWidth: 15,
      targetLapSeconds: 40,
    }),
  },
  {
    id: "portimao",
    name: "Autódromo Internacional do Algarve (Portimão)",
    shortName: "Portimão",
    country: "Portugal",
    region: "Europe" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: false,
    scenery: "desert" as SceneryTheme,
    asphaltColor: "#2a2e37",
    kerbPrimary: "#facc15",
    kerbSecondary: "#16a34a",
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 15,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["portimao"], {
      trackId: "portimao",
      trackWidth: 17.5,
      targetLapSeconds: 37,
    }),
  },
  {
    id: "fuji",
    name: "Fuji Speedway",
    shortName: "Fuji",
    country: "Japan",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["WEC"],
    flagship: false,
    scenery: "forest" as SceneryTheme,
    asphaltColor: "#272c35",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#ffffff",
    trackWidth: 18,
    targetLapSeconds: 36,
    corners: 16,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["fuji"], {
      trackId: "fuji",
      trackWidth: 18,
      targetLapSeconds: 36,
    }),
  },
  {
    id: "shanghai",
    name: "Shanghai International Circuit",
    shortName: "Shanghai",
    country: "China",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#272c35",
    kerbPrimary: "#ef4444",
    kerbSecondary: "#ffffff",
    trackWidth: 18,
    targetLapSeconds: 39,
    corners: 16,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["shanghai"], {
      trackId: "shanghai",
      trackWidth: 18,
      targetLapSeconds: 39,
    }),
  },
  {
    id: "singapore",
    name: "Marina Bay Street Circuit",
    shortName: "Singapore",
    country: "Singapore",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "street-night" as SceneryTheme,
    asphaltColor: "#21262f",
    kerbPrimary: "#06b6d4",
    kerbSecondary: "#ffffff",
    trackWidth: 15.5,
    targetLapSeconds: 40,
    corners: 19,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["singapore"], {
      trackId: "singapore",
      trackWidth: 15.5,
      targetLapSeconds: 40,
    }),
  },
  {
    id: "sepang",
    name: "Petronas Sepang International Circuit",
    shortName: "Sepang",
    country: "Malaysia",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "stadium" as SceneryTheme,
    asphaltColor: "#272c35",
    kerbPrimary: "#06b6d4",
    kerbSecondary: "#facc15",
    trackWidth: 18.5,
    targetLapSeconds: 39,
    corners: 15,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["sepang"], {
      trackId: "sepang",
      trackWidth: 18.5,
      targetLapSeconds: 39,
    }),
  },
  {
    id: "bahrain",
    name: "Bahrain International Circuit (Sakhir)",
    shortName: "Bahrain",
    country: "Bahrain",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: false,
    scenery: "desert" as SceneryTheme,
    asphaltColor: "#2a2e36",
    kerbPrimary: "#dc2626",
    kerbSecondary: "#ffffff",
    trackWidth: 18,
    targetLapSeconds: 38,
    corners: 15,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["bahrain"], {
      trackId: "bahrain",
      trackWidth: 18,
      targetLapSeconds: 38,
    }),
  },
  {
    id: "jeddah",
    name: "Jeddah Corniche Circuit",
    shortName: "Jeddah",
    country: "Saudi Arabia",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "street-night" as SceneryTheme,
    asphaltColor: "#232833",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#ffffff",
    trackWidth: 16.5,
    targetLapSeconds: 39,
    corners: 27,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["jeddah"], {
      trackId: "jeddah",
      trackWidth: 16.5,
      targetLapSeconds: 39,
    }),
  },
  {
    id: "lusail",
    name: "Lusail International Circuit",
    shortName: "Lusail",
    country: "Qatar",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1","WEC"],
    flagship: false,
    scenery: "desert" as SceneryTheme,
    asphaltColor: "#252a33",
    kerbPrimary: "#7c2d12",
    kerbSecondary: "#ffffff",
    trackWidth: 18,
    targetLapSeconds: 37,
    corners: 16,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["lusail"], {
      trackId: "lusail",
      trackWidth: 18,
      targetLapSeconds: 37,
    }),
  },
  {
    id: "yas-marina",
    name: "Yas Marina Circuit (Abu Dhabi)",
    shortName: "Yas Marina",
    country: "UAE",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "coastal" as SceneryTheme,
    asphaltColor: "#252a34",
    kerbPrimary: "#06b6d4",
    kerbSecondary: "#ef4444",
    trackWidth: 17.5,
    targetLapSeconds: 37,
    corners: 16,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["yas-marina"], {
      trackId: "yas-marina",
      trackWidth: 17.5,
      targetLapSeconds: 37,
    }),
  },
  {
    id: "albert-park",
    name: "Albert Park Grand Prix Circuit (Melbourne)",
    shortName: "Albert Park",
    country: "Australia",
    region: "Asia-Pacific & Middle East" as TrackRegion,
    seriesTags: ["F1"],
    flagship: false,
    scenery: "parkland" as SceneryTheme,
    asphaltColor: "#272c35",
    kerbPrimary: "#16a34a",
    kerbSecondary: "#facc15",
    trackWidth: 17,
    targetLapSeconds: 35,
    corners: 14,
    waypoints: svgToTrackPoints(TRACK_SVG_REGISTRY["albert-park"], {
      trackId: "albert-park",
      trackWidth: 17,
      targetLapSeconds: 35,
    }),
  },
];

export function getTrackById(id: string): TrackSpec {
  const builtin = TRACKS.find((t) => t.id === id);
  if (builtin) return builtin;
  const custom = getCustomTrackById(id);
  if (custom) return custom;
  return TRACKS[0];
}

export function getTracksByRegion(region: TrackRegion | 'All' | 'Flagship'): TrackSpec[] {
  if (region === 'Flagship') return TRACKS.filter((t) => t.flagship);
  if (region === 'All') return TRACKS;
  return TRACKS.filter((t) => t.region === region);
}

export interface SampledSplinePoint {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  nx: number;
  nz: number;
  s: number;
  t: number; // 0..1 normalized progress
  curvature: number; // signed 1/R in 1/m (+ = right turn, - = left turn)
  banking?: number; // radians
  width?: number; // track width in meters
}

export interface CompiledTrack {
  spec: TrackSpec;
  samples: SampledSplinePoint[];
  totalLength: number;
  pitEntryT: number;
  pitExitT: number;
  pitOffset: number; // lateral world offset for pit corridor
}

function hermiteCatmullRomVal(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
  tau1 = 0.16,
  tau2 = 0.16,
): number {
  const m1 = tau1 * (p2 - p0);
  const m2 = tau2 * (p3 - p1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p1 +
    (t3 - 2 * t2 + t) * m1 +
    (-2 * t3 + 3 * t2) * p2 +
    (t3 - t2) * m2
  );
}

/**
 * Compiles track waypoints into a dense, arc-length-uniformly-resampled closed racing spline.
 * Uses THREE.CatmullRomCurve3 ('catmullrom', low tension = 0.16, arcLengthDivisions = 1800)
 * so straights stay dead straight and hairpins/chicanes stay sharp without oval rounding.
 */
export function compileTrack(spec: TrackSpec, sampleCount = 720): CompiledTrack {
  let ptsArr = spec.waypoints;
  if (
    spec.startNodeIndex !== undefined &&
    spec.startNodeIndex > 0 &&
    spec.startNodeIndex < ptsArr.length
  ) {
    const head = ptsArr.slice(spec.startNodeIndex);
    const tail = ptsArr.slice(0, spec.startNodeIndex);
    ptsArr = [...head, ...tail];
  }
  const n = ptsArr.length;
  const hasPerNodeTension = ptsArr.some((wp) => wp.tension !== undefined);

  const raw: Array<{ x: number; y: number; z: number; banking: number; width: number; s: number }> = [];
  let totalLength = 0;

  if (!hasPerNodeTension) {
    // Centripetal Catmull-Rom over piecewise straight collars + circular corner clusters
    // guarantees zero ribbon self-intersection folds AND dead-straight straights.
    const curve = new THREE.CatmullRomCurve3(
      ptsArr.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      true,
      'centripetal',
      0.5,
    );
    curve.arcLengthDivisions = Math.max(1500, n * 30, 1800);
    totalLength = curve.getLength();
    const spaced = curve.getSpacedPoints(sampleCount);

    for (let k = 0; k < sampleCount; k++) {
      const u = k / sampleCount;
      const tParam = curve.getUtoTmapping(u, 0);
      const segU = tParam * n;
      const seg = Math.floor(segU) % n;
      const localT = segU - Math.floor(segU);

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

      const pt = spaced[k];
      raw.push({
        x: pt.x,
        y: pt.y,
        z: pt.z,
        banking: hermiteCatmullRomVal(bank0, bank1, bank2, bank3, localT, 0.18, 0.18),
        width: hermiteCatmullRomVal(w0, w1, w2, w3, localT, 0.18, 0.18),
        s: u * totalLength,
      });
    }
  } else {
    // Custom Track Studio path honoring per-node tension overrides (same Catmull-Rom polynomial, 1800+ arc divisions)
    const denseCount = Math.max(1800, n * 60);
    const dense: Array<{ x: number; y: number; z: number; banking: number; width: number }> = [];

    for (let i = 0; i < denseCount; i++) {
      const u = (i / denseCount) * n;
      const seg = Math.floor(u) % n;
      const localT = u - Math.floor(u);
      const p0 = ptsArr[(seg - 1 + n) % n];
      const p1 = ptsArr[seg];
      const p2 = ptsArr[(seg + 1) % n];
      const p3 = ptsArr[(seg + 2) % n];

      const tau1 = Math.max(0.12, Math.min(0.85, p1.tension ?? 0.16));
      const tau2 = Math.max(0.12, Math.min(0.85, p2.tension ?? 0.16));

      const bank0 = (p0.banking || 0) * (Math.PI / 180);
      const bank1 = (p1.banking || 0) * (Math.PI / 180);
      const bank2 = (p2.banking || 0) * (Math.PI / 180);
      const bank3 = (p3.banking || 0) * (Math.PI / 180);

      const w0 = p0.width || spec.trackWidth;
      const w1 = p1.width || spec.trackWidth;
      const w2 = p2.width || spec.trackWidth;
      const w3 = p3.width || spec.trackWidth;

      dense.push({
        x: hermiteCatmullRomVal(p0.x, p1.x, p2.x, p3.x, localT, tau1, tau2),
        y: hermiteCatmullRomVal(p0.y, p1.y, p2.y, p3.y, localT, 0.25, 0.25),
        z: hermiteCatmullRomVal(p0.z, p1.z, p2.z, p3.z, localT, tau1, tau2),
        banking: hermiteCatmullRomVal(bank0, bank1, bank2, bank3, localT, 0.25, 0.25),
        width: hermiteCatmullRomVal(w0, w1, w2, w3, localT, 0.25, 0.25),
      });
    }

    const denseCumLen: number[] = [0];
    for (let i = 1; i <= denseCount; i++) {
      const a = dense[i - 1];
      const b = dense[i % denseCount];
      totalLength += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      denseCumLen.push(totalLength);
    }

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
      t: curr.s / Math.max(1, totalLength),
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
    const windowRadius = Math.max(36, Math.round(n * 0.08));
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
