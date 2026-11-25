/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:git-changelog' {
  import type { ChangelogPayload } from './game/changelog';
  export const gitChangelog: ChangelogPayload;
}
