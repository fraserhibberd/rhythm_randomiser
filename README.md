# Pure Web Audio latency spike

This branch is a deliberately minimal tap-to-tone experiment. The pywebview
window serves a static page, but all reactive audio stays inside Web Audio:

- one `AudioContext` with the `interactive` latency hint;
- one continuously running oscillator;
- one pre-created gain node;
- direct `keydown`/`keyup` gain changes;
- no Python audio, bridge calls, polling, timers, decoding, or per-press nodes.

## Run

```sh
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python app.py
```

Hold any key to sound the tone. The window reports the buffer latency exposed
by the browser. The first key may also unlock the audio context on platforms
that require explicit user activation; clicking the window primes it without
playing a sound. Subsequent presses use the warm stream.
