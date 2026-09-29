// Waveform player: renders amplitude peaks on a canvas, highlights the played
// portion during playback, and supports click-to-seek. Purely a client-side
// visualization on top of the same hidden <audio> element used for playback — if
// waveform generation fails for any reason, playback itself still works, just
// without the visual.
import { formatElapsed, mixToMono } from './utils.js';

const audioPreview = document.getElementById('audioPreview');
const waveformCanvas = document.getElementById('waveformCanvas');
const wfCtx = waveformCanvas.getContext('2d');
const wfPlayBtn = document.getElementById('wfPlayBtn');
const wfTime = document.getElementById('wfTime');

let waveformPeaks = null;
let waveformRafId = null;

export function resetWaveformUI(){
  waveformPeaks = null;
  cancelAnimationFrame(waveformRafId);
  wfCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  wfPlayBtn.textContent = '▶';
  wfTime.textContent = '0:00';
}

export async function drawWaveformFor(file){
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
