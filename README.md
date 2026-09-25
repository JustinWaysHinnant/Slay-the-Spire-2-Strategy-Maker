# Slay the Spire 2 Strategy Maker

A local-first React dashboard for turning Slay the Spire 2 run history into personal strategy insights. All analytics are pure functions, all data stays in browser storage, and JSON import/export makes it portable.

The dashboard can read the game's `.run` files directly. In Chrome or Edge, connect the normal history folder and then the modded history folder; authorized folders are rescanned when the app opens, regains focus, and every 30 seconds while open. Other browsers receive a folder-import fallback. The usual Windows locations are:

Choose the `history` folder itself when connecting. If your browser blocks folder access, use **Import .run files** to select one or more run files instead; that is a one-time import, not automatic sync.

History shows the relics held at the end of each run and a collapsible floor-by-floor record of relic gains and removals. Re-import previously imported `.run` files to fill in their relic timelines; matching runs are enriched rather than duplicated. The manual run form also supports recording a relic exchange by entering the removed and gained relics on the same floor.

Card signals count each card a run owned at any point, including cards later removed or transformed. Each signal also shows removals among runs with recorded removal history. Imported runs use the game's card gain, removal, transformation, and final-deck records. Re-import older `.run` files to enrich existing runs without duplicates; until then, older saved runs fall back to their final decks. For manual runs, list removed cards separately beneath the final-card entries.

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

## Environments

| Environment | URL | Deploys when |
| --- | --- | --- |
| Dev | https://justinwayshinnant.github.io/Slay-the-Spire-2-Strategy-Maker/ | Every push to `main` |
| Prod | https://sts2.dynamicacg.io | A `v*` tag is pushed (or the workflow is run manually) |

Test changes on dev first, then promote the same commit to prod by tagging it:

```bash
git tag v1.1.0
git push origin v1.1.0
```

The prod workflow runs typecheck, tests, and a `VITE_BASE=/` build, then uploads `dist/` to Hostinger over FTPS. It needs a `production` environment with the `FTP_HOST`, `FTP_USER`, and `FTP_PASSWORD` secrets. The FTP account's root should be the subdomain's document root.

Run data lives in browser storage per origin, so dev and prod keep separate data. Use JSON export/import to move data between them.
