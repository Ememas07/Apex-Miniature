import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ChangelogPayload,
  parseChangelogMarkdown,
  parseGitLogOutput,
} from './changelog';

export function loadChangelogPayload(rootDir: string): ChangelogPayload {
  let commits = [] as ChangelogPayload['commits'];
  try {
    const rawLog = execFileSync(
      'git',
      ['log', '--date=format:%Y-%m-%d %H:%M', '--pretty=format:%H%x1f%h%x1f%ad%x1f%an%x1f%s%x1e'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    commits = parseGitLogOutput(rawLog);
  } catch {
    commits = [];
  }

  let sections = [] as ChangelogPayload['sections'];
  try {
    const changelogPath = path.join(rootDir, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      const md = fs.readFileSync(changelogPath, 'utf8');
      sections = parseChangelogMarkdown(md);
    }
  } catch {
    sections = [];
  }

  return {
    commits,
    sections,
    generatedAt: new Date().toISOString(),
  };
}
