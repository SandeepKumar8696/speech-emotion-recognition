# Functional Synopsis — Speech Emotion Recognition

*For the component-level technical breakdown (diagrams, request flow, file-by-file
responsibilities), see [ARCHITECTURE.md](ARCHITECTURE.md). For how the project got from its
original state to this one, see [PROJECT_EVOLUTION.md](PROJECT_EVOLUTION.md). This document
instead answers: what is this system for, what can it actually do today, and how does it
achieve that — without requiring the reader to trace through code.*

## Objective

Predict the emotional state of a speaker — angry, happy, sad, neutral, fear, disgust, calm,
or surprise — directly from a short clip of their voice, using only acoustic signal
properties (pitch, timbre, energy distribution), not the words being said.

The motivating use case is a standalone demo: a person uploads a short recording of speech
and receives an emotion label with a confidence score, through a simple web page — no manual
feature engineering or model knowledge required from the end user.

## What It Does

- Accepts an uploaded audio clip in **WAV, MP3, OGG, or FLAC** format through a browser UI
  (drag-and-drop or file picker)
- Alternatively, lets the user **record directly from their microphone** in-browser — no
  separate recording app or file needed. The recording is converted to a standard WAV clip
  entirely on the client side before being sent, so it's treated identically to an upload.
- Lets the user **play back the selected or recorded clip in-browser** via a custom waveform
  player — visualizing the clip's amplitude as a clickable waveform, with playback progress
  highlighted directly on it and click-to-seek — before running a prediction, so they can
  confirm it's the right audio. This preview is entirely local and never touches the server.
- Analyzes roughly a 3-second window of the clip's acoustic characteristics, showing a
  staged progress checklist (uploading → extracting features → running the model →
  finalizing) while it works, rather than a single unexplained spinner
- Returns one of 8 emotion labels, a confidence percentage for the top prediction, and a
  full breakdown of the model's probability across all 8 classes — revealed with a gentle
  fade/slide-in once the checklist completes, rather than an abrupt cut from one panel to
  the next
- Runs entirely locally — no external API calls, no cloud inference dependency

**What it does not do:** transcribe speech, understand word meaning or sentiment from
language/text, identify the speaker, or process real-time/streaming audio (each clip is a
single file, analyzed once, per request).

## How It Works

**1. Learning what emotional speech "sounds like."**
The system was trained on ~12,000 labeled speech clips pooled from four public research
datasets (CREMA-D, RAVDESS, SAVEE, TESS), each recorded by different actors reading lines in
different emotional deliveries. Pooling multiple datasets, rather than training on just one,
was a deliberate choice to reduce overfitting to any single dataset's recording conditions or
speaker roster.

**2. Turning audio into numbers a model can learn from.**
Raw audio waveforms aren't directly usable by a neural network. Each clip is converted into
**MFCCs (Mel-Frequency Cepstral Coefficients)** — a standard 40-number acoustic fingerprint
per clip that summarizes the shape of its frequency spectrum, which correlates with traits
like vocal tension and pitch that shift with emotion. This same 40-number extraction recipe
is used both when training the model and when a user uploads a clip later, so the model
always sees data in the same format it learned from.

**3. Classifying that fingerprint.**
Those 40 numbers are fed into an **LSTM-based neural network** (a type of model originally
designed for sequential data), followed by several fully-connected layers that narrow down
to a final probability across the 8 emotion categories. The network was trained with dropout
and L2 regularization to reduce overfitting, and training automatically stopped once
validation performance stopped improving.

**4. Serving predictions on demand.**
A lightweight **Flask** web server loads the trained model once when it starts up, then
handles each upload by: extracting the same MFCC fingerprint, running it through the loaded
model, and returning the result as JSON. The browser-side page (plain HTML/CSS/JS, no
framework) turns that JSON into the emoji, confidence badge, and probability bars the user
sees.

## Current Capabilities & Honest Limitations

| | |
|---|---|
| Test accuracy | 55.45% across 8 classes (~4.4x better than random guessing) |
| Weighted F1 | 0.545 |
| Best-performing classes | Surprise (0.79 F1), Angry (0.68 F1) |
| Weakest classes | Disgust (0.39 F1), Happy (0.47 F1) — most often confused with neutral/each other |
| Supported input formats | WAV, MP3, OGG, FLAC (M4A/AAC not yet supported — would require an FFmpeg system dependency) |
| Inference latency | First request after server start: ~30s (one-time library warm-up). Subsequent requests: under a second. |
| Scale | Single-clip, single-user demo — not built for concurrent production traffic |

The current accuracy sits below what modern pretrained speech-embedding approaches
(wav2vec2/HuBERT) achieve on the same underlying datasets — that's tracked as a known
direction for improvement, not a hidden limitation.
