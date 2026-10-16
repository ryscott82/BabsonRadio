# Sending track names to the radio from the DJ booth

Goal: when someone plays live, listeners see the real song and artist instead of just the show name. The site already shows the show and host names when no track info arrives, so none of this is required to go live. It makes the display better.

Written from how these tools are documented. Nothing here has been run on our booth yet, so test each step once and fix this page with what really happens.

## Why CDJ-3000s + USB sticks are the tricky case
Serato and rekordbox only know what is playing when the music is loaded in THEM. Tracks played straight from a USB stick on a CDJ never touch the laptop, so the laptop cannot see them through Serato or rekordbox.

The CDJs do announce the loaded track over their network connection (Pro DJ Link) if the USB was exported from rekordbox, which fills in artist and title. A program on a computer plugged into the same network can read that. The usual one is **Beat Link Trigger** (free, open source, Deep Symmetry).

## Setup A: CDJs + USB (our normal booth)
1. Prepare every USB in rekordbox and export to the stick, so the CDJs have artist/title for each track. Sticks filled by dragging files in have no titles to share.
2. Connect both CDJ-3000s and the DJM mixer to a small network switch with ethernet (Pro DJ Link). Plug the booth computer into the same switch.
3. On the booth computer install Beat Link Trigger. It should list both players when they are on.
4. Tell it which player counts as "on air". With a Pioneer mixer on the same network it can follow the channel faders. Otherwise pick the player by hand.
5. Have Beat Link Trigger write the on-air track as `Artist - Title` to a text file (for example `nowplaying.txt`) every time the track changes. This is a small expression inside the program; set it up and test it with a few tracks.
6. Point the streaming program (see "Streaming program" below) at that text file.

## Setup B: Serato DJ Pro or Mixxx (music loaded in the laptop)
- **Mixxx**: built in. Preferences, Live Broadcasting, tick "Enable Live Broadcasting"; it sends the current track as stream metadata automatically.
- **Serato DJ Pro**: it does not stream by itself. Write the current track to a text file with a "now playing" helper that reads Serato's history, then use the same text-file step as above.
- **rekordbox on the laptop**: no streaming metadata of its own. If the CDJs are plugged in, use Setup A.

## Streaming program (what actually connects to the station)
Whatever sends audio to the station must also send track text. Two common choices:
- **BUTT** (Broadcast Using This Tool): free. In its settings, set it to read the song name from a text file, and it sends that text as the live title.
- **Mixxx**: as above.

Connect it to the station with the live DJ login (see the go-live details in the approval email). The station accepts the title text through that connection and shows it as the live track.

## If you would rather push the title by hand
The DJ port accepts the standard stream "update title" web request. The exact address and login are in AzuraCast: station, Streamers/DJs, and the connection info shown there. Confirm the address on our install before relying on it.

## What listeners see
- Track text arrives: the site and app show it as the song (and clean up junk like "(Official Video)", once the clean-up step ships).
- No text arrives: the site shows the show name and host.

## Open items
- [ ] Try Setup A at the booth and note the exact Beat Link Trigger settings that worked here.
- [ ] Confirm the title-update address on our AzuraCast.
- [ ] Add a short version of this to the go-live details in the show approval email.
