# Team Swiss Event Tracker (JavaScript)

Offline-first static website for running **T-team / P-players-per-team MTG team swiss** events with:

- Unlimited rounds (create next round on demand)
- Team/player editing at any time
- Player match results per pairing (wins are 0 to 2, plus optional draws, with up to 3 games total)
- Auto team standings + tie breakers (Buchholz and OMW%)
- Local storage for multiple events
- Publish current event state into a standalone static HTML snapshot

## Quick start

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` - start Vite dev server
- `npm run build` - build static site
- `npm run preview` - preview production build
- `npm run lint` - run ESLint
- `npm run format` - run Prettier (tabs, width 4)
- `npm run format:check` - verify formatting
- `npm run test` - run Vitest suite

## Notes

- Team count must be even for pairings.
- Pairings are generated at the player level (never within the same team).
- Pairings prioritize each player facing opponents from new teams while still weighting Swiss-adjacent team standings.
- Team-vs-team rematches are deprioritized but may happen when needed to complete valid pairings.
- GitHub Pages project URL is `https://<user>.github.io/team-swiss-event-tracker-js/`; root-domain paths like `/src/main.js` are outside this project's Pages scope.
