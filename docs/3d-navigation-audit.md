# 3D view navigation audit (mouse and touch)

Written for Week 5. It lists what a mouse or touch visitor can do in the 3D view, where it breaks, and the small change that fixes the worst of it. All numbers are from scripted runs, so they are repeatable, but the runs are headless Chromium with software rendering (about 3 frames per second), not a real phone.

## How I tested

- Desktop: Chromium, 1280x720, real mouse events (move, press, drag, wheel, right button).
- Touch: Chromium, 390x844, touch emulation, one-finger and two-finger gestures sent as touch events.
- The page ran from `dev` at 5c93777 for the "before" column, and from this branch for "after".
- Camera position, camera target and card opacity were read from the page's `window.__es` debug helpers. Screenshots were taken at the key steps.

## What a visitor can do today

| Action | Mouse | Touch | Before the fix |
|---|---|---|---|
| Look around | Drag | One-finger drag | Works. A 250 px mouse drag turns the view about 125 degrees. |
| Zoom | Wheel | Pinch | Works. Zoom stops 0.8 m from the target. |
| Pan | Right-drag | Two-finger drag | Works. No limit is set. |
| Select a piece | Click | Tap | Card opens. Camera does not move. |
| Dismiss the card | Click empty wall | Tap empty wall | Works. |
| Move between pieces | Click another piece, or LIST | Tap another piece, or LIST | LIST flies to the piece. Clicking only moves the card. |
| Return to the overview | Zoom out by hand, or END TOUR | same | No direct way. |

## Where it breaks or feels stuck

1. **Selecting fires on press, not on release.** Pressing on a piece opens its card even when the visitor meant to drag. Pressing on empty wall closes the open card. So you cannot look around with a card open (the card closes the moment the drag starts), and starting a drag on a piece swings the view and opens the card at once. On touch, the second finger of a pinch lands on empty wall and closes the card too. Measured: with a card open, pressing empty wall took the card opacity from 1 to 0 on mouse, and a two-finger pinch did the same on touch.
2. **The card is not readable from where you select.** From the home view the pieces are 40x48 px on a 1280 px screen (48x56 px on a 390 px phone), and the card that opens is small with unreadable text. The camera stays where it is. The only way to get a readable card was LIST or TOUR, which fly the camera in.
3. **A drag during a camera glide is swallowed, then replayed.** While the camera flies to a piece, input is ignored. The drag is stored and applied as one jump when the glide ends. Measured: after a 60 px drag during a glide, the camera still moved another 7.2 m and turned about 82 degrees once the visitor let go. This reads as the view being stuck, then jumping.
4. **Tap targets are small.** 48x56 px on a phone at the home view is at the edge of a comfortable touch target. Not changed.
5. **The hint line describes a mouse.** "scroll to zoom" and "hover for glow" do not apply on a phone.

## The fix (4 source files, 73 lines added, 14 removed, including the review follow-ups)

- Select on release. A tap or click (finger or button released within 8 px of where it went down, primary pointer only, left button only) selects. A drag looks around and never changes the card. A second finger or a right-click never selects.
- Selecting a piece flies the camera in front of it and shows the card, the same move LIST already makes. During a tour the tour keeps the camera and only the card is placed.
- Pressing on the view during a glide stops the glide, so the visitor takes over at once and nothing is replayed later.
- The camera now turns during a fly-in. Before, it moved without turning and snapped to the piece on the last frame, for LIST and TOUR as well.
- The fly-in distance now depends on the screen. On a 390x844 phone the old 3.2 m put the 2.9 m wide card off both sides of the screen, for LIST and TOUR as well. On a narrow screen the camera now stops far enough back for the card to fit (about 4.9 m on that phone). Desktop stays at 3.2 m.
- On touch devices the hint reads "Drag to look · pinch to zoom · tap a piece".
- VR is untouched: the controller select handler and the session code are unchanged, and the new handlers return early while a headset session is running.

## Before and after

| Check | Before | After |
|---|---|---|
| Click a piece from the home view | card opens, camera stays | card opens, camera flies in |
| Press empty wall with a card open, then drag | card closes | card stays |
| Drag that starts on a piece | card opens, view rotates | view rotates, card unchanged |
| Pinch with a card open (touch) | card closes | card stays |
| Drag during a glide, 0.5 s after release until settled | camera moves a further 7.2 m, turns 82 degrees | camera moves 1.8 m, turns 16 degrees (damping only) |
| Right-click a piece | n/a | does not select |
| Click with 3 px of jitter | n/a | selects |
| Tour running, click a piece | n/a | tour keeps running |
| Biggest one-frame move of the piece on screen during a fly-in (1280x720) | 40 px back wall, 16,623 px side wall (piece behind the camera until the snap), both on the last frame | 3 px back wall, 15 px side wall |
| Fly in on a 390x844 phone | card cut off on both sides | whole card on screen |
| Move to the next piece, mouse | n/a | click a neighbour; camera moves to it |
| Move to the next piece, phone | LIST | LIST, or pinch out and tap a neighbour; no other piece centre is on screen after flying in |
| Tap or click empty space after flying in | n/a | card closes, on both sizes |

## Noticed and left alone

- Zoom out is allowed to 30 m, which puts the camera outside the open-fronted room and below head height. This is a design setting (`maxDistance`), not a bug. A smaller limit is a one-line change if wanted.
- No pan limit is set in the code, so a visitor may be able to pan the room off screen. I did not test how far it goes.
- Escape does not dismiss the card.
- The card covers the top of its own piece. It sits 0.5 m in front of the wall, above the centre of the piece. This is how v1 places it.
- On a portrait phone the neighbours are off screen after flying in, so you move between pieces with LIST, or pinch out and tap one. In the scripted run one pinch went from about 5 m to 21 m, which is a big step, and the next reached the 30 m limit.
- On a 390 px phone the hint line wraps to three lines over the mood line, and the title sits behind the toolbar.
- There is no "back to overview" control. Adding one would be a new control, which this task rules out.

## Not tested

- A tablet, a trackpad, a stylus. My scripted touch runs were emulated. The checks I did by hand, and on which devices, are in the pull request.
- Firefox and Safari.
- A headset. The VR code is unchanged, but I have not entered VR with this build.
