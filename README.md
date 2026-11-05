# UltraRealisticFPS

A small Unreal Engine 5 C++ foundation and a separate, immediately playable browser prototype. The browser build runs from this repository's `web/` directory and is the version intended for a workspace preview or GitHub Pages. It features a randomly generated large arena, thirteen selectable fictional weapons, throwable explosives, hostile bots that patrol, pursue and fire, and a live minimap.

## Run in a workspace website preview

The game is a static website. In a workspace with a web preview, serve the repository's `web/` directory as the site root (or serve the repository root and open `/web/`). It needs network access to load Three.js from jsDelivr and the optional fonts from Google Fonts.

From the repository root, start a local static server:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/web/`. In VS Code, the Live Server extension can also open `web/index.html`; if ES modules are blocked from `file://`, use the HTTP server. The game has no build step or npm dependencies.

## Play

- **WASD:** move; **mouse:** aim
- **Left click / hold:** fire; **1–9:** select weapons; **Q/E** or mouse wheel: cycle through all 13
- **R:** reload; **G:** throw a frag explosive
- **Shift:** sprint; **Space:** jump; **Esc:** pause/release mouse
- Use **NEW PROCEDURAL MAP** in the pause menu to restart with a newly generated arena.

Weapon selection changes damage, firing cadence, magazine, recoil, spread and projectile behavior. The breacher fires a pellet spread; three weapons fire simulated projectiles, two with area damage. Bots use line-of-sight checks, patrol, advance toward the player, seek nearby cover where possible, strafe in close combat and launch projectiles. The minimap shows the generated terrain, player direction and hostile contacts. This is a prototype: bot tactics, collision, balance and visuals are intentionally lightweight rather than production or networked combat.

## Publish as a website

A GitHub Actions workflow in `.github/workflows/pages.yml` publishes `web/` to GitHub Pages when changes are pushed to `main`. Enable **Settings → Pages → Build and deployment → Source: GitHub Actions**, then merge this branch to `main`. Once the workflow completes, the site is available at:

`https://Duck-png-lord.github.io/ultra-realistic-fps/`

The preview URL may not be active until the branch is merged and Pages is enabled. The site uses a CDN for Three.js, so an internet connection is required.

## Unreal Engine 5 foundation

The browser game is not a packaged Unreal build. The native Unreal C++ implementation and test map remain a separate follow-up; Unreal `.umap` levels should be created and saved in the Unreal Editor, not hand-written as text. Install Unreal Engine 5 and its supported C++ toolchain to build a native project once those files and editor-authored assets are added.
