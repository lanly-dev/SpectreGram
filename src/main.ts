// SpectreGram wiring. Owns DOM, file intake, AudioContext lifecycle for
// playback, the single worker instance, and module-level UI state. Direct
// DOM — no framework. Privacy invariant: no fetch/XHR/WebSocket anywhere.

import { decodeFile, type DecodeResult, type FileFacts } from './audio/decode';
import {
  renderSpectrogram,
  setActivePalette,
  exportPng,
  getActivePaletteName,
  getDbRange,
  adjustDbRange,
  paintLegend,
  paletteGradientCss,
  DB_STEP,
  type PaletteName,
} from './render';
import { DEFAULT_STFT, type DbGrid } from './audio/stft';
import type { AnalyzeRequest, WorkerMessage, ZoomRequest } from './audio/stft-worker';

// Tick step candidates for the rulers. The spectrogram's frequency axis is
// LINEAR, so frequency ticks must be evenly spaced in Hz: log-spaced values
// (100/200/500/…) pile a dozen labels into the bottom tenth of the ruler.
// Steps are picked per file so the label count stays small and readable.
const FREQ_STEPS = [500, 1000, 2000, 2500, 5000, 10000, 20000];
// Time tick step candidates (seconds) for the bottom ruler. The sub-second
// steps are for zoomed views (the minimum zoom is about one second).
const TIME_STEPS = [
  0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600,
];

/** Smallest step whose label count over `span` stays at or below `max`. */
function pickStep(steps: number[], span: number, max: number): number {
  for (const s of steps) {
    if (span / s <= max) return s;
  }
  return steps[steps.length - 1];
}

function fmtFreq(hz: number): string {
  // Number(...) drops a trailing ".0", so 5000 reads "5 k", not "5.0 k".
  if (hz >= 1000) return `${Number((hz / 1000).toFixed(hz >= 10000 ? 0 : 1))} k`;
  return String(Math.round(hz));
}

/** "1:05" / "42s", or with `decimals` "1:05.25" / "42.25s". */
function fmtTime(sec: number, decimals = 0): string {
  const f = 10 ** decimals;
  const t = Math.round(Math.max(0, sec) * f) / f; // round first so 59.99 can't print "60"
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const sStr = decimals > 0 ? s.toFixed(decimals) : String(Math.floor(s));
  if (m > 0) return `${m}:${sStr.padStart(decimals > 0 ? 3 + decimals : 2, '0')}`;
  return `${sStr}s`;
}

/** Decimal places that keep adjacent tick labels at `step` apart distinct. */
function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  return step >= 0.1 && Number.isInteger(step * 10) ? 1 : 2;
}

/** Paint frequency tick labels on the left ruler (major marks only). */
function setFreqRuler(sampleRate: number): void {
  const ruler = $('ruler-left');
  if (!ruler) return;
  const nyq = sampleRate / 2;
  if (!(nyq > 0)) {
    ruler.innerHTML = '';
    return;
  }
  // Evenly spaced ticks on the linear axis: 0, step, 2·step, …, plus
  // Nyquist always labelled at the very top.
  const step = pickStep(FREQ_STEPS, nyq, 5);
  const values: number[] = [];
  for (let f = 0; f < nyq; f += step) values.push(f);
  values.push(nyq);
  const html = values
    .map((f) => {
      const pct = ((nyq - f) / nyq) * 100;
      // Center the label on its value; clamp the two edge labels fully
      // inside the ruler so they never overflow top/bottom.
      const ty = pct <= 0 ? '0' : pct >= 100 ? '-100%' : '-50%';
      return `<div class="tick" style="top:${pct}%;transform:translateY(${ty});">${fmtFreq(f)}</div>`;
    })
    .join('');
  ruler.innerHTML = html;
}

/**
 * Paint time tick labels on the bottom ruler (major marks only) for the
 * visible range [start, end] seconds. The full view also labels the total
 * duration at the right edge; a zoomed view labels only round step ticks.
 */
