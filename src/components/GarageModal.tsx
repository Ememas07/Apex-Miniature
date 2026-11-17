import { useState } from 'react';
import { X, RotateCcw, Check, Search } from 'lucide-react';
import {
  CAR_CLASSES,
  CARS,
  computeBoPEquilibriumScore,
  filterCars,
  getCarById,
  resolveCarSpecial,
  validateDriverNumber,
} from '../game/cars';
import {
  CarClassId,
  HeadlightTint,
  LiveryConfig,
  LiveryTemplate,
  NumberPlateStyle,
  RimFinish,
} from '../game/types';
import { GarageAngle, GarageViewport } from '../three/GarageViewport';

interface GarageModalProps {
  selectedCarId: string;
  livery: LiveryConfig;
  onSelectCar: (carId: string, resetLivery: LiveryConfig) => void;
  onChangeLivery: (livery: LiveryConfig) => void;
  onClose: () => void;
}

type StudioTab = 'car' | 'livery' | 'number';

const COLOR_SWATCHES = [
  '#dc2626', '#ea580c', '#facc15', '#84cc16', '#16a34a', '#065f46',
  '#06b6d4', '#2563eb', '#1e1b4b', '#7c3aed', '#ec4899', '#f8fafc',
  '#94a3b8', '#334155', '#111827',
];

const RIM_OPTIONS: Array<{ id: RimFinish; label: string; swatch: string }> = [
  { id: 'gloss-black', label: 'Gloss Black', swatch: '#14171c' },
  { id: 'silver', label: 'Silver Alloy', swatch: '#d4d8df' },
  { id: 'gold-bronze', label: 'Gold / Bronze', swatch: '#c89b3c' },
  { id: 'white', label: 'Motorsport White', swatch: '#f1f5f9' },
  { id: 'body-matched', label: 'Body-Matched', swatch: 'linear-gradient(135deg,#ef4444,#3b82f6)' },
];

const TEMPLATE_OPTIONS: Array<{ id: LiveryTemplate; label: string; desc: string }> = [
  { id: 'racing-stripes', label: 'Racing Stripes', desc: 'Twin center stripes & rocker trim' },
  { id: 'two-tone', label: 'Two-Tone Split', desc: 'Diagonal aero flank & contrast tail' },
  { id: 'geometric', label: 'Geometric Blocks', desc: 'Angular modern works chevrons' },
  { id: 'heritage', label: 'Heritage Stripes', desc: 'Classic triple endurance bands' },
];

const PLATE_OPTIONS: Array<{ id: NumberPlateStyle; label: string; color: string }> = [
  { id: 'auto', label: 'Auto by Class', color: '#475569' },
  { id: 'gtp-red', label: 'GTP Red', color: '#dc2626' },
  { id: 'lmp2-blue', label: 'LMP2 Blue', color: '#2563eb' },
  { id: 'gt3-green', label: 'GT3 Green', color: '#16a34a' },
  { id: 'gt4-cyan', label: 'GT4 Cyan', color: '#0284c7' },
  { id: 'gtd-amber', label: 'GTD Amber', color: '#f59e0b' },
  { id: 'formula-white', label: 'Formula White', color: '#f8fafc' },
];

const HEADLIGHT_OPTIONS: Array<{ id: HeadlightTint; label: string; hex: string }> = [
  { id: 'crystal-white', label: 'Crystal White', hex: '#f8fafc' },
  { id: 'endurance-yellow', label: 'Endurance Yellow (GT)', hex: '#facc15' },
  { id: 'ice-blue', label: 'Ice Blue (EV)', hex: '#38bdf8' },
];

const BANNER_PRESETS = ['APEX', 'GT', 'PROTO', 'PRO', 'AM', 'WEC', 'IMSA', 'F1'];

