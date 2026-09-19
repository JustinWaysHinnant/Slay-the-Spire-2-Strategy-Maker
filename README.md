# Slay the Spire 2 Strategy Maker

A local-first React dashboard for turning Slay the Spire 2 run history into personal strategy insights. All analytics are pure functions, all data stays in browser storage, and JSON import/export makes it portable.

## Development

Requires Node 22 or newer.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

Card entries support optional acquisition floors using `Card name @ floor`. The dashboard groups timed pickups into 10-floor bands and compares each band's win rate with the overall counted-run baseline. Abandoned runs and untimed legacy cards are excluded from that calculation.

The default Vite base is `/spire2-run-tracker/`. Set `VITE_BASE=/` for root or custom-domain deployments.
