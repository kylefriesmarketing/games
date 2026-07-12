# THE ROOM

**A 90s bedroom you can click. Every object is a doorway.**

**▶ Play it: https://kylefriesmarketing.github.io/games/**

![THE ROOM — a clickable 3D 90s bedroom](media/room-hero.jpg)

It's after bedtime. Rain on the window, cartoons flickering on the CRT, a lava lamp
doing its slow thing, and a wind-up robot making laps around the galaxy rug. Everything
in the room is real and everything is clickable:

| In the room | What it opens |
|---|---|
| **The bookshelf** — five books standing proud of the row | [CHOOSE WISELY](https://kylefriesmarketing.github.io/choose-wisely/) · [NINE CIRCLES](https://kylefriesmarketing.github.io/nine-circles/) · [STILL BREATHING](https://kylefriesmarketing.github.io/still-breathing/) · [SOUTH](https://kylefriesmarketing.github.io/south/) · [NOBODY](https://kylefriesmarketing.github.io/nobody/) |
| **The toy chest** | [AGE OF TOYS](https://kylefriesmarketing.github.io/toybox-tactics/) — a storybook RTS |
| **The beige PC** and **the brain on the desk** | CHAMELEON 3D and BRAINROT INC — coming soon |
| **The notebook** | your progress across every game, read from this browser |
| **The TV** | the channel guide (plain list view of everything) |
| **The boombox** | a composed lofi tape under the rain — no audio files, all synthesized |
| The lamp, the clock, the door, the bed... | the room minds its own business |

The clock on the wall shows *your* actual time. The street outside flashes when the
storm does. The whole thing is Three.js — primitives, generated textures, four
AI-generated props (beanbag, T-rex, skateboard, globe) and one patrolling tin robot —
no build step, no framework, one HTML file and one script.

## Running locally

Serve the repo root with any static server and open `index.html`. The 3D room needs
WebGL; without it (or via the LIST VIEW button) you get the plain shelf list.

```
node tools/check-room.js   # audits every asset reference against disk
```

## The idea

One room, every game on the shelf, more games arriving as cartridges, posters, and
toys as they're built. Built by [Kyle Fries](https://github.com/kylefriesmarketing)
with Claude.
