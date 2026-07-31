const EMOJI = {
  angry: '😠', happy: '😄', sad: '😢', neutral: '😐',
  fear: '😨', disgust: '🤢', calm: '😌', surprise: '😲'
};

const dropzone = document.getElementById('dropzone');
const input = document.getElementById('audioInput');
const fileChip = document.getElementById('fileChip');
const fileNameEl = document.getElementById('fileName');
const clearFileBtn = document.getElementById('clearFile');
const btn = document.getElementById('predictBtn');
const btnLabel = document.getElementById('btnLabel');
const spinner = document.getElementById('spinner');
const hint = document.getElementById('hint');
const result = document.getElementById('result');

let selectedFile = null;

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
  dropzone.style.display = 'flex';
  btn.disabled = true;
  result.style.display = 'none';
  hint.textContent = '';
});

function setFile(file){
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileChip.style.display = 'flex';
  dropzone.style.display = 'none';
  btn.disabled = false;
  result.style.display = 'none';
  hint.className = 'hint';
  hint.textContent = '';
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
