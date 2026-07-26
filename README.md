# Rhythm Randomiser

A macOS desktop rhythm-practice application built with Python, pywebview,
VexFlow, sounddevice, and CoreMIDI (via python-rtmidi).

This project is built on top of
[bobderrico80/rhythmrandomizer](https://github.com/bobderrico80/rhythmrandomizer/)
and adds MIDI and computer-keyboard input for visually comparing a performance
with the expected rhythm. It also adds real-time audible feedback through note
beeps and metronome clicks.

## Project structure

- `app.py` — application server, pywebview bridge, and audio engine
- `frontend/index.html` — application markup
- `frontend/styles.css` — interface styles
- `frontend/app.js` — notation, settings, and rhythm-input behavior
- `settings.json` — local settings, created at runtime and ignored by Git
- `assets/vendor/` — vendored browser dependencies required at runtime
- `THIRD_PARTY_NOTICES.md` — asset provenance and version information

The application has no Node.js runtime or build-step dependency.

## Run locally

```sh
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python app.py
```

Use `./.venv/bin/python app.py --list-devices` to inspect available audio
output devices.

Connect a MIDI keyboard before launching the app, then choose it from the
**Input** selector. The first available MIDI device is selected by default;
choose **Computer keyboard** to use computer-key input only. MIDI keys produce
the same beep and use the same count-in, recording, and timeline behavior as
the computer keyboard.

Choose a Core Audio device from the **Output** selector to route the note tone
and metronome. The selection is saved in `settings.json`. If the saved device is
not available on the next launch, the app falls back to the macOS system
default.
