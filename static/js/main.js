// Composition root: each module below self-initializes on import (attaches its
// own event listeners) — this file's only job is to declare which concerns exist
// and let native ES module resolution handle the dependency order between them.
import './waveform.js';
import './fileUpload.js';
import './recorder.js';
import './predict.js';
