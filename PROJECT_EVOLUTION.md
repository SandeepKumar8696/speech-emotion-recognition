# Project Evolution — Speech Emotion Recognition

*This document is for anyone picking up this project after the fact — the original author
coming back to it, a new contributor, or an interviewer trying to understand the work. It
does not describe what the system is (see [FUNCTIONAL_SYNOPSIS.md](FUNCTIONAL_SYNOPSIS.md))
or how it's built (see [ARCHITECTURE.md](ARCHITECTURE.md)). It describes how the project got
from its original state to its current one, in order, and why each change happened —
grounded in the actual git history, not a reconstructed narrative.*

## Then vs. now

| | Original state | Current state |
|---|---|---|
| Could a stranger run it? | No — hardcoded personal file paths (`C:/Users/sandeep kumar/Downloads/...`) crashed on any other machine | Yes — paths resolve relative to the script |
| Dev server stability | Flask's debug reloader silently left orphaned processes holding the port after restarts | Reloader disabled; single clean process per run |
| Frontend code | One HTML file with everything inlined (~170 lines of mixed markup/CSS/JS) | Markup, styling, and behavior in separate files (`templates/`, `static/css/`, `static/js/`) |
| Audio format support | WAV only, and only as an unenforced client-side hint | WAV/MP3/OGG/FLAC, validated server-side, with clean error handling on decode failure |
| Input methods | File upload only | File upload **or** live microphone recording |
| Audio review before predicting | None — upload and hope | Interactive waveform player: playback, click-to-seek, and progress visualized on the clip's own amplitude shape |
| Documentation | A single marketing-style README | README + `ARCHITECTURE.md` (technical) + `FUNCTIONAL_SYNOPSIS.md` (functional) + this document |
| Dependency management | No `requirements.txt` despite the README referencing one | Pinned `requirements.txt`, isolated `venv`, `.gitignore` |
| Version control hygiene | Direct commits to `main`, no branch isolation | Feature branch (`local-setup-and-fixes`) off `main`, real commit messages explaining *why* |

## Phase-by-phase history

### Phase 0 — Inherited state
*(commits `7462cc8` → `96a195f`, 2026-07-16)*

The project as originally built: four Colab notebooks (`prepare_data.py`, `training.py`,
`evaluate_model.py` — saved with `.py` extensions but actually notebook JSON), a trained
model (`best_model.h5`, `label_encoder.pkl`), and a Flask demo (`app.py` +
`templates/index.html`). It worked, but only on the original author's machine — the model and
label-encoder paths were hardcoded to a personal `Downloads` folder, there was no
`requirements.txt`, and the entire frontend was one HTML file with inline CSS and JS.

### Phase 1 — Local environment setup & critical bug fixes
*(commit `07286ab`, 2026-07-31)*

Before anything else could be improved, the project had to actually run. This phase:
- Created an isolated `venv` and a real `requirements.txt` (previously undocumented)
- Fixed the hardcoded `MODEL_PATH`/`LABEL_ENCODER_PATH` to resolve relative to the script's
  own location — the single change that made the project runnable on any machine, not just
  the original author's
- Disabled Flask's debug auto-reloader (`use_reloader=False`) after tracing a recurring
  "browser hangs forever" symptom back to orphaned server processes the reloader left running
  on Windows
- Established a feature branch (`local-setup-and-fixes`) off `main`, so none of this work
  touched the original branch directly

### Phase 2 — UI redesign
*(part of commit `07286ab`)*

The original single-file page was rebuilt from scratch: a proper card layout, light/dark
theme support via `prefers-color-scheme`, animated probability bars, emotion emoji, and a
clearer file-selection state — replacing what was there before rather than patching it.

### Phase 3 — Code structure & first documentation
*(commit `1994313`, 2026-07-31)*

- Split the (by now large) inline `<style>`/`<script>` blocks out of `index.html` into
  `static/css/style.css` and `static/js/main.js`, served via Flask's default static-folder
  convention — a pure maintainability change, no behavior change
- Introduced `ARCHITECTURE.md`: the project's first structured technical documentation
  beyond the README, with component tables and diagrams

### Phase 4 — Multi-format audio support
*(commit `7f88b9d`, 2026-07-31)*

- A feasibility study was done **before** writing any code: empirically verified (by actually
  writing and reading test files, not by assuming from documentation) that `soundfile`/
  `libsndfile` already decode MP3/OGG/FLAC with zero new dependencies, while M4A/AAC would
  require introducing FFmpeg as a system-level dependency — a cost judged not worth paying yet
- Implemented the supported tier: a server-side extension allow-list, and proper exception
  handling in `/predict` (previously a bare `try/finally` with no `except` let any decode
  failure surface as an uncaught 500 with a raw traceback)
- Introduced `FUNCTIONAL_SYNOPSIS.md` as a second, deliberately non-technical document
- Established the standing rule this project now follows: every code change updates both
  docs in the same pass, proactively

### Phase 5 — In-browser audio preview
*(commit `879878f`, 2026-08-02)*

Added a native `<audio controls>` player, populated via `URL.createObjectURL()` whenever a
file is selected, dropped, or recorded — so a user can confirm they have the right clip
before spending a prediction on it. (Superseded by the custom waveform player in Phase 7.)

### Phase 6 — Microphone recording
*(commit `879878f`, 2026-08-02)*

