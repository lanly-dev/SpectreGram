// SpectreGram wiring. Owns DOM, file intake, AudioContext lifecycle for
// playback, the single worker instance, and module-level UI state. Direct
// DOM — no framework. Privacy invariant: no fetch/XHR/WebSocket anywhere.

import { decodeFile, type DecodeResult, type FileFacts } from './audio/decode';
import { analyze } from './audio/cutoff';
import { renderSpectrogram, setActivePalette, exportPng, getActivePaletteName, type PaletteName } from './render';
import { DEFAULT_STFT, type DbGrid } from './audio/stft';
import type { AnalyzeRequest, WorkerMessage } from './audio/stft-worker';

// Tick step candidates for the rulers. The spectrogram's frequency axis is
// LINEAR, so frequency ticks must be evenly spaced in Hz: log-spaced values
// (100/200/500/…) pile a dozen labels into the bottom tenth of the ruler.
// Steps are picked per file so the label count stays small and readable.
const FREQ_STEPS = [500, 1000, 2000, 2500, 5000, 10000, 20000];
// Time tick step candidates (seconds) for the bottom ruler.
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

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

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
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

/** Paint time tick labels on the bottom ruler (major marks only). */
function setTimeRuler(duration: number): void {
  const ruler = $('ruler-bottom');
  if (!ruler) return;
  if (!(duration > 0)) {
    ruler.innerHTML = '';
    return;
  }
  const step = pickStep(TIME_STEPS, duration, 6);
  const values: number[] = [];
  for (let t = 0; t < duration; t += step) values.push(t);
  // Always label the total duration at the right edge — unless it would
  // crowd the last step tick.
  if (duration - values[values.length - 1] >= step * 0.5) values.push(duration);
  const html = values
    .map((t) => {
      const pct = (t / duration) * 100;
      // Center the label on its value; clamp the two edge labels fully
      // inside the ruler so they never overflow left/right.
      const tx = pct <= 0 ? '0' : pct >= 100 ? '-100%' : '-50%';
      return `<div class="tick" style="left:${pct}%;transform:translateX(${tx});">${fmtTime(t)}</div>`;
    })
    .join('');
  ruler.innerHTML = html;
}

// Module-level state so a palette switch can re-render without recomputing.
let worker: Worker | null = null;
let audioBuffer: AudioBuffer | null = null;
let sampleRate = 0;
let claimedFormat = 'Unknown';
let lastGrid: DbGrid | null = null;
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

function setFacts(facts: FileFacts | null): void {
  const node = $('facts');
  if (!node) return;
  node.replaceChildren();
  if (!facts) return;
  const rows: Array<[string, string]> = [
    ['Format', facts.format],
    ['Duration', `${facts.durationSec.toFixed(2)} s`],
    ['Sample rate', `${facts.sampleRate} Hz`],
    ['Channels', String(facts.channels)],
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

function setStatus(text: string): void {
  const node = $('status');
  if (node) node.textContent = text;
}

// The verdict line only ever holds a real estimate verdict (or is empty while
// working). Transient status and errors go to #status so the "estimate"
// invariant on the verdict line is never muddied.
function setVerdict(text: string): void {
  const node = $('verdict');
  if (node) node.textContent = text;
}

function setProgress(fraction: number): void {
  const bar = $('progress-bar');
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
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
    setStatus(`Analysis error: ${e.message}`);
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
    setStatus(`Analyzing… ${Math.round(msg.fraction * 100)}%`);
  } else if (msg.type === 'result') {
    const grid: DbGrid = { data: msg.data, frames: msg.frames, bins: msg.bins };
    lastGrid = grid;
    const desktop = window.spectregramDesktop;
    if (desktop) void desktop.reportSpectrogramState(true);
    setProgress(1);
    const { cutoff, verdict } = analyze(grid, sampleRate, claimedFormat);
    setVerdict(verdict);
    setStatus(`Cutoff estimate ≈ ${(cutoff.cutoffHz / 1000).toFixed(1)} kHz`);
    const canvas = el<HTMLCanvasElement>('canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) renderSpectrogram(ctx, grid);
    }
  } else if (msg.type === 'error') {
    console.error('analysis error:', msg.message);
    setStatus(`Analysis error: ${msg.message}`);
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
  const dot = file.name.lastIndexOf('.');
  currentBaseName = dot > 0 ? file.name.slice(0, dot) : file.name || 'spectregram';
  setVerdict('');
  setProgress(0);
  setStatus('Decoding…');
  const desktop = window.spectregramDesktop;
  if (desktop) void desktop.reportSpectrogramState(false);

  const res: DecodeResult = await decodeFile(file);
  if (!res.ok) {
    console.warn('decode failed:', res.message);
    setFacts(null);
    setStatus(res.message);
    return;
  }

  audioBuffer = res.buffer;
  sampleRate = res.facts.sampleRate;
  claimedFormat = res.facts.format;
  setFacts(res.facts);
  setStatus('Analyzing…');
  setFreqRuler(sampleRate);
  setTimeRuler(res.facts.durationSec);
  // Show the current file in the window title bar.
  const shortName = file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name;
  document.title = `SpectreGram — ${shortName}`;

  const w = ensureWorker();
  const req: AnalyzeRequest = { type: 'analyze', samples: res.mono, params: DEFAULT_STFT };
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
];

function setupPaletteToggle(): void {
  const btn = $('palette-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const idx = PALETTE_CYCLE.findIndex((p) => p.name === getActivePaletteName());
    const next = PALETTE_CYCLE[(idx + 1) % PALETTE_CYCLE.length];
    setActivePalette(next.name);
    btn.textContent = next.label;
  });
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
      setStatus(saved ? `Saved ${currentBaseName}-spectrogram.png` : 'Save cancelled.');
    } catch (e) {
      console.error('export failed:', e);
      setStatus('Export failed.');
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
      setStatus(saved ? `Saved ${currentBaseName}-spectrogram.png` : 'Save cancelled.');
    } catch (e) {
      console.error('export failed:', e);
      setStatus('Export failed.');
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
    setStatus(`Folder "${folderName}" — ${files.length} audio file${files.length !== 1 ? 's' : ''}`);
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
        setStatus('Could not open that file.');
      }
    })();
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
  movePlayhead(0, false);
}

function rafLoop(): void {
  if (!isPlaying || !playCtx || !audioBuffer) return;
  const elapsed = playCtx.currentTime - playStartCtxTime;
  const frac = Math.min(1, elapsed / audioBuffer.duration);
  movePlayhead(frac, true);
  if (frac >= 1) {
    stopPlayback();
    return;
  }
  rafId = requestAnimationFrame(rafLoop);
}

function movePlayhead(frac: number, visible: boolean): void {
  const ph = $('playhead');
  const wrap = $('canvas-wrap');
  if (!ph || !wrap) return;
  ph.style.display = visible ? 'block' : 'none';
  ph.style.left = `${(frac * wrap.clientWidth).toFixed(1)}px`;
}

function setupPlay(): void {
  $('play-btn')?.addEventListener('click', startPlayback);
  $('stop-btn')?.addEventListener('click', stopPlayback);
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
  setupWindowDrop();
  setStatus('Drop an audio file or pick one to begin.');
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
