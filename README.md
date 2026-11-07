# alekami.com

My personal site: **[alekami.com](https://alekami.com)**.

A synthwave flight display over a wireframe landscape. When the page opens, a small neural network learns to fly a quadcopter, right there in your browser, in about two seconds. A fleet of drones flown by that network then writes my name, and my fields, in formation ahead of the plane. Fly through a formation and the drones scatter, then regroup ahead.

Drag, or use the arrow keys or WASD, to hand fly. Like a yoke: down or back pulls the nose up.

## How the drones learn

- **The drone:** a 2D quadcopter with gravity, two motors and only about 1.2 times its weight in thrust ([options/drone-sim.js](options/drone-sim.js)).
- **The brain:** a neural network with 7 inputs (where the target is, its own speed, tilt and spin), 64 hidden neurons and 2 outputs (the motor commands).
- **The training:** backpropagation through time ([options/drone-learn.js](options/drone-learn.js)). The physics is differentiable, so after a batch of flights the error is traced back through every time step, motor and neuron for the exact gradient of every weight, and Adam takes a step. It runs in a Web Worker until the network holds position within about 4 cm on flights it hasn't trained on, typically in a second or two, never more than 9.
- **The fleet:** every drone flies the same network toward its own spot in the formation. The chart above the links is the network's error on fresh test flights, live.

Everything is plain JavaScript, WebGL and Canvas: no libraries, frameworks or build step beyond copying files.

## The gallery

[index.html](index.html) is a gallery of the 59 options I built while designing the site, from a Matrix rain and a working terminal to a training race where four learning methods (a genetic algorithm, evolution strategies, the cross-entropy method and backprop) each fly a quarter of the name. Each option is a standalone page in [options/](options/); the live site is [options/56-backprop.html](options/56-backprop.html).

Shared modules:

| File | What it does |
|---|---|
| [config.js](config.js) | Name, links and device quality tiers, shared by every page |
| [options/flight.js](options/flight.js) | Terrain, flight model, autopilot, controls and the flight display |
| [options/fleet.js](options/fleet.js) | The drone fleet: formations, flight between them, rendering |
| [options/formation-kit.js](options/formation-kit.js) | The page shell the newer flight options share |
| [options/drone-sim.js](options/drone-sim.js) | Drone physics, the network and the training worker |
| [options/drone-learn.js](options/drone-learn.js) | Backprop, imitation learning, cross-entropy method, particle swarm and more |

## Running it

```sh
python3 serve.py 8765
```

Then open http://localhost:8765 for the gallery, or http://localhost:8765/options/56-backprop.html for the live page.

## Deploying

The site runs on Cloudflare Workers with static assets.

```sh
./build.sh
npx wrangler@4 deploy
```

[build.sh](build.sh) copies the live page and only the scripts it loads into `site/`. [worker.js](worker.js) serves it on alekami.com and redirects my other addresses there.

## License

MIT, see [LICENSE](LICENSE).
