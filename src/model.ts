export type Device = 'desktop' | 'mobile';
export type TransitionPreset = 'wave' | 'circle' | 'slide' | 'fade';
export type SlideDirection = 'left' | 'right' | 'up' | 'down';

export interface Box { x: number; y: number; width: number; height: number }
export interface SceneLayout { character: Box; text: Box }
export interface Transition {
  preset: TransitionPreset;
  durationMs: number;
  direction: SlideDirection;
  originX: number;
  originY: number;
}
export interface Scene {
  id: string;
  name: string;
  title: string;
  body: string;
  background: string;
  textureAssetId: string | null;
  frameAssetIds: string[];
  fps: number;
  blendMode: 'normal' | 'multiply';
  transition: Transition;
  characterStartMs: number;
  textStartMs: number;
  layouts: Record<Device, SceneLayout>;
}
export interface AssetMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
}
export interface Project {
  version: 1;
  name: string;
  theme: { ink: string; accent: string; font: 'serif' | 'sans' };
  scenes: Scene[];
  assets: AssetMeta[];
  updatedAt: string;
}

export const dimensions: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const makeLayout = (device: Device): SceneLayout => device === 'desktop'
  ? { character: { x: 75, y: 225, width: 520, height: 600 }, text: { x: 735, y: 270, width: 565, height: 330 } }
  : { character: { x: 0, y: 340, width: 350, height: 440 }, text: { x: 30, y: 115, width: 330, height: 205 } };

export function makeScene(index: number): Scene {
  const colors = ['#f0e3ce', '#ee3469', '#e4a936', '#e8dbca'];
  return {
    id: crypto.randomUUID(),
    name: index === 0 ? '序幕' : `第 ${index} 幕`,
    title: index === 0 ? '让故事开始流动' : index === 1 ? '第一段故事' : `第 ${index} 段故事`,
    body: index === 0 ? '滚动页面，查看场景如何展开。\n选中右侧属性即可改写内容。' : '在这里写这一屏的正文。\n人物、背景和文字都可以单独安排时间。',
    background: colors[index % colors.length],
    textureAssetId: null,
    frameAssetIds: [],
    fps: 18,
    blendMode: 'multiply',
    transition: {
      preset: index % 3 === 1 ? 'wave' : index % 3 === 2 ? 'circle' : 'slide',
      durationMs: 1100,
      direction: 'left', originX: 46, originY: 52,
    },
    characterStartMs: 0,
    textStartMs: 650,
    layouts: { desktop: makeLayout('desktop'), mobile: makeLayout('mobile') },
  };
}

export function newProject(): Project {
  return {
    version: 1,
    name: '我的逐帧故事',
    theme: { ink: '#3d1730', accent: '#f04170', font: 'serif' },
    scenes: [makeScene(0), makeScene(1), makeScene(2)],
    assets: [],
    updatedAt: new Date().toISOString(),
  };
}

export function validateProject(input: unknown): input is Project {
  if (!input || typeof input !== 'object') return false;
  const p = input as Partial<Project>;
  const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  const number = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const box = (value: unknown) => {
    if (!value || typeof value !== 'object') return false;
    const b = value as Partial<Box>;
    return number(b.x, -2000, 3000) && number(b.y, -2000, 3000) && number(b.width, 1, 3000) && number(b.height, 1, 3000);
  };
  if (p.version !== 1 || typeof p.name !== 'string' || p.name.length > 200 || !Array.isArray(p.scenes) || !Array.isArray(p.assets)) return false;
  if (!p.theme || !color(p.theme.ink) || !color(p.theme.accent) || !['serif', 'sans'].includes(p.theme.font)) return false;
  if (p.assets.length > 3600) return false;
  const assetIds = new Set<string>();
  for (const asset of p.assets) {
    if (!asset || typeof asset.id !== 'string' || assetIds.has(asset.id) || typeof asset.name !== 'string' || asset.name.length > 300 || typeof asset.type !== 'string') return false;
    if (!number(asset.size, 0, 100_000_000) || !number(asset.width, 1, 10000) || !number(asset.height, 1, 10000)) return false;
    assetIds.add(asset.id);
  }
  const ids = new Set<string>();
  for (const scene of p.scenes) {
    if (!scene || typeof scene.id !== 'string' || ids.has(scene.id) || typeof scene.name !== 'string' || scene.name.length > 200 || typeof scene.title !== 'string' || scene.title.length > 500 || typeof scene.body !== 'string' || scene.body.length > 10000 || !color(scene.background)) return false;
    if (!scene.transition || !['wave', 'circle', 'slide', 'fade'].includes(scene.transition.preset) || !['left', 'right', 'up', 'down'].includes(scene.transition.direction) || !number(scene.transition.durationMs, 100, 10000) || !number(scene.transition.originX, 0, 100) || !number(scene.transition.originY, 0, 100)) return false;
    if (!scene.layouts || !box(scene.layouts.desktop?.character) || !box(scene.layouts.mobile?.character) || !box(scene.layouts.desktop?.text) || !box(scene.layouts.mobile?.text)) return false;
    if (!Array.isArray(scene.frameAssetIds) || scene.frameAssetIds.length > 120 || scene.frameAssetIds.some(id => typeof id !== 'string' || !assetIds.has(id))) return false;
    if (scene.textureAssetId !== null && (typeof scene.textureAssetId !== 'string' || !assetIds.has(scene.textureAssetId))) return false;
    if (!number(scene.fps, 1, 60) || !number(scene.characterStartMs, 0, 10000) || !number(scene.textStartMs, 0, 10000) || !['normal', 'multiply'].includes(scene.blendMode)) return false;
    ids.add(scene.id);
  }
  return p.scenes.length > 0 && p.scenes.length <= 30;
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