- Added live in-browser recording via `getUserMedia` + `MediaRecorder`
- The key technical decision: `MediaRecorder` produces WebM/Opus, which `libsndfile` cannot
  decode and which would otherwise reopen the FFmpeg question settled in Phase 4. Instead, the
  recorded audio is decoded and re-encoded to a plain WAV file **entirely client-side** via the
  Web Audio API before it's ever sent to the server — so from the backend's point of view, a
  live recording and a WAV upload are indistinguishable, and the "no FFmpeg" constraint holds
- A 60-second hard auto-stop cap was added as a safety net against runaway recordings (the
  model itself only ever reads the first 3 seconds of any clip regardless of length)
- Verified end-to-end by substituting a synthetic tone-generating `MediaStream` for
  `getUserMedia()` (the one part of this that can't be automated is the OS-level microphone
  permission dialog itself) and confirming the converted recording round-trips through
  `/predict` correctly

### Phase 7 — Waveform player, for a more premium feel
*(commit `5fd3f9c`, 2026-08-02)*

- Replaced the native `<audio controls>` player from Phase 5 with a custom canvas-based
  waveform: amplitude peaks are extracted once via `AudioContext.decodeAudioData()`
  (`computePeaks()`), then rendered as bars that fill in with the accent color as playback
  progresses — the same visual pattern used by SoundCloud/Spotify-style players
- Added click-to-seek directly on the waveform (click position maps proportionally to
  `audioPreview.currentTime`)
- The underlying `<audio>` element is kept, just visually hidden — it remains the actual
  playback engine (play/pause/seek), while the canvas is a synced visualization layer on top,
  so a waveform-generation failure degrades gracefully to "plays fine, just no visual" rather
  than breaking playback
- Verified interactively end-to-end (not just by reading the code): rendered a waveform from
  a synthetic clip with a deliberately varying amplitude envelope, confirmed play/pause,
  click-to-seek at an arbitrary point, and correct end-of-playback state (whole waveform
  shows "played" color, not reset to empty) — plus confirmed it still works for
  microphone-recorded audio and doesn't affect the `/predict` flow

### Phase 8 — Staged loading sequence
*(current session, not yet committed at time of writing)*

- Replaced the plain spinner-and-"Analyzing…" state with a 4-step checklist (Uploading →
  Extracting acoustic features → Running emotion model → Finalizing results), each step
  transitioning from pending → spinning → checkmark
- Important honesty note captured in `ARCHITECTURE.md`: since `/predict` is a single
  synchronous request with no progress-streaming endpoint, these stages are **simulated on a
  client-side timer**, not driven by real backend telemetry. The timing is tuned to look
  natural for a typical (sub-second, post-warm-up) request, and the last stage simply holds
  — still animating — for as long as the real response actually takes, so it never looks
  frozen even during the ~30s first-call warm-up
- Verified deterministically: rather than relying on wall-clock observation (tool round-trip
  latency in the test harness alone exceeds the real warm-up time, making timing races
  unreliable to observe), the stage-transition logic was snapshotted at fixed checkpoints
  (50ms/600ms/1.6s/3.6s/5s) independent of any real network call, confirming the sequence
  advances correctly and holds indefinitely on the last stage rather than glitching

### Phase 9 — Smoother loading→result handoff
*(current session, not yet committed at time of writing)*

- Fixed a "flash cut" feel: the loading checklist and result panel previously toggled via
  raw `display:none`/`display:block` with no transition, and worse, the two panels'
  visibility briefly overlapped (the result was set to `display:block` immediately, while the
  completed checklist was still visible for another 350ms), producing a jarring double-flash
  rather than one clean handoff
- Restructured `stopLoadingStages()` to accept an `onHidden` callback that only fires once the
  checklist has actually faded out and been removed from layout — the result panel now reveals
  itself (`renderResult()` + `showResult()`) strictly *after* that, never overlapping
- Added real CSS transitions: the checklist fades out (`opacity`), and the result panel
  fades and slides up into place (`opacity` + `transform: translateY`), with the emotion
  emoji popping in with a slight overshoot easing. The Predict button now stays disabled for
  the entire handoff (previously it re-enabled the instant the network response arrived, before
  the visual transition had even started, so a second click could land mid-transition)
- Verified via genuine separate tool round-trips (not a single synchronous script, which
  produced a misleading same-tick artifact during initial debugging) that the panel's
  "hidden" computed state is truly `opacity:0` and the "shown" state is truly `opacity:1` with
  `transform` reset — i.e. there is a real before/after state for the browser's transition
  engine to interpolate between, not an instant jump disguised as a transition

## Where this is headed

Identified but not yet built, in the order they were prioritized during planning:

1. **Model upgrade** — replace the mean-pooled-MFCC + LSTM approach (which structurally
   discards the temporal information an LSTM exists to use) with a pretrained speech
   embedding (wav2vec2/HuBERT), directly addressing both the accuracy ceiling and the dated
   feature-extraction technique
2. **Cross-corpus evaluation** — train on 3 of the 4 datasets, evaluate on the 4th held out
   entirely, to get an honest generalization number instead of the current random-split metric
3. **Live deployment** — a public, clickable demo (Hugging Face Spaces or Render), since the
   project has been local-only through all of the phases above
4. **Baseline comparison, automated tests, CI** — supporting rigor once the above land
5. **Differentiating angles under consideration**: a fairness/demographic audit (CREMA-D ships
   actor demographic metadata), an honest acted-vs-spontaneous-speech generalization check,
   and an in-app explainability panel — all flagged as rare-at-this-project-tier rather than
   claims of research novelty
