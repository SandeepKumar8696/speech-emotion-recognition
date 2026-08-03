// File selection: drag-and-drop, file picker, the file chip, and the clear
// button. Owns `selectedFile` and exposes it via getSelectedFile() rather than
// a shared global — other modules that need to react to a file change (or a
// clear) listen for the 'audio:file-changed' event instead of being imported
// here directly, so this module never needs to know who's listening.
import { resetWaveformUI, drawWaveformFor } from './waveform.js';

const pickerArea = document.getElementById('pickerArea');
const dropzone = document.getElementById('dropzone');
const input = document.getElementById('audioInput');
const fileChip = document.getElementById('fileChip');
const fileNameEl = document.getElementById('fileName');
const clearFileBtn = document.getElementById('clearFile');
const audioPreview = document.getElementById('audioPreview');
const waveformPlayer = document.getElementById('waveformPlayer');
const btn = document.getElementById('predictBtn');
const hint = document.getElementById('hint');

let selectedFile = null;
let previewUrl = null;

export function getSelectedFile(){
  return selectedFile;
}

function notifyFileChanged(file){
  document.dispatchEvent(new CustomEvent('audio:file-changed', { detail: { file } }));
}

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
  hint.textContent = '';

  audioPreview.pause();
  audioPreview.removeAttribute('src');
  waveformPlayer.style.display = 'none';
  resetWaveformUI();
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  notifyFileChanged(null);
});

export function setFile(file){
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileChip.style.display = 'flex';
  pickerArea.style.display = 'none';
  btn.disabled = false;
  hint.className = 'hint';
  hint.textContent = '';

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  audioPreview.src = previewUrl;
  waveformPlayer.style.display = 'flex';
  resetWaveformUI();
  drawWaveformFor(file);
  notifyFileChanged(file);
}
