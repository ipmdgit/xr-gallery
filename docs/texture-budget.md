# Texture budget for the First Light hall

Ehtiram Shukurov, 22 November 2026

## What changed

- `npm run artwork` turns the 58 source images into WebP: a 1024 px wall texture and a 320 px thumb per work (`public/artwork/001.webp`, `001-thumb.webp`), plus `manifest.json` (work number, path, width, height, bytes). It prints a per-file table and totals, and a second run gives identical files.
- `src/gallery/textureCache.ts` gives each piece the resolution the screen needs. Every piece starts on its thumb, so it is never blank. The 1024 px texture loads when the piece is drawn bigger than about 65% of the thumb, and is freed when it is small or off screen again. At most 3 load at once. In VR every piece gets its full texture. It is hooked in with one line in `artwork.ts` and one in `main.ts`.

## Numbers

| | Before | After |
|---|---|---|
| Image files (58 works) | 14.78 MB JPG | 10.69 MB WebP (116 files) |
| Wall-art GPU memory, peak (dev loads one room at a time, Room 8 is the largest) | 14 textures, 51.6 MB | 21 to 45 MB phone size, 29.0 MB desktop |
| For reference: all 58 at 1024 px at once | 58 textures, 227.4 MB | |
| Blank pieces | 0 | 0 |
| Poco X3 NFC, Chrome | 56 to 57 fps in a room, about 40 up close | the same |
| iPhone | | 60 fps everywhere |

GPU memory is counted from the images on the textures (width x height x 4 x 4/3 for mipmaps), walking all 10 rooms in headless Chromium, with a tap to fly in to a work in each room. The blank check looked at every piece in view every 50 ms, about 3,200 times per run.

## What to know

- The phone-size peak was 21.3 MB in one walk and 45.2 MB in another, where 12 of Room 8's works loaded their full texture right after arriving. A clean entry to Room 8 loads 1. Dev is 51.6 MB either way.
- The win is memory, not frame rate. The Poco and the iPhone do not need it; it is a safety margin for weaker phones. The drop to about 40 fps up close is on dev too.
- It is not pixel-identical: at a distance the 320 px thumb is slightly sharper than the GPU's own downscale of the 1024 px image. For about 0.3 s over the whole walk, a thumb was drawn a little bigger than 320 px while its full texture loaded.
- The only images in the repo are the 1024 px JPGs, so the script re-encodes those (WebP quality 90, median PSNR 40 dB). With the originals: `npm run artwork -- --src <folder>`.
- Not changed, in `hall.ts` and `first-light.json`: `prefetchRoom` still prefetches the full JPGs, and LIST still uses the 160 px JPG thumbs.
