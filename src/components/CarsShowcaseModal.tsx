import { useMemo, useState } from 'react';
import { ArrowLeft, Check, RotateCw, Search, X } from 'lucide-react';
import {
  CAR_CLASSES,
  CARS,
  computeBoPEquilibriumScore,
  filterCars,
  getAllSelectableCars,
  getCarById,
  resolveCarSpecial,
} from '../game/cars';
import { CarClassId, LiveryConfig } from '../game/types';
import { GarageAngle, GarageViewport } from '../three/GarageViewport';

interface CarsShowcaseModalProps {
  selectedCarId: string;
  selectedLivery: LiveryConfig;
  onSelectCar: (carId: string, livery: LiveryConfig) => void;
  onClose: () => void;
}

export function CarsShowcaseModal({
  selectedCarId,
  selectedLivery,
  onSelectCar,
  onClose,
}: CarsShowcaseModalProps) {
  const initialCar = useMemo(() => getCarById(selectedCarId), [selectedCarId]);
  const [inspectCarId, setInspectCarId] = useState(initialCar.id);
  const [inspectLivery, setInspectLivery] = useState<LiveryConfig>(() => ({ ...selectedLivery }));
  const [activeClass, setActiveClass] = useState<CarClassId | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [angle, setAngle] = useState<GarageAngle>('hero');
  const [autoRotate, setAutoRotate] = useState(true);

  const allCars = useMemo(() => getAllSelectableCars(), []);
  const effectiveClassFilter: CarClassId | 'ALL' =
    search.trim().length > 0 && activeClass !== 'ALL' ? 'ALL' : activeClass;
  const filteredCars = useMemo(
    () => filterCars(allCars, search, effectiveClassFilter),
    [allCars, search, effectiveClassFilter],
  );

  const inspectCar = useMemo(() => getCarById(inspectCarId), [inspectCarId]);
  const classMeta = CAR_CLASSES[inspectCar.classId];
  const bopScore = computeBoPEquilibriumScore(inspectCar.attributes).toFixed(1);
  const special = resolveCarSpecial(inspectCar);
  const isEquipped = inspectCar.id === selectedCarId;

  const handleInspect = (carId: string) => {
    const c = getCarById(carId);
    setInspectCarId(c.id);
    setInspectLivery(carId === selectedCarId ? { ...selectedLivery } : { ...c.defaultLivery });
  };

  return (
    <div
      data-testid="cars-showcase-modal"
      role="dialog"
      aria-label="Cars Showcase"
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
              CARS SHOWCASE
            </h2>
            <p className="text-xs text-slate-400 truncate">
              {allCars.length} entries across {Object.keys(CAR_CLASSES).length} classes ({CARS.length} chassis)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="btn-showcase-select-car"
            onClick={() => {
              onSelectCar(inspectCar.id, { ...inspectLivery });
              onClose();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-red-950/50"
          >
            <Check className="w-4 h-4" />
            {isEquipped ? 'Keep Selected Car' : 'Select Car for Race'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Cars Showcase"
            className="p-2 rounded bg-[#161b24] hover:bg-[#202836] border border-white/10 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
        {/* Left: Search & Car Roster */}
        <div className="lg:col-span-5 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0e121a] p-4 md:p-5 space-y-3.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${allCars.length} cars by model, brand, or class...`}
              aria-label="Search showcase cars"
              className="w-full pl-8 pr-8 py-2 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear car search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveClass('ALL')}
              className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                effectiveClassFilter === 'ALL'
                  ? 'bg-[#1d2433] border-red-500 text-white'
                  : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              All ({allCars.length})
            </button>
            {Object.values(CAR_CLASSES).map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => {
                  setActiveClass(cls.id);
                  setSearch('');
                }}
                className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  effectiveClassFilter === cls.id
                    ? 'bg-[#1d2433] border-red-500 text-white'
                    : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {cls.shortName}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {effectiveClassFilter === 'ALL' ? 'All Classes' : CAR_CLASSES[effectiveClassFilter].name}
            </span>
            <span className="tabular-nums">{filteredCars.length} shown</span>
          </div>

          <div className="flex-1 min-h-[220px] overflow-y-auto custom-scroll space-y-1.5 pr-1">
            {filteredCars.map((c) => {
              const active = c.id === inspectCar.id;
              const equipped = c.id === selectedCarId;
              const cMeta = CAR_CLASSES[c.classId];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleInspect(c.id)}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1c2434] border-red-500 text-white'
                      : 'bg-[#151a23] border-white/8 text-slate-300 hover:bg-[#1a2130]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-display font-bold rounded-sm shrink-0"
                        style={{ backgroundColor: cMeta.plateColor, color: cMeta.badgeTextColor }}
                      >
                        {cMeta.shortName}
                      </span>
                      <span className="text-xs font-semibold truncate">{c.name}</span>
                      {equipped && (
                        <span className="text-[10px] font-telemetry text-emerald-400 shrink-0">ACTIVE</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {c.manufacturer} · {c.tradeoffNote}
                    </div>
                  </div>
                  <span
                    className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/25"
                    style={{ backgroundColor: c.defaultLivery.primaryColor }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Full 3D Car Viewer & Detailed Specs */}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-[#11151d] lg:overflow-y-auto custom-scroll">
          <div className="relative h-72 sm:h-80 lg:h-[380px] shrink-0 bg-[#0d1119] border-b border-white/10 overflow-hidden">
            <GarageViewport
              carSpec={inspectCar}
              livery={inspectLivery}
              angle={angle}
              autoRotate={autoRotate}
            />

            <div className="absolute top-4 left-5 right-5 pointer-events-none">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span
                  className="px-2 py-0.5 text-[10px] font-display font-bold rounded-sm"
                  style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
                >
                  {classMeta.name}
                </span>
                <span>{inspectCar.manufacturer}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="font-telemetry text-slate-200">#{inspectLivery.driverNumber}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="font-telemetry text-amber-300">BoP {bopScore}</span>
              </div>
              <h3 className="mt-1 text-2xl font-display font-extrabold text-white tracking-tight truncate">
                {inspectCar.name}
              </h3>
            </div>

            <div className="absolute bottom-3.5 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-1 p-1 rounded bg-[#0c1017]/92 border border-white/10 pointer-events-auto">
                {(['hero', 'front', 'side', 'rear'] as GarageAngle[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAngle(a)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      angle === a
                        ? 'bg-red-600 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {a === 'hero' ? '3/4 Hero' : a.charAt(0).toUpperCase() + a.slice(1)}
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
                  Auto-Spin
                </button>
                <span className="text-[11px] text-slate-400 bg-[#0c1017]/90 px-2.5 py-1.5 rounded border border-white/10">
                  Drag to orbit
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Spec Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Powertrain</div>
                <div className="font-semibold text-white mt-0.5 uppercase">
                  {inspectCar.engineType.replace('-', ' ')}
                </div>
              </div>
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Class Special</div>
                <div className="font-semibold text-amber-300 mt-0.5 truncate">{special.specialLabel}</div>
              </div>
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Length / Width</div>
                <div className="font-telemetry text-white mt-0.5">
                  {(inspectCar.dimensions?.length ?? inspectCar.length ?? 4.7).toFixed(2)}m ×{' '}
                  {(inspectCar.dimensions?.width ?? 1.98).toFixed(2)}m
                </div>
              </div>
              <div className="p-3 rounded bg-[#151a24] border border-white/10">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Pace Index</div>
                <div className="font-telemetry text-emerald-400 mt-0.5">
                  {classMeta.basePaceIndex.toFixed(2)}x ({inspectCar.gears ?? 6} Spd)
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed bg-[#141923] border border-white/10 rounded p-3.5">
              <span className="font-semibold text-white">Chassis Character: </span>
              {inspectCar.tradeoffNote}
            </div>

            {/* BoP Performance Bars */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-display font-bold text-white uppercase tracking-wider">
                BoP Performance Profile
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {[
                  { label: 'Top Speed', val: inspectCar.attributes.topSpeed, color: '#ef4444' },
                  { label: 'Acceleration', val: inspectCar.attributes.acceleration, color: '#f97316' },
                  { label: 'Cornering Grip', val: inspectCar.attributes.corneringGrip, color: '#22c55e' },
                  { label: 'Braking', val: inspectCar.attributes.braking, color: '#38bdf8' },
                  { label: 'Efficiency', val: inspectCar.attributes.efficiency, color: '#eab308' },
                ].map((stat) => (
                  <div key={stat.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">{stat.label}</span>
                      <span className="font-telemetry text-white">{stat.val}</span>
                    </div>
                    <div className="h-1.5 rounded bg-[#0c1017] overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-200"
                        style={{ width: `${stat.val}%`, backgroundColor: stat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Livery Presets (when available) */}
            {inspectCar.liveries && inspectCar.liveries.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-xs font-semibold text-slate-200">
                  Works & Team Liveries ({inspectCar.liveries.length})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {inspectCar.liveries.map((preset) => {
                    const activePreset =
                      inspectLivery.primaryColor.toLowerCase() === preset.livery.primaryColor.toLowerCase() &&
                      inspectLivery.driverNumber === preset.livery.driverNumber;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setInspectLivery({ ...preset.livery })}
                        className={`flex items-center gap-2 p-2 rounded border text-left cursor-pointer transition-colors ${
                          activePreset
                            ? 'bg-[#1d2638] border-red-500 text-white'
                            : 'bg-[#151a24] border-white/10 text-slate-300 hover:bg-[#1b2230]'
                        }`}
                      >
                        <div className="flex -space-x-1 shrink-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/40"
                            style={{ backgroundColor: preset.livery.primaryColor }}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/40"
                            style={{ backgroundColor: preset.livery.secondaryColor }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold truncate">{preset.name}</div>
                          <div className="text-[10px] text-slate-400 font-telemetry">
                            #{preset.livery.driverNumber}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
