"""
Flask application for wav2vec2-based Speech Emotion Recognition.
Replaces the legacy MFCC/LSTM pipeline. Downloads the pretrained 
facebook/wav2vec2-base model (~360MB) on first run.

Run locally:
    pip install -r requirements.txt
    python app.py
"""

import os
import numpy as np
import librosa
import joblib
import torch
from flask import Flask, request, render_template, jsonify
from tensorflow.keras.models import load_model
from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2Model
from werkzeug.utils import secure_filename

# -------------------------------------------------------
# CONFIGURATION
# -------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "best_model_wav2vec.h5")
LABEL_ENCODER_PATH = os.path.join(BASE_DIR, "label_encoder_wav2vec.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "scaler_wav2vec.pkl")

# Wav2Vec2 Settings
WAV2VEC_MODEL_NAME = "facebook/wav2vec2-base"
TARGET_SR = 16000
LAYER_TO_USE = 6
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# -------------------------------------------------------
# INITIALIZATION
# -------------------------------------------------------
app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Set up device (GPU if available, else CPU)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[*] Using device: {device}")

print("[*] Loading downstream Keras classifier and transformers...")
classifier = load_model(MODEL_PATH)
le = joblib.load(LABEL_ENCODER_PATH)
scaler = joblib.load(SCALER_PATH)

# Load Wav2Vec2 architecture
feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(WAV2VEC_MODEL_NAME)
wav2vec_model = Wav2Vec2Model.from_pretrained(WAV2VEC_MODEL_NAME).to(device)
wav2vec_model.eval()  # Set transformer to evaluation mode

# -------------------------------------------------------
# INFERENCE PIPELINE
# -------------------------------------------------------
def extract_embedding(file_path):
    """
    Extracts the mean-pooled hidden state representation from a specific 
    layer of the Wav2Vec 2.0 transformer for a given audio file.
    """
    # Load and resample audio to exactly 16kHz for Wav2Vec2
    waveform, sr = librosa.load(file_path, sr=TARGET_SR, mono=True, duration=3, offset=0.5)
    
    # Process waveform through the feature extractor
    inputs = feature_extractor(waveform, sampling_rate=TARGET_SR, return_tensors="pt", padding=True)
    input_values = inputs.input_values.to(device)
    
    # Run forward pass without calculating gradients
    with torch.no_grad():
        outputs = wav2vec_model(input_values, output_hidden_states=True)
    
    # Extract the designated hidden layer and mean-pool across the time dimension
    hidden = outputs.hidden_states[LAYER_TO_USE].squeeze(0)
    return hidden.mean(dim=0).cpu().numpy()

# -------------------------------------------------------
# FLASK ROUTES
# -------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/predict", methods=["POST"])
def predict():
    if "audio" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["audio"]
    if file.filename == '':
        return jsonify({"error": "Empty filename submitted"}), 400
        
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    try:
        # 1. Extract transformer embeddings
        embedding = extract_embedding(filepath)
        
        # 2. Scale features based on training distribution
        embedding_scaled = scaler.transform(embedding.reshape(1, -1))
        
        # 3. Predict using the downstream Keras model
        probs = classifier.predict(embedding_scaled, verbose=0)[0]
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
        return jsonify({"error": str(e)}), 500
        
    finally:
        # Ensure the temporary uploaded file is deleted even if prediction fails
        if os.path.exists(filepath):
            os.remove(filepath)

if __name__ == "__main__":
    # Port 5001 avoids conflicts with macOS AirPlay receiver on Port 5000
    app.run(debug=True, port=5001)
