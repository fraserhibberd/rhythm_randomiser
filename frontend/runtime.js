(() => {
  "use strict";

  const NOTE_FREQUENCY = 880;
  const NOTE_AMPLITUDE = 0.2;
  const TICK_FREQUENCY = 1200;
  const BAR_TICK_FREQUENCY = 780;
  const TICK_AMPLITUDE = 0.35;
  const BAR_TICK_AMPLITUDE = 0.5;
  const TICK_SECONDS = 0.035;
  const RETRIGGER_SECONDS = 0.003;
  const START_DELAY_SECONDS = 0.05;
  const SETTINGS_KEY = "rhythm-randomiser-settings";

  function waitForPywebviewApi() {
    if (window.pywebview?.api) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      window.addEventListener("pywebviewready", resolve, { once: true });
    });
  }

  class NativeAudioBackend {
    constructor(api) {
      this.api = api;
      this.externalInputIsAudible = true;
      this.outputLabel = "Native audio";
    }

    ensureRunning() {
      return Promise.resolve();
    }

    activateFromGesture() {
      return Promise.resolve();
    }

    pressKey(key) {
      return this.api.press_key(key);
    }

    releaseKey(key) {
      return this.api.release_key(key);
    }

    retriggerKey(key) {
      return this.api.retrigger_key(key);
    }

    reset() {
      return this.api.reset();
    }

    setInputMonitoring(enabled) {
      return this.api.set_input_monitoring(enabled);
    }

    scheduleCountIn(
      bpm,
      continueThroughRecording,
      alignToMetronome = false
    ) {
      return this.api.schedule_count_in(
        bpm,
        continueThroughRecording,
        alignToMetronome
      );
    }

    startMetronome(bpm) {
      return this.api.start_metronome(bpm);
    }

    schedulePredictionPattern(
      segments,
      bpm,
      metronome,
      alignToMetronome = false
    ) {
      return this.api.schedule_prediction_pattern(
        segments,
        bpm,
        metronome,
        alignToMetronome
      );
    }

    scheduleExpectedPattern(segments, bpm, metronome) {
      return this.api.schedule_expected_pattern(segments, bpm, metronome);
    }

    schedulePreviewLoop(segments, bpm) {
      return this.api.schedule_preview_loop(segments, bpm);
    }

    scheduleSelectionPattern(segments, bpm, beatCount) {
      return this.api.schedule_selection_pattern(segments, bpm, beatCount);
    }

    listOutputs() {
      return this.api.list_audio_outputs();
    }

    selectOutput(deviceId) {
      return this.api.select_audio_output(deviceId);
    }
  }

  class WebAudioBackend {
    constructor() {
      this.AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!this.AudioContextClass) {
        throw new Error("This browser does not support Web Audio.");
      }

      this.externalInputIsAudible = false;
      this.outputLabel = "Browser default";
      this.context = null;
      this.liveGain = null;
      this.liveOscillator = null;
      this.scheduledSounds = new Set();
      this.previewTimer = null;
      this.previewState = null;
    }

    _createAudioGraph() {
      if (this.context !== null) {
        return;
      }
      this.context = new this.AudioContextClass({ latencyHint: "interactive" });
      this.liveGain = new GainNode(this.context, { gain: 0 });
      this.liveOscillator = new OscillatorNode(this.context, {
        frequency: NOTE_FREQUENCY,
        type: "sine",
      });
      this.liveOscillator.connect(this.liveGain).connect(this.context.destination);
      this.liveOscillator.start();
    }

    async ensureRunning() {
      void this.activateFromGesture().catch(() => {
        // The next touchend/click gesture may still unlock the context.
      });
      if (this.context.state === "running") {
        return;
      }

      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeout);
          this.context.removeEventListener("statechange", handleStateChange);
          resolve();
        };
        const handleStateChange = () => {
          if (this.context.state === "running") {
            finish();
          }
        };
        const timeout = window.setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          this.context.removeEventListener("statechange", handleStateChange);
          reject(
            new Error(
              `Browser audio did not start (state: ${this.context.state}).`
            )
          );
        }, 2500);

        this.context.addEventListener("statechange", handleStateChange);
        void this.context.resume().then(handleStateChange).catch(() => {
          // A later touchend/click gesture can still unlock the context.
        });
        handleStateChange();
      });

      if (this.context.state !== "running") {
        throw new Error(
          `Browser audio did not start (state: ${this.context.state}).`
        );
      }
    }

    activateFromGesture() {
      this._createAudioGraph();
      this._playSilentUnlockSource();
      if (this.context.state === "running") {
        return Promise.resolve();
      }
      return this.context.resume();
    }

    pressKey() {
      if (this.context?.state === "running") {
        this._setLiveGain(NOTE_AMPLITUDE);
        return;
      }
      void this.ensureRunning().then(() => this._setLiveGain(NOTE_AMPLITUDE));
    }

    releaseKey() {
      if (this.context === null) {
        return;
      }
      this._setLiveGain(0);
    }

    retriggerKey() {
      if (this.context?.state !== "running") {
        void this.ensureRunning().then(() => this.retriggerKey());
        return;
      }
      const now = this.context.currentTime;
      this.liveGain.gain.cancelScheduledValues(now);
      this.liveGain.gain.setValueAtTime(0, now);
      this.liveGain.gain.setValueAtTime(
        NOTE_AMPLITUDE,
        now + RETRIGGER_SECONDS
      );
    }

    reset() {
      this._stopPreviewScheduler();
      if (this.context === null) {
        return;
      }
      const now = this.context.currentTime;
      this.liveGain.gain.cancelScheduledValues(now);
      this.liveGain.gain.setValueAtTime(0, now);
      this.scheduledSounds.forEach(({ oscillator, gain }) => {
        try {
          oscillator.stop();
        } catch (_error) {
          // It may already have reached its scheduled stop time.
        }
        oscillator.disconnect();
        gain.disconnect();
      });
      this.scheduledSounds.clear();
    }

    setInputMonitoring() {}

    async scheduleCountIn(
      bpm,
      continueThroughRecording,
      alignToMetronome = false
    ) {
      await this.ensureRunning();
      const now = this.context.currentTime;
      const beatSeconds = 60 / bpm;
      let start = now + START_DELAY_SECONDS;
      if (alignToMetronome && this.previewState?.anchor !== undefined) {
        const committedAudioMargin = 0.01;
        const elapsed = now + committedAudioMargin - this.previewState.anchor;
        const beatsElapsed = Math.max(0, Math.ceil(elapsed / beatSeconds));
        start = this.previewState.anchor + beatsElapsed * beatSeconds;
      }
      this.reset();
      const beatCount = continueThroughRecording ? 8 : 4;
      for (let beat = 0; beat < beatCount; beat += 1) {
        this._scheduleTick(start + beat * beatSeconds, beat % 4 === 0);
      }
      return Math.max(0, (start - now) * 1000);
    }

    startMetronome(bpm) {
      return this.schedulePreviewLoop([], bpm);
    }

    async schedulePredictionPattern(
      segments,
      bpm,
      metronome,
      alignToMetronome = false
    ) {
      await this.ensureRunning();
      const now = this.context.currentTime;
      const beatSeconds = 60 / bpm;
      let countInStart = now + START_DELAY_SECONDS;
      if (alignToMetronome && this.previewState?.anchor !== undefined) {
        const committedAudioMargin = 0.01;
        const elapsed = now + committedAudioMargin - this.previewState.anchor;
        const beatsElapsed = Math.max(0, Math.ceil(elapsed / beatSeconds));
        countInStart = this.previewState.anchor + beatsElapsed * beatSeconds;
      }

      this.reset();
      const patternStart = countInStart + beatSeconds * 4;
      this._scheduleSegments(segments, patternStart);
      const tickCount = metronome ? 8 : 4;
      for (let beat = 0; beat < tickCount; beat += 1) {
        this._scheduleTick(
          countInStart + beat * beatSeconds,
          beat % 4 === 0
        );
      }
      return Math.max(0, (countInStart - now) * 1000);
    }

    async scheduleExpectedPattern(segments, bpm, metronome) {
      await this.ensureRunning();
      this.reset();
      const start = this.context.currentTime + START_DELAY_SECONDS;
      this._scheduleSegments(segments, start);
      if (metronome) {
        const beatSeconds = 60 / bpm;
        for (let beat = 0; beat < 4; beat += 1) {
          this._scheduleTick(start + beat * beatSeconds, beat === 0);
        }
      }
      return START_DELAY_SECONDS * 1000;
    }

    async scheduleSelectionPattern(segments, bpm, beatCount) {
      await this.ensureRunning();
      this.reset();
      const start = this.context.currentTime + START_DELAY_SECONDS;
      this._scheduleSegments(segments, start);
      const beatSeconds = 60 / bpm;
      for (let beat = 0; beat < beatCount; beat += 1) {
        this._scheduleTick(start + beat * beatSeconds, false);
      }
      return START_DELAY_SECONDS * 1000;
    }

    async schedulePreviewLoop(segments, bpm) {
      await this.ensureRunning();
      this.reset();
      const beatSeconds = 60 / bpm;
      const start = this.context.currentTime + START_DELAY_SECONDS;
      this.previewState = {
        segments,
        beatSeconds,
        anchor: start,
        nextStart: start,
        nextBeatIndex: 0,
      };
      this._fillPreviewSchedule();
      this.previewTimer = window.setInterval(
        () => this._fillPreviewSchedule(),
        250
      );
      return START_DELAY_SECONDS * 1000;
    }

    listOutputs() {
      return Promise.resolve({
        devices: [],
        defaultName: "Browser default",
        selectedId: "",
      });
    }

    selectOutput() {
      return Promise.resolve({ ok: true, name: "Browser default" });
    }

    _setLiveGain(value) {
      const now = this.context.currentTime;
      this.liveGain.gain.cancelScheduledValues(now);
      this.liveGain.gain.setValueAtTime(value, now);
    }

    _playSilentUnlockSource() {
      const source = this.context.createBufferSource();
      source.buffer = this.context.createBuffer(
        1,
        1,
        this.context.sampleRate
      );
      source.connect(this.context.destination);
      source.addEventListener("ended", () => source.disconnect());
      source.start(0);
    }

    _scheduleSegments(segments, startTime) {
      segments.forEach((segment) => {
        const startedAt = startTime + Math.max(0, segment.startMs) / 1000;
        const duration = Math.max(0, segment.durationMs) / 1000;
        if (duration <= 0) {
          return;
        }
        const endedAt =
          startedAt + Math.max(0, duration - RETRIGGER_SECONDS);
        this._scheduleOscillator(
          NOTE_FREQUENCY,
          NOTE_AMPLITUDE,
          startedAt,
          endedAt,
          false
        );
      });
    }

    _scheduleTick(startTime, isBarStart) {
      this._scheduleOscillator(
        isBarStart ? BAR_TICK_FREQUENCY : TICK_FREQUENCY,
        isBarStart ? BAR_TICK_AMPLITUDE : TICK_AMPLITUDE,
        startTime,
        startTime + TICK_SECONDS,
        true
      );
    }

    _scheduleOscillator(frequency, amplitude, startTime, endTime, fadeOut) {
      if (endTime <= startTime) {
        return;
      }
      const oscillator = new OscillatorNode(this.context, {
        frequency,
        type: "sine",
      });
      const gain = new GainNode(this.context, { gain: 0 });
      const scheduledSound = { oscillator, gain };
      oscillator.connect(gain).connect(this.context.destination);
      gain.gain.setValueAtTime(amplitude, startTime);
      if (fadeOut) {
        gain.gain.linearRampToValueAtTime(0, endTime);
      } else {
        gain.gain.setValueAtTime(0, endTime);
      }
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gain.disconnect();
        this.scheduledSounds.delete(scheduledSound);
      });
      this.scheduledSounds.add(scheduledSound);
      oscillator.start(startTime);
      oscillator.stop(endTime);
    }

    _fillPreviewSchedule() {
      if (!this.previewState) {
        return;
      }

      const horizon = this.context.currentTime + 2;
      const loopSeconds = this.previewState.beatSeconds * 2;
      while (this.previewState.nextStart < horizon) {
        this._scheduleSegments(
          this.previewState.segments,
          this.previewState.nextStart
        );
        for (let beat = 0; beat < 2; beat += 1) {
          this._scheduleTick(
            this.previewState.nextStart + beat * this.previewState.beatSeconds,
            (this.previewState.nextBeatIndex + beat) % 4 === 0
          );
        }
        this.previewState.nextStart += loopSeconds;
        this.previewState.nextBeatIndex += 2;
      }
    }

    _stopPreviewScheduler() {
      if (this.previewTimer !== null) {
        window.clearInterval(this.previewTimer);
        this.previewTimer = null;
      }
      this.previewState = null;
    }
  }

  class NativeMidiBackend {
    constructor(api) {
      this.api = api;
      this.pollTimer = null;
      this.pollInFlight = false;
    }

    listInputs() {
      return this.api.list_midi_inputs();
    }

    selectInput(deviceId) {
      return this.api.select_midi_input(deviceId);
    }

    start(onEvent, onError) {
      this.stop();
      this.pollTimer = window.setInterval(async () => {
        if (this.pollInFlight) {
          return;
        }
        this.pollInFlight = true;
        try {
          const events = await this.api.drain_midi_events();
          events.forEach(onEvent);
        } catch (error) {
          this.stop();
          onError(error);
        } finally {
          this.pollInFlight = false;
        }
      }, 5);
    }

    stop() {
      if (this.pollTimer !== null) {
        window.clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }
  }

  class WebMidiBackend {
    constructor() {
      this.access = null;
      this.selectedInput = null;
      this.onEvent = null;
    }

    get supported() {
      return typeof navigator.requestMIDIAccess === "function";
    }

    async requestAccess() {
      if (!this.supported) {
        throw new Error("This browser does not support Web MIDI.");
      }
      if (!this.access) {
        this.access = await navigator.requestMIDIAccess();
      }
      return this.access;
    }

    async listInputs() {
      if (!this.access) {
        return [];
      }
      return Array.from(this.access.inputs.values()).map((input) => ({
        id: input.id,
        name: input.name || "MIDI input",
      }));
    }

    async selectInput(deviceId) {
      if (this.selectedInput) {
        this.selectedInput.onmidimessage = null;
        this.selectedInput = null;
      }
      if (!deviceId) {
        return { ok: true, name: "" };
      }
      if (!this.access) {
        return { ok: false, error: "Enable browser MIDI access first." };
      }

      const input = this.access.inputs.get(deviceId);
      if (!input) {
        return { ok: false, error: "That MIDI input is no longer available." };
      }
      this.selectedInput = input;
      input.onmidimessage = (event) => this._handleMessage(event.data);
      return { ok: true, name: input.name || "MIDI input" };
    }

    start(onEvent, _onError) {
      this.onEvent = onEvent;
    }

    stop() {
      this.onEvent = null;
      if (this.selectedInput) {
        this.selectedInput.onmidimessage = null;
      }
    }

    _handleMessage(message) {
      if (!this.onEvent || message.length < 3) {
        return;
      }
      const [status, note, velocity] = message;
      const messageType = status & 0xf0;
      let type;
      if (messageType === 0x90 && velocity > 0) {
        type = "down";
      } else if (messageType === 0x80 || (messageType === 0x90 && velocity === 0)) {
        type = "up";
      } else {
        return;
      }
      this.onEvent({
        type,
        key: `midi:${status & 0x0f}:${note}`,
      });
    }
  }

  class NativeSettings {
    constructor(api) {
      this.api = api;
    }

    load() {
      return this.api.load_settings();
    }

    save(settings) {
      return this.api.save_settings(settings);
    }
  }

  class BrowserSettings {
    async load() {
      try {
        return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");
      } catch (_error) {
        return {};
      }
    }

    async save(settings) {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        return true;
      } catch (_error) {
        return false;
      }
    }
  }

  async function createRuntime() {
    const isNative =
      new URLSearchParams(window.location.search).get("native") === "1";
    if (isNative) {
      await waitForPywebviewApi();
      const api = window.pywebview.api;
      return {
        mode: "native",
        audio: new NativeAudioBackend(api),
        midi: new NativeMidiBackend(api),
        settings: new NativeSettings(api),
      };
    }

    return {
      mode: "web",
      audio: new WebAudioBackend(),
      midi: new WebMidiBackend(),
      settings: new BrowserSettings(),
    };
  }

  window.RhythmRuntime = { createRuntime };
})();
