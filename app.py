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


def extract_features(file_path, n_mfcc=N_MFCC):
    # Matches your notebook: mean-pooled MFCC -> single (n_mfcc,) vector per clip
    y, sr = librosa.load(file_path, duration=3, offset=0.5)
    mfcc = np.mean(librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc).T, axis=0)
    return mfcc


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
        features = extract_features(filepath)
        features = features[np.newaxis, ..., np.newaxis]  # match training input shape
        probs = model.predict(features)[0]
        pred_idx = int(np.argmax(probs))
        pred_label = le.inverse_transform([pred_idx])[0]

        result = {
            "emotion": pred_label,
            "confidence": float(probs[pred_idx]),
            "all_probabilities": {
                le.classes_[i]: float(probs[i]) for i in range(len(le.classes_))
            }
        }
        return jsonify(result)
    except Exception as e:
        detail = str(e) or type(e).__name__
        return jsonify({"error": f"Could not process audio file: {detail}"}), 400
    finally:
        os.remove(filepath)


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