function setTimeRuler(start: number, end: number, labelEnd = true): void {
  const ruler = $('ruler-bottom');
  if (!ruler) return;
  const span = end - start;
  if (!(span > 0)) {
    ruler.innerHTML = '';
    return;
  }
  const step = pickStep(TIME_STEPS, span, 6);
  const decimals = decimalsForStep(step);
  const values: number[] = [];
  // Integer multiples of the step (no float accumulation drift).
  const first = Math.ceil(start / step - 1e-9);
  for (let i = first; i * step < end - 1e-9; i++) values.push(i * step);
  // Label the right edge too — unless it would crowd the last step tick.
  if (labelEnd && (values.length === 0 || end - values[values.length - 1] >= step * 0.5)) {
    values.push(end);
  }
  const html = values
    .map((t) => {
      const pct = ((t - start) / span) * 100;
      // Center the label on its value; clamp the two edge labels fully
      // inside the ruler so they never overflow left/right.
      const tx = pct <= 0 ? '0' : pct >= 100 ? '-100%' : '-50%';
      return `<div class="tick" style="left:${pct}%;transform:translateX(${tx});">${fmtTime(t, decimals)}</div>`;
    })
    .join('');
  ruler.innerHTML = html;
}

/** Repaint the dBFS color bar and its labels for the active palette + range. */
function updateLegend(): void {
  const canvas = el<HTMLCanvasElement>('legend-canvas');
  if (canvas) paintLegend(canvas);
  const ticks = $('legend-ticks');
  if (!ticks) return;
  const { lower, upper } = getDbRange();
  const span = upper - lower;
  const step = span > 60 ? 20 : 10;
  const values: number[] = [];
  for (let db = upper; db > lower; db -= step) values.push(db);
  values.push(lower);
  ticks.innerHTML = values
    .map((db) => {
      const pct = ((upper - db) / span) * 100;
      const ty = pct <= 0 ? '0' : pct >= 100 ? '-100%' : '-50%';
      return `<div class="tick" style="top:${pct}%;transform:translateY(${ty});">${db} dB</div>`;
    })
    .join('');
}

/** Spek-style keys: u/U lower/raise the upper limit, l/L lower/raise the lower limit. */
function setupDbRangeKeys(): void {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    let which: 'lower' | 'upper';
    if (e.key === 'u' || e.key === 'U') which = 'upper';
    else if (e.key === 'l' || e.key === 'L') which = 'lower';
    else return;
    const delta = e.key === e.key.toUpperCase() ? DB_STEP : -DB_STEP;
    const before = getDbRange();
    const after = adjustDbRange(which, delta);
    updateLegend();
    const changed = before.lower !== after.lower || before.upper !== after.upper;
    toast(
      `${changed ? 'dB range' : 'dB range limit reached'}: ${after.lower} … ${after.upper} dBFS ` +
        '(u/U upper, l/L lower)',
    );
  });
}

// Module-level state so a palette switch can re-render without recomputing.
let worker: Worker | null = null;
let audioBuffer: AudioBuffer | null = null;
let sampleRate = 0;
// Base name (no extension) of the file being analyzed — names the PNG export.
let currentBaseName = 'spectregram';

// Playback state (optional playhead — analyzer, not a player).
let playCtx: AudioContext | null = null;
let playSource: AudioBufferSourceNode | null = null;
let playStartCtxTime = 0;
let rafId = 0;
let isPlaying = false;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// --- UI helpers -------------------------------------------------------------

