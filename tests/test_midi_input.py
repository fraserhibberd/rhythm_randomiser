import time
import unittest

from app import BeepGate, MidiInputManager


class FakeGate:
    def __init__(self) -> None:
        self.actions: list[tuple[str, str]] = []

    def press(self, key: str) -> None:
        self.actions.append(("press", key))

    def release(self, key: str) -> None:
        self.actions.append(("release", key))

    def retrigger(self, key: str) -> None:
        self.actions.append(("retrigger", key))


class MidiInputManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = FakeGate()
        self.midi = MidiInputManager(self.gate)

    def test_disabled_monitoring_only_queues_ui_event(self) -> None:
        self.midi._handle_message(([0x90, 60, 100], 0.0))

        self.assertEqual(self.gate.actions, [])
        self.assertEqual(
            self.midi.drain_events(),
            [{"type": "down", "key": "midi:0:60"}],
        )

    def test_enabled_monitoring_drives_native_gate_directly(self) -> None:
        self.midi.set_monitoring(True)
        self.midi._handle_message(([0x90, 60, 100], 0.0))
        self.midi._handle_message(([0x90, 64, 100], 0.0))
        self.midi._handle_message(([0x80, 60, 0], 0.0))
        self.midi._handle_message(([0x80, 64, 0], 0.0))

        self.assertEqual(
            self.gate.actions,
            [
                ("press", "merged"),
                ("retrigger", "merged"),
                ("release", "merged"),
            ],
        )

    def test_count_in_to_recording_transition_keeps_held_note_tracked(self) -> None:
        self.midi.set_monitoring(True)
        self.midi._handle_message(([0x90, 60, 100], 0.0))
        self.midi.set_monitoring(True)
        self.midi._handle_message(([0x80, 60, 0], 0.0))

        self.assertEqual(
            self.gate.actions,
            [("press", "merged"), ("release", "merged")],
        )

    def test_disabling_monitoring_releases_an_active_note(self) -> None:
        self.midi.set_monitoring(True)
        self.midi._handle_message(([0x90, 60, 100], 0.0))
        self.midi.set_monitoring(False)

        self.assertEqual(
            self.gate.actions,
            [("press", "merged"), ("release", "merged")],
        )


class BeepGateMetronomeTests(unittest.TestCase):
    def test_aligned_count_in_replaces_next_metronome_tick(self) -> None:
        gate = BeepGate()
        next_tick = time.perf_counter() + 0.25
        gate._tick_start_times = [
            (next_tick, False),
            (next_tick + 0.5, False),
        ]

        delay_ms = gate.schedule_count_in(120, True, align_to_metronome=True)

        self.assertAlmostEqual(gate._tick_start_times[0][0], next_tick, delta=0.01)
        self.assertAlmostEqual(delay_ms, 250, delta=20)
        self.assertEqual(len(gate._tick_start_times), 8)
        self.assertEqual(
            [is_bar_start for _tick_time, is_bar_start in gate._tick_start_times],
            [True, False, False, False, True, False, False, False],
        )

    def test_start_metronome_creates_a_continuing_schedule(self) -> None:
        gate = BeepGate()

        delay_ms = gate.start_metronome(120)

        self.assertAlmostEqual(delay_ms, 50, delta=20)
        self.assertIsNotNone(gate._preview_loop_next_start_time)
        self.assertGreaterEqual(len(gate._tick_start_times), 4)

    def test_prediction_plays_after_aligned_four_beat_count_in(self) -> None:
        gate = BeepGate()
        next_tick = time.perf_counter() + 0.25
        gate._tick_start_times = [(next_tick, False)]

        gate.schedule_prediction_pattern(
            [{"startMs": 0, "durationMs": 250}],
            120,
            True,
            align_to_metronome=True,
        )

        self.assertAlmostEqual(gate._tick_start_times[0][0], next_tick, delta=0.01)
        self.assertEqual(len(gate._tick_start_times), 8)
        prediction_start, prediction_end = gate._scheduled_note_times[0]
        self.assertAlmostEqual(prediction_start, next_tick + 2.0, delta=0.01)
        self.assertAlmostEqual(prediction_end - prediction_start, 0.247, delta=0.01)

if __name__ == "__main__":
    unittest.main()
