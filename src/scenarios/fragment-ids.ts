/** IDs of the scenarios built from GitOps fragments in ./fragments.ts (E9-08), for the content build's checks. */
export const FRAGMENT_SCENARIO_IDS = [
  'gitops-drift',
  'gitops-manual-sync',
  'gitops-sync-failed',
  'gitops-bad-release',
] as const
