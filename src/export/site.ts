import template from './runtime.html?raw';
import type { Project } from '../model';
import { getBlob } from '../storage';
import { makeZip } from './zip';

function extension(type: string): string {
  const mime = type.toLowerCase();
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/avif') return 'avif';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/bmp') return 'bmp';
  throw new Error(`网页导出暂不支持 ${type || '未知格式'} 图片；请转换为 PNG 或 WebP。`);
}

export async function exportStaticSite(project: Project): Promise<Blob> {
  const media: Record<string, string> = {};
  const entries: { name: string; data: Blob }[] = [];
  const used = new Set(project.scenes.flatMap(scene => [scene.textureAssetId, ...scene.frameAssetIds].filter((id): id is string => !!id)));
  for (const asset of project.assets.filter(item => used.has(item.id))) {
    const blob = await getBlob(asset.id);
    if (!blob) throw new Error(`素材缺失：${asset.name}`);
    const path = `assets/${asset.id}.${extension(asset.type)}`;
    media[asset.id] = path;
    entries.push({ name: path, data: blob });
  }
  const json = JSON.stringify({ project, media }).replace(/</g, '\\u003c');
  const html = template.replace('__FRAMEFLOW_PROJECT_JSON__', json);
  const instructions = `Frameflow 静态网页\n\n1. 解压这个 ZIP。\n2. 在解压目录运行 python3 -m http.server 8000，然后访问 http://127.0.0.1:8000/ 预览。正式交付时把 index.html 和 assets 文件夹一起上传到静态托管服务。\n3. 鼠标滚轮、触控板上下滑、手机上下滑、键盘方向键可切页。右下角“继续下滑”只是提示，不是按钮。\n4. index.html 是展示网页，不是可编辑项目包。继续编辑请保存并导入工作台导出的 .frameflow。\n5. 发布前检查素材使用许可、电脑和手机尺寸、图片加载速度。\n`;
  return makeZip([
    { name: 'index.html', data: new Blob([html], { type: 'text/html;charset=utf-8' }) },
    { name: 'README.txt', data: new Blob([instructions], { type: 'text/plain;charset=utf-8' }) },
    ...entries,
  ]);
}