/** 182.48 s -> "3:02"; under a minute keeps a decimal so it can't read as 0:00. */
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(2)} s`;
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/** 48000 -> "48 kHz", 44100 -> "44.1 kHz". */
function fmtSampleRate(hz: number): string {
  return `${Number((hz / 1000).toFixed(1))} kHz`;
}

/** "mono" / "stereo" / "N ch" — the strip is one row, so spell out the common cases. */
function fmtChannels(n: number): string {
  return n === 1 ? 'mono' : n === 2 ? 'stereo' : `${n} ch`;
}

function setFacts(facts: FileFacts | null): void {
  const node = $('facts');
  if (!node) return;
  node.replaceChildren();
  if (!facts) return;
  const rows: Array<[string, string]> = [
    ['Format', facts.format],
    ['Duration', fmtDuration(facts.durationSec)],
    ['Sample rate', fmtSampleRate(facts.sampleRate)],
    ['Channels', fmtChannels(facts.channels)],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'value';
    v.textContent = value;
    row.append(l, v);
    node.appendChild(row);
  }
}

// Brief floating message for things the user should notice: errors, save
// results, dB range changes. Progress is the top-edge line and the verdict
// line holds only estimates, so neither is used for these.
let toastTimer = 0;

function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  const node = $('toast');
  if (!node) return;
  clearTimeout(toastTimer);
  // Halloween dressing: the ghost delivers good news, the pumpkin bad news.
  node.textContent = `${kind === 'error' ? '🎃' : '👻'} ${text}`;
  node.classList.toggle('error', kind === 'error');
  node.hidden = false;
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, kind === 'error' ? 5000 : 2500);
}

// The verdict line holds a real estimate verdict (generated only in
// cutoff.ts), or — while a file loads — a dimmed progress note set via
// setVerdictPending. Errors go to toasts, never here.
function setVerdict(text: string): void {
  const node = $('verdict');
  if (!node) return;
  node.classList.remove('pending', 'stamp-genuine', 'stamp-fake');
  // Verdict stamps: genuine files get the ghost's seal of approval, fakes
  // get branded a costume. Inconclusive verdicts stay unstamped.
  if (text.includes('genuine lossless')) node.classList.add('stamp-genuine');
  else if (text.includes('costume')) node.classList.add('stamp-fake');
  node.textContent = text;
  // Full verdict on hover when the one-line slot ellipsizes it.
  node.title = text;
}

/** Show a loading note ("Decoding…", "Analyzing… 42%") in the verdict slot. */
function setVerdictPending(text: string): void {
  const node = $('verdict');
  if (!node) return;
  node.classList.add('pending');
  node.classList.remove('stamp-genuine', 'stamp-fake');
  node.textContent = text;
  node.title = '';
  hideEmptyState();
}

/** The haunted empty state haunts only until the first file is analyzed. */
function hideEmptyState(): void {
  const node = $('empty-state');
  if (node) node.hidden = true;
}

// Top-of-window progress line: shown while decoding/analyzing, fades out
// shortly after reaching 100%.
let progressHideTimer = 0;

function setProgress(fraction: number): void {
  const bar = $('progress-bar');
  if (!bar) return;
  clearTimeout(progressHideTimer);
  if (fraction <= 0) {
    // Jump back to 0 instantly (no backwards slide), then show the line.
    bar.classList.add('reset');
    bar.style.width = '0%';
    void bar.offsetWidth; // flush so the reset applies before re-enabling transitions
    bar.classList.remove('reset');
    bar.classList.add('active');
    return;
  }
  bar.classList.add('active');
  bar.style.width = `${Math.round(fraction * 100)}%`;
  if (fraction >= 1) {
    progressHideTimer = window.setTimeout(() => bar.classList.remove('active'), 400);
  }
}

/** Hide the progress line without filling it (decode/analysis failed). */
function hideProgress(): void {
  clearTimeout(progressHideTimer);
  $('progress-bar')?.classList.remove('active');
}

// --- Worker -----------------------------------------------------------------

function ensureWorker(): Worker {
  if (worker) return worker;
  // Locked Vite module-worker syntax.
  worker = new Worker(new URL('./audio/stft-worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent) => {
    onWorkerMessage(ev.data as WorkerMessage);
  };
  worker.onerror = (e) => {
    console.error('worker error:', e.message);
    toast(`Analysis error: ${e.message}`, 'error');
    hideProgress();
    setVerdict('');
    teardownWorker();
  };
  return worker;
}

function teardownWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function onWorkerMessage(msg: WorkerMessage): void {
  if (msg.type === 'progress') {
    setProgress(msg.fraction);
    setVerdictPending(`Analyzing… ${Math.round(msg.fraction * 100)}%`);
  } else if (msg.type === 'result') {
    const grid: DbGrid = { data: msg.data, frames: msg.frames, bins: msg.bins };
    const desktop = window.spectregramDesktop;
    if (desktop) void desktop.reportSpectrogramState(true);
    setProgress(1);
    setVerdictPending('Estimating cutoff…');
    // Paint immediately: the grid is already computed, so the pixels land in the
    // same task its result arrived in. The cutoff pass runs in the worker and
    // arrives as its own message, so it never delays the graph and never blocks
    // the UI thread (its per-bin percentile sort measures ~160 ms).
    fullGrid = grid;
    const ctx = spectrogramCtx();
    if (ctx) renderSpectrogram(ctx, grid);
  } else if (msg.type === 'verdict') {
    setVerdict(msg.verdict);
  } else if (msg.type === 'zoom-result') {
    onZoomResult(msg.id, { data: msg.data, frames: msg.frames, bins: msg.bins });
  } else if (msg.type === 'zoom-error') {
    console.error('zoom error:', msg.message);
    onZoomResult(msg.id, null);
    toast(`Zoom failed: ${msg.message}`, 'error');
  } else if (msg.type === 'error') {
    console.error('analysis error:', msg.message);
    toast(`Analysis error: ${msg.message}`, 'error');
    hideProgress();
    setVerdict('');
    const desktop = window.spectregramDesktop;
    if (desktop) void desktop.reportSpectrogramState(false);
    teardownWorker();
  }
}

// --- File intake ------------------------------------------------------------

async function handleFile(file: File): Promise<void> {
  // Cancel any in-flight analysis and playback before starting fresh.
  teardownWorker();
  stopPlayback();
  resetZoomState();
  const dot = file.name.lastIndexOf('.');
  currentBaseName = dot > 0 ? file.name.slice(0, dot) : file.name || 'spectregram';
  setVerdictPending('Decoding…');
  setProgress(0);
  const desktop = window.spectregramDesktop;
  if (desktop) void desktop.reportSpectrogramState(false);

  const res: DecodeResult = await decodeFile(file);
  if (!res.ok) {
    console.warn('decode failed:', res.message);
    setFacts(null);
    toast(res.message, 'error');
    hideProgress();
    setVerdict('');
    return;
  }

  audioBuffer = res.buffer;
  sampleRate = res.facts.sampleRate;
  setFacts(res.facts);
  setVerdictPending('Analyzing… 0%');
  setFreqRuler(sampleRate);
  setTimeRuler(0, res.facts.durationSec);
  // Show the current file in the window title bar.
  const shortName = file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name;
  document.title = `SpectreGram — ${shortName}`;

  // Adaptive hop: cap the frame count near the display width (1024 px) so long
  // tracks don't waste FFTs on columns that get downscaled away. Short tracks
  // keep the default 50% overlap for time resolution.
  const TARGET_FRAMES = 1024;
  const baseHop = DEFAULT_STFT.hopSize;
  const fftSize = DEFAULT_STFT.fftSize;
  const framesAtBase = Math.floor((res.mono.length - fftSize) / baseHop) + 1;
  const hopSize = framesAtBase > TARGET_FRAMES
    ? Math.max(baseHop, Math.ceil((res.mono.length - fftSize) / (TARGET_FRAMES - 1)))
    : baseHop;
  const params = { ...DEFAULT_STFT, hopSize };

  const w = ensureWorker();
  const req: AnalyzeRequest = {
    type: 'analyze',
    samples: res.mono,
    params,
    sampleRate: res.facts.sampleRate,
    claimedFormat: res.facts.format,
  };
  // Transfer the mono buffer (we keep the AudioBuffer for playback separately).
  w.postMessage(req, [res.mono.buffer]);
}

function setupWindowDrop(): void {
  // Whole-app drag & drop: accept a file dropped anywhere on the window.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragenter', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });
}

function setupIntake(): void {
  const input = el<HTMLInputElement>('file-input');
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void handleFile(file);
    input.value = ''; // allow re-picking the same file
  });
}

// --- Controls ---------------------------------------------------------------

const PALETTE_CYCLE: ReadonlyArray<{ name: PaletteName; label: string }> = [
  { name: 'spectrum', label: 'Palette: Spectrum' },
  { name: 'hellfire', label: 'Palette: Hellfire' },
  { name: 'ectoplasm', label: 'Palette: Ectoplasm' },
  { name: 'pumpkin', label: 'Palette: Pumpkin' },
];

/** Palette button: gradient thumbnail of the active palette + tooltip/label. */
function updatePaletteButton(): void {
  const btn = $('palette-toggle');
  const swatch = $('palette-swatch');
  const active = getActivePaletteName();
  const entry = PALETTE_CYCLE.find((p) => p.name === active) ?? PALETTE_CYCLE[0];
  const label = `${entry.label} (click to change)`;
  if (btn) {
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  if (swatch) swatch.style.background = paletteGradientCss(active);
}

function setupPaletteToggle(): void {
  const btn = $('palette-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const idx = PALETTE_CYCLE.findIndex((p) => p.name === getActivePaletteName());
    const next = PALETTE_CYCLE[(idx + 1) % PALETTE_CYCLE.length];
    setActivePalette(next.name);
    updateLegend();
    updatePaletteButton();
  });
  updatePaletteButton();
}

function savePngFromCanvas(): Promise<boolean> {
  const canvas = el<HTMLCanvasElement>('canvas');
  if (!canvas) return Promise.resolve(false);
  const fileName = `${currentBaseName}-spectrogram.png`;
  // Desktop: native save dialog via the preload bridge. Web: download.
  const desktop = window.spectregramDesktop;
  if (desktop) {
    return exportPng(canvas)
      .then((blob) => blob.arrayBuffer())
      .then((ab) => desktop.savePng(ab, fileName));
  }
  return exportPng(canvas).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  });
}

function setupPng(): void {
  const btn = $('png-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      const saved = await savePngFromCanvas();
      toast(saved ? `Saved ${currentBaseName}-spectrogram.png` : 'Save cancelled.');
    } catch (e) {
      console.error('export failed:', e);
      toast('Export failed.', 'error');
    }
  });
}

/** File > Save menu: paint the spectrogram PNG and save it through the bridge. */
function setupMenuSave(): void {
  const desktop = window.spectregramDesktop;
  if (!desktop) return;
  desktop.onSavePng(async () => {
    try {
      const saved = await savePngFromCanvas();
      toast(saved ? `Saved ${currentBaseName}-spectrogram.png` : 'Save cancelled.');
    } catch (e) {
      console.error('export failed:', e);
      toast('Export failed.', 'error');
    }
  });
}

/** Folder panel: list audio files from an opened folder; clicking one opens it. */
function setupFolderPanel(): void {
  const desktop = window.spectregramDesktop;
  if (!desktop) return;
  const box = el<HTMLElement>('spectrogram-box');
  const panel = el<HTMLElement>('folder-panel');
  const list = el<HTMLUListElement>('folder-list');
  const nameNode = el<HTMLSpanElement>('folder-name');
  if (!box || !panel || !list || !nameNode) return;

  let selectedLi: HTMLElement | null = null;
  desktop.onFolderLoaded(({ folderName, files }) => {
    nameNode.textContent = folderName;
    list.replaceChildren();
    selectedLi = null;
    for (const { path: filePath, name } of files) {
      const li = document.createElement('li');
      li.textContent = name;
      li.tabIndex = 0;
      const open = () => void desktop.openFolderFile(filePath);
      li.addEventListener('click', () => {
        selectLi(li);
        open();
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          selectLi(li);
          open();
        }
      });
      list.appendChild(li);
    }

    function selectLi(li: HTMLElement): void {
      if (selectedLi) selectedLi.classList.remove('selected');
      selectedLi = li;
      li.classList.add('selected');
    }
    panel.hidden = false;
    box.classList.add('folder-open');
    document.querySelector('main')?.classList.add('folder-open');
    toast(`Folder "${folderName}" — ${files.length} audio file${files.length !== 1 ? 's' : ''}`);
  });
}

// Desktop only: files opened with / passed to the app arrive as paths. Read
// the bytes through the bridge and hand them to the exact same handleFile
// path as a drop or pick (wrapped in a File), so analysis is identical.
function setupDesktopOpenFile(): void {
  const desktop = window.spectregramDesktop;
  if (!desktop) return;
  desktop.onOpenFile((filePath) => {
    void (async () => {
      try {
        const buffer = await desktop.readFile(filePath);
        const name = filePath.split(/[\\/]/).pop() ?? 'audio';
        await handleFile(new File([buffer], name));
      } catch (e) {
        console.error('open-file failed:', e);
        toast('Could not open that file.', 'error');
      }
    })();
  });
}

// --- Cursor crosshair + live readout over the spectrogram --------------------

function setupCrosshair(): void {
  const wrap = el<HTMLElement>('canvas-wrap');
  const v = el<HTMLDivElement>('crosshair-v');
  const h = el<HTMLDivElement>('crosshair-h');
  const label = el<HTMLDivElement>('cursor-label');
  if (!wrap || !v || !h || !label) return;

  wrap.addEventListener('mousemove', (e) => {
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = Math.max(0, Math.min(1, x / rect.width));
    const py = Math.max(0, Math.min(1, y / rect.height));

    const nyq = sampleRate / 2;
    const r = viewRange();
    const span = r.end - r.start;
    const time = r.start + px * span;
    const freq = nyq * (1 - py);

    // Finer readout as the view narrows (≈1 ms per pixel at the minimum zoom).
    const tStr = fmtTime(time, span <= 2 ? 3 : span <= 20 ? 2 : 1);
    const fStr = freq >= 1000 ? `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)} k` : `${Math.round(freq)} Hz`;

    v.style.display = 'block';
    h.style.display = 'block';
    v.style.left = `${x}px`;
    h.style.top = `${y}px`;
    label.textContent = `${tStr} · ${fStr}`;
    label.style.display = 'block';
    label.style.left = `${Math.min(x + 10, rect.width - 140)}px`;
    label.style.top = `${Math.max(y - 26, 4)}px`;
  });
  wrap.addEventListener('mouseleave', () => {
    v.style.display = 'none';
    h.style.display = 'none';
    label.style.display = 'none';
  });
}

// --- Zoom: drag across the spectrogram to view a time segment ----------------
//
// The zoomed view is re-analyzed in the worker (computeStftSegment) at about
// one column per canvas pixel, so it shows real detail rather than a
// stretched overview. Frequency stays full-range; only time zooms.

/**
 * Minimum zoom span, in STFT windows. Detail shorter than one window
 * (2048 samples ≈ 46 ms at 44.1 kHz) cannot be resolved, so zooming further
 * only widens the smear. At 20 windows each one spans ≤ 5% of the view:
 * ≈ 0.93 s at 44.1 kHz, ≈ 0.85 s at 48 kHz. TUNABLE.
 */
const MIN_ZOOM_WINDOWS = 20;
/** Columns computed for a zoomed view — matches render.ts's canvas width. */
const ZOOM_COLUMNS = 1024;
/** A drag narrower than this many pixels is treated as a click, not a zoom. */
const DRAG_MIN_PX = 4;

interface TimeView {
  start: number;
  end: number;
}

/** The full-track grid, kept so "Reset zoom" can redraw without recomputing. */
let fullGrid: DbGrid | null = null;
/** Visible time range in seconds; null = the whole track. */
let view: TimeView | null = null;
let zoomReqId = 0;
let zoomBusy = false;
let zoomQueued = false;

function trackDuration(): number {
  return audioBuffer ? audioBuffer.duration : 0;
}

function viewRange(): TimeView {
  return view ?? { start: 0, end: trackDuration() };
}

function minZoomSec(): number {
  return sampleRate > 0 ? (MIN_ZOOM_WINDOWS * DEFAULT_STFT.fftSize) / sampleRate : 1;
}

function spectrogramCtx(): CanvasRenderingContext2D | null {
  const canvas = el<HTMLCanvasElement>('canvas');
  return canvas ? canvas.getContext('2d') : null;
}

/** Forget any zoom (a new file is loading). */
function resetZoomState(): void {
  fullGrid = null;
  view = null;
  zoomReqId++;
  zoomBusy = false;
  zoomQueued = false;
  updateZoomChrome();
}

/** Show/hide the reset button and position the scroll indicator. */
function updateZoomChrome(): void {
  const btn = el<HTMLButtonElement>('zoom-reset');
  const thumb = $('zoom-thumb');
  const dur = trackDuration();
  if (btn) {
    btn.hidden = view === null;
    if (view) {
      btn.title = `Reset zoom (showing ${fmtTime(view.start, 2)} – ${fmtTime(view.end, 2)}) · Esc`;
    }
  }
  if (thumb) {
    thumb.hidden = view === null || !(dur > 0);
    if (view && dur > 0) {
      thumb.style.left = `${(view.start / dur) * 100}%`;
      thumb.style.width = `${((view.end - view.start) / dur) * 100}%`;
    }
  }
}

/** Switch the visible range: rulers and chrome update now, pixels when the worker answers. */
function applyView(next: TimeView | null): void {
  view = next;
  const r = viewRange();
  setTimeRuler(r.start, r.end, view === null);
  updateZoomChrome();
  if (view) {
    requestZoomGrid();
  } else {
    zoomReqId++; // drop any in-flight zoom result
    zoomQueued = false;
    const ctx = spectrogramCtx();
    if (ctx && fullGrid) renderSpectrogram(ctx, fullGrid);
  }
}

/**
 * Ask the worker for the current view's grid. At most one request is in
 * flight; scrolling while one is busy just marks the view dirty, and the
 * latest view is requested when the current one lands.
 */
function requestZoomGrid(): void {
  if (!view || !worker || !(sampleRate > 0)) return;
  if (zoomBusy) {
    zoomQueued = true;
    return;
  }
  zoomBusy = true;
  const req: ZoomRequest = {
    type: 'zoom',
    id: ++zoomReqId,
    startSample: view.start * sampleRate,
    endSample: view.end * sampleRate,
    columns: ZOOM_COLUMNS,
  };
  worker.postMessage(req);
}

function onZoomResult(id: number, grid: DbGrid | null): void {
  zoomBusy = false;
  // Paint even if a newer view is queued: during continuous scrolling this
  // keeps the picture moving instead of freezing until the wheel stops.
  if (grid && id === zoomReqId && view) {
    const ctx = spectrogramCtx();
    if (ctx) renderSpectrogram(ctx, grid);
  }
  if (zoomQueued) {
    zoomQueued = false;
    requestZoomGrid();
  }
}

/** Zoom to [t0, t1] seconds, widened to the minimum span if needed. */
function zoomTo(t0: number, t1: number): void {
  const dur = trackDuration();
  const min = minZoomSec();
  if (!fullGrid || !(dur > 0)) return;
  if (dur <= min) {
    toast(`Track is shorter than the ${fmtTime(min, 2)} minimum zoom.`);
    return;
  }
  let a = Math.max(0, Math.min(t0, t1));
  let b = Math.min(dur, Math.max(t0, t1));
  // Already at the minimum span: a smaller selection can't zoom further, so
  // keep the view where it is (re-centering here would read as a jump).
  if (view && view.end - view.start <= min * 1.001 && b - a < view.end - view.start) {
    toast(`That's the minimum zoom (${fmtTime(min, 2)})`);
    return;
  }
  if (b - a < min) {
    const c = (a + b) / 2;
    a = c - min / 2;
    b = c + min / 2;
    if (a < 0) {
      b -= a;
      a = 0;
    }
    if (b > dur) {
      a -= b - dur;
      b = dur;
    }
    a = Math.max(0, a);
    toast(`Zoomed to the ${fmtTime(min, 2)} minimum`);
  }
  // A selection covering (almost) the whole track is just the full view.
  if (b - a >= dur * 0.999) {
    applyView(null);
    return;
  }
  applyView({ start: a, end: b });
}

