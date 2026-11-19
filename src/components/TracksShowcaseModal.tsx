import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Compass, MapPin, RotateCw, Search, X } from 'lucide-react';
import { getSavedCustomTracks } from '../game/customTracks';
import { CCW_CIRCUIT_IDS } from '../game/trackSvgs';
import {
  TRACKS,
  compileTrack,
  filterTracks,
  formatTargetLapMMSS,
  getTrackById,
} from '../game/tracks';
import { TrackRegion, TrackSpec } from '../game/types';
import { TrackViewerAngle, TrackViewerViewport } from '../three/TrackViewerViewport';

interface TracksShowcaseModalProps {
  selectedTrackId: string;
  selectedCustomTrack?: TrackSpec;
  onSelectTrack: (trackId: string, customTrack?: TrackSpec) => void;
  onClose: () => void;
}

const REGION_FILTERS: Array<'Flagship' | TrackRegion | 'All'> = [
  'Flagship',
  'Americas',
  'Europe',
  'Asia-Pacific & Middle East',
  'Custom',
  'All',
];

function TrackMiniOutline({ track }: { track: TrackSpec }) {
  const compiled = useMemo(() => compileTrack(track, 72), [track]);
  const xs = compiled.samples.map((s) => s.x);
  const zs = compiled.samples.map((s) => s.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ, 1);

  const d =
    compiled.samples
      .map((s, i) => {
        const px = 12 + ((s.x - minX) / span) * 96;
        const py = 12 + ((s.z - minZ) / span) * 76;
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ') + ' Z';

  return (
    <svg viewBox="0 0 120 100" className="w-16 h-12 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="#334155" strokeWidth="6" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={track.kerbPrimary} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function TracksShowcaseModal({
  selectedTrackId,
  selectedCustomTrack,
  onSelectTrack,
  onClose,
}: TracksShowcaseModalProps) {
  const initialTrack = useMemo(
    () => selectedCustomTrack || getTrackById(selectedTrackId),
    [selectedCustomTrack, selectedTrackId],
  );
  const [inspectTrack, setInspectTrack] = useState<TrackSpec>(initialTrack);
  const [regionFilter, setRegionFilter] = useState<'Flagship' | TrackRegion | 'All'>('All');
  const [search, setSearch] = useState('');
  const [angle, setAngle] = useState<TrackViewerAngle>('overview');
  const [autoRotate, setAutoRotate] = useState(true);

  const customTracks = useMemo(() => getSavedCustomTracks(), []);
  const filteredTracks = useMemo(
    () => filterTracks(TRACKS, customTracks, regionFilter, search),
    [customTracks, regionFilter, search],
  );

  const isCustom = inspectTrack.region === 'Custom';
  const isCurrentActive = inspectTrack.id === selectedTrackId && (isCustom ? Boolean(selectedCustomTrack) : !selectedCustomTrack);
  const isCCW = CCW_CIRCUIT_IDS.has(inspectTrack.id);
  const lengthKm = useMemo(() => {
    if (inspectTrack.circuitLengthKm) return inspectTrack.circuitLengthKm;
    return Number((compileTrack(inspectTrack, 60).totalLength / 1000).toFixed(2));
  }, [inspectTrack]);

  return (
    <div
      data-testid="tracks-showcase-modal"
      role="dialog"
      aria-label="Tracks Showcase"
      className="fixed inset-0 z-30 bg-[#0b0e13]/95 flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 md:px-7 py-3.5 bg-[#0d1118] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#161b24] hover:bg-[#1e2634] border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Menu
          </button>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-display font-bold text-white tracking-wide whitespace-nowrap">
              TRACKS SHOWCASE
            </h2>
            <p className="text-xs text-slate-400 truncate">
              {TRACKS.length} official circuits + {customTracks.length} custom tracks in 3D
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="btn-showcase-select-track"
            onClick={() => {
              onSelectTrack(inspectTrack.id, isCustom ? inspectTrack : undefined);
              onClose();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-red-950/50"
          >
            <Check className="w-4 h-4" />
            {isCurrentActive ? 'Keep Selected Circuit' : 'Select Circuit for Race'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Tracks Showcase"
            className="p-2 rounded bg-[#161b24] hover:bg-[#202836] border border-white/10 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
        {/* Left: Search, Region Filter & Track Roster */}
        <div className="lg:col-span-5 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0e121a] p-4 md:p-5 space-y-3.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search circuits by name, city, country, or series..."
              aria-label="Search showcase tracks"
              className="w-full pl-8 pr-8 py-2 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear circuit search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {REGION_FILTERS.map((rf) => (
              <button
                key={rf}
                type="button"
                onClick={() => setRegionFilter(rf)}
                className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  regionFilter === rf
                    ? 'bg-red-600 text-white'
                    : 'bg-[#171c26] text-slate-300 hover:bg-[#1f2634]'
                }`}
              >
                {rf === 'Flagship'
                  ? 'Flagship 10'
                  : rf === 'Custom'
                  ? `Custom (${customTracks.length})`
                  : rf}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{regionFilter === 'All' ? 'All Circuits' : regionFilter}</span>
            <span className="tabular-nums">{filteredTracks.length} shown</span>
          </div>

          <div className="flex-1 min-h-[220px] overflow-y-auto custom-scroll space-y-1.5 pr-1">
            {filteredTracks.map((trk) => {
              const active = trk.id === inspectTrack.id;
              const equipped = trk.id === selectedTrackId;
              return (
                <button
                  key={trk.id}
                  type="button"
                  onClick={() => setInspectTrack(trk)}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1c2434] border-red-500 text-white'
                      : 'bg-[#151a23] border-white/8 text-slate-300 hover:bg-[#1a2130]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold truncate">{trk.name}</span>
                      {equipped && (
                        <span className="text-[10px] font-telemetry text-emerald-400 shrink-0">ACTIVE</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {trk.city ? `${trk.city} · ` : ''}
                      {trk.country}
                    </div>
                    <div className="text-[11px] font-telemetry text-slate-400 mt-0.5">
                      {trk.circuitLengthKm ? `${trk.circuitLengthKm.toFixed(2)} km · ` : ''}
                      {trk.corners} turns · Est. {formatTargetLapMMSS(trk.targetLapSeconds)}
                    </div>
                  </div>
                  <TrackMiniOutline track={trk} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: 3D Track Viewer & Circuit Dossier */}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-[#11151d] lg:overflow-y-auto custom-scroll">
          <div className="relative h-72 sm:h-80 lg:h-[390px] shrink-0 bg-[#0d1119] border-b border-white/10 overflow-hidden">
            <TrackViewerViewport
              trackSpec={inspectTrack}
              angle={angle}
              autoRotate={autoRotate}
            />

            <div className="absolute top-4 left-5 right-5 pointer-events-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                <span className="font-semibold text-white">{inspectTrack.country}</span>
                {inspectTrack.city && (
                  <>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span>{inspectTrack.city}</span>
                  </>
                )}
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span>{inspectTrack.region}</span>
                {inspectTrack.seriesTags.length > 0 && (
                  <>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="font-display font-bold text-amber-300">
                      {inspectTrack.seriesTags.join(' / ')}
                    </span>
                  </>
                )}
              </div>
              <h3 className="mt-1 text-2xl font-display font-extrabold text-white tracking-tight truncate">
                {inspectTrack.name}
              </h3>
            </div>

            <div className="absolute bottom-3.5 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-1 p-1 rounded bg-[#0c1017]/92 border border-white/10 pointer-events-auto">
                {(
                  [
                    { id: 'overview', label: 'Aerial 3/4' },
                    { id: 'top', label: 'Plan View' },
                    { id: 'low', label: 'Low Horizon' },
                  ] as Array<{ id: TrackViewerAngle; label: string }>
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setAngle(preset.id)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      angle === preset.id
                        ? 'bg-red-600 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    autoRotate
                      ? 'bg-sky-600/25 border-sky-400 text-sky-200'
                      : 'bg-[#0c1017]/92 border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <RotateCw className="w-3 h-3" />
                  Auto-Orbit
                </button>
                <span className="text-[11px] text-slate-400 bg-[#0c1017]/90 px-2.5 py-1.5 rounded border border-white/10">
                  Drag to orbit · Scroll to zoom
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Est. Lap Time</div>
                <div className="font-telemetry text-base font-bold text-emerald-400 mt-0.5">
                  {formatTargetLapMMSS(inspectTrack.targetLapSeconds)}
                </div>
              </div>
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Circuit Length</div>
                <div className="font-telemetry text-base font-bold text-white mt-0.5">
                  {lengthKm.toFixed(2)} km
                </div>
              </div>
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Turns / Width</div>
                <div className="font-telemetry text-sm font-bold text-white mt-0.5">
                  {inspectTrack.corners} Corners · {inspectTrack.trackWidth.toFixed(1)}m
                </div>
              </div>
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Direction</div>
                <div className="font-semibold text-amber-300 mt-0.5 flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5" />
                  {isCCW ? 'Anti-Clockwise' : 'Clockwise'}
                </div>
              </div>
            </div>

            <div className="rounded bg-[#141923] border border-white/10 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <MapPin className="w-3.5 h-3.5 text-red-400" />
                  <span>
                    {inspectTrack.city ? `${inspectTrack.city}, ` : ''}
                    {inspectTrack.country}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 capitalize">
                  Scenery: {inspectTrack.scenery.replace('-', ' ')} · Pit {inspectTrack.pitSide ?? 'left'}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {inspectTrack.circuitInfo ||
                  `${inspectTrack.name} is a ${lengthKm.toFixed(2)} km ${inspectTrack.scenery.replace('-', ' ')} circuit featuring ${inspectTrack.corners} corners and ${formatTargetLapMMSS(inspectTrack.targetLapSeconds)} benchmark pace.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