export function GarageModal({
  selectedCarId,
  livery,
  onSelectCar,
  onChangeLivery,
  onClose,
}: GarageModalProps) {
  const activeCar = getCarById(selectedCarId);
  const [activeClass, setActiveClass] = useState<CarClassId | 'ALL'>(activeCar.classId);
  const [carSearch, setCarSearch] = useState('');
  const [tab, setTab] = useState<StudioTab>('livery');
  const [angle, setAngle] = useState<GarageAngle>('hero');

  const trimmedCarSearch = carSearch.trim();
  const effectiveClassFilter: CarClassId | 'ALL' = trimmedCarSearch.length > 0 && activeClass !== 'ALL' ? 'ALL' : activeClass;
  const classCars = filterCars(CARS, carSearch, effectiveClassFilter);
  const classMeta = CAR_CLASSES[activeCar.classId];
  const bopScore = computeBoPEquilibriumScore(activeCar.attributes).toFixed(1);

  const updateLivery = (patch: Partial<LiveryConfig>) => {
    onChangeLivery({ ...livery, ...patch });
  };

  return (
    <div
      data-testid="garage-modal"
      role="dialog"
      aria-label="Garage and Livery Studio"
      className="fixed inset-0 z-30 bg-[#0b0e13] flex flex-col lg:flex-row overflow-hidden"
    >
      {/* LEFT: Live 3D Die-Cast Turntable */}
      <div className="relative flex-1 min-h-[300px] lg:h-full bg-[#10141c] border-b lg:border-b-0 lg:border-r border-white/10">
        <GarageViewport carSpec={activeCar} livery={livery} angle={angle} />

        {/* Top-Left Car Identity */}
        <div className="absolute top-5 left-5 right-5 flex items-start justify-between pointer-events-none">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="px-2 py-0.5 text-xs font-display font-bold rounded-sm"
                style={{ backgroundColor: classMeta.plateColor, color: classMeta.badgeTextColor }}
              >
                {classMeta.shortName}
              </span>
              <span className="text-xs text-slate-400">{activeCar.manufacturer} · BoP Index {bopScore}</span>
            </div>
            <h2 className="mt-1 text-2xl md:text-3xl font-display font-extrabold text-white tracking-tight">
              {activeCar.name}
            </h2>
            <p className="mt-1 max-w-md text-xs text-slate-300 leading-relaxed">
              {activeCar.tradeoffNote}
            </p>
          </div>
        </div>

        {/* Bottom Turntable Camera Angles + BoP Quick Readout */}
        <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
          <div className="flex items-center gap-1.5 p-1 rounded-md bg-[#121720]/95 border border-white/10 pointer-events-auto">
            {(['hero', 'front', 'side', 'rear'] as GarageAngle[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAngle(a)}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                  angle === a
                    ? 'bg-red-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {a === 'hero' ? '3/4 Hero' : a.charAt(0).toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400 bg-[#121720]/90 px-3 py-1.5 rounded border border-white/10">
            Drag car to inspect 360°
          </div>
        </div>
      </div>

      {/* RIGHT: Interactive Customization Studio */}
      <div className="w-full lg:w-[490px] xl:w-[520px] h-[56vh] lg:h-full bg-[#11151d] flex flex-col">
        {/* Studio Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h3 className="text-base font-display font-bold text-white">Garage & Livery Studio</h3>
            <p className="text-xs text-slate-400">Customize chassis, paint, carbon & race numbers</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeLivery({ ...activeCar.defaultLivery })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 cursor-pointer whitespace-nowrap"
              title="Reset to factory livery"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Factory
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Done and close Garage"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-display font-bold text-white cursor-pointer whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              Apply & Close
            </button>
          </div>
        </div>

        {/* Studio Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-[#0c1017] border-b border-white/10">
          {[
            { id: 'car' as StudioTab, label: 'Car & BoP' },
            { id: 'livery' as StudioTab, label: 'Paint & Livery' },
            { id: 'number' as StudioTab, label: 'Number & Lights' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-2 px-3 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.id
                  ? 'bg-[#1c2331] text-white border border-white/15'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-6">
          {tab === 'car' && (
            <>
              {/* Instant Car Model Search */}
              <div>
                <label htmlFor="garage-car-search" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Search Car Models
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="garage-car-search"
                    type="text"
                    value={carSearch}
                    onChange={(e) => setCarSearch(e.target.value)}
                    placeholder={`Search ${CARS.length} cars by model, brand, class, or ID...`}
                    aria-label="Search car models"
                    className="w-full pl-8 pr-8 py-2 rounded bg-[#0c1017] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                  />
                  {carSearch.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCarSearch('')}
                      aria-label="Clear car search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Class Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Motorsport Class (All Unlocked)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveClass('ALL')}
                    className={`px-2.5 py-2 rounded text-left text-xs font-semibold border transition-colors cursor-pointer truncate ${
                      effectiveClassFilter === 'ALL'
                        ? 'bg-[#1d2433] border-red-500 text-white'
                        : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({CARS.length})
                  </button>
                  {Object.values(CAR_CLASSES).map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => {
                        setActiveClass(cls.id);
                        setCarSearch('');
                      }}
                      className={`px-2.5 py-2 rounded text-left text-xs font-semibold border transition-colors cursor-pointer truncate ${
                        effectiveClassFilter === cls.id
                          ? 'bg-[#1d2433] border-red-500 text-white'
                          : 'bg-[#151a24] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cls.shortName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtered Car List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">
                    {effectiveClassFilter === 'ALL'
                      ? trimmedCarSearch
                        ? 'Search Results Across All Classes'
                        : 'All Motorsport Classes'
                      : CAR_CLASSES[effectiveClassFilter].name}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">
                    Showing {classCars.length} of {CARS.length} cars
                  </span>
                </div>
                {classCars.length === 0 ? (
                  <div className="p-5 rounded border border-dashed border-white/15 bg-[#0e131c] text-center space-y-2.5">
                    <p className="text-xs text-slate-300">
                      No car models match &ldquo;{carSearch}&rdquo;.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCarSearch('')}
                      className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scroll pr-1">
                    {classCars.map((c) => {
                      const selected = c.id === activeCar.id;
                      const cMeta = CAR_CLASSES[c.classId];
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onSelectCar(c.id, { ...c.defaultLivery })}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded border text-left transition-colors cursor-pointer ${
                            selected
                              ? 'bg-[#1c2434] border-red-500 text-white'
                              : 'bg-[#151a23] border-white/5 text-slate-300 hover:bg-[#19202b]'
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate">{c.name}</span>
                              {effectiveClassFilter === 'ALL' && (
                                <span
                                  className="px-1.5 py-0.5 text-[10px] font-bold rounded-sm shrink-0"
                                  style={{ backgroundColor: cMeta.plateColor, color: cMeta.badgeTextColor }}
                                >
                                  {cMeta.shortName}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">{c.tradeoffNote}</div>
                          </div>
                          <span
                            className="w-4 h-4 rounded-sm shrink-0 border border-white/20"
                            style={{ backgroundColor: c.defaultLivery.primaryColor }}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Asymmetric BoP 5-Attribute Bars */}
              <div className="pt-3 border-t border-white/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Asymmetric BoP Profile</span>
                  <span className="text-slate-400">Special: {resolveCarSpecial(activeCar).specialLabel}</span>
                </div>
                {[
                  { label: 'Top Speed', val: activeCar.attributes.topSpeed, color: '#ef4444' },
                  { label: 'Acceleration', val: activeCar.attributes.acceleration, color: '#f97316' },
                  { label: 'Cornering Grip', val: activeCar.attributes.corneringGrip, color: '#22c55e' },
                  { label: 'Braking', val: activeCar.attributes.braking, color: '#38bdf8' },
                  { label: 'Tire / Energy Efficiency', val: activeCar.attributes.efficiency, color: '#eab308' },
                ].map((stat) => (
                  <div key={stat.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">{stat.label}</span>
                      <span className="font-telemetry text-white">{stat.val}</span>
                    </div>
                    <div className="h-2 rounded bg-[#0c1017] overflow-hidden">
                      <div
                        className="h-full rounded transition-all duration-200"
                        style={{ width: `${stat.val}%`, backgroundColor: stat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'livery' && (
            <>
              {/* Livery Templates */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Livery Template
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATE_OPTIONS.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => updateLivery({ template: tpl.id })}
                      className={`p-2.5 rounded border text-left transition-colors cursor-pointer ${
                        livery.template === tpl.id
                          ? 'bg-[#1d2534] border-red-500 text-white'
                          : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{tpl.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{tpl.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3-Channel Color Pickers */}
              {(
                [
                  { key: 'primaryColor', label: 'Primary Body Color' },
                  { key: 'secondaryColor', label: 'Secondary Accent Color' },
                  { key: 'tertiaryColor', label: 'Tertiary Trim Color' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor={`color-${key}`} className="text-xs font-semibold text-slate-300">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="font-telemetry text-[11px] text-slate-400 uppercase">
                        {livery[key]}
                      </span>
                      <input
                        id={`color-${key}`}
                        type="color"
                        value={livery[key]}
                        onChange={(e) => updateLivery({ [key]: e.target.value })}
                        className="w-7 h-7 rounded border border-white/20 bg-transparent cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Select ${label} ${hex}`}
                        onClick={() => updateLivery({ [key]: hex })}
                        className={`w-6 h-6 rounded-sm border cursor-pointer transition-transform ${
                          livery[key].toLowerCase() === hex.toLowerCase()
                            ? 'border-white scale-110 ring-2 ring-red-500'
                            : 'border-white/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Wheel Rim Finish */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Wheel Rim Finish
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {RIM_OPTIONS.map((rim) => (
                    <button
                      key={rim.id}
                      type="button"
                      onClick={() => updateLivery({ rimFinish: rim.id })}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded border text-xs font-medium cursor-pointer transition-colors ${
                        livery.rimFinish === rim.id
                          ? 'bg-[#1d2534] border-red-500 text-white'
                          : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                        style={{ background: rim.swatch }}
                      />
                      <span className="truncate">{rim.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Exposed Carbon Fiber Toggles */}
              <div className="pt-2 border-t border-white/10">
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Exposed Carbon Fiber Elements
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'carbonHood' as const, label: 'Carbon Hood' },
                    { key: 'carbonWing' as const, label: 'Carbon Wing' },
                    { key: 'carbonSplitter' as const, label: 'Carbon Splitter' },
                  ].map((item) => {
                    const active = livery[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateLivery({ [item.key]: !active })}
                        className={`px-2.5 py-2 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                          active
                            ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                            : 'bg-[#151a23] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.label}: {active ? 'ON' : 'OFF'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'number' && (
            <>
              {/* Custom 1-to-3 digit Driver Number */}
              <div>
                <label htmlFor="driver-number-input" className="block text-xs font-semibold text-slate-300 mb-2">
                  Racing Number (1–3 Digits)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="driver-number-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={livery.driverNumber}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                      updateLivery({ driverNumber: cleaned });
                    }}
                    onBlur={() => updateLivery({ driverNumber: validateDriverNumber(livery.driverNumber) })}
                    className="w-28 px-3 py-2.5 rounded bg-[#0c1017] border border-white/20 text-white font-display font-bold text-xl tracking-wider text-center focus:outline-none focus:border-red-500"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {['1', '7', '16', '24', '51', '007', '911'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => updateLivery({ driverNumber: preset })}
                        className="px-2.5 py-1.5 rounded bg-[#161b24] hover:bg-[#1e2532] border border-white/10 text-xs font-telemetry text-slate-200 cursor-pointer"
                      >
                        #{preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Class-Colored Number Plate */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Number Plate Backing
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PLATE_OPTIONS.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => updateLivery({ numberPlateStyle: pl.id })}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                        livery.numberPlateStyle === pl.id
                          ? 'bg-[#1d2534] border-red-500 text-white'
                          : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-sm border border-white/25 shrink-0"
                        style={{ backgroundColor: pl.color }}
                      />
                      <span>{pl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Headlight Tint */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Headlight Lens Tint
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {HEADLIGHT_OPTIONS.map((hl) => (
                    <button
                      key={hl.id}
                      type="button"
                      onClick={() => updateLivery({ headlightTint: hl.id })}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                        livery.headlightTint === hl.id
                          ? 'bg-[#1d2534] border-red-500 text-white'
                          : 'bg-[#151a23] border-white/10 text-slate-300 hover:bg-[#1a202b]'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                        style={{ backgroundColor: hl.hex }}
                      />
                      <span className="truncate">{hl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Windshield Sunstrip Banner */}
              <div>
                <label htmlFor="windshield-banner-input" className="block text-xs font-semibold text-slate-300 mb-2">
                  Windshield Banner Text
                </label>
                <input
                  id="windshield-banner-input"
                  type="text"
                  maxLength={10}
                  value={livery.windshieldBanner}
                  onChange={(e) => updateLivery({ windshieldBanner: e.target.value.toUpperCase().slice(0, 10) })}
                  className="w-full px-3 py-2 rounded bg-[#0c1017] border border-white/20 text-white font-display font-bold tracking-widest uppercase text-sm focus:outline-none focus:border-red-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {BANNER_PRESETS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => updateLivery({ windshieldBanner: b })}
                      className="px-2.5 py-1 rounded bg-[#161b24] hover:bg-[#1e2532] border border-white/10 text-[11px] font-display font-bold text-slate-300 cursor-pointer"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile floating close icon fallback */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close Garage"
        className="lg:hidden absolute top-4 right-4 p-2 rounded-md bg-[#121720] border border-white/20 text-white"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
