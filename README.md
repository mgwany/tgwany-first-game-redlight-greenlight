# Red Light, Green Light

First game created with GenAI (ChatGPT) — now a mobile-friendly web game.

## Play

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000`.

## Controls

- **Tap or click** the game screen to move toward the finish line.
- Hold to keep moving.
- **Don't move on RED.**
- Each level has a **1-minute countdown**. Reach the finish before time runs out.
- You start with **10 lives**. Moving on RED or running out of time costs 1 life.
- After a life loss, **tap or click** to retry the same level (lives carry across wins).
- At **0 lives**, the run ends — tap to restart from Level 1 with 10 lives again.

No keyboard is required. Works with mouse and touch on phones.

## Notes

The original desktop Java version (`RedLightGreenLightGame.java`) used arrow keys to move and `R` to restart. The web app replaces those with tap/click and is laid out for mobile browsers (viewport meta, full-screen usable layout, touch-action / scroll prevention, PWA manifest + optional service worker).
