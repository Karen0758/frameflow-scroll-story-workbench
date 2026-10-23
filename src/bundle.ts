import { validateProject, type Project } from './model';
import { getBlob, putBlob } from './storage';

interface Bundle {
  format: 'frameflow-bundle-v1';
  project: Project;
  assets: Record<string, { type: string; base64: string }>;
}

function encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < bytes.length; i += 0x8000) result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(result);
}

function decode(base64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function exportBundle(project: Project): Promise<Blob> {
  const data: Bundle = { format: 'frameflow-bundle-v1', project, assets: {} };
  for (const asset of project.assets) {
    const blob = await getBlob(asset.id);
    if (!blob) throw new Error(`素材缺失：${asset.name}`);
    data.assets[asset.id] = { type: asset.type, base64: encode(await blob.arrayBuffer()) };
  }
  const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export async function importBundle(file: File): Promise<Project> {
  let raw: string;
  const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (header[0] === 0x1f && header[1] === 0x8b) raw = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  else raw = await file.text();
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || (data as Partial<Bundle>).format !== 'frameflow-bundle-v1') throw new Error('不是 Frameflow 项目包。');
  const bundle = data as Bundle;
  if (!validateProject(bundle.project)) throw new Error('项目文件格式或版本不受支持。');
  for (const asset of bundle.project.assets) {
    const content = bundle.assets?.[asset.id];
    if (!content) throw new Error(`项目包缺少素材：${asset.name}`);
    await putBlob(asset.id, new Blob([decode(content.base64)], { type: content.type }));
  }
  return bundle.project;
}