/** Scroll the zoomed view by `dt` seconds, clamped to the track. */
function panBy(dt: number): void {
  if (!view) return;
  const dur = trackDuration();
  const span = view.end - view.start;
  const start = Math.max(0, Math.min(dur - span, view.start + dt));
  if (start === view.start) return;
  applyView({ start, end: start + span });
}

function setupZoom(): void {
  const wrap = el<HTMLElement>('canvas-wrap');
  const sel = el<HTMLDivElement>('zoom-select');
  const btn = el<HTMLButtonElement>('zoom-reset');
  if (!wrap || !sel || !btn) return;

  let dragX0 = -1;
  let dragId = -1;
  const xIn = (e: PointerEvent): number => {
    const rect = wrap.getBoundingClientRect();
    return Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  };
  const endDrag = (): void => {
    if (dragId >= 0 && wrap.hasPointerCapture(dragId)) wrap.releasePointerCapture(dragId);
    dragX0 = -1;
    dragId = -1;
    sel.style.display = 'none';
  };

  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !fullGrid) return;
    if ((e.target as HTMLElement).closest('#zoom-reset')) return;
    e.preventDefault();
    dragX0 = xIn(e);
    dragId = e.pointerId;
    wrap.setPointerCapture(e.pointerId);
    sel.style.left = `${dragX0}px`;
    sel.style.width = '0px';
    sel.style.display = 'block';
  });
  wrap.addEventListener('pointermove', (e) => {
    if (dragX0 < 0 || e.pointerId !== dragId) return;
    const x = xIn(e);
    sel.style.left = `${Math.min(dragX0, x)}px`;
    sel.style.width = `${Math.abs(x - dragX0)}px`;
  });
  wrap.addEventListener('pointerup', (e) => {
    if (dragX0 < 0 || e.pointerId !== dragId) return;
    const x0 = dragX0;
    const x1 = xIn(e);
    const width = wrap.getBoundingClientRect().width;
    endDrag();
    if (Math.abs(x1 - x0) < DRAG_MIN_PX || !(width > 0)) return; // a click, not a drag
    const r = viewRange();
    const span = r.end - r.start;
    zoomTo(r.start + (x0 / width) * span, r.start + (x1 / width) * span);
  });
  wrap.addEventListener('pointercancel', endDrag);

  // Mouse wheel / trackpad scrolls the zoomed view horizontally.
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (!view) return;
      e.preventDefault();
      const width = wrap.getBoundingClientRect().width;
      if (!(width > 0)) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === 1 ? d * 16 : e.deltaMode === 2 ? d * width : d;
      panBy((px / width) * (view.end - view.start));
    },
    { passive: false },
  );

  btn.addEventListener('click', () => applyView(null));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dragX0 >= 0) endDrag();
    else if (view) applyView(null);
  });
}

