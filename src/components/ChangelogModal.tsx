import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  GitCommitHorizontal,
  Search,
  User,
  X,
} from 'lucide-react';
import { gitChangelog } from 'virtual:git-changelog';
import { ChangelogPayload, CommitCategory } from '../game/changelog';

interface ChangelogModalProps {
  onClose: () => void;
}

type ChangelogTab = 'commits' | 'notes';

const CATEGORY_STYLES: Record<CommitCategory, { label: string; className: string }> = {
  feat: {
    label: 'FEAT',
    className: 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300',
  },
  fix: {
    label: 'FIX',
    className: 'bg-rose-500/15 border-rose-400/35 text-rose-300',
  },
  refactor: {
    label: 'REFACTOR',
    className: 'bg-sky-500/15 border-sky-400/35 text-sky-300',
  },
  perf: {
    label: 'PERF',
    className: 'bg-amber-500/15 border-amber-400/35 text-amber-300',
  },
  test: {
    label: 'TEST',
    className: 'bg-violet-500/15 border-violet-400/35 text-violet-300',
  },
  docs: {
    label: 'DOCS',
    className: 'bg-cyan-500/15 border-cyan-400/35 text-cyan-300',
  },
  chore: {
    label: 'CHORE',
    className: 'bg-slate-500/20 border-slate-400/35 text-slate-300',
  },
  merge: {
    label: 'MERGE',
    className: 'bg-indigo-500/15 border-indigo-400/35 text-indigo-300',
  },
  update: {
    label: 'COMMIT',
    className: 'bg-white/10 border-white/20 text-slate-200',
  },
};

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const [payload, setPayload] = useState<ChangelogPayload>(gitChangelog);
  const [activeTab, setActiveTab] = useState<ChangelogTab>('commits');
  const [query, setQuery] = useState('');
  const [hideMerges, setHideMerges] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('./api/changelog', { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ChangelogPayload | null) => {
        if (data && Array.isArray(data.commits) && data.commits.length > 0) {
          setPayload(data);
        }
      })
      .catch(() => {
        // Offline / static bundle fallback uses embedded virtual:git-changelog data
      });
    return () => controller.abort();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredCommits = useMemo(() => {
    return payload.commits.filter((c) => {
      if (hideMerges && c.isMerge) return false;
      if (!normalizedQuery) return true;
      return (
        c.subject.toLowerCase().includes(normalizedQuery) ||
        c.shortHash.toLowerCase().includes(normalizedQuery) ||
        c.author.toLowerCase().includes(normalizedQuery) ||
        c.date.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [payload.commits, hideMerges, normalizedQuery]);

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return payload.sections;
    return payload.sections
      .map((sec) => {
        if (sec.date.toLowerCase().includes(normalizedQuery)) return sec;
        const matchingItems = sec.items.filter((item) =>
          item.toLowerCase().includes(normalizedQuery),
        );
        return matchingItems.length > 0 ? { ...sec, items: matchingItems } : null;
      })
      .filter((sec): sec is NonNullable<typeof sec> => sec !== null);
  }, [payload.sections, normalizedQuery]);

  const latestCommit = payload.commits[0];

  return (
    <div
      data-testid="changelog-modal"
      role="dialog"
      aria-label="Changelog and Git Commit History"
      className="fixed inset-0 z-40 bg-black/82 flex items-center justify-center safe-pad-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92dvh] flex flex-col bg-[#0d1118] border border-white/15 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-[#0a0e14]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <GitCommitHorizontal className="w-5 h-5 text-sky-400 shrink-0" />
              <h2 className="text-lg sm:text-xl font-display font-bold text-white tracking-wide">
                Changelog &amp; Git History
              </h2>
              {latestCommit && (
                <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/35 font-telemetry text-[11px] text-sky-300">
                  HEAD {latestCommit.shortHash}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {payload.commits.length} total commits · {payload.sections.length} release milestones
              {latestCommit ? ` · Last updated ${latestCommit.date}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close changelog"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Tabs + Search + Merge Filter */}
        <div className="px-5 py-3 border-b border-white/10 bg-[#101620] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="tab-changelog-commits"
              onClick={() => setActiveTab('commits')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                activeTab === 'commits'
                  ? 'bg-sky-600/25 border-sky-400/60 text-white'
                  : 'bg-[#0b0e13]/70 border-white/10 text-slate-300 hover:text-white hover:border-white/25'
              }`}
            >
              <GitCommitHorizontal className="w-3.5 h-3.5 text-sky-400" />
              <span>Git Commits ({filteredCommits.length})</span>
            </button>
            <button
              type="button"
              data-testid="tab-changelog-notes"
              onClick={() => setActiveTab('notes')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-display font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                activeTab === 'notes'
                  ? 'bg-amber-600/25 border-amber-400/60 text-white'
                  : 'bg-[#0b0e13]/70 border-white/10 text-slate-300 hover:text-white hover:border-white/25'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Release Notes ({filteredSections.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-1 sm:max-w-md justify-end">
            {activeTab === 'commits' && (
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 whitespace-nowrap cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideMerges}
                  onChange={(e) => setHideMerges(e.target.checked)}
                  className="accent-sky-500 cursor-pointer"
                />
                <span>Hide merges</span>
              </label>
            )}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  activeTab === 'commits'
                    ? 'Search commits, hash, author...'
                    : 'Search release notes...'
                }
                className="w-full pl-8 pr-7 py-1.5 rounded-md bg-[#0b0e13] border border-white/15 focus:border-sky-400/60 outline-none text-xs text-slate-100 placeholder:text-slate-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto custom-scroll p-4 sm:p-5 space-y-2.5">
          {activeTab === 'commits' ? (
            filteredCommits.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-400">
                No git commits match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredCommits.map((commit, index) => {
                  const badge = CATEGORY_STYLES[commit.category];
                  return (
                    <div
                      key={commit.hash}
                      className="rounded-lg bg-[#121823]/90 hover:bg-[#171f2d] border border-white/8 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors"
                    >
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                        <span className="font-telemetry text-[11px] px-1.5 py-0.5 rounded bg-black/45 border border-white/12 text-sky-300 shrink-0">
                          {commit.shortHash}
                        </span>
                        <span
                          className={`text-[10px] font-display font-bold px-1.5 py-0.5 rounded border shrink-0 ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-xs sm:text-[13px] text-slate-100 font-medium break-words">
                          {commit.subject}
                        </span>
                        {index === 0 && !normalizedQuery && (
                          <span className="text-[10px] font-display font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 shrink-0">
                            LATEST
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0 font-telemetry pl-0 sm:pl-3">
                        <span className="inline-flex items-center gap-1 text-slate-300">
                          <User className="w-3 h-3 text-slate-400" />
                          {commit.author}
                        </span>
                        <span>{commit.date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredSections.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">
              No release notes match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSections.map((section) => (
                <section
                  key={section.date}
                  className="rounded-lg bg-[#121823]/90 border border-white/10 p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <h3 className="font-display font-bold text-sm text-amber-300 tracking-wide">
                      {section.date}
                    </h3>
                    <span className="font-telemetry text-[11px] text-slate-400">
                      {section.items.length} {section.items.length === 1 ? 'change' : 'changes'}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs sm:text-[13px] text-slate-200 leading-relaxed list-disc pl-5">
                    {section.items.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
