const EMOJI = {
  angry: '😠', happy: '😄', sad: '😢', neutral: '😐',
  fear: '😨', disgust: '🤢', calm: '😌', surprise: '😲'
};

const pickerArea = document.getElementById('pickerArea');
const dropzone = document.getElementById('dropzone');
const input = document.getElementById('audioInput');
const fileChip = document.getElementById('fileChip');
const fileNameEl = document.getElementById('fileName');
const clearFileBtn = document.getElementById('clearFile');
const audioPreview = document.getElementById('audioPreview');
const waveformPlayer = document.getElementById('waveformPlayer');
const waveformCanvas = document.getElementById('waveformCanvas');
const wfCtx = waveformCanvas.getContext('2d');
const wfPlayBtn = document.getElementById('wfPlayBtn');
const wfTime = document.getElementById('wfTime');
const btn = document.getElementById('predictBtn');
const btnLabel = document.getElementById('btnLabel');
const spinner = document.getElementById('spinner');
const hint = document.getElementById('hint');
const result = document.getElementById('result');
const recordBtn = document.getElementById('recordBtn');
const recordLabel = document.getElementById('recordLabel');

let selectedFile = null;
let previewUrl = null;

input.addEventListener('change', e => {
  if (e.target.files.length) setFile(e.target.files[0]);
});

['dragover', 'dragenter'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag'); })
);
dropzone.addEventListener('drop', e => {
  if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
});

clearFileBtn.addEventListener('click', () => {
  selectedFile = null;
  input.value = '';
  fileChip.style.display = 'none';
  pickerArea.style.display = 'block';
  btn.disabled = true;
  result.style.display = 'none';
  hint.textContent = '';

  audioPreview.pause();
  audioPreview.removeAttribute('src');
  waveformPlayer.style.display = 'none';
  resetWaveformUI();
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
});

function setFile(file){
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileChip.style.display = 'flex';
  pickerArea.style.display = 'none';
  btn.disabled = false;
  result.style.display = 'none';
  hint.className = 'hint';
  hint.textContent = '';

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  audioPreview.src = previewUrl;
  waveformPlayer.style.display = 'flex';
  resetWaveformUI();
  drawWaveformFor(file);
}

// ---------------- Waveform player ----------------
// Decorative + functional: renders amplitude peaks on a canvas, highlights the
// played portion during playback, and supports click-to-seek. Purely a client-side
// visualization on top of the same hidden <audio> element used for playback — if
// waveform generation fails for any reason, playback itself still works, just
// without the visual.

let waveformPeaks = null;
let waveformRafId = null;

function resetWaveformUI(){
  waveformPeaks = null;
  cancelAnimationFrame(waveformRafId);
  wfCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  wfPlayBtn.textContent = '▶';
  wfTime.textContent = '0:00';
}

async function drawWaveformFor(file){
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextCls = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextCls();
    let audioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      audioCtx.close();
    }
    waveformPeaks = computePeaks(audioBuffer, 120);
    sizeCanvasToDisplay();
    renderWaveform(0);
  } catch (err) {
    console.warn('Waveform generation failed (playback still works):', err);
  }
}

function computePeaks(audioBuffer, numPeaks){
  const data = audioBuffer.numberOfChannels > 1 ? mixToMono(audioBuffer) : audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / numPeaks));
  const peaks = [];
  for (let i = 0; i < numPeaks; i++) {
    let max = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    for (let j = start; j < end; j++) {
      const val = Math.abs(data[j]);
      if (val > max) max = val;
    }
    peaks.push(max);
  }
  return peaks;
}

function sizeCanvasToDisplay(){
  waveformCanvas.width = waveformCanvas.clientWidth;
  waveformCanvas.height = waveformCanvas.clientHeight;
}

function renderWaveform(progressRatio){
  if (!waveformPeaks) return;
  const w = waveformCanvas.width;
  const h = waveformCanvas.height;
  wfCtx.clearRect(0, 0, w, h);

  const styles = getComputedStyle(document.documentElement);
  const accentColor = styles.getPropertyValue('--accent').trim();
  const lineColor = styles.getPropertyValue('--line').trim();
  const barWidth = w / waveformPeaks.length;
  const playedBars = Math.floor(progressRatio * waveformPeaks.length);

  waveformPeaks.forEach((peak, i) => {
    const barHeight = Math.max(2, peak * h);
    const x = i * barWidth;
    const y = (h - barHeight) / 2;
    wfCtx.fillStyle = i < playedBars ? accentColor : lineColor;
    wfCtx.fillRect(x + 0.5, y, Math.max(1, barWidth - 1), barHeight);
  });
}

function updateWfTime(){
  const cur = formatElapsed(audioPreview.currentTime || 0);
  const dur = isFinite(audioPreview.duration) ? formatElapsed(audioPreview.duration) : '0:00';
  wfTime.textContent = `${cur} / ${dur}`;
}

function progressLoop(){
  if (audioPreview.duration) {
    renderWaveform(audioPreview.currentTime / audioPreview.duration);
    updateWfTime();
  }
  waveformRafId = requestAnimationFrame(progressLoop);
}

