# Third-party components shipped in `public/`

| Component | Where | License |
|---|---|---|
| Firebase JS SDK 12.x (`firebase/app`, `firebase/app-check`, `firebase/ai`), bundled into `hybrid.bundle.js` | `public/hybrid.bundle.js` | Apache-2.0 |
| Chart.js 4.4.4 | `public/vendor/chart.umd.min.js` | MIT |
| Instrument Serif, DM Mono, Geist (latin subsets, via `@fontsource`) | `public/fonts/` | SIL Open Font License 1.1 |

Run `npm install && npm run vendor && npm run build` to regenerate them from npm.
