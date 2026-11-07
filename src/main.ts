// SpectreGram wiring. Owns DOM, file intake, AudioContext lifecycle for
// playback, the single worker instance, and module-level UI state. Direct
// DOM — no framework. Privacy invariant: no fetch/XHR/WebSocket anywhere.

import { decodeFile, type DecodeResult, type FileFacts } from './audio/decode';
import { analyze } from './audio/cutoff';
import { renderSpectrogram, setActivePalette, exportPng, getActivePaletteName, type PaletteName } from './render';
import { DEFAULT_STFT, type DbGrid } from './audio/stft';
import type { AnalyzeRequest, WorkerMessage } from './audio/stft-worker';

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

  const w = ensureWorker();
  const req: AnalyzeRequest = { type: 'analyze', samples: res.mono, params: DEFAULT_STFT };
  // Transfer the mono buffer (we keep the AudioBuffer for playback separately).
  w.postMessage(req, [res.mono.buffer]);
}

function setupIntake(): void {
  const dropzone = $('dropzone');
  const input = el<HTMLInputElement>('file-input');
  if (dropzone && input) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      const file = e.dataTransfer?.files?.[0];
      if (file) void handleFile(file);
    });
    // Keyboard: open the picker from the drop zone.
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    dropzone.addEventListener('click', (e) => {
      // Avoid double-triggering when the Pick button itself is clicked.
      if ((e.target as HTMLElement).closest('button')) return;
      input.click();
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void handleFile(file);
      input.value = ''; // allow re-picking the same file
    });
  }
}

// --- Controls ---------------------------------------------------------------

function setupPaletteToggle(): void {
  const btn = $('palette-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next: PaletteName = getActivePaletteName() === 'hellfire' ? 'ectoplasm' : 'hellfire';
    setActivePalette(next);
    btn.textContent = next === 'hellfire' ? 'Palette: Hellfire' : 'Palette: Ectoplasm';
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
  setupPlay();
  setupDesktopOpenFile();
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
