# Validation: phone touch, VR and PHOTO

Results for pull requests #13 (PHOTO at full ratio), #14 (phone layout), #15 (tap slop) and #16 (VR ray and exit).

## Devices

| Device | Browser | Page size | Pixel ratio |
|---|---|---|---|
| Laptop (Windows 11) | Chrome 157 | 1280x720 | 1 |
| Poco X3 NFC (Android) | Chrome 157 | 392x767 | 2.75 |
| iPhone | Safari | not recorded | not recorded |

The Poco's screen is 1080x2400, but Chrome's bars take part of it, so the page is 392x767 points.

## Touch matrix (#15)

Tested by hand.

| Check | Desktop Chrome | Android Chrome (Poco) | iOS Safari (iPhone) |
|---|---|---|---|
| Drag to look around | pass | pass | pass |
| Tap a piece to select it | pass | pass | pass |
| Pinch (or wheel) to zoom | pass | pass | pass |
| LIST: open and pick a piece | pass | pass | pass |
| MOOD: open and dismiss | pass | pass | pass |
| PHOTO saves an image | pass | pass | pass |
| TOUR: start and stop | pass | pass | pass |

Different on Safari: PHOTO saves the image as a file download, not into the Photos app.

Scripted in headless Chromium, before and after #15:

| Press on a piece | Before | After |
|---|---|---|
| Touch, 10 or 11 px wobble | no select | selects |
| Touch, drag 40 px out and back | selects | no select |
| Mouse, 10 px wobble | no select | no select |
| Mouse, drag 40 px out and back | selects | no select |
| Two fingers | no select | no select |

## VR checklist (#16)

iwer 2.8.0 (the runtime behind Immersive Web Emulator) as a Meta Quest 3, in headless Chromium, scripted.

| Check | Before #16 | After #16 |
|---|---|---|
| ENTER VR starts a session, PHOTO is disabled in it | pass | pass |
| The controller laser aims at a piece | pass | pass |
| Pointing the laser lights the hover glow | fail | pass |
| Trigger selects the piece aimed at | fail | pass |
| Card at the correct spot | fail | pass |
| Trigger on the floor hides the card | pass | pass |
| Screen clicks and drags in a session move no camera and start no fly-in | pass | pass |
| Leaving VR ends the session | pass | pass |
| ENTER VR comes back after leaving, and VR can be entered again | fail | pass |

Scripted checks in total: 13 of 23 pass before, 24 of 24 after. The after run has one more check, entering VR a second time.

Before #16, aiming at piece 9 on the right wall opened the card for piece 8 on the left wall. After, both controllers select correctly on the back and side walls, and leaving works from the EXIT VR button and from the headset's own menu.

## PHOTO size (#13)

| Screen | Pixel ratio | Saved before | Saved after |
|---|---|---|---|
| Poco X3 NFC, by hand | 2.75 | 686x1342 | 1078x2109 |
| iPhone-size screen 430x932, scripted | 3 | 752x1631 | 1290x2796 |
| Desktop 1280x720, scripted | 1 | 1280x720 | 1280x720 |

The toolbar, title, hint and ENTER VR are never in the photo, because the capture reads only the 3D canvas. An open info card is in it, since it is part of the scene.

## Phone layout (#14)

Checked at 390x844 and 393x873 in headless Chromium: the title, hint and footer no longer overlap the toolbar or ENTER VR. The footer leaves 150 px on its right for ENTER VR. On a phone with no ENTER VR button that space stays empty.

## Not tested

A real VR headset. PHOTO pixel size on the iPhone. The layout fix by hand on the phones.
