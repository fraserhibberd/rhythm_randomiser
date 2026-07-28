(() => {
  "use strict";

  const FREQUENCY_HZ = 880;
  const AMPLITUDE = 0.2;

  const main = document.querySelector("main");
  const keyState = document.getElementById("key-state");
  const audioState = document.getElementById("audio-state");
  const errorDisplay = document.getElementById("error");
  const heldKeys = new Set();

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    showError("This browser does not support Web Audio.");
    return;
  }

  // Construct the entire audio graph once. The oscillator runs continuously;
  // input events only enqueue a gain change on the browser's audio renderer.
  const audioContext = new AudioContextClass({ latencyHint: "interactive" });
  const oscillator = new OscillatorNode(audioContext, {
    frequency: FREQUENCY_HZ,
    type: "sine",
  });
  const gate = new GainNode(audioContext, { gain: 0 });
  oscillator.connect(gate).connect(audioContext.destination);
  oscillator.start();

  function showError(error) {
    errorDisplay.hidden = false;
    errorDisplay.textContent = error instanceof Error ? error.stack : String(error);
  }

  function latencyText(value) {
    return Number.isFinite(value) ? `${(value * 1000).toFixed(2)} ms` : "unavailable";
  }

  function updateAudioState() {
    const outputLatency =
      typeof audioContext.outputLatency === "number"
        ? audioContext.outputLatency
        : Number.NaN;
    audioState.textContent =
      `Audio ${audioContext.state} · ${audioContext.sampleRate} Hz` +
      ` · base ${latencyText(audioContext.baseLatency)}` +
      ` · output ${latencyText(outputLatency)}`;
  }

  function ensureAudioIsRunning() {
    if (audioContext.state === "suspended") {
      // Do not await this in an input handler: the gain command should be
      // queued during the same user gesture that unlocks the audio context.
      void audioContext.resume().catch(showError);
    }
  }

  function setGate(isOpen) {
    gate.gain.setValueAtTime(isOpen ? AMPLITUDE : 0, audioContext.currentTime);
    main.classList.toggle("is-sounding", isOpen);
  }

  function updateKeyState() {
    keyState.textContent =
      heldKeys.size === 0
        ? "No keys held"
        : `${heldKeys.size} held · ${Array.from(heldKeys).join(", ")}`;
  }

  window.addEventListener(
    "keydown",
    (event) => {
      event.preventDefault();
      if (event.repeat) {
        return;
      }

      const key = event.code || event.key;
      heldKeys.add(key);
      ensureAudioIsRunning();
      setGate(true);
      updateKeyState();
    },
    { capture: true }
  );

  window.addEventListener(
    "keyup",
    (event) => {
      event.preventDefault();
      heldKeys.delete(event.code || event.key);
      if (heldKeys.size === 0) {
        setGate(false);
      }
      updateKeyState();
    },
    { capture: true }
  );

  function releaseAllKeys() {
    heldKeys.clear();
    setGate(false);
    updateKeyState();
  }

  window.addEventListener("blur", releaseAllKeys);
  window.addEventListener("pointerdown", ensureAudioIsRunning, {
    capture: true,
    passive: true,
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      releaseAllKeys();
    }
  });
  audioContext.addEventListener("statechange", updateAudioState);

  // This succeeds immediately in permissive webviews. If user activation is
  // required, the first keydown retries it without adding another event hop.
  ensureAudioIsRunning();
  updateAudioState();
})();
