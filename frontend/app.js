function showError(message) {
  const error = document.getElementById("error");
  error.style.display = "block";
  error.textContent = message;
}

window.addEventListener("error", (event) => {
  showError(`${event.message}\n${event.filename}:${event.lineno}:${event.colno}`);
});

window.addEventListener("unhandledrejection", (event) => {
  showError(event.reason && event.reason.stack ? event.reason.stack : String(event.reason));
});

function loadVexFlow() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vexflow.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load local VexFlow script."));
    document.head.appendChild(script);

    window.setTimeout(() => {
      if (!window.Vex) {
        reject(new Error("Timed out loading local VexFlow script."));
      }
    }, 10000);
  });
}

async function loadConfig() {
  const response = await fetch("/config.json");
  if (!response.ok) {
    throw new Error(`Failed to load app configuration (${response.status}).`);
  }
  return response.json();
}

(async function boot() {
  try {
    const [, config] = await Promise.all([loadVexFlow(), loadConfig()]);

    const VF = Vex.Flow && Vex.Flow.Renderer ? Vex.Flow : Vex;
    const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline } = VF;

    const TIME_SIGNATURE = { type: "4/4", beatsPerMeasure: 4 };
    const noteIconUrls = config.noteIconUrls;

    const NoteType = {
      W: "w",
      H: "h",
      Q: "q",
      E: "8",
      S: "16",
    };

    const noteWidthUnitMap = {
      [NoteType.W]: 13,
      [NoteType.H]: 8,
      [NoteType.Q]: 5,
      [NoteType.E]: 3,
      [NoteType.S]: 1,
    };

    const notePlaybackUnitMap = {
      [NoteType.W]: "1",
      [NoteType.H]: "2",
      [NoteType.Q]: "4",
      [NoteType.E]: "8",
      [NoteType.S]: "16",
    };

    function createNote(type, rest = false, dotted = false) {
      return {
        type,
        dotted,
        rest,
        playbackUnit: notePlaybackUnitMap[type],
        widthUnit: noteWidthUnitMap[type] * (dotted ? 1.5 : 1),
      };
    }

    const c = createNote;

    function getGeneratedNoteIconSrc(noteGroup) {
      const noteSpacing = 82;
      const margin = 44;
      const width = Math.max(220, margin * 2 + noteSpacing * (noteGroup.notes.length - 1) + 72);
      const stemTop = 28;
      const stemBottom = 142;
      const noteY = 176;
      const soundingNotes = noteGroup.notes
        .map((note, index) => ({ note, x: margin + noteSpacing * index }))
        .filter(({ note }) => !note.rest);
      const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="230" viewBox="0 0 ${width} 230">`,
        `<g fill="#000">`,
      ];

      if (noteGroup.beam && soundingNotes.length > 1) {
        const beamStart = soundingNotes[0].x + 30;
        const beamEnd = soundingNotes[soundingNotes.length - 1].x + 42;
        parts.push(
          `<rect x="${beamStart}" y="${stemTop}" width="${beamEnd - beamStart}" height="20"/>`
        );

        soundingNotes.forEach(({ note, x }, index) => {
          if (note.type !== NoteType.S) {
            return;
          }

          const previous = soundingNotes[index - 1];
          const next = soundingNotes[index + 1];
          let secondaryStart;
          let secondaryEnd;

          if (next?.note.type === NoteType.S) {
            secondaryStart = x + 30;
            secondaryEnd = next.x + 42;
          } else if (previous?.note.type === NoteType.S) {
            return;
          } else if (next) {
            secondaryStart = x + 30;
            secondaryEnd = x + 62;
          } else {
            secondaryStart = x + 10;
            secondaryEnd = x + 42;
          }

          parts.push(
            `<rect x="${secondaryStart}" y="${stemTop + 30}" width="${secondaryEnd - secondaryStart}" height="14"/>`
          );
        });
      }

      noteGroup.notes.forEach((note, index) => {
        const x = margin + noteSpacing * index;
        if (note.rest) {
          parts.push(`<rect x="${x - 14}" y="${noteY - 34}" width="34" height="20" rx="3" transform="rotate(-14 ${x + 3} ${noteY - 24})"/>`);
        } else {
          parts.push(`<ellipse cx="${x}" cy="${noteY}" rx="30" ry="18" transform="rotate(-18 ${x} ${noteY})"/>`);
          parts.push(`<rect x="${x + 30}" y="${stemTop}" width="12" height="${stemBottom - stemTop}"/>`);
          if (!noteGroup.beam || soundingNotes.length < 2) {
            parts.push(`<path d="M${x + 42} ${stemTop}c24 8 36 24 36 46c0 18-7 36-20 52c8-28-2-52-36-68z"/>`);
          }
        }
        if (note.dotted) {
          parts.push(`<circle cx="${x + 48}" cy="${noteY - 16}" r="7"/>`);
        }
      });

      parts.push(`</g></svg>`);
      return `data:image/svg+xml,${encodeURIComponent(parts.join(""))}`;
    }

    function getNoteIconSrc(noteGroup) {
      return noteIconUrls[noteGroup.type] || getGeneratedNoteIconSrc(noteGroup);
    }

    const noteGroupCategories = [
      { type: "basicDurations", label: "Basic durations", sortOrder: 0 },
      { type: "eighthVocabulary", label: "Eighth-note vocabulary", sortOrder: 1 },
      { type: "sixteenthVocabulary", label: "Sixteenth-note vocabulary", sortOrder: 2 },
      { type: "twoBeatSyncopations", label: "Two-beat syncopations", sortOrder: 3 },
      { type: "tuplets", label: "Tuplets", sortOrder: 4 },
      { type: "groovePatterns", label: "Groove patterns", sortOrder: 5 },
    ];

    const noteGroups = [
      {
        categoryType: "basicDurations",
        type: "w",
        label: "Whole note",
        duration: 4,
        notes: [c(NoteType.W)],
        weight: 1,
        defaultSelectionValue: false,
        sortOrder: 0,
      },
      {
        categoryType: "basicDurations",
        type: "h",
        label: "Half note",
        duration: 2,
        notes: [c(NoteType.H)],
        weight: 4,
        defaultSelectionValue: true,
        sortOrder: 1,
      },
      {
        categoryType: "basicDurations",
        type: "q",
        label: "Quarter note",
        duration: 1,
        notes: [c(NoteType.Q)],
        weight: 8,
        defaultSelectionValue: true,
        sortOrder: 2,
      },
      {
        categoryType: "basicDurations",
        type: "wr",
        label: "Whole rest",
        duration: (beatsPerMeasure) => beatsPerMeasure,
        notes: [c(NoteType.W, true)],
        weight: 1,
        defaultSelectionValue: false,
        sortOrder: 3,
      },
      {
        categoryType: "basicDurations",
        type: "hr",
        label: "Half rest",
        duration: 2,
        notes: [c(NoteType.H, true)],
        weight: 2,
        defaultSelectionValue: true,
        sortOrder: 4,
      },
      {
        categoryType: "basicDurations",
        type: "qr",
        label: "Quarter rest",
        duration: 1,
        notes: [c(NoteType.Q, true)],
        weight: 4,
        defaultSelectionValue: true,
        sortOrder: 5,
      },
      {
        categoryType: "eighthVocabulary",
        type: "ee",
        label: "Two eighth notes",
        duration: 1,
        notes: [c(NoteType.E), c(NoteType.E)],
        beam: true,
        weight: 8,
        defaultSelectionValue: true,
        sortOrder: 0,
      },
      {
        categoryType: "eighthVocabulary",
        type: "eer",
        label: "Eighth note, eighth rest",
        duration: 1,
        notes: [c(NoteType.E), c(NoteType.E, true)],
        weight: 5,
        defaultSelectionValue: true,
        sortOrder: 1,
      },
      {
        categoryType: "eighthVocabulary",
        type: "ere",
        label: "Eighth rest, eighth note",
        duration: 1,
        notes: [c(NoteType.E, true), c(NoteType.E)],
        weight: 5,
        defaultSelectionValue: true,
        sortOrder: 2,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "ssss",
        label: "Four sixteenth notes",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.S), c(NoteType.S), c(NoteType.S)],
        beam: true,
        weight: 5,
        defaultSelectionValue: false,
        sortOrder: 0,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "sse",
        label: "Two sixteenths and an eighth",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.S), c(NoteType.E)],
        beam: true,
        weight: 6,
        defaultSelectionValue: false,
        sortOrder: 1,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "ess",
        label: "An eighth and two sixteenths",
        duration: 1,
        notes: [c(NoteType.E), c(NoteType.S), c(NoteType.S)],
        beam: true,
        weight: 6,
        defaultSelectionValue: false,
        sortOrder: 2,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "ses",
        label: "A sixteenth, eighth, and sixteenth",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.E), c(NoteType.S)],
        beam: true,
        weight: 5,
        defaultSelectionValue: false,
        sortOrder: 3,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "eds",
        label: "Dotted eighth and sixteenth",
        duration: 1,
        notes: [c(NoteType.E, false, true), c(NoteType.S)],
        beam: true,
        weight: 5,
        defaultSelectionValue: false,
        sortOrder: 4,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "sed",
        label: "Sixteenth and dotted eighth",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.E, false, true)],
        beam: true,
        weight: 4,
        defaultSelectionValue: false,
        sortOrder: 5,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "srse",
        label: "Sixteenth rest, sixteenth, eighth",
        duration: 1,
        notes: [c(NoteType.S, true), c(NoteType.S), c(NoteType.E)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 6,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "ssre",
        label: "Sixteenth, sixteenth rest, eighth",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.S, true), c(NoteType.E)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 7,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "esrs",
        label: "Eighth, sixteenth rest, sixteenth",
        duration: 1,
        notes: [c(NoteType.E), c(NoteType.S, true), c(NoteType.S)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 8,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "erss",
        label: "Eighth rest and two sixteenths",
        duration: 1,
        notes: [c(NoteType.E, true), c(NoteType.S), c(NoteType.S)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 9,
      },
      {
        categoryType: "twoBeatSyncopations",
        type: "qde",
        label: "Dotted quarter and eighth",
        duration: 2,
        notes: [c(NoteType.Q, false, true), c(NoteType.E)],
        weight: 4,
        defaultSelectionValue: false,
        sortOrder: 0,
      },
      {
        categoryType: "twoBeatSyncopations",
        type: "eqd",
        label: "Eighth and dotted quarter",
        duration: 2,
        notes: [c(NoteType.E), c(NoteType.Q, false, true)],
        weight: 4,
        defaultSelectionValue: false,
        sortOrder: 1,
      },
      {
        categoryType: "twoBeatSyncopations",
        type: "eqe",
        label: "Eighth, quarter, eighth",
        duration: 2,
        notes: [c(NoteType.E), c(NoteType.Q), c(NoteType.E)],
        weight: 4,
        defaultSelectionValue: false,
        sortOrder: 2,
      },
      {
        categoryType: "tuplets",
        type: "teee",
        label: "Eighth-note triplet",
        duration: 1,
        notes: [c(NoteType.E), c(NoteType.E), c(NoteType.E)],
        beam: true,
        tuplet: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 0,
      },
      {
        categoryType: "tuplets",
        type: "tqqq",
        label: "Quarter-note triplet",
        duration: 2,
        notes: [c(NoteType.Q), c(NoteType.Q), c(NoteType.Q)],
        tuplet: true,
        weight: 1,
        defaultSelectionValue: false,
        sortOrder: 1,
      },
      {
        categoryType: "groovePatterns",
        type: "edede",
        label: "3+3+2",
        duration: 2,
        notes: [
          c(NoteType.E, false, true),
          c(NoteType.E, false, true),
          c(NoteType.E),
        ],
        beam: true,
        weight: 2,
        defaultSelectionValue: false,
        sortOrder: 0,
      },
      {
        categoryType: "groovePatterns",
        type: "eqqe",
        label: "Eighth, two quarters, eighth",
        duration: 3,
        notes: [c(NoteType.E), c(NoteType.Q), c(NoteType.Q), c(NoteType.E)],
        weight: 2,
        defaultSelectionValue: false,
        sortOrder: 1,
      },
      {
        categoryType: "groovePatterns",
        type: "eqqqe",
        label: "Eighth, three quarters, eighth",
        duration: 4,
        notes: [
          c(NoteType.E),
          c(NoteType.Q),
          c(NoteType.Q),
          c(NoteType.Q),
          c(NoteType.E),
        ],
        weight: 2,
        defaultSelectionValue: false,
        sortOrder: 2,
      },
    ];

    const practicePresets = [
      {
        id: "foundation",
        label: "Foundation",
        description: "Steady beats, basic rests, and eighth-note placement.",
        noteGroupTypes: ["q", "qr", "h", "hr", "ee", "eer", "ere"],
      },
      {
        id: "sixteenthVocabulary",
        label: "Sixteenth vocabulary",
        description: "Core eighth- and sixteenth-note cells without tuplets.",
        noteGroupTypes: [
          "q", "qr", "h", "ee", "eer", "ere",
          "ssss", "sse", "ess", "ses", "eds", "sed",
          "srse", "ssre", "esrs", "erss",
        ],
      },
      {
        id: "offbeats",
        label: "Offbeats and syncopation",
        description: "Rests, displaced attacks, and longer offbeat figures.",
        noteGroupTypes: [
          "eer", "ere", "qde", "eqd", "eqe",
          "srse", "ssre", "esrs", "erss", "eqqe", "eqqqe",
        ],
      },
      {
        id: "tuplets",
        label: "Tuplets",
        description: "Triplet subdivision supported by simple bar fillers.",
        noteGroupTypes: ["q", "h", "teee", "tqqq"],
      },
      {
        id: "mixed",
        label: "Mixed reading",
        description: "The complete reduced rhythm library.",
        noteGroupTypes: noteGroups.map((noteGroup) => noteGroup.type),
      },
    ];
    let currentMeasure = null;
    let currentExpectedSourceEvents = [];
    let preferredMidiInputName = "";
    let preferredAudioOutputName = "";
    const noteGroupSelection = new Map(
      noteGroups.map((noteGroup) => [
        noteGroup.type,
        noteGroup.defaultSelectionValue,
      ])
    );

    function saveSettings() {
      window.pywebview.api
        .save_settings({
          bpm: getBpm(),
          metronome: metronomeCheckbox.checked,
          midiInputName: preferredMidiInputName,
          audioOutputName: preferredAudioOutputName,
          noteGroupSelection: Object.fromEntries(noteGroupSelection),
        })
        .then((saved) => {
          if (!saved) {
            showError("Could not save settings.json.");
          }
        })
        .catch((error) => showError(`Could not save settings: ${error}`));
    }

    async function restoreSettings() {
      let savedSettings;
      try {
        savedSettings = await window.pywebview.api.load_settings();
      } catch (error) {
        showError(`Could not load settings: ${error}`);
        return;
      }

      if (!savedSettings || typeof savedSettings !== "object") {
        return;
      }

      if (Number.isFinite(Number(savedSettings.bpm))) {
        bpmInput.value = String(savedSettings.bpm);
        getBpm();
      }

      metronomeCheckbox.checked = Boolean(savedSettings.metronome);
      preferredMidiInputName =
        typeof savedSettings.midiInputName === "string"
          ? savedSettings.midiInputName
          : "";
      preferredAudioOutputName =
        typeof savedSettings.audioOutputName === "string"
          ? savedSettings.audioOutputName
          : "";

      if (
        savedSettings.noteGroupSelection &&
        typeof savedSettings.noteGroupSelection === "object"
      ) {
        noteGroups.forEach((noteGroup) => {
          if (
            Object.prototype.hasOwnProperty.call(
              savedSettings.noteGroupSelection,
              noteGroup.type
            )
          ) {
            noteGroupSelection.set(
              noteGroup.type,
              Boolean(savedSettings.noteGroupSelection[noteGroup.type])
            );
          }
        });
      }
    }

    function getDuration(item, targetDuration) {
      return typeof item.duration === "function"
        ? item.duration(targetDuration)
        : item.duration;
    }

    function chooseWeightedItem(items) {
      const totalWeight = items.reduce((total, item) => total + item.weight, 0);
      let selection = Math.random() * totalWeight;

      for (const item of items) {
        selection -= item.weight;
        if (selection < 0) {
          return item;
        }
      }

      return items[items.length - 1];
    }

    function getRandomItems(possibleItems, targetDuration) {
      if (possibleItems.length === 0) {
        throw new Error("Select at least one rhythm group.");
      }

      const randomItems = [];
      const completionMemo = new Map();
      const canComplete = (remainingDuration) => {
        if (Math.abs(remainingDuration) < Number.EPSILON) {
          return true;
        }

        const memoKey = remainingDuration.toFixed(6);
        if (completionMemo.has(memoKey)) {
          return completionMemo.get(memoKey);
        }

        completionMemo.set(memoKey, false);
        const completable = possibleItems.some((item) => {
          const duration = getDuration(item, targetDuration);
          return (
            duration <= remainingDuration &&
            canComplete(remainingDuration - duration)
          );
        });
        completionMemo.set(memoKey, completable);
        return completable;
      };

      if (!canComplete(targetDuration)) {
        throw new Error("The selected rhythms cannot complete a 4/4 bar.");
      }

      let remainingDuration = targetDuration;
      while (remainingDuration > Number.EPSILON) {
        const candidates = possibleItems.filter((item) => {
          const duration = getDuration(item, targetDuration);
          return (
            duration <= remainingDuration &&
            canComplete(remainingDuration - duration)
          );
        });
        const selectedItem = chooseWeightedItem(candidates);
        randomItems.push(selectedItem);
        remainingDuration -= getDuration(selectedItem, targetDuration);
      }

      return randomItems;
    }

    function generateNoteGroup(noteGroup) {
      return {
        type: noteGroup.type,
        duration: getDuration(noteGroup, TIME_SIGNATURE.beatsPerMeasure),
        notes: noteGroup.notes,
        beam: noteGroup.beam ?? false,
        tuplet: noteGroup.tuplet ?? false,
      };
    }

    function getRandomMeasure() {
      const selectedNoteGroups = noteGroups.filter((noteGroup) =>
        noteGroupSelection.get(noteGroup.type)
      );
      if (selectedNoteGroups.length === 0) {
        throw new Error("Select at least one rhythm group.");
      }

      return {
        noteGroups: getRandomItems(
          selectedNoteGroups,
          TIME_SIGNATURE.beatsPerMeasure
        ).map(generateNoteGroup),
      };
    }

    function getExpectedSourceEvents(measure) {
      const sourceEvents = [];
      let elapsedBeats = 0;

      measure.noteGroups.forEach((noteGroup) => {
        noteGroup.notes.forEach((note) => {
          let durationBeats = 4 / Number.parseInt(note.playbackUnit, 10);
          if (note.dotted) {
            durationBeats *= 1.5;
          }
          if (noteGroup.tuplet) {
            durationBeats *= 2 / 3;
          }
          if (!note.rest) {
            sourceEvents.push({
              startBeats: elapsedBeats,
              durationBeats,
            });
          }
          elapsedBeats += durationBeats;
        });
      });

      return sourceEvents;
    }

    function addDot(staveNote) {
      if (typeof staveNote.addDotToAll === "function") {
        staveNote.addDotToAll();
      } else {
        staveNote.addDot(0);
      }
    }

    function createStaveNote(note) {
      const staveNote = new StaveNote({
        clef: "percussion",
        keys: ["b/4"],
        duration: note.type + (note.rest ? "r" : ""),
        stem_direction: VF.Stem.UP,
        auto_stem: false,
      });

      if (note.dotted) {
        addDot(staveNote);
      }

      return staveNote;
    }

    function renderRandomMeasure() {
      const target = document.getElementById("notation");
      target.replaceChildren();

      let measure;
      try {
        measure = getRandomMeasure();
      } catch (error) {
        currentMeasure = null;
        currentExpectedSourceEvents = [];
        const message = document.createElement("p");
        message.textContent = error.message;
        message.style.margin = "48px 20px";
        target.appendChild(message);
        return;
      }

      currentMeasure = measure;
      currentExpectedSourceEvents = getExpectedSourceEvents(measure);
      const renderer = new Renderer(target, Renderer.Backends.SVG);
      renderer.resize(700, 170);

      const context = renderer.getContext();
      const stave = new Stave(20, 28, 650);
      stave.setConfigForLine(0, { visible: false });
      stave.setConfigForLine(1, { visible: false });
      stave.setConfigForLine(3, { visible: false });
      stave.setConfigForLine(4, { visible: false });
      stave.setBegBarType(Barline.type.NONE);
      stave.setEndBarType(Barline.type.END);
      stave.addClef("percussion").addTimeSignature(TIME_SIGNATURE.type);
      stave.setContext(context).draw();

      const beams = [];
      const tuplets = [];
      const staveNotes = measure.noteGroups.flatMap((noteGroup) => {
        const groupNotes = noteGroup.notes.map(createStaveNote);
        const soundingGroupNotes = groupNotes.filter(
          (_staveNote, index) => !noteGroup.notes[index].rest
        );
        if (noteGroup.beam && soundingGroupNotes.length > 1) {
          beams.push(new Beam(soundingGroupNotes, false));
        }
        if (noteGroup.tuplet) {
          tuplets.push(new VF.Tuplet(groupNotes));
        }
        return groupNotes;
      });

      const voice = new Voice({ num_beats: 4, beat_value: 4 })
        .setMode(Voice.Mode.SOFT)
        .addTickables(staveNotes);

      new Formatter({ softmaxFactor: 10 })
        .joinVoices([voice])
        .formatToStave([voice], stave);

      voice.setStave(stave).draw(context, stave);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
    }

    function getSelectedNoteGroupCount() {
      return noteGroups.filter((noteGroup) =>
        noteGroupSelection.get(noteGroup.type)
      ).length;
    }

    function updateSelectedCount() {
      const selectedCount = document.getElementById("selected-rhythm-count");
      if (selectedCount) {
        selectedCount.textContent =
          `${getSelectedNoteGroupCount()} of ${noteGroups.length} selected`;
      }
    }

    function applyPreset(preset) {
      const selectedTypes = new Set(preset.noteGroupTypes);
      noteGroups.forEach((noteGroup) => {
        noteGroupSelection.set(noteGroup.type, selectedTypes.has(noteGroup.type));
      });
      saveSettings();
      renderSettings();
      renderRandomMeasure();
    }

    function renderSettings() {
      const settings = document.getElementById("settings");
      settings.replaceChildren();

      const presetSection = document.createElement("section");
      presetSection.className = "practice-presets";

      const presetHeader = document.createElement("div");
      presetHeader.className = "preset-header";
      const presetTitle = document.createElement("h2");
      presetTitle.textContent = "Practice presets";
      const selectedCount = document.createElement("span");
      selectedCount.id = "selected-rhythm-count";
      presetHeader.append(presetTitle, selectedCount);
      presetSection.appendChild(presetHeader);

      const presetOptions = document.createElement("div");
      presetOptions.className = "preset-options";
      practicePresets.forEach((preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "preset-button";

        const label = document.createElement("strong");
        label.textContent = preset.label;
        const description = document.createElement("span");
        description.textContent = preset.description;
        button.append(label, description);
        button.addEventListener("click", () => applyPreset(preset));
        presetOptions.appendChild(button);
      });
      presetSection.appendChild(presetOptions);
      settings.appendChild(presetSection);
      updateSelectedCount();

      noteGroupCategories.forEach((category) => {
        const groups = noteGroups
          .filter((noteGroup) => noteGroup.categoryType === category.type)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (!groups.length) {
          return;
        }

        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = category.label;
        fieldset.appendChild(legend);

        const actions = document.createElement("div");
        actions.className = "group-actions";

        const selectAll = document.createElement("button");
        selectAll.type = "button";
        selectAll.textContent = "All";
        selectAll.addEventListener("click", () => {
          groups.forEach((noteGroup) => noteGroupSelection.set(noteGroup.type, true));
          saveSettings();
          renderSettings();
          renderRandomMeasure();
        });

        const selectNone = document.createElement("button");
        selectNone.type = "button";
        selectNone.textContent = "None";
        selectNone.addEventListener("click", () => {
          groups.forEach((noteGroup) => noteGroupSelection.set(noteGroup.type, false));
          saveSettings();
          renderSettings();
          renderRandomMeasure();
        });

        actions.append(selectAll, selectNone);
        fieldset.appendChild(actions);

        const options = document.createElement("div");
        options.className = "note-options";
        groups.forEach((noteGroup) => {
          const label = document.createElement("label");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = Boolean(noteGroupSelection.get(noteGroup.type));
          checkbox.addEventListener("change", () => {
            noteGroupSelection.set(noteGroup.type, checkbox.checked);
            saveSettings();
            updateSelectedCount();
            renderRandomMeasure();
          });

          const labelText = document.createElement("span");
          labelText.className = "note-option-text";
          labelText.textContent = noteGroup.label;
          label.append(checkbox, labelText);

          const icon = document.createElement("img");
          icon.className = `note-icon note-icon--${noteGroup.type}`;
          icon.src = getNoteIconSrc(noteGroup);
          icon.alt = "";
          icon.title = noteGroup.label;
          label.appendChild(icon);

          options.appendChild(label);
        });

        fieldset.appendChild(options);
        settings.appendChild(fieldset);
      });
    }

    const AppState = {
      IDLE: "idle",
      COUNTING_IN: "countingIn",
      RECORDING: "recording",
      PLAYING_EXPECTED: "playingExpected",
      DONE: "done",
    };

    const bpmInput = document.getElementById("bpm");
    const metronomeCheckbox = document.getElementById("metronome");
    const randomizeButton = document.getElementById("randomize");
    const midiInput = document.getElementById("midi-input");
    const audioOutput = document.getElementById("audio-output");
    const settingsPanel = document.getElementById("settings-panel");
    const status = document.getElementById("status");
    const timeline = document.getElementById("timeline");
    const timelineGrid = document.getElementById("timeline-grid");
    const playExpectedButton = document.getElementById("play-expected");
    const expectedTrack = document.getElementById("expected-track");
    const recordedTrack = document.getElementById("recorded-track");
    const gridLabels = ["1", "e", "&", "a", "2", "e", "&", "a", "3", "e", "&", "a", "4", "e", "&", "a"];

    let appState = AppState.IDLE;
    let recordingBpm = 50;
    let recordingStartMs = 0;
    let measureDurationMs = 0;
    let activeSegmentStartMs = null;
    let activeKey = null;
    let recordedSegments = [];
    let midiPollInFlight = false;
    let activeAudioOutputId = "";
    let expectedPlaybackTimer = null;
    const heldKeys = new Set();

    function getBpm() {
      const parsed = Number.parseInt(bpmInput.value, 10);
      if (Number.isNaN(parsed)) {
        bpmInput.value = "50";
        return 50;
      }

      const clamped = Math.min(300, Math.max(40, parsed));
      bpmInput.value = String(clamped);
      return clamped;
    }

    function getMeasureDurationMs() {
      return 4 * (60000 / getBpm());
    }

    function setControlsLocked(locked) {
      bpmInput.disabled = locked;
      metronomeCheckbox.disabled = locked;
      randomizeButton.disabled = locked;
      midiInput.disabled = locked;
      audioOutput.disabled = locked;
      playExpectedButton.disabled = locked;
      settingsPanel.querySelectorAll("button, input").forEach((control) => {
        control.disabled = locked;
      });
    }

    function setState(nextState, message) {
      appState = nextState;
      status.textContent = message;
      setControlsLocked(
        nextState === AppState.COUNTING_IN ||
          nextState === AppState.RECORDING ||
          nextState === AppState.PLAYING_EXPECTED
      );
    }

    function renderTimelineGrid() {
      timelineGrid.replaceChildren();
      gridLabels.forEach((label) => {
        const marker = document.createElement("div");
        marker.className = "timeline-marker";
        marker.textContent = label;
        timelineGrid.appendChild(marker);
      });
    }

    function getPlaybackPatternDurationMs(note, noteGroup, quarterNoteMs) {
      let durationMs = quarterNoteMs * (4 / Number.parseInt(note.playbackUnit, 10));
      if (note.dotted) {
        durationMs *= 1.5;
      }
      if (noteGroup.tuplet) {
        durationMs *= 2 / 3;
      }
      return durationMs;
    }

    function getExpectedSegments() {
      const quarterNoteMs = measureDurationMs / TIME_SIGNATURE.beatsPerMeasure;
      return currentExpectedSourceEvents.map((event) => ({
        startMs: event.startBeats * quarterNoteMs,
        durationMs: event.durationBeats * quarterNoteMs,
      }));
    }

    function renderSegmentBars(track, segments, className, emptyText = "") {
      track.replaceChildren();
      if (segments.length === 0 && emptyText) {
        const empty = document.createElement("span");
        empty.className = "timeline-empty";
        empty.textContent = emptyText;
        track.appendChild(empty);
        return;
      }

      segments.forEach((segment) => {
        const startPercent = (segment.startMs / measureDurationMs) * 100;
        const widthPercent = (segment.durationMs / measureDurationMs) * 100;
        const eventBar = document.createElement("span");
        eventBar.className = className;
        eventBar.style.left = `${startPercent}%`;
        eventBar.style.width = `${widthPercent}%`;
        track.appendChild(eventBar);
      });
    }

    function renderComparisonTimeline() {
      renderTimelineGrid();
      renderSegmentBars(
        expectedTrack,
        getExpectedSegments(),
        "expected-event"
      );
      renderSegmentBars(recordedTrack, recordedSegments, "recorded-event");
      timeline.hidden = false;
    }

    function hideComparisonTimeline() {
      timeline.hidden = true;
    }

    async function playExpectedPattern() {
      if (appState !== AppState.DONE || playExpectedButton.disabled) {
        return;
      }

      const segments = getExpectedSegments();
      playExpectedButton.disabled = true;
      playExpectedButton.classList.add("is-playing");
      playExpectedButton.textContent = "■";
      playExpectedButton.setAttribute("aria-label", "Playing expected rhythm");
      playExpectedButton.title = "Playing expected rhythm";
      setState(AppState.PLAYING_EXPECTED, "Playing expected rhythm");

      try {
        window.pywebview.api.reset();
        const scheduledStartDelayMs =
          await window.pywebview.api.schedule_expected_pattern(
            segments,
            recordingBpm,
            metronomeCheckbox.checked
          );

        window.clearTimeout(expectedPlaybackTimer);
        expectedPlaybackTimer = window.setTimeout(() => {
          playExpectedButton.classList.remove("is-playing");
          playExpectedButton.textContent = "▶";
          playExpectedButton.setAttribute("aria-label", "Play expected rhythm");
          playExpectedButton.title = "Play expected rhythm";
          expectedPlaybackTimer = null;
          setState(AppState.DONE, "Done. Press Enter to record again.");
        }, scheduledStartDelayMs + measureDurationMs);
      } catch (error) {
        playExpectedButton.disabled = false;
        playExpectedButton.classList.remove("is-playing");
        playExpectedButton.textContent = "▶";
        playExpectedButton.setAttribute("aria-label", "Play expected rhythm");
        playExpectedButton.title = "Play expected rhythm";
        setState(AppState.DONE, "Could not play the expected rhythm.");
        showError(error);
      }
    }

    function closeActiveSegment(nowMs) {
      if (activeSegmentStartMs === null) {
        return;
      }

      const clampedStartMs = Math.max(0, Math.min(activeSegmentStartMs, measureDurationMs));
      const clampedEndMs = Math.max(clampedStartMs, Math.min(nowMs - recordingStartMs, measureDurationMs));
      if (clampedEndMs > clampedStartMs) {
        recordedSegments.push({
          startMs: clampedStartMs,
          durationMs: clampedEndMs - clampedStartMs,
        });
      }
      activeSegmentStartMs = null;
    }

    function finishRecording() {
      if (appState !== AppState.RECORDING) {
        return;
      }

      closeActiveSegment(recordingStartMs + measureDurationMs);
      activeKey = null;
      heldKeys.clear();
      window.pywebview.api.reset();
      renderComparisonTimeline();
      setState(AppState.DONE, "Done. Press Enter to record again.");
    }

    function beginRecording() {
      recordingStartMs = performance.now();
      activeKey = heldKeys.size > 0 ? heldKeys.values().next().value : null;
      activeSegmentStartMs = activeKey === null ? null : 0;
      setState(AppState.RECORDING, "Recording");
      window.setTimeout(finishRecording, measureDurationMs);
    }

    async function beginCountIn() {
      if (!currentMeasure) {
        setState(AppState.IDLE, "Select at least one note group before recording.");
        return;
      }

      const bpm = getBpm();
      recordingBpm = bpm;
      const beatMs = 60000 / bpm;
      measureDurationMs = 4 * beatMs;
      activeSegmentStartMs = null;
      activeKey = null;
      recordedSegments = [];
      heldKeys.clear();
      hideComparisonTimeline();
      setState(AppState.COUNTING_IN, "Counting in...");

      window.pywebview.api.reset();
      const scheduledStartDelayMs = await window.pywebview.api.schedule_count_in(
        bpm,
        metronomeCheckbox.checked
      );
      const countInStartedAt = performance.now() + scheduledStartDelayMs;

      for (let beat = 0; beat < 4; beat += 1) {
        window.setTimeout(() => {
          if (appState === AppState.COUNTING_IN) {
            status.textContent = `Counting in: ${beat + 1}`;
          }
        }, Math.max(0, countInStartedAt + beat * beatMs - performance.now()));
      }

      window.setTimeout(() => {
        if (appState === AppState.COUNTING_IN) {
          beginRecording();
        }
      }, Math.max(0, countInStartedAt + measureDurationMs - performance.now()));
    }

    function handleRecordingInputDown(key) {
      if (heldKeys.has(key)) {
        return;
      }

      const nowMs = performance.now();
      const replacingActiveKey = activeKey !== null;
      heldKeys.add(key);
      if (replacingActiveKey) {
        closeActiveSegment(nowMs);
      }

      activeKey = key;
      activeSegmentStartMs = Math.max(0, nowMs - recordingStartMs);
      if (replacingActiveKey) {
        window.pywebview.api.retrigger_key("merged");
      } else {
        window.pywebview.api.press_key("merged");
      }
    }

    function handleRecordingInputUp(key) {
      if (!heldKeys.has(key)) {
        return;
      }

      heldKeys.delete(key);
      if (activeKey !== key) {
        return;
      }

      activeKey = null;
      closeActiveSegment(performance.now());
      window.pywebview.api.release_key("merged");
    }

    function handleCountInInputDown(key) {
      if (heldKeys.has(key)) {
        return;
      }

      heldKeys.add(key);
      if (heldKeys.size === 1) {
        activeKey = key;
        window.pywebview.api.press_key("merged");
      }
    }

    function handleCountInInputUp(key) {
      if (!heldKeys.has(key)) {
        return;
      }

      heldKeys.delete(key);
      if (activeKey === key) {
        activeKey = null;
        window.pywebview.api.release_key("merged");
      }
    }

    async function selectMidiInput() {
      const selectedOption = midiInput.selectedOptions[0];
      const result = await window.pywebview.api.select_midi_input(midiInput.value);
      if (!result.ok) {
        showError(result.error);
        preferredMidiInputName = "";
        midiInput.value = "";
        return;
      }

      preferredMidiInputName = selectedOption ? selectedOption.dataset.name || "" : "";
      saveSettings();
    }

    async function waitForPywebviewApi() {
      if (window.pywebview && window.pywebview.api) {
        return;
      }

      await new Promise((resolve) => {
        window.addEventListener("pywebviewready", resolve, { once: true });
      });
    }

    async function refreshMidiInputs() {
      const devices = await window.pywebview.api.list_midi_inputs();
      const previousName =
        midiInput.selectedOptions[0]?.dataset.name || preferredMidiInputName;
      midiInput.replaceChildren();

      const noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.textContent = "Computer keyboard";
      noneOption.dataset.name = "";
      midiInput.appendChild(noneOption);

      devices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.id;
        option.textContent = device.name;
        option.dataset.name = device.name;
        midiInput.appendChild(option);
      });

      const matchingOption = previousName
        ? Array.from(midiInput.options).find(
            (option) => option.dataset.name === previousName
          )
        : null;
      midiInput.value = matchingOption
        ? matchingOption.value
        : devices[0]?.id || "";
      await selectMidiInput();
    }

    async function selectAudioOutput() {
      const selectedOption = audioOutput.selectedOptions[0];
      const result = await window.pywebview.api.select_audio_output(
        audioOutput.value
      );
      if (!result.ok) {
        showError(result.error);
        audioOutput.value = activeAudioOutputId;
        return;
      }

      activeAudioOutputId = audioOutput.value;
      preferredAudioOutputName =
        selectedOption ? selectedOption.dataset.name || "" : "";
      saveSettings();
    }

    async function refreshAudioOutputs() {
      const outputInfo = await window.pywebview.api.list_audio_outputs();
      const devices = outputInfo.devices;
      audioOutput.replaceChildren();

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = outputInfo.defaultName
        ? `System default (${outputInfo.defaultName})`
        : "System default";
      defaultOption.dataset.name = "";
      audioOutput.appendChild(defaultOption);

      devices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.id;
        option.textContent = device.name;
        option.dataset.name = device.name;
        audioOutput.appendChild(option);
      });

      const matchingOption = preferredAudioOutputName
        ? Array.from(audioOutput.options).find(
            (option) => option.dataset.name === preferredAudioOutputName
          )
        : null;
      const initialOption =
        matchingOption ||
        Array.from(audioOutput.options).find(
          (option) => option.value === outputInfo.selectedId
        );
      audioOutput.value = initialOption ? initialOption.value : "";
      await selectAudioOutput();
    }

    async function pollMidiEvents() {
      if (midiPollInFlight) {
        return;
      }

      midiPollInFlight = true;
      try {
        const events = await window.pywebview.api.drain_midi_events();
        events.forEach((event) => {
          if (appState === AppState.COUNTING_IN) {
            if (event.type === "down") {
              handleCountInInputDown(event.key);
            } else {
              handleCountInInputUp(event.key);
            }
          } else if (appState === AppState.RECORDING) {
            if (event.type === "down") {
              handleRecordingInputDown(event.key);
            } else {
              handleRecordingInputUp(event.key);
            }
          }
        });
      } catch (error) {
        window.clearInterval(midiPollTimer);
        showError(`MIDI input stopped: ${error}`);
      } finally {
        midiPollInFlight = false;
      }
    }

    await waitForPywebviewApi();
    await restoreSettings();
    renderSettings();
    renderRandomMeasure();
    hideComparisonTimeline();
    setState(AppState.IDLE, "Idle. Press Enter for a one-bar count-in.");

    function startNewMeasure() {
      renderRandomMeasure();
      hideComparisonTimeline();
      setState(AppState.IDLE, "Idle. Press Enter for a one-bar count-in.");
    }

    randomizeButton.addEventListener("click", startNewMeasure);
    playExpectedButton.addEventListener("click", playExpectedPattern);

    bpmInput.addEventListener("change", () => {
      getBpm();
      saveSettings();
    });
    metronomeCheckbox.addEventListener("change", saveSettings);
    midiInput.addEventListener("change", selectMidiInput);
    audioOutput.addEventListener("change", selectAudioOutput);
    await refreshAudioOutputs();
    await refreshMidiInputs();
    const midiPollTimer = window.setInterval(pollMidiEvents, 5);

    function isInteractiveTarget(target) {
      return Boolean(
        target &&
        typeof target.closest === "function" &&
        target.closest("input, button, summary, label")
      );
    }

    window.addEventListener("keydown", (event) => {
      if (appState === AppState.IDLE || appState === AppState.DONE) {
        if (
          event.key === "Enter" &&
          !event.repeat &&
          !isInteractiveTarget(event.target)
        ) {
          event.preventDefault();
          beginCountIn();
        } else if (
          event.key === "ArrowRight" &&
          !event.repeat &&
          !isInteractiveTarget(event.target)
        ) {
          event.preventDefault();
          startNewMeasure();
        } else if (!isInteractiveTarget(event.target)) {
          event.preventDefault();
        }
        return;
      }

      event.preventDefault();
      if (appState === AppState.COUNTING_IN) {
        if (midiInput.value === "" && event.code === "Space" && !event.repeat) {
          handleCountInInputDown(event.code);
        }
      } else if (appState === AppState.RECORDING) {
        if (midiInput.value === "" && !event.repeat) {
          handleRecordingInputDown(event.code);
        }
      }
    });

    window.addEventListener("keyup", (event) => {
      if (
        appState === AppState.COUNTING_IN ||
        appState === AppState.RECORDING ||
        !isInteractiveTarget(event.target)
      ) {
        event.preventDefault();
      }

      if (appState === AppState.COUNTING_IN) {
        if (midiInput.value === "" && event.code === "Space") {
          handleCountInInputUp(event.code);
        }
      } else if (appState === AppState.RECORDING) {
        if (midiInput.value === "") {
          handleRecordingInputUp(event.code);
        }
      }
    });
  } catch (error) {
    showError(error && error.stack ? error.stack : String(error));
  }
})();
