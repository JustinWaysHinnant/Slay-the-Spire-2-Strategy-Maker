# Slay the Spire 2 Strategy Maker

A local-first React dashboard for turning Slay the Spire 2 run history into personal strategy insights. All analytics are pure functions, all data stays in browser storage, and JSON import/export makes it portable.

The hosted app is protected by Steam OpenID. Steam verifies account ownership and the authentication service returns a signed, seven-day session containing only the verified SteamID64. Run-history files and analytics remain in the browser and are never uploaded to the authentication service. No Steam Web API key is used or included in the frontend.

The dashboard can read the game's `.run` files directly. In Chrome or Edge, connect the normal history folder and then the modded history folder; authorized folders are rescanned when the app opens, regains focus, and every 30 seconds while open. Other browsers receive a folder-import fallback. The usual Windows locations are:

Choose the `history` folder itself when connecting. The app rejects connecting the exact same folder as both Normal and Modded. Current game versions may initially copy vanilla history into the separate modded profile; identical copied runs are recognized and counted only once. If automatic folder access is unavailable, use **Import Normal/Modded history folder** and select the appropriate `history` directory; that is a one-time import, not automatic sync.

History shows the relics held at the end of each run and a collapsible floor-by-floor record of relic gains and removals. Re-import previously imported `.run` files to fill in their relic timelines; matching runs are enriched rather than duplicated. The manual run form also supports recording a relic exchange by entering the removed and gained relics on the same floor.

Dashboard and History filters separate Normal from Modded saves and Singleplayer from Multiplayer runs. Character filtering appears for Singleplayer, while History includes an abandoned-run breakdown for every character in both run types. Older records without run-type metadata are treated as Singleplayer instead of appearing in a separate unclassified bucket.

For multiplayer Normal and Modded files, the importer matches the verified signed-in SteamID64 to `players[].id` and uses only that player's character, deck, relics, potions, and per-floor history. Multiplayer files that do not contain the signed-in SteamID are skipped rather than falling back to another player. Reconnecting or re-importing a folder replaces older first-player multiplayer records with the correct signed-in player data.

Card signals count each card a run owned at any point, including cards later removed or transformed. Each signal also shows removals among runs with recorded removal history. Imported runs use the game's card gain, removal, transformation, and final-deck records. Re-import older `.run` files to enrich existing runs without duplicates; until then, older saved runs fall back to their final decks. For manual runs, list removed cards separately beneath the final-card entries.

The strategy dashboard preserves each imported run's seed, game build, Acts, chronological route, combat turns, HP and gold changes, and complete card, relic, potion, Ancient, event, and rest-site choices. Its decision table compares picked and skipped card offers with the next fight's HP cost; encounter pressure reports deaths per visit and median HP/turn costs; routing and resource panels summarize the selected scope. Filters cover patch, character, Ascension, and Act. Rates use 95% Wilson intervals, medians use deterministic 95% bootstrap intervals, and small card-pick samples are shrunk toward the matching character-and-Ascension baseline. Re-import older history files to populate these fields.

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

For Steam sign-in on prod, deploy the Worker's production environment (see below) and set a `STEAM_AUTH_API` variable on the `production` GitHub environment to its origin. It overrides the repository-level variable that dev uses.

Run data lives in browser storage per origin, so dev and prod keep separate data. Use JSON export/import to move data between them.

## Steam authentication service

The serverless authentication gateway is in `worker/` and is configured for Cloudflare Workers. It verifies Steam's OpenID response directly with Steam before issuing an HMAC-signed session. `SESSION_SECRET` is a server-only Cloudflare secret and must be at least 32 random characters.

```bash
pnpm exec wrangler secret put SESSION_SECRET --cwd worker
pnpm exec wrangler deploy --cwd worker
```

Set the GitHub repository Actions variable `STEAM_AUTH_API` to the deployed Worker origin, such as `https://sts2-strategy-maker-auth.example.workers.dev`, then redeploy GitHub Pages. For local frontend development, set `VITE_STEAM_AUTH_API` in an ignored `.env.local` file. For local Worker development, store `SESSION_SECRET` in an ignored `worker/.dev.vars` file.

The Worker only accepts sign-in returns to its `FRONTEND_URL`, so prod uses a separate deployment configured for `https://sts2.dynamicacg.io/`:

```bash
pnpm exec wrangler secret put SESSION_SECRET --cwd worker --env production
pnpm exec wrangler deploy --cwd worker --env production
```
