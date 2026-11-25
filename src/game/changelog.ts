export type CommitCategory =
  | 'feat'
  | 'fix'
  | 'refactor'
  | 'perf'
  | 'test'
  | 'docs'
  | 'chore'
  | 'merge'
  | 'update';

export interface GitCommitEntry {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  subject: string;
  category: CommitCategory;
  isMerge: boolean;
}

export interface ChangelogSection {
  date: string;
  items: string[];
}

export interface ChangelogPayload {
  commits: GitCommitEntry[];
  sections: ChangelogSection[];
  generatedAt: string;
}

const COMMIT_PREFIX_RE = /^(feat|fix|refactor|perf|test|docs|chore)(?:\([^)]+\))?:\s*/i;

export function classifyCommitSubject(subject: string): {
  category: CommitCategory;
  isMerge: boolean;
} {
  const trimmed = subject.trim();
  if (/^merge\b/i.test(trimmed)) {
    return { category: 'merge', isMerge: true };
  }
  const match = COMMIT_PREFIX_RE.exec(trimmed);
  if (match) {
    return {
      category: match[1].toLowerCase() as CommitCategory,
      isMerge: false,
    };
  }
  return { category: 'update', isMerge: false };
}

export function parseGitLogOutput(raw: string): GitCommitEntry[] {
  if (!raw) return [];
  const commits: GitCommitEntry[] = [];
  const records = raw.split('\x1e');
  for (const record of records) {
    const cleaned = record.trim();
    if (!cleaned) continue;
    const parts = cleaned.split('\x1f');
    if (parts.length < 5) continue;
    const [hash, shortHash, date, author, ...subjectParts] = parts;
    const subject = subjectParts.join('\x1f').trim();
    if (!hash || !shortHash || !subject) continue;
    const { category, isMerge } = classifyCommitSubject(subject);
    commits.push({
      hash: hash.trim(),
      shortHash: shortHash.trim(),
      date: date.trim(),
      author: author.trim(),
      subject,
      category,
      isMerge,
    });
  }
  return commits;
}

export function parseChangelogMarkdown(markdown: string): ChangelogSection[] {
  if (!markdown) return [];
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const headingMatch = /^##\s+(.+)$/.exec(line);
    if (headingMatch) {
      if (current) {
        sections.push(current);
      }
      current = {
        date: headingMatch[1].trim(),
        items: [],
      };
      continue;
    }
    if (current && line.startsWith('- ')) {
      current.items.push(line.slice(2).trim());
    }
  }
  if (current) {
    sections.push(current);
  }
  return sections;
}
