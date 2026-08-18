# Rhythm Randomiser

A rhythm-practice application that can run in either of two modes:

- as a standalone static website using Web Audio and optional Web MIDI;
- as a macOS Python/pywebview application using native `sounddevice` audio and
  CoreMIDI via `python-rtmidi`.

This project is built on top of
[bobderrico80/rhythmrandomizer](https://github.com/bobderrico80/rhythmrandomizer/)
and adds MIDI and computer-keyboard input for visually comparing a performance
with the expected rhythm. It also adds real-time audible feedback through note
beeps and metronome clicks.

Enable **Silent mode** to suppress metronome, rhythm-preview, and live input
audio. In 4/4, a four-circle visual metronome tracks the current beat from left
to right; beat 1 is accented to make the start of each measure clear.

There are two practice modes:

- `/tap` keeps the score visible throughout the count-in and performance;
- `/prediction` shows the score for study, with its BPM and optional continuous
  metronome on the main page. **Play** turns the next metronome pulse into
  count-in beat 1, then plays the expected rhythm while the score remains
  visible. The metronome stops when playback finishes.

## Project structure

- `index.html` — static-site entry point
- `tap/` and `prediction/` — static route entry points for each practice mode
- `app.py` — optional pywebview wrapper and native audio engine
- `frontend/index.html` — application markup
- `frontend/styles.css` — interface styles
- `frontend/runtime.js` — browser/native runtime adapters and Web Audio engine
- `frontend/app.js` — notation, settings, and rhythm-input behavior
- `settings.json` — local settings, created at runtime and ignored by Git
- `assets/vendor/` — vendored browser dependencies required at runtime
- `THIRD_PARTY_NOTICES.md` — asset provenance and version information

The website has no Python or Node.js runtime dependency and no build step.

## Standalone website

Publish the repository as static files and open `index.html`. For local
development, serve the repository with any static-file server and open its root
URL.

The standalone site uses the browser's default audio output. Select
**Enable browser MIDI…** in the Input menu to grant MIDI access when the browser
supports Web MIDI. Web MIDI normally requires HTTPS (localhost is accepted by
supporting browsers). Settings are saved in browser local storage.

## Python wrapper with native audio

```sh
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python app.py
```

Use `./.venv/bin/python app.py --list-devices` to inspect available audio
output devices.

Connect a MIDI keyboard before launching the wrapper, then choose it from the
**Input** selector. The first available MIDI device is selected by default;
choose **Computer keyboard** to use computer-key input only.

MIDI note events trigger the native Python audio engine immediately. A copy of
each event is sent to the web interface for recording and visualization, so
browser rendering or bridge latency is not part of the MIDI-to-sound path.

Choose a Core Audio device from the **Output** selector to route the note tone
and metronome. The selection is saved in `settings.json`. If the saved device is
not available on the next launch, the app falls back to the macOS system
default.
