# Team Swiss Event Tracker (JavaScript)

Offline-first static website for running **T-team / P-players-per-team MTG team swiss** events with:

- Unlimited rounds (create next round on demand)
- Team/player editing at any time
- BO3 player match results by seat
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
- `npm run format` - run Prettier (tabs)
- `npm run format:check` - verify formatting
- `npm run test` - run Vitest suite

## Notes

- Team count must be even for pairings.
- Pairings avoid teammate pairings by pairing at the team-vs-team level.
- Pairings attempt to avoid rematches and only allow if unavoidable.
