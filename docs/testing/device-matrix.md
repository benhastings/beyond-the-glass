# Devices and browsers (E11-03)

## What's supported

| | Desktop (1280 × 720 and up) | Tablet | Phone |
|---|---|---|---|
| Lessons, checks, quizzes, the Field Guide | Yes | Yes | Yes |
| Terminal challenges | Yes | Yes | Yes, with a note that a larger screen is better |
| The war room | Two panes at 1280 × 720, three at 1920 × 1080 | Tabs | Tabs, with the same note |

Browsers: the latest Chrome, Edge, Firefox (and Firefox ESR) and Safari, on Windows 10/11 and macOS. Automated
end-to-end tests run in **Chromium only** (AGENTS.md rule 8): `e2e/device-matrix.spec.ts` runs the full journey
at desktop size, and lessons, the quiz and the war room at tablet (820 × 1180) and phone (390 × 844) sizes,
checking nothing scrolls sideways and axe finds no violations.

## Manual checklist: Edge on Windows (E11-03.AC2)

The team's usual environment, checked by a person before launch. Record the result in
`docs/evidence/E11-03.md`.

1. Open the site in Edge on Windows 10 or 11, at 100 % and at 150 % display scaling.
2. Landing page: the Console Room scene shows; **Step up to the Threshold** works.
3. The Threshold: answer a few questions with the keyboard only (Tab, arrows, Enter).
4. **Step through the glass**: the Crossing plays once; Esc skips it.
5. A lesson: the terminal takes input; Ctrl+L clears; Alt+O reads the last output; Copy copies.
6. A field card: print it (Ctrl+P) to PDF; it fits one Letter page.
7. `/stormwatch` at 1280 × 720 and maximised: two and three panes; Alt+1–7; ? lists the shortcuts.
8. Settings: high contrast **on**, and Windows High Contrast (forced colours): every control still has a
   visible boundary and focus ring.
9. Settings: export a progress code, clear site data, import it: progress comes back.
