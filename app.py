"""
Flask demo for Speech Emotion Recognition.
Upload an audio file in the browser -> get predicted emotion + confidence.
Supported formats: WAV, MP3, OGG, FLAC (decoded via soundfile/libsndfile, no FFmpeg needed).

Run locally:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000
"""

import os
import numpy as np
import librosa
import joblib
from flask import Flask, request, render_template, jsonify
from tensorflow.keras.models import load_model
from werkzeug.utils import secure_filename

# ---------------- CONFIG (edit these) ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "best_model.h5")
LABEL_ENCODER_PATH = os.path.join(BASE_DIR, "label_encoder.pkl")
N_MFCC = 40
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".ogg", ".flac"}
# -------------------------------------------------------

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

print("Loading model...")
model = load_model(MODEL_PATH)
le = joblib.load(LABEL_ENCODER_PATH)


def extract_features_from_array(y_segment, sr, n_mfcc=N_MFCC):
    # Matches your notebook: mean-pooled MFCC -> single (n_mfcc,) vector per clip.
    # Operates on an already-loaded array rather than a file path so the same recipe
    # can be applied to any window of a clip, not just the whole-file load
    # extract_features() used to do.
    mfcc = np.mean(librosa.feature.mfcc(y=y_segment, sr=sr, n_mfcc=n_mfcc).T, axis=0)
    return mfcc


PREDICT_WINDOW_SEC = 3.0  # matches the model's own training window (each training clip was ~3s)
PREDICT_MIN_TAIL_SEC = 0.3  # drop a trailing sliver shorter than this rather than predict on near-nothing
PREDICT_START_OFFSET_SEC = 0.5  # matches the original notebook's librosa.load(..., offset=0.5)


def predict_over_full_clip(y, sr):
    # The model itself was trained on ~3-second single-utterance clips (see
    # prepare_data.py/training.py) and only ever accepts one 40-value MFCC vector per
    # prediction — it has no notion of "a 26-second clip" as a single input. Rather than
    # only ever showing the user whatever the model says about the clip's opening 3
    # seconds (which was this function's behavior before), this runs the same model over
    # every consecutive 3s window spanning the WHOLE clip, then combines all windows'
    # probability vectors into one duration-weighted verdict — so the headline genuinely
    # reflects the entire recording, not just its first moment. For a clip <= 3.5s this
    # is mathematically identical to before (there's only one window).
    total_duration = len(y) / sr

    windows = []
    t = PREDICT_START_OFFSET_SEC
    while t < total_duration:
        end = min(t + PREDICT_WINDOW_SEC, total_duration)
        start_sample, end_sample = int(t * sr), int(end * sr)
        y_segment = y[start_sample:end_sample]
        if len(y_segment) < int(PREDICT_MIN_TAIL_SEC * sr) and windows:
            break  # trailing sliver too short to add signal, but only skip it if we
            # already have at least one real window — a clip shorter than the offset
            # itself still needs to fall through to the "at least one window" case below
        if len(y_segment) > 0:
            windows.append(y_segment)
        t += PREDICT_WINDOW_SEC

    if not windows:
        # Clip shorter than PREDICT_START_OFFSET_SEC itself (e.g. < 0.5s) — analyze
        # whatever exists from the very start rather than the offset.
        windows = [y[: int(PREDICT_WINDOW_SEC * sr)]]

    feats = np.stack([extract_features_from_array(seg, sr) for seg in windows])
    feats = feats[..., np.newaxis]  # (num_windows, 40, 1)
    probs_per_window = model.predict(feats, verbose=0)  # (num_windows, 8)

    weights = np.array([len(seg) for seg in windows], dtype=np.float64)
    weights /= weights.sum()
    avg_probs = np.average(probs_per_window, axis=0, weights=weights)

    pred_idx = int(np.argmax(avg_probs))
    pred_label = le.inverse_transform([pred_idx])[0]
    all_probabilities = {le.classes_[i]: float(avg_probs[i]) for i in range(len(le.classes_))}
    return pred_label, float(avg_probs[pred_idx]), all_probabilities


