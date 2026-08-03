import unittest

from app import MidiInputManager


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


if __name__ == "__main__":
    unittest.main()
