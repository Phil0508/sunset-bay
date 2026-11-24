# sunset-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Phil0508/sunset-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Phil0508/sunset-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Sunset Bay is an original open-world crime game that runs offline in a desktop browser. Explore a sun-soaked coastal city on foot and by car, steal cars, outrun the police as your wanted level rises, and run missions for the Sunset Bay crew.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## Controls

WASD move/drive, Mouse look, Shift run, Space jump/handbrake, E enter/exit car, F punch, Click shoot, Right-click aim, R reload, Q/1/2 switch gun, Esc pause/save, M mute.

## Polish pass (2026-11-24)

Headless playtest (new game, walking, wanted level, police dispatch, save/load, all four missions) ran with no page errors. Police dispatch, pursuit, ramming and escalation were traced end to end in `police.js` and confirmed working; mission markers are tapered additive light beams. Controls above match the title screen.

---

<sub>Entered on [make.fun](https://make.fun/?ref=a62ksn7x&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
