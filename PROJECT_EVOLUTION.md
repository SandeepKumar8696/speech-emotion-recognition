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
| Frontend code | One HTML file with everything inlined (~170 lines of mixed markup/CSS/JS) | Markup, and 5 ES-module JS files + 4 CSS files each scoped to a single concern (file picker, waveform, recording, predict/result) |
| Audio format support | WAV only, and only as an unenforced client-side hint | WAV/MP3/OGG/FLAC, validated server-side, with clean error handling on decode failure |
| Input methods | File upload only | File upload **or** live microphone recording |
| Audio review before predicting | None — upload and hope | Interactive waveform player: playback, click-to-seek, and progress visualized on the clip's own amplitude shape |
| Result output | Emotion label + confidence, based on only the clip's first 3 seconds | Emotion + confidence based on the **whole clip** (windowed + duration-weighted across its full length), plus a voice-statistics panel (duration, pitch, energy, silence%, estimated speaking rate) |
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
*(commit `9b05f9d`, 2026-08-03)*

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
*(commit `9b05f9d`, 2026-08-03)*

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

### Phase 10 — Split the frontend by concern (JS modules + matching CSS)
*(commit `96f1c9b`, 2026-08-03)*

By this point `static/js/main.js` had grown to ~460 lines covering five genuinely different
concerns (file picker, waveform player, mic recording, loading checklist, result rendering)
and `static/css/style.css` had grown alongside it — a maintainability problem raised
explicitly, in separation-of-concerns terms, as more UI work was still to come.

- Split `main.js` into `utils.js`, `waveform.js`, `fileUpload.js`, `recorder.js`, and
  `predict.js` — one file per concern — using native ES modules (`import`/`export`,
  `<script type="module">`), no bundler or build step introduced
- Kept the module dependency graph one-directional on purpose: rather than a circular import
  between `fileUpload.js` and `predict.js` (each conceptually needs something from the other),
  `predict.js` imports `getSelectedFile()` from `fileUpload.js`, and `fileUpload.js`
  communicates file changes via a `document`-level `'audio:file-changed'` CustomEvent that
  `predict.js` listens for — `fileUpload.js` never imports `predict.js`
- Split `style.css` the same way: `base.css` (shared variables/reset/card), `upload.css`,
  `player.css`, `predict.css` — loaded as four `<link>` tags
- `main.js` is now a 4-line composition root that only imports the other modules; loading
  order in that file doesn't matter since native ES module resolution handles the actual
  dependency order
- Verified this was a pure refactor, not a behavior change: re-ran the full regression suite
  (file select → waveform render, predict → result reveal, clear, mic recording end-to-end,
  the unsupported-extension error path, both themes) against the split files and confirmed
  zero console errors and identical behavior to before the split. One adjustment the split
  itself required: `setFile()` is no longer a global, so testing had to simulate real
  `<input>` `change` events instead of calling it directly — which is itself a sign the split
  achieved real encapsulation rather than just moving code around

### Phase 11 — Voice statistics panel
*(current session, not yet committed at time of writing)*

Added a small "voice statistics" panel to the result view: Speech Duration, Speaking Rate,
Pitch, Energy, and Silence%, shown as a tile grid alongside the emotion prediction.

- Before implementing, checked which of the five requested metrics were honestly
  computable: Duration, Pitch, Energy, and Silence% are all standard, well-established
  signal-processing measurements (`librosa`) with no real ambiguity. **Speaking Rate (WPM)
  was different** — true words-per-minute requires knowing how many *words* were spoken,
  which needs actual speech-to-text, a capability this app has never had. Rather than
  silently fabricate a precise-looking number, this was raised explicitly as a decision:
  real ASR (accurate, but a meaningfully heavier new dependency + latency) vs. an acoustic
  estimate (lighter, consistent with how this project has avoided heavy dependencies
  elsewhere, but approximate) vs. skipping it. Decision: estimate, clearly labeled as such.