# Speaking-rate here is an *estimate*, not a real word count: getting an actual WPM
# requires speech-to-text, which this app doesn't have. Syllable nuclei are
# approximated via onset (energy-transient) detection, then converted to words using
# the commonly-cited English average of ~1.5 syllables/word. The onset-detection
# delta/wait parameters below were calibrated against a synthetic clip with a known
# burst count (16), not guessed.
AVG_SYLLABLES_PER_WORD = 1.5
ONSET_DELTA = 0.3
ONSET_WAIT = 7
SILENCE_TOP_DB = 30
ENERGY_THRESHOLDS = (0.025, 0.09)  # < low -> "Low", < high -> "Medium", else "High"


def compute_voice_stats(y, sr):
    # Describes the whole clip using plain DSP measurements (duration, pitch, energy,
    # silence%) — independent of predict_over_full_clip()'s windowed model predictions.
    duration_sec = librosa.get_duration(y=y, sr=sr)

    is_silent = duration_sec == 0 or np.max(np.abs(y)) < 1e-4
    if is_silent:
        # librosa.effects.split() thresholds relative to the clip's own peak, so a
        # near-zero-amplitude clip has no reference max and degenerately reports the
        # whole thing as "non-silent" — handle explicitly rather than trust that.
        return {
            "duration_sec": round(duration_sec, 1),
            "pitch_hz": None,
            "energy": "Low",
            "silence_pct": 100,
            "speaking_rate_wpm": 0,
        }

    intervals = librosa.effects.split(y, top_db=SILENCE_TOP_DB)
    non_silent_duration = sum((end - start) for start, end in intervals) / sr
    silence_pct = max(0.0, 100.0 * (1 - non_silent_duration / duration_sec))

    rms_frame = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    mean_rms = float(np.mean(rms_frame))
    if mean_rms < ENERGY_THRESHOLDS[0]:
        energy_label = "Low"
    elif mean_rms < ENERGY_THRESHOLDS[1]:
        energy_label = "Medium"
    else:
        energy_label = "High"

    # yin() is ~8x faster than pyin() and accurate enough once masked to
    # energy-active frames only (silence/near-silence otherwise skews the mean).
    f0 = librosa.yin(y, fmin=65, fmax=500, sr=sr)
    n = min(len(f0), len(rms_frame))
    voiced_mask = rms_frame[:n] > (0.1 * np.max(rms_frame[:n]))
    pitch_hz = float(np.mean(f0[:n][voiced_mask])) if voiced_mask.any() else None

    onset_times = librosa.onset.onset_detect(
        y=y, sr=sr, delta=ONSET_DELTA, wait=ONSET_WAIT, backtrack=False, units="time"
    )
    if non_silent_duration > 0.3:
        syllables_per_sec = len(onset_times) / non_silent_duration
        wpm_estimate = (syllables_per_sec / AVG_SYLLABLES_PER_WORD) * 60
    else:
        wpm_estimate = 0.0

    return {
        "duration_sec": round(duration_sec, 1),
        "pitch_hz": round(pitch_hz) if pitch_hz is not None else None,
        "energy": energy_label,
        "silence_pct": round(silence_pct),
        "speaking_rate_wpm": round(wpm_estimate),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    if "audio" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["audio"]
    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        supported = ", ".join(sorted(ALLOWED_EXTENSIONS))
        return jsonify({"error": f"Unsupported file type '{ext}'. Supported: {supported}"}), 400

    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    try:
        # Loaded once, full clip — used both for the headline prediction itself (now
        # whole-clip-aware, not just the first 3s) and for voice_stats below.
        y_full, sr_full = librosa.load(filepath)

        pred_label, confidence, all_probabilities = predict_over_full_clip(y_full, sr_full)

        try:
            voice_stats = compute_voice_stats(y_full, sr_full)
        except Exception:
            # Voice stats are a supplementary display, not the core function of this
            # endpoint — a DSP edge case here shouldn't take down the actual prediction.
            voice_stats = None

        result = {
            "emotion": pred_label,
            "confidence": confidence,
            "all_probabilities": all_probabilities,
            "voice_stats": voice_stats,
        }
        return jsonify(result)
    except Exception as e:
        detail = str(e) or type(e).__name__
        return jsonify({"error": f"Could not process audio file: {detail}"}), 400
    finally:
        os.remove(filepath)


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
