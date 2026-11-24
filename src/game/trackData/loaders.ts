export interface TrackDataPayload {
  svg: string;
  dem: number[];
}

const unwrapJson = (mod: unknown): TrackDataPayload => {
  const m = mod as { default?: TrackDataPayload } & Partial<TrackDataPayload>;
  return (m && typeof m === 'object' && 'default' in m && m.default ? m.default : m) as TrackDataPayload;
};

/**
 * Explicit per-track dynamic import loaders so Vite/Rollup code-splits each circuit's
 * heavy SVG coordinate string and 200-sample DEM elevation array out of the entry bundle.
 */
export const TRACK_DATA_LOADERS: Record<string, () => Promise<TrackDataPayload>> = {
  'spa-francorchamps': () => import('./spa-francorchamps.json').then(unwrapJson),
  'daytona-road': () => import('./daytona-road.json').then(unwrapJson),
  'laguna-seca': () => import('./laguna-seca.json').then(unwrapJson),
  'le-mans': () => import('./le-mans.json').then(unwrapJson),
  'monza': () => import('./monza.json').then(unwrapJson),
  'silverstone': () => import('./silverstone.json').then(unwrapJson),
  'suzuka': () => import('./suzuka.json').then(unwrapJson),
  'monaco': () => import('./monaco.json').then(unwrapJson),
  'cota': () => import('./cota.json').then(unwrapJson),
  'sebring': () => import('./sebring.json').then(unwrapJson),
  'long-beach': () => import('./long-beach.json').then(unwrapJson),
  'detroit-street': () => import('./detroit-street.json').then(unwrapJson),
  'mid-ohio': () => import('./mid-ohio.json').then(unwrapJson),
  'watkins-glen': () => import('./watkins-glen.json').then(unwrapJson),
  'mosport': () => import('./mosport.json').then(unwrapJson),
  'lime-rock': () => import('./lime-rock.json').then(unwrapJson),
  'road-america': () => import('./road-america.json').then(unwrapJson),
  'vir': () => import('./vir.json').then(unwrapJson),
  'indianapolis-road': () => import('./indianapolis-road.json').then(unwrapJson),
  'road-atlanta': () => import('./road-atlanta.json').then(unwrapJson),
  'montreal': () => import('./montreal.json').then(unwrapJson),
  'miami': () => import('./miami.json').then(unwrapJson),
  'las-vegas': () => import('./las-vegas.json').then(unwrapJson),
  'mexico-city': () => import('./mexico-city.json').then(unwrapJson),
  'interlagos': () => import('./interlagos.json').then(unwrapJson),
  'imola': () => import('./imola.json').then(unwrapJson),
  'barcelona': () => import('./barcelona.json').then(unwrapJson),
  'madring': () => import('./madring.json').then(unwrapJson),
  'red-bull-ring': () => import('./red-bull-ring.json').then(unwrapJson),
  'hungaroring': () => import('./hungaroring.json').then(unwrapJson),
  'zandvoort': () => import('./zandvoort.json').then(unwrapJson),
  'paul-ricard': () => import('./paul-ricard.json').then(unwrapJson),
  'baku': () => import('./baku.json').then(unwrapJson),
  'portimao': () => import('./portimao.json').then(unwrapJson),
  'fuji': () => import('./fuji.json').then(unwrapJson),
  'shanghai': () => import('./shanghai.json').then(unwrapJson),
  'singapore': () => import('./singapore.json').then(unwrapJson),
  'sepang': () => import('./sepang.json').then(unwrapJson),
  'bahrain': () => import('./bahrain.json').then(unwrapJson),
  'jeddah': () => import('./jeddah.json').then(unwrapJson),
  'lusail': () => import('./lusail.json').then(unwrapJson),
  'yas-marina': () => import('./yas-marina.json').then(unwrapJson),
  'albert-park': () => import('./albert-park.json').then(unwrapJson),
};

export const ALL_TRACK_DATA_IDS: readonly string[] = Object.keys(TRACK_DATA_LOADERS);

const payloadCache = new Map<string, TrackDataPayload>();
const inflightPayloads = new Map<string, Promise<TrackDataPayload | null>>();

export function isNodeSyncCapable(): boolean {
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node) &&
    typeof (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule === 'function'
  );
}

function hasTrackLoader(trackId: string): boolean {
  return Object.prototype.hasOwnProperty.call(TRACK_DATA_LOADERS, trackId);
}

/**
 * Synchronously reads a track's split JSON payload in Node.js (e.g. `tsx --test` or headless RL),
 * using `process.getBuiltinModule` so browser Vite bundles never see static Node built-in imports.
 */
export function readTrackDataSync(trackId: string): TrackDataPayload | null {
  if (!hasTrackLoader(trackId)) return null;
  const cached = payloadCache.get(trackId);
  if (cached) return cached;
  if (!isNodeSyncCapable()) return null;

  try {
    const getBuiltin = (process as unknown as { getBuiltinModule: (id: string) => any }).getBuiltinModule;
    const fs = getBuiltin('node:fs');
    const path = getBuiltin('node:path');
    const url = getBuiltin('node:url');
    if (!fs || !path || !url) return null;

    const here =
      typeof import.meta !== 'undefined' && import.meta.url
        ? path.dirname(url.fileURLToPath(import.meta.url))
        : '';

    const candidates = [
      here ? path.join(here, `${trackId}.json`) : '',
      here ? path.join(here, 'trackData', `${trackId}.json`) : '',
      path.join(process.cwd(), 'src', 'game', 'trackData', `${trackId}.json`),
    ].filter(Boolean);

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as TrackDataPayload;
        if (parsed && typeof parsed.svg === 'string' && Array.isArray(parsed.dem)) {
          payloadCache.set(trackId, parsed);
          return parsed;
        }
      }
    }
  } catch {
    // Fall back to async loader if sync read is unavailable in a non-standard host
  }
  return null;
}

export function getCachedTrackDataPayload(trackId: string): TrackDataPayload | undefined {
  return payloadCache.get(trackId);
}

/**
 * Asynchronously loads and caches a single track's split geometry/elevation chunk via dynamic `import()`.
 */
export async function loadTrackDataAsync(trackId: string): Promise<TrackDataPayload | null> {
  if (!hasTrackLoader(trackId)) return null;
  const cached = payloadCache.get(trackId);
  if (cached) return cached;

  const sync = readTrackDataSync(trackId);
  if (sync) return sync;

  const existing = inflightPayloads.get(trackId);
  if (existing) return existing;

  const promise = TRACK_DATA_LOADERS[trackId]()
    .then((payload) => {
      if (payload && typeof payload.svg === 'string' && Array.isArray(payload.dem)) {
        payloadCache.set(trackId, payload);
        return payload;
      }
      return null;
    })
    .finally(() => {
      inflightPayloads.delete(trackId);
    });

  inflightPayloads.set(trackId, promise);
  return promise;
}
