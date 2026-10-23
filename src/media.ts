import type { AssetMeta } from './model';
import { deleteBlob, putBlob } from './storage';

export interface ExtractOptions { start: number; end: number; fps: number; width: number; quality: number }

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const result = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}

export async function storeImage(blob: Blob, name: string): Promise<AssetMeta> {
  const { width, height } = await imageSize(blob);
  const meta: AssetMeta = { id: crypto.randomUUID(), name, type: blob.type || 'image/webp', size: blob.size, width, height };
  await putBlob(meta.id, blob);
  return meta;
}

export function readVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.src = url;
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      const data = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
      URL.revokeObjectURL(url);
      resolve(data);
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取视频。')); };
  });
}

const canvasBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法编码帧图。')), 'image/webp', quality);
});

export async function extractVideoFrames(file: File, options: ExtractOptions, onProgress: (done: number, total: number) => void): Promise<AssetMeta[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  const result: AssetMeta[] = [];
  const waitFor = (event: 'loadedmetadata' | 'seeked') => new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('视频读取或定位失败。')); };
    const cleanup = () => { video.removeEventListener(event, ok); video.removeEventListener('error', bad); };
    video.addEventListener(event, ok, { once: true });
    video.addEventListener('error', bad, { once: true });
  });
  try {
    const loaded = waitFor('loadedmetadata');
    video.src = url;
    await loaded;
    const end = Math.min(options.end, video.duration);
    const count = Math.ceil((end - options.start) * options.fps);
    if (!Number.isFinite(count) || count < 1 || count > 120) throw new Error('抽帧数量应在 1–120 张之间。');
    const scale = options.width / video.videoWidth;
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布。');
    for (let i = 0; i < count; i++) {
      const time = Math.min(end - 0.01, options.start + i / options.fps);
      const seeking = waitFor('seeked');
      video.currentTime = time;
      await seeking;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, options.quality);
      result.push(await storeImage(blob, `${file.name.replace(/\.[^.]+$/, '')}-${String(i + 1).padStart(3, '0')}.webp`));
      onProgress(i + 1, count);
    }
    return result;
  } catch (error) {
    await Promise.all(result.map(asset => deleteBlob(asset.id)));
    throw error;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
