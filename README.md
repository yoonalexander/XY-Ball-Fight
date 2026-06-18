# XY-Ball-Fight

A small browser-based 2D "ball fight" game built with plain HTML, CSS and JavaScript.  
This project demonstrates a simple game loop, basic physics, AI opponents, weapons, and an on-screen UI.

## Features
- Lightweight vanilla JavaScript implementation
- Simple physics-based movement and collisions (see engine/physics.js)
- AI opponents (see engine/ai.js) (WIP)
- Modular engine files: game loop, weapons, UI, physics
- Easy to run locally — no build step required

## Quick start

Recommended: run a simple static server to avoid any browser restrictions on local files.

Option A — Quick (may work directly in many browsers)
1. Open `index.html` in your browser.

Option B — Recommended (serve locally)
1. From the project root (where `index.html` sits) run one of:
   - Python 3: `python -m http.server 8000`
   - Node: `npx serve .` or `npx http-server .`
2. Open http://localhost:8000 in your browser.

## Vercel deployment

This repo is configured for Vercel as a static site with no build step.

Project settings:
- Framework Preset: `Other`
- Build Command: leave empty
- Output Directory: leave empty or `.`
- Install Command: leave empty

To host the game at `https://alexyoon.com/xy-fight/`, keep this game deployed as its
own Vercel project, then add the route below to the Vercel project that owns
`alexyoon.com`:

```json
{
  "redirects": [
    {
      "source": "/xy-fight",
      "destination": "/xy-fight/",
      "permanent": true
    }
  ],
  "rewrites": [
    {
      "source": "/xy-fight/:path*",
      "destination": "https://xy-ball-fight.vercel.app/xy-fight/:path*"
    }
  ]
}
```

Vercel domains attach to hostnames, not URL paths, so `alexyoon.com/xy-fight`
must be handled by a rewrite from the project currently serving `alexyoon.com`.

## Controls
Controls are implemented in `engine/ui.js`. Default bindings may include keyboard for movement and mouse for aiming/attacking — inspect that file for exact keys and mouse behavior.

## Development
- Files of interest:
  - `index.html` — main page
  - `style.css` — styles
  - `main.js` — entry / initial setup
  - `engine/gameLoop.js` — game loop and tick logic
  - `engine/physics.js` — physics calculations
  - `engine/ai.js` — enemy AI
  - `engine/weapons.js` — weapon definitions and behavior
  - `engine/ui.js` — input and UI handling

- To modify the game:
  1. Edit the relevant file(s) in `engine/`.
  2. Reload the browser (or use a live-reload server for convenience).

## Contributing
- Open an issue to report bugs or suggest features.
- Send a pull request with clearly described changes.
- Keep changes small and focused; include a short description of testing steps.

## Repository
https://github.com/yoonalexander/XY-Ball-Fight

## Troubleshooting
- If assets or scripts don't load when opening `index.html` directly, use a local HTTP server (see Quick start - Option B).
- Check the browser console for errors (press F12 / DevTools).

## License
No license file included in this repository. Add a LICENSE file if you wish to set one.

## Credits
Project maintained in this repository: yoonalexander/XY-Ball-Fight

