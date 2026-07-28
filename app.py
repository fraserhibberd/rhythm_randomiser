import argparse
import math
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
from urllib.parse import urlparse

import sounddevice as sd
import webview
import rtmidi


SAMPLE_RATE = 48_000
BLOCK_SIZE = 64
FREQUENCY = 880.0
AMPLITUDE = 0.20
TICK_FREQUENCY = 1200.0
TICK_AMPLITUDE = 0.35
TICK_SECONDS = 0.035
RETRIGGER_SILENCE_SECONDS = 0.003
BAR_TICK_FREQUENCY = 780.0
BAR_TICK_AMPLITUDE = 0.50
PREVIEW_LOOP_RHYTHM_BEATS = 1
PREVIEW_LOOP_GAP_BEATS = 1
PREVIEW_LOOP_BEATS = PREVIEW_LOOP_RHYTHM_BEATS + PREVIEW_LOOP_GAP_BEATS
PROJECT_DIR = Path(__file__).resolve().parent
ASSET_DIR = PROJECT_DIR / "assets"
FRONTEND_DIR = PROJECT_DIR / "frontend"
INDEX_PATH = FRONTEND_DIR / "index.html"
STYLESHEET_PATH = FRONTEND_DIR / "styles.css"
JAVASCRIPT_PATH = FRONTEND_DIR / "app.js"
SETTINGS_PATH = PROJECT_DIR / "settings.json"
VEXFLOW_SCRIPT_PATH = ASSET_DIR / "vendor" / "vexflow-5.0.0.js"


class AppRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed_path = urlparse(self.path)
        if parsed_path.path in ("", "/"):
            self._send_bytes(
                INDEX_PATH.read_bytes(),
                "text/html; charset=utf-8",
            )
            return

        if parsed_path.path == "/styles.css" and STYLESHEET_PATH.is_file():
            self._send_bytes(
                STYLESHEET_PATH.read_bytes(),
                "text/css; charset=utf-8",
            )
            return

        if parsed_path.path == "/app.js" and JAVASCRIPT_PATH.is_file():
            self._send_bytes(
                JAVASCRIPT_PATH.read_bytes(),
                "application/javascript; charset=utf-8",
            )
            return

        if parsed_path.path == "/vexflow.js" and VEXFLOW_SCRIPT_PATH.is_file():
            self._send_bytes(
                VEXFLOW_SCRIPT_PATH.read_bytes(),
                "application/javascript; charset=utf-8",
            )
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def log_message(self, _format: str, *_args) -> None:
        return

    def _send_bytes(self, content: bytes, content_type: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def start_app_server() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", 0), AppRequestHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    return server


class BeepGate:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pressed_keys: set[str] = set()
        self._retrigger_silence_until = 0.0
        self._tick_start_times: list[tuple[float, bool]] = []
        self._scheduled_note_times: list[tuple[float, float]] = []
        self._preview_loop_duration_seconds = 0.0
        self._preview_loop_note_segments: list[tuple[float, float]] = []
        self._preview_loop_next_start_time: float | None = None
        self._preview_loop_next_beat_index = 0
        self._phase = 0.0
        self._phase_step = 2.0 * math.pi * FREQUENCY / SAMPLE_RATE
        self._tick_phase_step = 2.0 * math.pi * TICK_FREQUENCY / SAMPLE_RATE
        self._bar_tick_phase_step = 2.0 * math.pi * BAR_TICK_FREQUENCY / SAMPLE_RATE

    def press(self, key: str) -> bool:
        with self._lock:
            was_silent = not self._pressed_keys
            self._pressed_keys.add(key)
            return was_silent

    def release(self, key: str) -> bool:
        with self._lock:
            self._pressed_keys.discard(key)
            return not self._pressed_keys

    def retrigger(self, key: str) -> None:
        with self._lock:
            self._pressed_keys.add(key)
            self._retrigger_silence_until = (
                time.perf_counter() + RETRIGGER_SILENCE_SECONDS
            )

    def reset(self) -> None:
        with self._lock:
            self._pressed_keys.clear()
            self._retrigger_silence_until = 0.0
            self._tick_start_times.clear()
            self._scheduled_note_times.clear()
            self._clear_preview_loop_locked()

    def _clear_preview_loop_locked(self) -> None:
        self._preview_loop_duration_seconds = 0.0
        self._preview_loop_note_segments.clear()
        self._preview_loop_next_start_time = None
        self._preview_loop_next_beat_index = 0

    def _fill_preview_loop_schedule_locked(self, through_time: float) -> None:
        while (
            self._preview_loop_next_start_time is not None
            and self._preview_loop_next_start_time < through_time
        ):
            loop_start_time = self._preview_loop_next_start_time
            for note_started_at, note_ended_at in self._preview_loop_note_segments:
                self._scheduled_note_times.append(
                    (
                        loop_start_time + note_started_at,
                        loop_start_time + note_ended_at,
                    )
                )
            beat_seconds = self._preview_loop_duration_seconds / PREVIEW_LOOP_BEATS
            for beat_offset in range(PREVIEW_LOOP_BEATS):
                self._tick_start_times.append(
                    (
                        loop_start_time + beat_seconds * beat_offset,
                        (self._preview_loop_next_beat_index + beat_offset) % 4 == 0,
                    )
                )
            self._preview_loop_next_start_time += (
                self._preview_loop_duration_seconds
            )
            self._preview_loop_next_beat_index += PREVIEW_LOOP_BEATS

    def schedule_count_in(self, bpm: int, continue_through_recording: bool) -> float:
        beat_seconds = 60.0 / bpm
        now = time.perf_counter()
        first_tick_time = now + 0.05
        beat_count = 8 if continue_through_recording else 4
        with self._lock:
            self._clear_preview_loop_locked()
            self._tick_start_times = [
                (first_tick_time + beat_seconds * beat, beat % 4 == 0)
                for beat in range(beat_count)
            ]
        return (first_tick_time - now) * 1000.0

    def schedule_expected_pattern(
        self,
        segments: list[dict[str, float]],
        bpm: int,
        metronome: bool,
    ) -> float:
        beat_seconds = 60.0 / bpm
        now = time.perf_counter()
        pattern_start_time = now + 0.05
        note_gap = RETRIGGER_SILENCE_SECONDS
        scheduled_notes = []
        for segment in segments:
            start_seconds = max(0.0, float(segment["startMs"]) / 1000.0)
            duration_seconds = max(0.0, float(segment["durationMs"]) / 1000.0)
            if duration_seconds <= 0.0:
                continue
            note_start = pattern_start_time + start_seconds
            note_end = note_start + max(0.0, duration_seconds - note_gap)
            scheduled_notes.append((note_start, note_end))

        tick_start_times = []
        if metronome:
            tick_start_times = [
                (pattern_start_time + beat_seconds * beat, beat == 0)
                for beat in range(4)
            ]

        with self._lock:
            self._pressed_keys.clear()
            self._retrigger_silence_until = 0.0
            self._scheduled_note_times = scheduled_notes
            self._tick_start_times = tick_start_times
            self._clear_preview_loop_locked()
        return (pattern_start_time - now) * 1000.0

    def schedule_selection_pattern(
        self,
        segments: list[dict[str, float]],
        bpm: int,
        beat_count: int,
    ) -> float:
        beat_seconds = 60.0 / bpm
        now = time.perf_counter()
        pattern_start_time = now + 0.05
        note_gap = RETRIGGER_SILENCE_SECONDS
        scheduled_notes = []
        for segment in segments:
            start_seconds = max(0.0, float(segment["startMs"]) / 1000.0)
            duration_seconds = max(0.0, float(segment["durationMs"]) / 1000.0)
            if duration_seconds <= 0.0:
                continue
            note_start = pattern_start_time + start_seconds
            note_end = note_start + max(0.0, duration_seconds - note_gap)
            scheduled_notes.append((note_start, note_end))

        tick_start_times = [
            (pattern_start_time + beat_seconds * beat, False)
            for beat in range(max(0, int(beat_count)))
        ]

        with self._lock:
            self._pressed_keys.clear()
            self._retrigger_silence_until = 0.0
            self._scheduled_note_times = scheduled_notes
            self._tick_start_times = tick_start_times
            self._clear_preview_loop_locked()
        return (pattern_start_time - now) * 1000.0

    def schedule_preview_loop(
        self,
        segments: list[dict[str, float]],
        bpm: int,
    ) -> float:
        beat_seconds = 60.0 / bpm
        now = time.perf_counter()
        loop_start_time = now + 0.05
        note_gap = RETRIGGER_SILENCE_SECONDS
        loop_segments = []
        for segment in segments:
            start_seconds = max(0.0, float(segment["startMs"]) / 1000.0)
            duration_seconds = max(0.0, float(segment["durationMs"]) / 1000.0)
            if duration_seconds <= 0.0 or start_seconds >= beat_seconds:
                continue
            end_seconds = min(
                beat_seconds,
                start_seconds + max(0.0, duration_seconds - note_gap),
            )
            loop_segments.append((start_seconds, end_seconds))

        with self._lock:
            self._pressed_keys.clear()
            self._retrigger_silence_until = 0.0
            self._tick_start_times.clear()
            self._scheduled_note_times.clear()
            self._preview_loop_duration_seconds = beat_seconds * PREVIEW_LOOP_BEATS
            self._preview_loop_note_segments = loop_segments
            self._preview_loop_next_start_time = loop_start_time
            self._preview_loop_next_beat_index = 0
            self._fill_preview_loop_schedule_locked(
                loop_start_time + max(2.0, beat_seconds * 4)
            )
        return (loop_start_time - now) * 1000.0

    def audio_callback(self, outdata, frames, _time_info, status) -> None:
        if status:
            print(status, flush=True)

        with self._lock:
            active = bool(self._pressed_keys)
            retrigger_silence_until = self._retrigger_silence_until
            tick_start_times = tuple(self._tick_start_times)
            scheduled_note_times = tuple(self._scheduled_note_times)

        buffer_started_at = time.perf_counter()
        outdata.fill(0)

        for frame in range(frames):
            sample_time = buffer_started_at + frame / SAMPLE_RATE
            sample = 0.0

            scheduled_note_active = any(
                note_started_at <= sample_time < note_ended_at
                for note_started_at, note_ended_at in scheduled_note_times
            )
            note_active = (
                active and sample_time >= retrigger_silence_until
            ) or scheduled_note_active
            if note_active:
                sample += math.sin(self._phase) * AMPLITUDE

            for tick_started_at, is_bar_start in tick_start_times:
                tick_elapsed = sample_time - tick_started_at
                if 0 <= tick_elapsed < TICK_SECONDS:
                    envelope = 1.0 - tick_elapsed / TICK_SECONDS
                    phase_step = (
                        self._bar_tick_phase_step
                        if is_bar_start
                        else self._tick_phase_step
                    )
                    amplitude = BAR_TICK_AMPLITUDE if is_bar_start else TICK_AMPLITUDE
                    tick_phase = phase_step * frame
                    sample += math.sin(tick_phase) * amplitude * envelope

            outdata[frame, 0] = sample

            if note_active:
                self._phase += self._phase_step
                if self._phase >= 2.0 * math.pi:
                    self._phase -= 2.0 * math.pi

        cleanup_time = buffer_started_at - TICK_SECONDS
        with self._lock:
            self._tick_start_times = [
                tick
                for tick in self._tick_start_times
                if tick[0] >= cleanup_time
            ]
            self._scheduled_note_times = [
                note
                for note in self._scheduled_note_times
                if note[1] >= buffer_started_at
            ]
            self._fill_preview_loop_schedule_locked(
                buffer_started_at
                + max(2.0, self._preview_loop_duration_seconds * 4)
            )


class AudioApi:
    def __init__(
        self,
        gate: BeepGate,
        midi: "MidiInputManager",
        audio: "AudioOutputManager",
    ) -> None:
        self.gate = gate
        self.midi = midi
        self.audio = audio
        self._settings_lock = threading.Lock()

    def press_key(self, key: str) -> bool:
        return self.gate.press(key)

    def release_key(self, key: str) -> bool:
        return self.gate.release(key)

    def retrigger_key(self, key: str) -> None:
        self.gate.retrigger(key)

    def reset(self) -> None:
        self.gate.reset()

    def schedule_count_in(
        self, bpm: int, continue_through_recording: bool
    ) -> float:
        return self.gate.schedule_count_in(bpm, continue_through_recording)

    def schedule_expected_pattern(
        self,
        segments: list[dict[str, float]],
        bpm: int,
        metronome: bool,
    ) -> float:
        return self.gate.schedule_expected_pattern(segments, bpm, metronome)

    def schedule_preview_loop(
        self,
        segments: list[dict[str, float]],
        bpm: int,
    ) -> float:
        return self.gate.schedule_preview_loop(segments, bpm)

    def schedule_selection_pattern(
        self,
        segments: list[dict[str, float]],
        bpm: int,
        beat_count: int,
    ) -> float:
        return self.gate.schedule_selection_pattern(segments, bpm, beat_count)

    def list_midi_inputs(self) -> list[dict[str, str]]:
        return self.midi.list_inputs()

    def select_midi_input(self, device_id: str) -> dict[str, str | bool]:
        return self.midi.select_input(device_id)

    def drain_midi_events(self) -> list[dict[str, str]]:
        return self.midi.drain_events()

    def list_audio_outputs(self) -> dict[str, object]:
        return self.audio.list_outputs()

    def select_audio_output(self, device_id: str) -> dict[str, str | bool]:
        return self.audio.select_output(device_id)

    def load_settings(self) -> dict[str, object]:
        with self._settings_lock:
            try:
                settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return {}
        return settings if isinstance(settings, dict) else {}

    def save_settings(self, settings: dict[str, object]) -> bool:
        if not isinstance(settings, dict):
            return False

        temporary_path = SETTINGS_PATH.with_suffix(".json.tmp")
        with self._settings_lock:
            try:
                temporary_path.write_text(
                    json.dumps(settings, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )
                temporary_path.replace(SETTINGS_PATH)
            except OSError:
                return False
        return True


class AudioOutputManager:
    def __init__(self, gate: BeepGate) -> None:
        self.gate = gate
        self._lock = threading.Lock()
        self._stream: sd.OutputStream | None = None
        self._selected_id = ""

    def list_outputs(self) -> dict[str, object]:
        devices = sd.query_devices()
        default_output_index = sd.default.device[1]
        outputs = [
            {
                "id": str(index),
                "name": str(device["name"]),
                "isDefault": index == default_output_index,
            }
            for index, device in enumerate(devices)
            if int(device["max_output_channels"]) > 0
        ]
        default_name = next(
            (
                str(device["name"])
                for index, device in enumerate(devices)
                if index == default_output_index
            ),
            "",
        )
        with self._lock:
            selected_id = self._selected_id
        return {
            "devices": outputs,
            "defaultName": default_name,
            "selectedId": selected_id,
        }

    def select_output(self, device_id: str) -> dict[str, str | bool]:
        if device_id == "":
            device: int | str | None = None
            selected_name = ""
        else:
            try:
                device = int(device_id)
                device_info = sd.query_devices(device)
            except (TypeError, ValueError, sd.PortAudioError):
                return {
                    "ok": False,
                    "error": "That audio output is no longer available.",
                }

            if int(device_info["max_output_channels"]) < 1:
                return {
                    "ok": False,
                    "error": "The selected device has no audio output.",
                }
            selected_name = str(device_info["name"])

        with self._lock:
            if device_id == self._selected_id and self._stream is not None:
                return {"ok": True, "name": selected_name}

        next_stream = None
        try:
            next_stream = sd.OutputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=BLOCK_SIZE,
                latency="low",
                device=device,
                callback=self.gate.audio_callback,
            )
            next_stream.start()
        except (sd.PortAudioError, ValueError) as error:
            if next_stream is not None:
                next_stream.close()
            return {"ok": False, "error": f"Could not open audio output: {error}"}

        with self._lock:
            previous_stream = self._stream
            self._stream = next_stream
            self._selected_id = device_id

        if previous_stream is not None:
            try:
                previous_stream.stop()
                previous_stream.close()
            except sd.PortAudioError:
                pass
        return {"ok": True, "name": selected_name}

    def open_initial_output(self, device: int | str | None) -> None:
        initial_stream = sd.OutputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=BLOCK_SIZE,
            latency="low",
            device=device,
            callback=self.gate.audio_callback,
        )
        initial_stream.start()
        with self._lock:
            self._stream = initial_stream
            self._selected_id = "" if device is None else str(initial_stream.device)

    def close(self) -> None:
        with self._lock:
            stream = self._stream
            self._stream = None
        if stream is not None:
            try:
                stream.stop()
                stream.close()
            except sd.PortAudioError:
                pass


class MidiInputManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._input: rtmidi.MidiIn | None = None
        self._events: list[dict[str, str]] = []
        self._selected_name = ""

    def list_inputs(self) -> list[dict[str, str]]:
        probe = rtmidi.MidiIn()
        try:
            return [
                {"id": str(index), "name": name}
                for index, name in enumerate(probe.get_ports())
            ]
        finally:
            del probe

    def select_input(self, device_id: str) -> dict[str, str | bool]:
        self.close()
        if device_id == "":
            return {"ok": True, "name": ""}

        try:
            port_index = int(device_id)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Invalid MIDI input selection."}

        midi_input = rtmidi.MidiIn()
        port_names = midi_input.get_ports()
        if port_index < 0 or port_index >= len(port_names):
            del midi_input
            return {
                "ok": False,
                "error": "That MIDI input is no longer available. Refresh the device list.",
            }

        try:
            midi_input.ignore_types(sysex=True, timing=True, active_sense=True)
            midi_input.set_callback(self._handle_message)
            midi_input.open_port(port_index, "Rhythm Randomiser Input")
        except Exception as error:
            del midi_input
            return {"ok": False, "error": f"Could not open MIDI input: {error}"}

        with self._lock:
            self._input = midi_input
            self._selected_name = port_names[port_index]
            self._events.clear()
        return {"ok": True, "name": self._selected_name}

    def _handle_message(
        self, event: tuple[list[int], float], _data: object = None
    ) -> None:
        message, _delta_time = event
        if len(message) < 3:
            return

        status, note, velocity = message[:3]
        message_type = status & 0xF0
        if message_type == 0x90 and velocity > 0:
            event_type = "down"
        elif message_type == 0x80 or (message_type == 0x90 and velocity == 0):
            event_type = "up"
        else:
            return

        channel = status & 0x0F
        with self._lock:
            self._events.append(
                {"type": event_type, "key": f"midi:{channel}:{note}"}
            )

    def drain_events(self) -> list[dict[str, str]]:
        with self._lock:
            events = self._events
            self._events = []
        return events

    def close(self) -> None:
        with self._lock:
            midi_input = self._input
            self._input = None
            self._selected_name = ""
            self._events.clear()
        if midi_input is not None:
            try:
                midi_input.cancel_callback()
                midi_input.close_port()
            except Exception:
                # A disconnected USB device may already have closed the port.
                pass


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render VexFlow notation and beep while any key is held."
    )
    parser.add_argument(
        "--device",
        help="Output device index or exact/partial device name. Use --list-devices to inspect.",
    )
    parser.add_argument(
        "--list-devices",
        action="store_true",
        help="Print available audio devices and exit.",
    )
    args = parser.parse_args()

    if args.list_devices:
        print(sd.query_devices())
        return

    gate = BeepGate()
    audio = AudioOutputManager(gate)
    midi = MidiInputManager()
    device_arg = int(args.device) if args.device and args.device.isdigit() else args.device

    try:
        audio.open_initial_output(device_arg)
        server = start_app_server()
        host, port = server.server_address
        webview.create_window(
            "Rhythm Randomiser",
            url=f"http://{host}:{port}/",
            width=980,
            height=760,
            js_api=AudioApi(gate, midi, audio),
        )
        webview.start()
    finally:
        midi.close()
        audio.close()
        if "server" in locals():
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
