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

(async function boot() {
  try {
    await loadVexFlow();

    const VF = Vex.Flow && Vex.Flow.Renderer ? Vex.Flow : Vex;
    const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline } = VF;

    const TIME_SIGNATURE = { type: "4/4", beatsPerMeasure: 4 };
    const noteIconSrcCache = new Map();

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
        categoryType: "sixteenthVocabulary",
        type: "sser",
        label: "Two sixteenths and an eighth rest",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.S), c(NoteType.E, true)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 10,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "sesr",
        label: "Sixteenth, eighth, sixteenth rest",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.E), c(NoteType.S, true)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 11,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "sres",
        label: "Sixteenth rest, eighth, sixteenth",
        duration: 1,
        notes: [c(NoteType.S, true), c(NoteType.E), c(NoteType.S)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 12,
      },
      {
        categoryType: "sixteenthVocabulary",
        type: "sers",
        label: "Sixteenth, eighth rest, sixteenth",
        duration: 1,
        notes: [c(NoteType.S), c(NoteType.E, true), c(NoteType.S)],
        beam: true,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 13,
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
        categoryType: "tuplets",
        type: "shuffle8",
        label: "Eighth-note shuffle",
        duration: 1,
        notes: [c(NoteType.E), c(NoteType.E, true), c(NoteType.E)],
        beam: true,
        tuplet: true,
        tupletGroupSize: 3,
        weight: 3,
        defaultSelectionValue: false,
        sortOrder: 2,
      },
      {
        categoryType: "tuplets",
        type: "shuffle16",
        label: "Sixteenth-note shuffle",
        duration: 1,
        notes: [
          c(NoteType.S),
          c(NoteType.S, true),
          c(NoteType.S),
          c(NoteType.S),
          c(NoteType.S, true),
          c(NoteType.S),
        ],
        beam: true,
        tuplet: true,
        tupletGroupSize: 3,
        weight: 2,
        defaultSelectionValue: false,
        sortOrder: 3,
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
          "sser", "sesr", "sres", "sers",
        ],
      },
      {
        id: "offbeats",
        label: "Offbeats and syncopation",
        description: "Rests, displaced attacks, and longer offbeat figures.",
        noteGroupTypes: [
          "eer", "ere", "qde", "eqd", "eqe",
          "srse", "ssre", "esrs", "erss",
          "sser", "sesr", "sres", "sers",
          "eqqe", "eqqqe",
        ],
      },
      {
        id: "tuplets",
        label: "Tuplets",
        description: "Triplet subdivision supported by simple bar fillers.",
        noteGroupTypes: ["q", "h", "teee", "tqqq", "shuffle8", "shuffle16"],
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
    let notationSelectionLayout = null;
    let selectionDragAnchorIndex = null;
    let selectedGroupRange = null;
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
        tupletGroupSize: noteGroup.tupletGroupSize ?? null,
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

    function createNoteGroupNotation(noteGroup) {
      const notes = noteGroup.notes.map(createStaveNote);
      const groupSize = noteGroup.tupletGroupSize || notes.length;
      const notationGroups = [];
      for (let index = 0; index < notes.length; index += groupSize) {
        notationGroups.push({
          notes: notes.slice(index, index + groupSize),
          sourceNotes: noteGroup.notes.slice(index, index + groupSize),
        });
      }

      const beams = noteGroup.beam
        ? notationGroups.flatMap((group) => {
            const soundingNotes = group.notes.filter(
              (_staveNote, index) => !group.sourceNotes[index].rest
            );
            return soundingNotes.length > 1
              ? [new Beam(soundingNotes, false)]
              : [];
          })
        : [];
      const tuplets = noteGroup.tuplet
        ? notationGroups.map((group) => new VF.Tuplet(group.notes))
        : [];

      return { notes, beams, tuplets };
    }

    function renderNoteIconSrc(noteGroup) {
      const width = Math.max(110, 50 + noteGroup.notes.length * 42);
      const height = 130;
      const target = document.createElement("div");
      target.style.cssText =
        "position:fixed;left:-10000px;top:0;visibility:hidden";
      document.body.appendChild(target);
      const renderer = new Renderer(target, Renderer.Backends.SVG);
      renderer.resize(width, height);

      const context = renderer.getContext();
      const stave = new Stave(8, 16, width - 16);
      for (let line = 0; line < 5; line += 1) {
        stave.setConfigForLine(line, { visible: false });
      }
      stave.setBegBarType(Barline.type.NONE);
      stave.setEndBarType(Barline.type.NONE);

      const { notes, beams, tuplets } = createNoteGroupNotation(noteGroup);
      const voice = new Voice({
        num_beats: getDuration(noteGroup, TIME_SIGNATURE.beatsPerMeasure),
        beat_value: 4,
      })
        .setMode(Voice.Mode.SOFT)
        .addTickables(notes);

      new Formatter({ softmaxFactor: 10 })
        .joinVoices([voice])
        .formatToStave([voice], stave);

      voice.setStave(stave).draw(context, stave);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());

      const svg = target.querySelector("svg");
      if (!svg) {
        throw new Error(`VexFlow did not render an icon for ${noteGroup.type}.`);
      }
      const bounds = svg.getBBox();
      const padding = 8;
      svg.setAttribute(
        "viewBox",
        [
          bounds.x - padding,
          bounds.y - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2,
        ].join(" ")
      );
      svg.setAttribute("width", String(bounds.width + padding * 2));
      svg.setAttribute("height", String(bounds.height + padding * 2));
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const source = `data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`;
      target.remove();
      return source;
    }

    function getNoteIconSrc(noteGroup) {
      if (!noteIconSrcCache.has(noteGroup.type)) {
        noteIconSrcCache.set(noteGroup.type, renderNoteIconSrc(noteGroup));
      }
      return noteIconSrcCache.get(noteGroup.type);
    }

    function renderRandomMeasure() {
      const target = document.getElementById("notation");
      target.replaceChildren();
      notationSelectionLayout = null;
      selectionDragAnchorIndex = null;
      selectedGroupRange = null;

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
        const notation = createNoteGroupNotation(noteGroup);
        beams.push(...notation.beams);
        tuplets.push(...notation.tuplets);
        return notation.notes;
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

      const svg = target.querySelector("svg");
      if (svg) {
        const scoreStartX = stave.getNoteStartX();
        const scoreEndX = stave.getX() + stave.getWidth() - 10;
        const groupBeatBoundaries = [0];
        measure.noteGroups.forEach((noteGroup) => {
          groupBeatBoundaries.push(
            groupBeatBoundaries[groupBeatBoundaries.length - 1] +
              noteGroup.duration
          );
        });
        notationSelectionLayout = {
          svg,
          scoreStartX,
          scoreEndX,
          groupBeatBoundaries,
        };
      }
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
          const option = document.createElement("div");
          option.className = "note-option";

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

          const iconButton = document.createElement("button");
          iconButton.type = "button";
          iconButton.className = "note-icon-button";
          iconButton.setAttribute(
            "aria-label",
            `Preview ${noteGroup.label.toLowerCase()}`
          );
          iconButton.title = `Preview ${noteGroup.label}`;
          iconButton.addEventListener("click", () => openNotePreview(noteGroup));

          const icon = document.createElement("img");
          icon.className = `note-icon note-icon--${noteGroup.type}`;
          icon.src = getNoteIconSrc(noteGroup);
          icon.alt = "";
          iconButton.appendChild(icon);

          option.append(label, iconButton);
          options.appendChild(option);
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
    const notePreviewDialog = document.getElementById("note-preview-dialog");
    const notePreviewTitle = document.getElementById("note-preview-title");
    const notePreviewImage = document.getElementById("note-preview-image");
    const notePreviewTiming = document.getElementById("note-preview-timing");
    const notePreviewGridLabels = document.getElementById(
      "note-preview-grid-labels"
    );
    const notePreviewTrack = document.getElementById("note-preview-track");
    const notePreviewPlaybackControls = document.getElementById(
      "note-preview-playback-controls"
    );
    const notePreviewBpmInput = document.getElementById("note-preview-bpm");
    const playNotePreviewButton = document.getElementById("play-note-preview");
    const closeNotePreviewButton = document.getElementById("close-note-preview");
    const notation = document.getElementById("notation");
    const selectionPreviewDialog = document.getElementById(
      "selection-preview-dialog"
    );
    const selectionPreviewTitle = document.getElementById(
      "selection-preview-title"
    );
    const selectionPreviewNotation = document.getElementById(
      "selection-preview-notation"
    );
    const selectionPreviewTiming = document.getElementById(
      "selection-preview-timing"
    );
    const selectionPreviewGridLabels = document.getElementById(
      "selection-preview-grid-labels"
    );
    const selectionPreviewTrack = document.getElementById(
      "selection-preview-track"
    );
    const selectionPreviewBpmInput = document.getElementById(
      "selection-preview-bpm"
    );
    const playSelectionPreviewButton = document.getElementById(
      "play-selection-preview"
    );
    const closeSelectionPreviewButton = document.getElementById(
      "close-selection-preview"
    );
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
    let notePreviewIsPlaying = false;
    let previewedNoteGroup = null;
    let selectionPreviewIsPlaying = false;
    let selectionPreviewTimer = null;
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
      notation.classList.toggle(
        "is-selection-disabled",
        nextState !== AppState.IDLE && nextState !== AppState.DONE
      );
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

    function getNotePreviewBpm() {
      const parsed = Number.parseInt(notePreviewBpmInput.value, 10);
      if (Number.isNaN(parsed)) {
        notePreviewBpmInput.value = "50";
        return 50;
      }

      const clamped = Math.min(300, Math.max(40, parsed));
      notePreviewBpmInput.value = String(clamped);
      return clamped;
    }

    function getNoteGroupPreviewSegments(noteGroup, bpm = getNotePreviewBpm()) {
      const quarterNoteMs = 60000 / bpm;
      let elapsedMs = 0;
      const segments = [];

      noteGroup.notes.forEach((note) => {
        const durationMs = getPlaybackPatternDurationMs(
          note,
          noteGroup,
          quarterNoteMs
        );
        if (!note.rest) {
          segments.push({ startMs: elapsedMs, durationMs });
        }
        elapsedMs += durationMs;
      });

      return { segments, durationMs: elapsedMs };
    }

    function renderNoteGroupPreviewTiming(noteGroup) {
      const durationBeats = getDuration(
        noteGroup,
        TIME_SIGNATURE.beatsPerMeasure
      );
      const subdivisionCount = durationBeats * 4;
      const { segments, durationMs } = getNoteGroupPreviewSegments(noteGroup);

      notePreviewGridLabels.replaceChildren();
      notePreviewTrack.replaceChildren();
      notePreviewGridLabels.style.gridTemplateColumns =
        `repeat(${subdivisionCount}, minmax(0, 1fr))`;
      notePreviewTiming.setAttribute(
        "aria-label",
        `${noteGroup.label} timing over ${durationBeats} ${
          durationBeats === 1 ? "beat" : "beats"
        }`
      );

      const subdivisionLabels = ["1", "e", "&", "a"];
      for (let index = 0; index < subdivisionCount; index += 1) {
        const subdivision = index % 4;
        const label = document.createElement("div");
        label.className = "note-preview-grid-label";
        if (subdivision === 0) {
          label.classList.add("is-beat");
          label.textContent = String(Math.floor(index / 4) + 1);
        } else {
          label.textContent = subdivisionLabels[subdivision];
        }
        notePreviewGridLabels.appendChild(label);

        if (index > 0) {
          const line = document.createElement("span");
          line.className = "note-preview-grid-line";
          if (subdivision === 0) {
            line.classList.add("is-beat");
          }
          line.style.left = `${(index / subdivisionCount) * 100}%`;
          notePreviewTrack.appendChild(line);
        }
      }

      segments.forEach((segment) => {
        const eventBar = document.createElement("span");
        eventBar.className = "note-preview-event";
        eventBar.style.left = `${(segment.startMs / durationMs) * 100}%`;
        eventBar.style.width = `${(segment.durationMs / durationMs) * 100}%`;
        notePreviewTrack.appendChild(eventBar);
      });

      if (segments.length === 0) {
        const restLabel = document.createElement("span");
        restLabel.className = "note-preview-rest-label";
        restLabel.textContent = "Rest";
        notePreviewTrack.appendChild(restLabel);
      }
    }

    function stopNoteGroupPreview() {
      window.pywebview.api.reset();
      notePreviewIsPlaying = false;
      notePreviewBpmInput.disabled = false;
      playNotePreviewButton.disabled = false;
      playNotePreviewButton.classList.remove("is-playing");
      playNotePreviewButton.textContent = "▶ Loop with metronome";
    }

    async function toggleNoteGroupPreview() {
      if (notePreviewIsPlaying) {
        stopNoteGroupPreview();
        return;
      }

      if (
        !previewedNoteGroup ||
        getDuration(previewedNoteGroup, TIME_SIGNATURE.beatsPerMeasure) !== 1 ||
        (appState !== AppState.IDLE && appState !== AppState.DONE)
      ) {
        return;
      }

      const noteGroup = previewedNoteGroup;
      const bpm = getNotePreviewBpm();
      const { segments } = getNoteGroupPreviewSegments(noteGroup, bpm);
      playNotePreviewButton.disabled = true;
      notePreviewBpmInput.disabled = true;

      try {
        window.pywebview.api.reset();
        await window.pywebview.api.schedule_preview_loop(segments, bpm);
        if (!notePreviewDialog.open || previewedNoteGroup !== noteGroup) {
          stopNoteGroupPreview();
          return;
        }
        notePreviewIsPlaying = true;
        playNotePreviewButton.disabled = false;
        playNotePreviewButton.classList.add("is-playing");
        playNotePreviewButton.textContent = "■ Stop";
      } catch (error) {
        stopNoteGroupPreview();
        showError(error);
      }
    }

    function openNotePreview(noteGroup) {
      previewedNoteGroup = noteGroup;
      notePreviewTitle.textContent = noteGroup.label;
      notePreviewImage.src = getNoteIconSrc(noteGroup);
      notePreviewImage.alt = `${noteGroup.label} rhythm notation`;
      renderNoteGroupPreviewTiming(noteGroup);

      const isOneBeat =
        getDuration(noteGroup, TIME_SIGNATURE.beatsPerMeasure) === 1;
      notePreviewPlaybackControls.hidden = !isOneBeat;

      notePreviewDialog.showModal();
    }

    function closeNotePreview() {
      if (notePreviewDialog.open) {
        notePreviewDialog.close();
      }
    }

    function getSelectionPreviewBpm() {
      const parsed = Number.parseInt(selectionPreviewBpmInput.value, 10);
      if (Number.isNaN(parsed)) {
        selectionPreviewBpmInput.value = String(getBpm());
        return getBpm();
      }

      const clamped = Math.min(300, Math.max(40, parsed));
      selectionPreviewBpmInput.value = String(clamped);
      return clamped;
    }

    function getSelectedGroups() {
      if (!currentMeasure || !selectedGroupRange) {
        return [];
      }
      return currentMeasure.noteGroups.slice(
        selectedGroupRange.startIndex,
        selectedGroupRange.endIndex + 1
      );
    }

    function getSelectedDurationBeats() {
      return getSelectedGroups().reduce(
        (total, noteGroup) => total + noteGroup.duration,
        0
      );
    }

    function renderSelectionPreviewNotation() {
      selectionPreviewNotation.replaceChildren();
      const selectedGroups = getSelectedGroups();
      const durationBeats = getSelectedDurationBeats();
      if (selectedGroups.length === 0 || durationBeats <= 0) {
        return;
      }

      const width = 390;
      const height = 160;
      const renderer = new Renderer(
        selectionPreviewNotation,
        Renderer.Backends.SVG
      );
      renderer.resize(width, height);

      const context = renderer.getContext();
      const stave = new Stave(10, 20, width - 20);
      for (let line = 0; line < 5; line += 1) {
        stave.setConfigForLine(line, { visible: false });
      }
      stave.setBegBarType(Barline.type.NONE);
      stave.setEndBarType(Barline.type.NONE);

      const beams = [];
      const tuplets = [];
      const staveNotes = selectedGroups.flatMap((noteGroup) => {
        const notationGroup = createNoteGroupNotation(noteGroup);
        beams.push(...notationGroup.beams);
        tuplets.push(...notationGroup.tuplets);
        return notationGroup.notes;
      });
      const voice = new Voice({
        num_beats: durationBeats,
        beat_value: 4,
      })
        .setMode(Voice.Mode.SOFT)
        .addTickables(staveNotes);

      new Formatter({ softmaxFactor: 10 })
        .joinVoices([voice])
        .formatToStave([voice], stave);
      voice.setStave(stave).draw(context, stave);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
    }

    function renderSelectionPreviewTiming() {
      selectionPreviewGridLabels.replaceChildren();
      selectionPreviewTrack.replaceChildren();
      const selectedGroups = getSelectedGroups();
      const durationBeats = getSelectedDurationBeats();
      if (
        selectedGroups.length === 0 ||
        durationBeats <= 0 ||
        !selectedGroupRange ||
        !notationSelectionLayout
      ) {
        return;
      }

      const subdivisionCount = durationBeats * 4;
      const selectionStartBeat =
        notationSelectionLayout.groupBeatBoundaries[
          selectedGroupRange.startIndex
        ];
      selectionPreviewGridLabels.style.gridTemplateColumns =
        `repeat(${subdivisionCount}, minmax(0, 1fr))`;
      selectionPreviewTiming.setAttribute(
        "aria-label",
        `${getSelectedBeatRangeLabel()} timing grid`
      );

      const subdivisionLabels = ["", "e", "&", "a"];
      for (let index = 0; index < subdivisionCount; index += 1) {
        const subdivision = index % 4;
        const label = document.createElement("div");
        label.className = "note-preview-grid-label";
        if (subdivision === 0) {
          label.classList.add("is-beat");
          label.textContent = String(
            selectionStartBeat + Math.floor(index / 4) + 1
          );
        } else {
          label.textContent = subdivisionLabels[subdivision];
        }
        selectionPreviewGridLabels.appendChild(label);

        if (index > 0) {
          const line = document.createElement("span");
          line.className = "note-preview-grid-line";
          if (subdivision === 0) {
            line.classList.add("is-beat");
          }
          line.style.left = `${(index / subdivisionCount) * 100}%`;
          selectionPreviewTrack.appendChild(line);
        }
      }

      const sourceEvents = getExpectedSourceEvents({
        noteGroups: selectedGroups,
      });
      sourceEvents.forEach((event) => {
        const eventBar = document.createElement("span");
        eventBar.className = "note-preview-event";
        eventBar.style.left = `${(event.startBeats / durationBeats) * 100}%`;
        eventBar.style.width = `${(event.durationBeats / durationBeats) * 100}%`;
        selectionPreviewTrack.appendChild(eventBar);
      });

      if (sourceEvents.length === 0) {
        const restLabel = document.createElement("span");
        restLabel.className = "note-preview-rest-label";
        restLabel.textContent = "Rest";
        selectionPreviewTrack.appendChild(restLabel);
      }
    }

    function getSelectedBeatRangeLabel() {
      if (!selectedGroupRange || !notationSelectionLayout) {
        return "Selected rhythm";
      }
      const boundaries = notationSelectionLayout.groupBeatBoundaries;
      const firstBeat = boundaries[selectedGroupRange.startIndex] + 1;
      const lastBeat = boundaries[selectedGroupRange.endIndex + 1];
      return firstBeat === lastBeat
        ? `Beat ${firstBeat}`
        : `Beats ${firstBeat}–${lastBeat}`;
    }

    function stopSelectionPreview() {
      window.clearTimeout(selectionPreviewTimer);
      selectionPreviewTimer = null;
      if (selectionPreviewIsPlaying) {
        window.pywebview.api.reset();
      }
      selectionPreviewIsPlaying = false;
      selectionPreviewBpmInput.disabled = false;
      playSelectionPreviewButton.disabled = false;
      playSelectionPreviewButton.classList.remove("is-playing");
      playSelectionPreviewButton.textContent = "▶ Play with metronome";
    }

    async function toggleSelectionPreview() {
      if (selectionPreviewIsPlaying) {
        stopSelectionPreview();
        return;
      }

      const selectedGroups = getSelectedGroups();
      const durationBeats = getSelectedDurationBeats();
      if (
        selectedGroups.length === 0 ||
        durationBeats <= 0 ||
        !selectionPreviewDialog.open
      ) {
        return;
      }

      const bpm = getSelectionPreviewBpm();
      const quarterNoteMs = 60000 / bpm;
      const segments = getExpectedSourceEvents({
        noteGroups: selectedGroups,
      }).map((event) => ({
        startMs: event.startBeats * quarterNoteMs,
        durationMs: event.durationBeats * quarterNoteMs,
      }));
      const playbackDurationMs = durationBeats * quarterNoteMs;
      selectionPreviewBpmInput.disabled = true;
      playSelectionPreviewButton.disabled = true;

      try {
        window.pywebview.api.reset();
        const scheduledStartDelayMs =
          await window.pywebview.api.schedule_selection_pattern(
            segments,
            bpm,
            durationBeats
          );
        if (!selectionPreviewDialog.open) {
          window.pywebview.api.reset();
          stopSelectionPreview();
          return;
        }
        selectionPreviewIsPlaying = true;
        playSelectionPreviewButton.disabled = false;
        playSelectionPreviewButton.classList.add("is-playing");
        playSelectionPreviewButton.textContent = "■ Stop";
        selectionPreviewTimer = window.setTimeout(
          stopSelectionPreview,
          scheduledStartDelayMs + playbackDurationMs
        );
      } catch (error) {
        stopSelectionPreview();
        showError(error);
      }
    }

    function openSelectionPreview() {
      if (!selectedGroupRange || selectionPreviewDialog.open) {
        return;
      }
      selectionPreviewTitle.textContent = getSelectedBeatRangeLabel();
      selectionPreviewBpmInput.value = String(getBpm());
      renderSelectionPreviewNotation();
      renderSelectionPreviewTiming();
      selectionPreviewDialog.showModal();
    }

    function clearNotationSelection() {
      notation.querySelector(".notation-selection")?.remove();
      selectionDragAnchorIndex = null;
      selectedGroupRange = null;
    }

    function closeSelectionPreview() {
      if (selectionPreviewDialog.open) {
        selectionPreviewDialog.close();
      }
    }

    function getScoreXFromPointer(event) {
      if (!notationSelectionLayout) {
        return 0;
      }
      const svgRect = notationSelectionLayout.svg.getBoundingClientRect();
      const svgWidth = Number.parseFloat(
        notationSelectionLayout.svg.getAttribute("width")
      );
      return ((event.clientX - svgRect.left) / svgRect.width) * svgWidth;
    }

    function getGroupIndexAtScoreX(scoreX) {
      if (!currentMeasure || !notationSelectionLayout) {
        return null;
      }
      const { scoreStartX, scoreEndX, groupBeatBoundaries } =
        notationSelectionLayout;
      const clampedX = Math.max(scoreStartX, Math.min(scoreX, scoreEndX));
      const beatPosition =
        ((clampedX - scoreStartX) / (scoreEndX - scoreStartX)) *
        TIME_SIGNATURE.beatsPerMeasure;
      for (let index = 1; index < groupBeatBoundaries.length; index += 1) {
        if (beatPosition < groupBeatBoundaries[index]) {
          return index - 1;
        }
      }
      return currentMeasure.noteGroups.length - 1;
    }

    function updateNotationSelection(anchorIndex, pointerIndex) {
      if (!notationSelectionLayout) {
        return;
      }
      const startIndex = Math.min(anchorIndex, pointerIndex);
      const endIndex = Math.max(anchorIndex, pointerIndex);
      selectedGroupRange = { startIndex, endIndex };

      let overlay = notation.querySelector(".notation-selection");
      if (!overlay) {
        overlay = document.createElement("span");
        overlay.className = "notation-selection";
        notation.appendChild(overlay);
      }

      const { svg, scoreStartX, scoreEndX, groupBeatBoundaries } =
        notationSelectionLayout;
      const notationRect = notation.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const svgWidth = Number.parseFloat(svg.getAttribute("width"));
      const scaleX = svgRect.width / svgWidth;
      const selectionStartBeat = groupBeatBoundaries[startIndex];
      const selectionEndBeat = groupBeatBoundaries[endIndex + 1];
      const selectionStartX =
        scoreStartX +
        (selectionStartBeat / TIME_SIGNATURE.beatsPerMeasure) *
          (scoreEndX - scoreStartX);
      const selectionEndX =
        scoreStartX +
        (selectionEndBeat / TIME_SIGNATURE.beatsPerMeasure) *
          (scoreEndX - scoreStartX);
      overlay.style.left = `${
        svgRect.left - notationRect.left + selectionStartX * scaleX
      }px`;
      overlay.style.width = `${(selectionEndX - selectionStartX) * scaleX}px`;
      overlay.style.top = `${svgRect.top - notationRect.top + 35}px`;
      overlay.style.height = `${Math.min(105, svgRect.height - 45)}px`;
    }

    function beginNotationSelection(event) {
      if (
        event.button !== 0 ||
        !currentMeasure ||
        !notationSelectionLayout ||
        (appState !== AppState.IDLE && appState !== AppState.DONE) ||
        notePreviewDialog.open ||
        selectionPreviewDialog.open
      ) {
        return;
      }
      const groupIndex = getGroupIndexAtScoreX(getScoreXFromPointer(event));
      if (groupIndex === null) {
        return;
      }
      event.preventDefault();
      notation.setPointerCapture(event.pointerId);
      selectionDragAnchorIndex = groupIndex;
      updateNotationSelection(groupIndex, groupIndex);
    }

    function continueNotationSelection(event) {
      if (selectionDragAnchorIndex === null) {
        return;
      }
      const groupIndex = getGroupIndexAtScoreX(getScoreXFromPointer(event));
      if (groupIndex !== null) {
        updateNotationSelection(selectionDragAnchorIndex, groupIndex);
      }
    }

    function finishNotationSelection(event) {
      if (selectionDragAnchorIndex === null) {
        return;
      }
      continueNotationSelection(event);
      if (notation.hasPointerCapture(event.pointerId)) {
        notation.releasePointerCapture(event.pointerId);
      }
      selectionDragAnchorIndex = null;
      openSelectionPreview();
    }

    function cancelNotationSelection(event) {
      if (selectionDragAnchorIndex === null) {
        return;
      }
      if (notation.hasPointerCapture(event.pointerId)) {
        notation.releasePointerCapture(event.pointerId);
      }
      clearNotationSelection();
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
    playNotePreviewButton.addEventListener("click", toggleNoteGroupPreview);
    closeNotePreviewButton.addEventListener("click", closeNotePreview);
    notation.addEventListener("pointerdown", beginNotationSelection);
    notation.addEventListener("pointermove", continueNotationSelection);
    notation.addEventListener("pointerup", finishNotationSelection);
    notation.addEventListener("pointercancel", cancelNotationSelection);
    playSelectionPreviewButton.addEventListener(
      "click",
      toggleSelectionPreview
    );
    closeSelectionPreviewButton.addEventListener(
      "click",
      closeSelectionPreview
    );
    notePreviewDialog.addEventListener("click", (event) => {
      if (event.target === notePreviewDialog) {
        closeNotePreview();
      }
    });
    notePreviewDialog.addEventListener("close", () => {
      previewedNoteGroup = null;
      stopNoteGroupPreview();
    });
    selectionPreviewDialog.addEventListener("click", (event) => {
      if (event.target === selectionPreviewDialog) {
        closeSelectionPreview();
      }
    });
    selectionPreviewDialog.addEventListener("close", () => {
      stopSelectionPreview();
      clearNotationSelection();
      selectionPreviewNotation.replaceChildren();
      selectionPreviewGridLabels.replaceChildren();
      selectionPreviewTrack.replaceChildren();
    });

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
      if (event.key === "Escape") {
        if (notePreviewDialog.open) {
          event.preventDefault();
          closeNotePreview();
          return;
        }
        if (selectionPreviewDialog.open) {
          event.preventDefault();
          closeSelectionPreview();
          return;
        }
      }

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
