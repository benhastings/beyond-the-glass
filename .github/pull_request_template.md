Closes #<!-- issue number -->

## Summary
<!-- What changed and why. -->

## Acceptance criteria
<!-- Copy every criterion from the issue, with its tag, and check each one. If one is wrong or impossible, say so here and on the issue; never skip or renumber it. -->
- [ ] acceptance criteria copied from the issue and each one checked
- [ ] `python3 scripts/ac-trace.py --issue <ID>` passes

## Definition of Done (AGENTS.md §4)
- [ ] All acceptance criteria in the linked issue are met, and `python3 scripts/ac-trace.py --issue <ID>` passes (each automated criterion has a passing test tagged `[<ID>.ACn]`, each manual one has evidence in `docs/evidence/<ID>.md`)
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` pass locally and in CI
- [ ] New logic has unit tests; framework-free packages stay at ≥ 90% line coverage
- [ ] User-facing changes have a Playwright test covering the main path, and axe reports zero violations
- [ ] Keyboard-only operation verified; focus order and visible focus checked
- [ ] Reduced-motion behavior verified for any animation
- [ ] UI changes include screenshots (both moods if applicable) or a short recording
- [ ] `content-guard` and `lint:content` pass
- [ ] Docs updated (support matrix, authoring guide, ADRs) when behavior or conventions change
- [ ] No new runtime third-party requests; bundle budgets still pass

## Screenshots or recording
<!-- Required for UI changes: both moods where they apply. -->
- [ ] screenshots/recording for UI changes attached (or "no UI change")

## How this was verified
<!-- The commands you ran and what they showed. Only claim what actually happened. -->