// --- Playhead (optional, guardrailed) ---------------------------------------

function playbackCtor(): typeof AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext || w.webkitAudioContext || null;
}

function startPlayback(): void {
  if (!audioBuffer) return;
  stopPlayback();
  const Ctor = playbackCtor();
  if (!Ctor) return;
  if (!playCtx) playCtx = new Ctor();
  if (playCtx.state === 'suspended') void playCtx.resume();

  playSource = playCtx.createBufferSource();
  playSource.buffer = audioBuffer;
  playSource.connect(playCtx.destination);
  playSource.onended = () => stopPlayback();
  playStartCtxTime = playCtx.currentTime;
  playSource.start();
  isPlaying = true;
  updatePlayButton();
  rafLoop();
}

function stopPlayback(): void {
  if (playSource) {
    try {
      playSource.stop();
    } catch {
      /* already stopped */
    }
    playSource.disconnect();
    playSource = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  isPlaying = false;
  updatePlayButton();
  movePlayhead(0, false);
}

function rafLoop(): void {
  if (!isPlaying || !playCtx || !audioBuffer) return;
  const elapsed = playCtx.currentTime - playStartCtxTime;
  if (elapsed >= audioBuffer.duration) {
    stopPlayback();
    return;
  }
  movePlayhead(elapsed, true);
  rafId = requestAnimationFrame(rafLoop);
}

/** Place the playhead at `timeSec`; hidden when outside the visible range. */
function movePlayhead(timeSec: number, visible: boolean): void {
  const ph = $('playhead');
  const wrap = $('canvas-wrap');
  if (!ph || !wrap) return;
  const r = viewRange();
  const span = r.end - r.start;
  const inView = span > 0 && timeSec >= r.start && timeSec <= r.end;
  ph.style.display = visible && inView ? 'block' : 'none';
  if (inView) ph.style.left = `${(((timeSec - r.start) / span) * wrap.clientWidth).toFixed(1)}px`;
}

/** Play/stop toggle: icon, tooltip and label follow the playback state. */
function updatePlayButton(): void {
  const btn = $('play-btn');
  if (!btn) return;
  const label = isPlaying ? 'Stop' : 'Play';
  btn.classList.toggle('playing', isPlaying);
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

function setupPlay(): void {
  $('play-btn')?.addEventListener('click', () => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  });
  updatePlayButton();
}

// --- Screensaver --------------------------------------------------------------

// Idle screensaver: after this long with no user input, the ghost takes
// over the whole window (screensaver.mp4, reframed to the window's aspect)
// until the next input arrives.
const IDLE_MS = 60_000;

// After a manual "Show Screensaver", ignore input this long so the mouse
// movement from closing the menu doesn't dismiss it instantly.
const MANUAL_SHOW_GRACE_MS = 800;

interface ScreensaverControls {
  /** Turn the idle timer on/off (Options > Disable Screensaver). */
  setEnabled(enabled: boolean): void;
  /** Show it right now, even when the idle timer is disabled. */
  showNow(): void;
}

function setupScreensaver(): ScreensaverControls | null {
  const overlay = $('screensaver');
  const video = el<HTMLVideoElement>('screensaver-video');
  if (!overlay || !video) return null;
  let timer = 0;
  let enabled = true;
  let ignoreUntil = 0;
  const show = (): void => {
    overlay.hidden = false;
    void video.play().catch(() => undefined);
  };
  const hide = (): void => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    video.pause();
  };
  const arm = (): void => {
    window.clearTimeout(timer);
    if (enabled) timer = window.setTimeout(show, IDLE_MS);
  };
  const onActivity = (): void => {
    if (performance.now() < ignoreUntil) return;
    hide();
    arm();
  };
  for (const evt of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'drop']) {
    window.addEventListener(evt, onActivity, { passive: true });
  }
  arm();
  return {
    setEnabled(next) {
      enabled = next;
      if (!enabled) hide();
      arm();
    },
    showNow() {
      ignoreUntil = performance.now() + MANUAL_SHOW_GRACE_MS;
      window.clearTimeout(timer);
      show();
    },
  };
}

/** Desktop Options menu: screensaver toggle + development helpers. */
function setupMenuActions(screensaver: ScreensaverControls | null): void {
  const desktop = window.spectregramDesktop;
  if (!desktop) return;
  desktop.onMenuAction((action, value) => {
    if (action === 'screensaver-enabled') {
      screensaver?.setEnabled(value === true);
      toast(value === true ? 'Screensaver enabled' : 'Screensaver disabled');
    } else if (action === 'show-screensaver') {
      screensaver?.showNow();
    } else if (action === 'toast') {
      const v = value as { message?: unknown; kind?: unknown } | undefined;
      if (typeof v?.message === 'string') toast(v.message, v.kind === 'error' ? 'error' : 'info');
    }
  });
}

// --- Init -------------------------------------------------------------------

function init(): void {
  setupIntake();
  setupPaletteToggle();
  setupPng();
  setupMenuSave();
  setupFolderPanel();
  setupPlay();
  setupDesktopOpenFile();
  setupCrosshair();
  setupZoom();
  setupWindowDrop();
  setupDbRangeKeys();
  setupMenuActions(setupScreensaver());
  updateLegend();
  window.addEventListener('beforeunload', () => {
    teardownWorker();
    stopPlayback();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
