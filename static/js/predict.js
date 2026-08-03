// Predict button: the staged loading checklist, the result panel (and its
// fade/slide-in), and the actual fetch('/predict') call. Reads the current file
// via getSelectedFile() rather than owning it, and reacts to file changes via
// the 'audio:file-changed' event fileUpload.js dispatches, rather than being
// imported by it — keeps the dependency one-directional.
import { getSelectedFile } from './fileUpload.js';

const EMOJI = {
  angry: '😠', happy: '😄', sad: '😢', neutral: '😐',
  fear: '😨', disgust: '🤢', calm: '😌', surprise: '😲'
};

const btn = document.getElementById('predictBtn');
const btnLabel = document.getElementById('btnLabel');
const spinner = document.getElementById('spinner');
const hint = document.getElementById('hint');
const result = document.getElementById('result');
const loadingSteps = document.getElementById('loadingSteps');
const loadingStepEls = Array.from(document.querySelectorAll('.loading-step'));

function hideResult(){
  result.classList.remove('visible');
  result.style.display = 'none';
}

function showResult(){
  result.style.display = 'block';
  result.classList.remove('visible');
  void result.offsetWidth; // force a reflow so the browser registers the pre-transition state
  requestAnimationFrame(() => result.classList.add('visible'));
}

document.addEventListener('audio:file-changed', hideResult);

function setLoading(isLoading){
  btn.disabled = isLoading;
  spinner.style.display = isLoading ? 'inline-block' : 'none';
  btnLabel.textContent = isLoading ? 'Analyzing…' : 'Predict Emotion';
}

// Stage timings are simulated, not driven by real backend progress — /predict is a
// single synchronous request with no streaming/progress endpoint. The delays below are
// tuned to look natural for a typical fast request; the last stage simply stays active
// (spinning) for however long the real response actually takes, including the slow
// first-call warm-up case, so it never looks frozen even if that takes ~30s.
const LOADING_STAGE_DELAYS = { upload: 0, extract: 500, model: 1500, finalize: 3500 };
let loadingStageTimeouts = [];

function startLoadingStages(){
  loadingStepEls.forEach(el => el.classList.remove('active', 'done'));
  loadingSteps.style.display = 'flex';
  Object.keys(LOADING_STAGE_DELAYS).forEach((key, idx) => {
    const t = setTimeout(() => {
      for (let i = 0; i < idx; i++) {
        loadingStepEls[i].classList.remove('active');
        loadingStepEls[i].classList.add('done');
      }
      loadingStepEls[idx].classList.add('active');
    }, LOADING_STAGE_DELAYS[key]);
    loadingStageTimeouts.push(t);
  });
}

// Sequences the handoff so the two panels never overlap in a jarring way: the
// checklist holds briefly at "all done" (so the checkmarks actually register with the
// user), fades out, and only then does `onHidden` run — e.g. revealing the result panel
// with its own fade/slide-in, instead of both panels flashing in and out at once.
function stopLoadingStages(success, onHidden){
  loadingStageTimeouts.forEach(clearTimeout);
  loadingStageTimeouts = [];
  const fadeOutThenHide = (holdMs) => {
    setTimeout(() => {
      loadingSteps.classList.add('fade-out');
      setTimeout(() => {
        loadingSteps.style.display = 'none';
        loadingSteps.classList.remove('fade-out');
        if (onHidden) onHidden();
      }, 350); // matches the .loading-steps opacity transition duration
    }, holdMs);
  };
  if (success) {
    loadingStepEls.forEach(el => { el.classList.remove('active'); el.classList.add('done'); });
    fadeOutThenHide(500);
  } else {
    fadeOutThenHide(0);
  }
}

function renderResult(data){
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
}

btn.addEventListener('click', async () => {
  const selectedFile = getSelectedFile();
  if (!selectedFile) return;
  setLoading(true);
  hint.className = 'hint';
  hint.textContent = 'First prediction can take up to 30s while the model warms up.';
  hideResult();
  startLoadingStages();

  const formData = new FormData();
  formData.append('audio', selectedFile);

  try {
    const res = await fetch('/predict', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    hint.textContent = '';
    stopLoadingStages(true, () => {
      renderResult(data);
      showResult();
      setLoading(false);
    });
  } catch (err) {
    hint.className = 'hint error';
    hint.textContent = 'Error: ' + err.message;
    stopLoadingStages(false, () => setLoading(false));
  }
});
