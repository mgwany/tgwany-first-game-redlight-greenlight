# Red Light, Green Light

First game created with GenAI (ChatGPT) — now a mobile-friendly web game hosted on **Netlify**.

## Play (with high scores)

High scores use a **Netlify Function** plus **Netlify Blobs**. Lambda/Functions disk is ephemeral, so the live board is stored in Blobs under key `highscore.txt` using the same comma-delimited CSV shape as the repo example file.

### Deploy on Netlify

1. Connect this repo to a Netlify site (publish directory = site root).
2. Netlify runs `npm install` (see `netlify.toml`) and publishes static files + `netlify/functions`.
3. Open the site URL — the HIGH SCORE panel loads from `/.netlify/functions/highscores`.

No `node server.js`. No cloud database beyond Netlify Blobs (included with the site).

### Local development

```bash
npm install
npm run dev
# → netlify dev (serves the site + Functions; link a Netlify site for Blobs)
```

Then open the URL printed by the CLI (usually `http://localhost:8888`).

If Functions/Blobs are unavailable (plain `file://` or a static-only server), the game still plays; the HIGH SCORE panel shows an offline message and cannot persist.

### Score format (`highscore.txt`)

Comma-delimited CSV, one entry per line (repo file is the format example / empty seed; production data lives in Blobs):

```text
name,level
Ada,7
Mina,5
```

- **Score** = highest **level reached** in a finished run (not time).
- Top **10** only. Sorted by level descending.
- **Tie-break:** equal levels keep the **earlier** entry ranked higher (new ties insert after existing same-level scores).
- Names are trimmed, commas stripped, max 20 characters.

### API

- `GET /.netlify/functions/highscores` — load the board  
- `POST /.netlify/functions/highscores` with JSON `{ "name": "Ada", "level": 7 }` — submit if it qualifies  

`/api/highscores` is redirected to the same Function (`netlify.toml`) for convenience.

## Controls

- **Tap or click** the game screen to move toward the finish line (mobile-friendly).
- **Arrow keys** (↑ ↓ ← →) move in four directions on desktop. Hold a key to keep moving.
- Hold tap/click to keep moving forward.
- **Don't move on RED.**
- Each level has a **1-minute countdown**. Reach the finish before time runs out.
- You start with **10 lives**. Moving on RED or running out of time costs 1 life.
- After a life loss, **tap or click** to retry the same level (lives carry across wins).
- At **0 lives**, the run ends. If your highest level reached makes the top 10, enter your name; the HIGH SCORE list is on the right (stacks under the stage on narrow phones).
- After that, tap to restart from Level 1 with 10 lives again.

Works with mouse, touch, and keyboard arrows. Name entry uses the on-screen or hardware keyboard.

## Notes

The original desktop Java version (`RedLightGreenLightGame.java`) used arrow keys to move and `R` to restart. The web app keeps tap/click for mobile and restores arrow-key movement for desktop (viewport meta, full-screen usable layout, touch-action / scroll prevention, PWA manifest + optional service worker).
