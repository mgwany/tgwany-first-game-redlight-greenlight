# Red Light, Green Light

First game created with GenAI (ChatGPT) — now a mobile-friendly web game.

## Play (with high scores)

High scores are stored in a local `highscore.txt` file. Browsers cannot write that file directly, so run the tiny Node server (serves the game **and** reads/writes scores):

```bash
node server.js
```

Then visit `http://127.0.0.1:8000`.

Optional env vars: `PORT` (default `8000`), `HOST` (default `127.0.0.1`).

### `highscore.txt` format

Comma-delimited CSV, one entry per line:

```text
name,level
Ada,7
Mina,5
```

- **Score** = highest **level reached** in a finished run (not time).
- Top **10** only. Sorted by level descending.
- **Tie-break:** equal levels keep the **earlier** entry ranked higher (new ties insert after existing same-level scores).
- Names are trimmed, commas stripped, max 20 characters.

API used by the game:

- `GET /api/highscores` — load the board
- `POST /api/highscores` with JSON `{ "name": "Ada", "level": 7 }` — submit if it qualifies

Opening `index.html` as a file (or a plain static server without `server.js`) still plays, but the HIGH SCORE panel cannot persist to disk.

## Controls

- **Tap or click** the game screen to move toward the finish line.
- Hold to keep moving.
- **Don't move on RED.**
- Each level has a **1-minute countdown**. Reach the finish before time runs out.
- You start with **10 lives**. Moving on RED or running out of time costs 1 life.
- After a life loss, **tap or click** to retry the same level (lives carry across wins).
- At **0 lives**, the run ends. If your highest level reached makes the top 10, enter your name; the HIGH SCORE list is on the right (stacks under the stage on narrow phones).
- After that, tap to restart from Level 1 with 10 lives again.

No keyboard is required for play (name entry uses the on-screen keyboard). Works with mouse and touch on phones.

## Notes

The original desktop Java version (`RedLightGreenLightGame.java`) used arrow keys to move and `R` to restart. The web app replaces those with tap/click and is laid out for mobile browsers (viewport meta, full-screen usable layout, touch-action / scroll prevention, PWA manifest + optional service worker).
