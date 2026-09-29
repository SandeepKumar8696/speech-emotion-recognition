// Microphone recording. MediaRecorder produces WebM/Opus (or similar), which the
// backend cannot decode without FFmpeg. To keep the app FFmpeg-free, the
// recording is decoded and re-encoded as a plain WAV file entirely client-side
// (Web Audio API) before being handed to setFile(), so from the backend's point
// of view it's just another WAV upload.
import { setFile } from './fileUpload.js';
import { formatElapsed, mixToMono } from './utils.js';

const recordBtn = document.getElementById('recordBtn');
const recordLabel = document.getElementById('recordLabel');
const hint = document.getElementById('hint');

const MAX_RECORD_SECONDS = 60;
let mediaRecorder = null;
let recordedChunks = [];
let recordStream = null;
let recordTimerInterval = null;
let recordStartTime = null;

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