wfPlayBtn.addEventListener('click', () => {
  if (audioPreview.paused) {
    audioPreview.play();
  } else {
    audioPreview.pause();
  }
});

audioPreview.addEventListener('play', () => {
  wfPlayBtn.textContent = '⏸';
  progressLoop();
});
audioPreview.addEventListener('pause', () => {
  wfPlayBtn.textContent = '▶';
  cancelAnimationFrame(waveformRafId);
});
audioPreview.addEventListener('ended', () => {
  wfPlayBtn.textContent = '▶';
  cancelAnimationFrame(waveformRafId);
  renderWaveform(1);
  updateWfTime();
});
audioPreview.addEventListener('loadedmetadata', updateWfTime);

waveformCanvas.addEventListener('click', (e) => {
  if (!audioPreview.duration || !waveformPeaks) return;
  const rect = waveformCanvas.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  audioPreview.currentTime = ratio * audioPreview.duration;
  renderWaveform(ratio);
  updateWfTime();
});

// ---------------- Microphone recording ----------------
// MediaRecorder produces WebM/Opus (or similar), which the backend cannot decode
// without FFmpeg. To keep the app FFmpeg-free, the recording is decoded and
// re-encoded as a plain WAV file entirely client-side (Web Audio API) before
// being handed to setFile(), so from the backend's point of view it's just
// another WAV upload.

const MAX_RECORD_SECONDS = 60;
let mediaRecorder = null;
let recordedChunks = [];
let recordStream = null;
let recordTimerInterval = null;
let recordStartTime = null;

function formatElapsed(seconds){
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
  recordBtn.disabled = true;
  recordLabel.textContent = 'Recording unavailable (needs HTTPS/localhost + a modern browser)';
}

recordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
});

async function startRecording(){
  hint.className = 'hint';
  hint.textContent = '';
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    hint.className = 'hint error';
    hint.textContent = 'Microphone access denied or unavailable: ' + err.message;
    return;
  }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(recordStream);
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = onRecordingStop;
  mediaRecorder.start();

  recordStartTime = Date.now();
  recordBtn.classList.add('recording');
  recordLabel.textContent = 'Stop Recording · 0:00';
  recordTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - recordStartTime) / 1000;
    recordLabel.textContent = `Stop Recording · ${formatElapsed(elapsed)}`;
    if (elapsed >= MAX_RECORD_SECONDS) stopRecording();
  }, 200);
}

function stopRecording(){
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  clearInterval(recordTimerInterval);
  recordBtn.classList.remove('recording');
}

async function onRecordingStop(){
  recordStream.getTracks().forEach(t => t.stop());
  recordLabel.textContent = 'Record from microphone';

  const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  try {
    const wavBlob = await convertBlobToWav(blob);
    setFile(new File([wavBlob], 'recording.wav', { type: 'audio/wav' }));
  } catch (err) {
    hint.className = 'hint error';
    hint.textContent = 'Could not process the recording: ' + err.message;
  }
}

async function convertBlobToWav(blob){
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCls = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextCls();
  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    audioCtx.close();
  }
  return audioBufferToWavBlob(audioBuffer);
}

function audioBufferToWavBlob(audioBuffer){
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.numberOfChannels > 1
    ? mixToMono(audioBuffer)
    : audioBuffer.getChannelData(0);
  const numSamples = channelData.length;

  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  function writeStr(offset, str){ for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }

  writeStr(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE'); writeStr(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function mixToMono(audioBuffer){
  const len = audioBuffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i] / audioBuffer.numberOfChannels;
  }
  return out;
}

function setLoading(isLoading){
  btn.disabled = isLoading;
  spinner.style.display = isLoading ? 'inline-block' : 'none';
  btnLabel.textContent = isLoading ? 'Analyzing…' : 'Predict Emotion';
}

btn.addEventListener('click', async () => {
  if (!selectedFile) return;
  setLoading(true);
  hint.className = 'hint';
  hint.textContent = 'First prediction can take up to 30s while the model warms up.';
  result.style.display = 'none';

  const formData = new FormData();
  formData.append('audio', selectedFile);

  try {
    const res = await fetch('/predict', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    document.getElementById('emotionEmoji').textContent = EMOJI[data.emotion] || '🎧';
    document.getElementById('emotionLabel').textContent = data.emotion;
    document.getElementById('confidenceBadge').textContent =
      `${(data.confidence * 100).toFixed(1)}% confident`;

    const barsEl = document.getElementById('probBars');
    barsEl.innerHTML = '';
    const sorted = Object.entries(data.all_probabilities).sort((a, b) => b[1] - a[1]);
    for (const [label, prob] of sorted) {
      const pct = (prob * 100).toFixed(1);
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill"></div></div>
        <div class="bar-pct">${pct}%</div>`;
      barsEl.appendChild(row);
      requestAnimationFrame(() => {
        row.querySelector('.bar-fill').style.width = pct + '%';
      });
    }

    result.style.display = 'block';
    hint.textContent = '';
  } catch (err) {
    hint.className = 'hint error';
    hint.textContent = 'Error: ' + err.message;
  } finally {
    setLoading(false);
  }
});
