# 🎙️ Speech Emotion Recognition using Wav2Vec2 and Dense Classifier

A Speech Emotion Recognition (SER) system that classifies human emotions from speech audio using **Wav2Vec2 pretrained embeddings** and a **Dense neural network classifier**. The model is trained on multiple public speech emotion datasets and deployed using a Flask web application.

---

## 📌 Project Overview

Speech Emotion Recognition is a machine learning task that identifies emotions from spoken audio. This project replaces traditional handcrafted MFCC features with pretrained **Wav2Vec2 embeddings** extracted directly from speech audio.

The extracted 768-dimensional Wav2Vec2 representations are passed through a Dense neural network to classify the emotional state of the speaker.

## 📊 Key Results

- ✅ Test Accuracy: **75.84%**
- ✅ Weighted F1 Score: **0.758**
- ✅ Trained on **12,000+** speech samples
- ✅ Combined **4 public datasets**
- ✅ Wav2Vec2 pretrained speech embeddings
- ✅ Flask web application for real-time prediction

### Supported Emotions

- 😠 Angry
- 😄 Happy
- 😢 Sad
- 😐 Neutral
- 😨 Fear
- 🤢 Disgust
- 😌 Calm
- 😲 Surprise

---

# 🚀 Features

- Wav2Vec2 pretrained feature extraction using Hugging Face Transformers
- Uses `facebook/wav2vec2-base`
- Extracts 768-dimensional speech embeddings
- Uses Layer 6 hidden-state representations
- Dense neural network classifier
- Batch Normalization and Dropout for regularization
- StandardScaler for feature standardization
- Flask web application for emotion prediction
- Label Encoder for emotion mapping
- Supports `.wav` audio files

---

# 📂 Dataset

The model is trained on the following publicly available datasets:

- CREMA-D
- RAVDESS
- SAVEE
- TESS

Approximately **12,000+ audio samples** were combined to improve model generalization.

---

# 🧠 Model Architecture

Input Audio (.wav)

↓

Wav2Vec2 Pretrained Model

↓

Layer 6 Hidden-State Representation

↓

Mean Pooling (768-dimensional vector)

↓

StandardScaler

↓

Dense (256 Units, ReLU)

↓

Batch Normalization

↓

Dropout (0.4)

↓

Dense (128 Units, ReLU)

↓

Batch Normalization

↓

Dropout (0.4)

↓

Dense (64 Units, ReLU)

↓

Dropout (0.3)

↓

Softmax Output Layer

---

# 📊 Results

| Metric | Value |
|---------|-------|
| Test Accuracy | **75.84%** |
| Weighted F1 Score | **0.758** |
| Number of Classes | **8** |
| Feature Dimension | **768** |

The Wav2Vec2-based model achieved a significant improvement over the previous MFCC + LSTM baseline.

### Comparison with MFCC + LSTM

| Metric | MFCC + LSTM | Wav2Vec2 + Dense |
|---------|-------------|------------------|
| Test Accuracy | 55.45% | **75.84%** |
| Weighted F1 Score | 0.545 | **0.758** |
| Feature Dimension | 40 | **768** |

---

# 🛠️ Technologies Used

- Python
- TensorFlow
- Keras
- PyTorch
- Hugging Face Transformers
- Wav2Vec2
- Scikit-learn
- NumPy
- Pandas
- Librosa
- Flask

---


# 📁 Project Structure

    Speech-Emotion-Recognition/
    │
    ├── static/
    │   ├── css/
    │   └── js/
    │
    ├── templates/
    │   └── index.html
    │
    ├── app_wav2vec.py
    ├── best_model_wav2vec.h5
    ├── label_encoder_wav2vec.pkl
    ├── scaler_wav2vec.pkl
    ├── requirements_wav2vec.txt
    ├── .gitignore
    └── README.md

# ⚙️ Installation

Clone the repository

    git clone https://github.com/SandeepKumar8696/speech-emotion-recognition.git

Go to the project folder

    cd speech-emotion-recognition

Switch to the Wav2Vec2 branch

    git checkout wav2vec2

Install dependencies

    pip install -r requirements_wav2vec.txt

---

# ▶️ Run the Flask Application

    python app_wav2vec.py

Open your browser and visit:

    http://127.0.0.1:5001

Upload a `.wav` file to predict the emotion.

The application extracts Wav2Vec2 embeddings from the uploaded audio and passes them through the trained Dense classifier to generate the predicted emotion.

---

# 🤗 Wav2Vec2 Model

This project uses the publicly available pretrained model:

    facebook/wav2vec2-base

The Wav2Vec2 model is automatically downloaded through Hugging Face Transformers when the application is first run.

No Hugging Face account or API token is required for downloading this public model.

---

# 🔮 Future Improvements

- Fine-tune the Wav2Vec2 model directly for emotion classification
- Compare different Wav2Vec2 hidden layers
- Experiment with larger pretrained speech models
- Real-time microphone emotion recognition
- Improve cross-dataset generalization
- Deploy using Hugging Face Spaces or Render

---

# 📚 Learning Outcomes

Through this project I learned:

- Audio preprocessing
- Speech feature extraction using Wav2Vec2
- Transformer-based speech representation
- Deep Learning with TensorFlow/Keras
- Dense neural network classification
- Model evaluation techniques
- Flask deployment
- Speech signal processing
- End-to-end machine learning workflow

---

# 👨‍💻 Author

**Sandeep Kumar**

B.Tech – Artificial Intelligence & Data Science

GitHub:

https://github.com/SandeepKumar8696/speech-emotion-recognition

LinkedIn:

https://www.linkedin.com/in/sandeepkumar3456/

---

## ⭐ If you found this project useful, consider giving it a star!