- Implemented `compute_voice_stats()` in `app.py`, analyzing the *full* clip (a separate,
  untruncated `librosa.load()`, unlike the model's own 3-second window) — duration, mean
  pitch (`librosa.yin()` + an energy-relative voiced mask), mean RMS energy (bucketed
  Low/Medium/High), silence percentage (`librosa.effects.split()`), and the speaking-rate
  estimate (onset/transient count as a syllable-count proxy, converted to words via the
  ~1.5-syllables-per-word English average).
- **Calibrated rather than guessed every threshold**, against synthetic clips with known
  ground truth: energy Low/Medium/High cutoffs against a sweep of amplitude levels; onset
  detection's `delta`/`wait` parameters tuned until the detected count matched a synthetic
  clip's known burst count (16); pitch verified against a synthetic tone at an exact known
  frequency (220 Hz in, 220.8 Hz / 219.3 Hz out across two methods tested).
- **Caught a real edge case during testing, not by inspection alone**: `librosa.effects
  .split()` thresholds silence relative to the clip's own peak amplitude — for a clip
  that's silent throughout (no real peak to threshold against), it degenerately reports
  the *entire* clip as non-silent. `compute_voice_stats()` now checks for a near-zero peak
  first and returns `silence_pct: 100` directly rather than trusting that.
- **Caught and fixed a real performance issue during prototyping**: the more accurate
  pitch-tracking method (`librosa.pyin()`) measured ~8x slower than `librosa.yin()` (~7s
  for a 7s clip — untenable against a 60s max recording). Switched to `yin()` + a simple
  energy-relative voiced mask, keeping equivalent accuracy at a fraction of the cost —
  found via direct timing measurement, not assumed.
- Voice-stats computation is wrapped in its own `try/except` inside `/predict` — a DSP
  failure there returns `voice_stats: null` (frontend hides that section) without taking
  down the actual emotion prediction, matching this project's established pattern of
  never letting a supplementary feature break the core one (same philosophy as the
  waveform-generation failure handling in Phase 7).
- Verified end-to-end against the real running server (not just unit-level): confirmed
  correct values on a realistic synthetic clip (duration, pitch match input tone exactly),
  a ~31s clip (timing stays negligible, ~0.5s), and a pure-silence clip (all fields
  degrade sensibly instead of erroring) — plus confirmed the frontend correctly renders
  all five tiles and hides the whole section gracefully if the backend ever returns
  `voice_stats: null`.

### Phase 12 — Emotion timeline across the clip
*(current session, not yet committed at time of writing)*

Added a second analytics feature to the result view: instead of one emotion label for the
whole clip, a timeline showing how the predicted emotion changes across it — e.g.
`0.5-3.5 sec: Neutral`, `3.5-6.5 sec: Angry`, `6.5-10.5 sec: Disgust`, `10.5-18 sec: Calm` —
rendered as a connected-dot vertical list.

- `compute_emotion_timeline()` runs the *same* trained model (no second model, no
  retraining) across consecutive **3-second** windows spanning the full clip — 3s
  specifically because that matches the window size the model was actually trained on
  (`extract_features()`'s own `duration=3`); a different window length would be
  out-of-distribution input the model has never seen.
- All windows are stacked and run through **one batched `model.predict()` call**, not a
  loop of individual predictions — verified this keeps a multi-window clip's added latency
  in the same ballpark (~0.3s) as the single-window case rather than multiplying per window.
- Adjacent windows that predict the same label are merged into a single range — this is
  why real output has variable-length ranges rather than a uniform 3s grid, and why the
  headline example above has a final range of `10-18 sec` (8 seconds — 2-3 windows that
  all agreed) rather than another clean 3-second block.
- Verified the merge logic doesn't over-merge: built a synthetic clip with a
  `fear → calm → fear` pattern across windows and confirmed the output kept the two `fear`
  ranges separate rather than merging them together across the intervening `calm` range —
  merging non-adjacent recurrences would have misrepresented a real change away and back
  as one continuous span.
- A trailing partial window shorter than 0.3s is dropped rather than predicted on (not
  enough signal for a meaningful MFCC); clips too short to produce at least 2 windows
  return `None` and the frontend hides the section rather than show one row that would
  just repeat the headline emotion already shown above it. Confirmed this actually
  triggers correctly in practice, not just in theory — a real test clip where every
  window happened to predict the same label produced exactly this (a 1-entry timeline,
  correctly suppressed by the frontend), which on first look could easily have been
  mistaken for a bug rather than the intended behavior.
- Shares the same failure-isolation pattern as `voice_stats`: its own independent
  `try/except` in the route handler, and both share a single `librosa.load()` of the full
  clip rather than each loading the file separately.
- **Caught a real bug via actual dogfooding, not by inspection**: after building the
  feature and trying it, a clip showed the headline result as "Disgust" while the
  timeline's most common label was "Sad" for the same recording — asked to investigate
  rather than dismiss it. Root cause: the headline (`extract_features()`) analyzes audio
  `[0.5s, 3.5s]` (`offset=0.5, duration=3`), while the timeline's windows started at `t=0`
  (`[0,3), [3,6), ...`) — two genuinely different, merely-overlapping slices of the same
  clip fed to the identical model. Measured the actual effect rather than assuming: on 20
  random test clips, shifting the analysis window by exactly 0.5s (no other change)
  flipped the model's top-1 label in **8 of them (40%)** — confirming this was a frequent,
  real inconsistency, not a rare fluke. Fixed by starting the timeline's window grid at
  the same `0.5s` offset (`TIMELINE_START_OFFSET_SEC`); re-ran the same 20-clip test and
  got **0 mismatches**, including on the exact clip that had flipped before the fix.
  Separately noted for anyone debugging a *future* headline/timeline disagreement: this
  fix removes the spurious (misaligned-window) source of disagreement, but real
  disagreement between two genuinely different, low-confidence windows later in a clip is
  still expected — that's the model's actual ~55% accuracy ceiling, not a bug, and
  `disgust` specifically is already documented as one of its weakest classes (0.39 F1).
- **A brief detour and a second real finding, both from continued dogfooding.** The
  timeline was momentarily asked to be removed in favor of real speech-to-text, then that
  was reversed in favor of keeping it — no code was actually pulled before the decision
  changed. In the same session, checking a real 26-second clip surfaced a second,
  different observation: the headline read "Disgust" (93.4%), but the *timeline* showed
  `Angry` occupying the most total time across the clip (10.5s / 41.2% vs. `Disgust`'s
  9.0s / 35.3%) — tallied precisely rather than eyeballed, and confirmed to sum to exactly
  the clip's reported 26s duration. This was **not** a repeat of the alignment bug (the
  headline and the timeline's first segment still agreed exactly, confirming that fix
  holds) — it's that the headline was never designed to summarize a whole clip, only its
  first 3 seconds, which only becomes visually confusing once a clip is long enough for
  the timeline to disagree with that opening snapshot. Presented three options (clarify
  the label / add a duration-weighted "overall" metric / leave it and just document it);
  chose the label clarification — added `renderHeadlineScopeNote()` to `predict.js`, which
  shows "Based on the first 3 seconds of a `{duration}`s clip" whenever `emotion_timeline`
  is non-null (reusing that field's existing short-clip `None` behavior as the signal,
  rather than adding a new duration check), so short clips — where the headline *is* the
  whole clip — show no caveat at all. Verified both branches directly: a 2s clip shows no
  note, a 10s clip shows "Based on the first 3 seconds of a 10s clip."

### Phase 13 — Removed the emotion timeline; made the headline whole-clip-aware
*(current session, not yet committed at time of writing)*

Prompted by a direct question after continued dogfooding: "there is a line which says based
on first 3s. Is the emotion predicted based on only the first 3s? It should be based on the
whole audio speech right" — followed immediately by "strip off the emotion timeline from the
project, we are good without it." Both were acted on together, since fixing the first made
the second the correct call rather than a loss.

- **Confirmed the concern was correct before changing anything.** `extract_features()`
  loaded exactly `librosa.load(file_path, duration=3, offset=0.5)` — the headline had
  always been a first-3-seconds snapshot, regardless of how long the uploaded clip was, for
  every phase up to this one. The `headlineScopeNote` caption added in Phase 12 had been
  papering over this fact, not fixing it.
- **Replaced `extract_features()` + a single `model.predict()` call with
  `predict_over_full_clip()`**: slices the *entire* clip into consecutive 3-second windows
  (starting at the same 0.5s offset the training recipe uses), runs all windows through the
  model in one batched call, then combines every window's probability vector into a single
  verdict via a **duration-weighted average** — a 10s window counts for more than a leftover
  1.5s sliver. For any clip ≤3.5s this is exactly one window, mathematically identical to
  the old behavior.
- **Verified, not assumed, both directions**: for short clips, `predict_over_full_clip()`'s
  output matched a manual single-window calculation bit-for-bit across several durations
  (1s, 3s, 3.5s). For long clips, built a synthetic 23-second clip (a 3s tone followed by 20s
  of distinctly different noise) and confirmed the full-clip prediction genuinely differed
  from a first-3.5-seconds-only prediction on the same audio — proof the fix isn't a no-op.
- **Removed the emotion timeline entirely** (`compute_emotion_timeline()` and its
  `TIMELINE_*` constants in `app.py`; the `emotion-timeline`/`timeline-*` markup and CSS; the
  `renderEmotionTimeline()`/`formatTimeLabel()` JS). The timeline's whole reason for existing
  — showing per-window detail because the headline couldn't be trusted to represent the
  whole clip — evaporated once the headline itself became whole-clip-aware. Its underlying
  per-window model calls live on inside `predict_over_full_clip()`, just averaged into one
  number instead of surfaced as a list.
- **Removed the `headlineScopeNote` caption** (`"Based on the first 3 seconds of a 26s
  clip"`) for the same reason — there's no longer a scope gap left to caveat.
- Verified end-to-end after the change: a full regression pass (short clip, long clip,
  browser round-trip via a real `/predict` request) confirmed the JSON response no longer
  includes an `emotion_timeline` key, the result panel renders with clean spacing where the
  timeline used to sit, and zero console errors.
- Phase 12 above is left intact rather than rewritten, per this document's own principle of
  reflecting actual history — the timeline was a real, working feature for one session
  before being superseded by a better fix to the problem it was compensating for.

## Where this is headed

Identified but not yet built, in the order they were prioritized during planning:

1. **Live deployment** — a public, clickable demo (Hugging Face Spaces or Render), since the
   project has been local-only through all of the phases above
2. **Baseline comparison, automated tests, CI** — supporting rigor once the above land
3. **Differentiating angles under consideration**: a fairness/demographic audit (CREMA-D ships
   actor demographic metadata), an honest acted-vs-spontaneous-speech generalization check,
   and an in-app explainability panel — all flagged as rare-at-this-project-tier rather than
   claims of research novelty
