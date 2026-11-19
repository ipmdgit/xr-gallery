# EchoSphere — XR Gallery (PM: Jason Fang)

WebXR gallery that's viewable in any browser and fully immersive in VR headsets. The immersive
web companion to Robot M — the gallery senses the visitor's mood and carries the same visual
language as the hardware.

## Content — First Light

The gallery is the EchoBloom exhibition hall for **First Light** (launches 1 Dec 2026): 58 works in
10 rooms, from Booklet v10. Edit `src/data/first-light.json` to change titles, credits or room
assignments; images live in `public/art/first-light/` named by work number (`018.jpg`). Wall layout
is computed per room in `src/gallery/hall.ts`. Links: `#room-3` opens a room, `#work-18` a work.

## Mood vocabulary

The gallery speaks the same four moods as Robot M. We say it **senses the mood** — never
"detects emotions".

| Mood | Colour |
|---|---|
| Warm | gold `#f5b942` |
| Sad | blue `#5aa9e6` |
| Calm | purple `#9b7bd4` |
| Dynamic | red `#ff5a3c` |

Selecting a mood re-tints the whole room — floor light trails, beacons, info-card borders and
controller lasers all adopt that colour.

## Controls

- **Desktop** — drag to look · scroll to zoom · click a piece → info card floats in 3D space.
- **MOOD** — pick one of the four moods; the room re-tints to match.
- **Room bar / ← →** — walk between the 10 rooms; with a label open, ← → step between works.
- **TOUR** — guided walk through every room, starting where you are.
- **LIST** — every work, grouped by room.
- **PHOTO** — save a screenshot of the current view.
- **VR** — controllers get a laser aim; pull the trigger on a piece for its info card.
