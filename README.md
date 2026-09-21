# Slay the Spire 2 Strategy Maker

A local-first React dashboard for turning Slay the Spire 2 run history into personal strategy insights. All analytics are pure functions, all data stays in browser storage, and JSON import/export makes it portable.

The dashboard can read the game's `.run` files directly. In Chrome or Edge, connect the normal history folder and then the modded history folder; authorized folders are rescanned when the app opens, regains focus, and every 30 seconds while open. Other browsers receive a folder-import fallback. The usual Windows locations are:

```text
%APPDATA%\SlayTheSpire2\steam\<Steam ID>\profile1\saves\history
%APPDATA%\SlayTheSpire2\steam\<Steam ID>\modded\profile1\saves\history
```

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

The default Vite base is `/Slay-the-Spire-2-Strategy-Maker/`, matching the GitHub Pages repository path. Set `VITE_BASE=/` for root or custom-domain deployments.
