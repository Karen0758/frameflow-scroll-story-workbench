import { useCallback, useEffect, useRef, useState } from 'react';
import Stage from './Stage';
import { clamp, dimensions, makeScene, newProject, type AssetMeta, type Box, type Device, type Project, type Scene, type TransitionPreset } from './model';
import { extractVideoFrames, readVideoMetadata, storeImage, type ExtractOptions } from './media';
import { deleteBlob, getBlob, loadProject, saveProject } from './storage';
import { exportBundle, importBundle } from './bundle';

type Panel = 'scene' | 'theme' | 'media';
type UploadKind = 'frames' | 'texture';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NumberField({ label, value, min, max, step = 1, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void;
}) {
  return <label className="field"><span>{label}</span><div className="number-input"><input type="number" min={min} max={max} step={step} value={value} onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n)) onChange(clamp(n, min, max)); }} />{suffix && <em>{suffix}</em>}</div></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field color-field"><span>{label}</span><div><input type="color" value={value} onChange={event => onChange(event.target.value)} /><input aria-label={`${label} 色值`} type="text" value={value} onChange={event => { if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) onChange(event.target.value); }} /></div></label>;
}

function VideoDialog({ file, onClose, onComplete, onError }: {
  file: File; onClose: () => void; onComplete: (assets: AssetMeta[], fps: number) => void; onError: (message: string) => void;
}) {
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [options, setOptions] = useState<ExtractOptions>({ start: 0, end: 3, fps: 12, width: 720, quality: 0.84 });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    void readVideoMetadata(file).then(data => {
      setMeta(data);
      setOptions(current => ({ ...current, end: Math.min(data.duration, 3), width: Math.min(960, data.width) }));
    }).catch(error => onError(String(error)));
  }, [file, onError]);
  async function run() {
    setRunning(true);
    try {
      const assets = await extractVideoFrames(file, options, (done, total) => setProgress({ done, total }));
      onComplete(assets, options.fps);
    } catch (error) { onError(error instanceof Error ? error.message : '抽帧失败。'); }
    finally { setRunning(false); }
  }
  const frameCount = Math.ceil(Math.max(0, options.end - options.start) * options.fps);
  return <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="video-title">
    <div className="modal-header"><div><span className="eyebrow">MEDIA LAB / 01</span><h2 id="video-title">从视频截取逐帧图</h2></div><button className="icon-button" onClick={onClose} disabled={running} aria-label="关闭">×</button></div>
    <p className="muted">固定输出尺寸与帧率，生成 WebP 序列。这里保留原视频背景；透明人物请上传已去背序列。</p>
    <div className="video-summary"><strong>{file.name}</strong><span>{meta ? `${meta.width} × ${meta.height} · ${meta.duration.toFixed(1)} 秒` : '读取视频信息…'}</span></div>
    <div className="field-grid">
      <NumberField label="开始" value={options.start} min={0} max={Math.max(0, (meta?.duration ?? 30) - 0.1)} step={0.1} suffix="秒" onChange={value => setOptions(current => ({ ...current, start: value }))} />
      <NumberField label="结束" value={options.end} min={0.1} max={meta?.duration ?? 30} step={0.1} suffix="秒" onChange={value => setOptions(current => ({ ...current, end: value }))} />
      <NumberField label="帧率" value={options.fps} min={4} max={30} suffix="fps" onChange={value => setOptions(current => ({ ...current, fps: value }))} />
      <NumberField label="输出宽度" value={options.width} min={160} max={960} suffix="px" onChange={value => setOptions(current => ({ ...current, width: value }))} />
    </div>
    <div className="modal-foot"><span>{progress ? `正在生成 ${progress.done} / ${progress.total} 张` : `预计生成 ${frameCount} 张 · 最多 120 张`}</span><button className="primary-button" onClick={() => void run()} disabled={!meta || running || options.end <= options.start || frameCount < 1 || frameCount > 120}>{running ? '处理中…' : '生成并应用'}</button></div>
  </div></div>;
}

export default function App() {
  const [project, setProject] = useState<Project>(loadProject);
  const [selectedId, setSelectedId] = useState(() => project.scenes[0].id);
  const [device, setDevice] = useState<Device>('desktop');
  const [panel, setPanel] = useState<Panel>('scene');
  const [playing, setPlaying] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saveState, setSaveState] = useState('已保存在此浏览器');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const uploadKind = useRef<UploadKind>('frames');
  const selected = project.scenes.find(item => item.id === selectedId) ?? project.scenes[0];
  const selectedIndex = project.scenes.findIndex(item => item.id === selected.id);

  useEffect(() => {
    const timer = window.setTimeout(() => setSaveState(saveProject(project) ? '已保存在此浏览器' : '保存失败：浏览器空间不足'), 300);
    setSaveState('保存中…');
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    let disposed = false;
    const created: string[] = [];
    void Promise.all(project.assets.map(async asset => {
      const blob = await getBlob(asset.id);
      if (!blob) return [asset.id, ''] as const;
      const url = URL.createObjectURL(blob);
      created.push(url);
      return [asset.id, url] as const;
    })).then(entries => { if (!disposed) setUrls(Object.fromEntries(entries)); });
    return () => { disposed = true; created.forEach(url => URL.revokeObjectURL(url)); };
  }, [project.assets]);

  useEffect(() => { if (!project.scenes.some(scene => scene.id === selectedId)) setSelectedId(project.scenes[0].id); }, [project.scenes, selectedId]);

  const selectScene = useCallback((id: string) => { setSelectedId(id); setScrubMs(0); }, []);
  const reportError = useCallback((text: string) => setMessage(text), []);
  function updateScene(fn: (scene: Scene) => Scene) {
    setProject(current => ({ ...current, scenes: current.scenes.map(scene => scene.id === selectedId ? fn(scene) : scene) }));
  }
  function setField<K extends keyof Scene>(key: K, value: Scene[K]) { updateScene(scene => ({ ...scene, [key]: value })); }
  function setBox(sceneId: string, target: 'character' | 'text', box: Box) {
    setProject(current => ({ ...current, scenes: current.scenes.map(scene => scene.id === sceneId ? { ...scene, layouts: { ...scene.layouts, [device]: { ...scene.layouts[device], [target]: box } } } : scene) }));
  }
  function moveScene(delta: -1 | 1) {
    const next = selectedIndex + delta;
    if (next < 0 || next >= project.scenes.length) return;
    setProject(current => { const scenes = [...current.scenes]; [scenes[selectedIndex], scenes[next]] = [scenes[next], scenes[selectedIndex]]; return { ...current, scenes }; });
  }
  function addScene() {
    const next = makeScene(project.scenes.length);
    setProject(current => ({ ...current, scenes: [...current.scenes, next] }));
    selectScene(next.id);
  }
  function duplicateScene() {
    const copy: Scene = { ...structuredClone(selected), id: crypto.randomUUID(), name: `${selected.name} 副本` };
    setProject(current => ({ ...current, scenes: [...current.scenes.slice(0, selectedIndex + 1), copy, ...current.scenes.slice(selectedIndex + 1)] }));
    selectScene(copy.id);
  }
  function removeScene() {
    if (project.scenes.length <= 1) { setMessage('至少保留一页。'); return; }
    const next = project.scenes.filter(scene => scene.id !== selectedId);
    setProject(current => ({ ...current, scenes: next }));
    selectScene(next[Math.min(selectedIndex, next.length - 1)].id);
  }
  async function handleImages(files: FileList | null) {
    if (!files?.length) return;
    try {
      const sorted = (uploadKind.current === 'texture' ? [...files].slice(0, 1) : [...files]).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (uploadKind.current === 'frames' && sorted.length > 120) throw new Error('一次最多导入 120 张逐帧图。');
      if (uploadKind.current === 'frames') {
        const sizes = await Promise.all(sorted.map(async file => {
          const bitmap = await createImageBitmap(file);
          const size = `${bitmap.width}x${bitmap.height}`;
          bitmap.close();
          return size;
        }));
        if (sizes.some(size => size !== sizes[0])) throw new Error('逐帧图尺寸不统一；请先统一画布后再导入。');
      }
      const stored: AssetMeta[] = [];
      for (const file of sorted) {
        if (!file.type.startsWith('image/')) throw new Error(`${file.name} 不是图片。`);
        stored.push(await storeImage(file, file.name));
      }
      setProject(current => ({ ...current, assets: [...current.assets, ...stored], scenes: current.scenes.map(scene => scene.id === selectedId ? uploadKind.current === 'texture'
        ? { ...scene, textureAssetId: stored[0].id }
        : { ...scene, frameAssetIds: stored.map(asset => asset.id) }
        : scene) }));
      setMessage(uploadKind.current === 'texture' ? '背景纹理已应用。' : `已导入 ${stored.length} 张同尺寸图片。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '图片导入失败。'); }
    if (imageInput.current) imageInput.current.value = '';
  }
  async function exportProject() {
    try { download(await exportBundle(project), `${project.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '-') || 'frameflow'}.frameflow`); setMessage('项目与素材已导出。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '导出失败。'); }
  }
  async function handleImport(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await importBundle(file);
      const importedIds = new Set(imported.assets.map(asset => asset.id));
      void Promise.all(project.assets.filter(asset => !importedIds.has(asset.id)).map(asset => deleteBlob(asset.id)));
      setProject(imported); selectScene(imported.scenes[0].id); setPlaying(false); setMessage(`已导入「${imported.name}」。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败。'); }
    if (importInput.current) importInput.current.value = '';
  }
  function newBlankProject() {
    if (!window.confirm('创建新项目会替换当前浏览器中的项目。请先导出项目包备份。继续吗？')) return;
    void Promise.all(project.assets.map(asset => deleteBlob(asset.id))).catch(() => setMessage('新项目已建立，但旧素材的浏览器缓存未能全部清除。'));
    const next = newProject(); setProject(next); selectScene(next.scenes[0].id); setPlaying(false);
  }
  const box = selected.layouts[device].character;
  const textBox = selected.layouts[device].text;
  const timelineEnd = Math.max(selected.transition.durationMs, selected.characterStartMs + selected.frameAssetIds.length / selected.fps * 1000, selected.textStartMs + 600, 1800);

  return <div className="app-shell">
    <header className="app-header"><div className="brand-mark">F<span>↝</span></div><div className="brand-copy"><strong>Frameflow</strong><small>逐帧叙事工作台 <span>LOCAL BETA</span></small></div><div className="header-divider" /><label className="project-name-label">项目名称<input aria-label="项目名称" value={project.name} onChange={event => setProject(current => ({ ...current, name: event.target.value }))} /></label><div className="header-spacer" /><span className="save-state">● {saveState}</span><button className="ghost-button" onClick={newBlankProject}>新项目</button><button className="ghost-button" onClick={() => importInput.current?.click()}>导入项目包</button><button className="primary-button" onClick={() => void exportProject()}>导出项目 ↗</button></header>
    <div className="workspace">
      <aside className="scene-sidebar"><div className="sidebar-section-title"><span>场景 / SCENES</span><button onClick={addScene} aria-label="添加场景">＋</button></div><div className="scene-list">{project.scenes.map((scene, index) => <button key={scene.id} className={`scene-item ${selected.id === scene.id ? 'selected' : ''}`} onClick={() => { selectScene(scene.id); setPlaying(false); }}><span className="scene-no">{String(index + 1).padStart(2, '0')}</span><span className="scene-swatch" style={{ background: scene.background }} /><span className="scene-list-name"><strong>{scene.name}</strong><small>{scene.title}</small></span><span className="scene-arrow">↗</span></button>)}</div><button className="add-scene" onClick={addScene}>＋ 添加新场景</button><div className="sidebar-bottom"><span className="eyebrow">FRAMEFLOW METHOD</span><p>主体、纹理和文字分层。先定画幅与影子，再定过场和时间轴。</p><small>制作流程：docs/PROCESS_TEMPLATE.md</small></div></aside>
      <main className="center-column"><div className="canvas-toolbar"><div className="toolbar-group"><span className="eyebrow">CANVAS</span><button className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>▣ 电脑</button><button className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}>▯ 手机</button></div><div className="toolbar-group"><span className="eyebrow">PREVIEW</span><button className={playing ? 'preview-active' : ''} onClick={() => { setPlaying(value => !value); setScrubMs(0); }}>{playing ? '■ 停止预览' : '▶ 播放交互'}</button></div></div><div className="canvas-area"><Stage project={project} selectedId={selected.id} device={device} urls={urls} playing={playing} scrubMs={scrubMs} onSelect={selectScene} onBox={setBox} /></div><div className="timeline"><div className="timeline-head"><div><span className="eyebrow">TIMELINE</span><strong>{selected.name}</strong></div><span>拖动时间线查看人物与文字的出现顺序</span><b>{(scrubMs / 1000).toFixed(2)} s</b></div><input aria-label="时间轴预览" type="range" min={0} max={timelineEnd} step={20} value={scrubMs} disabled={playing} onChange={event => setScrubMs(Number(event.target.value))} /><div className="timeline-tracks"><div><label>背景过场</label><span style={{ width: `${Math.min(100, selected.transition.durationMs / timelineEnd * 100)}%`, background: selected.background }} /><em>{(selected.transition.durationMs / 1000).toFixed(1)}s</em></div><div><label>人物逐帧</label><span style={{ marginLeft: `${selected.characterStartMs / timelineEnd * 100}%`, width: `${Math.min(100, selected.frameAssetIds.length / selected.fps * 1000 / timelineEnd * 100)}%`, background: '#a69d8b' }} /><em>{selected.frameAssetIds.length || '未上传'} 帧</em></div><div><label>文字出现</label><span style={{ marginLeft: `${selected.textStartMs / timelineEnd * 100}%`, width: `${Math.min(100, 600 / timelineEnd * 100)}%`, background: '#ac5277' }} /><em>{(selected.textStartMs / 1000).toFixed(1)}s 起</em></div></div></div></main>
      <aside className="inspector"><div className="inspector-tabs"><button className={panel === 'scene' ? 'active' : ''} onClick={() => setPanel('scene')}>页面</button><button className={panel === 'theme' ? 'active' : ''} onClick={() => setPanel('theme')}>风格</button><button className={panel === 'media' ? 'active' : ''} onClick={() => setPanel('media')}>素材</button></div><div className="inspector-scroll">
        {panel === 'scene' && <><div className="panel-heading"><span className="eyebrow">SCENE {String(selectedIndex + 1).padStart(2, '0')}</span><h2>{selected.name}</h2><p>编辑这一屏的内容和动作。</p></div><section className="control-section"><h3>页面内容</h3><label className="field"><span>场景名称</span><input value={selected.name} onChange={event => setField('name', event.target.value)} /></label><label className="field"><span>标题</span><input value={selected.title} onChange={event => setField('title', event.target.value)} /></label><label className="field"><span>正文</span><textarea rows={4} value={selected.body} onChange={event => setField('body', event.target.value)} /></label><ColorField label="背景颜色" value={selected.background} onChange={value => setField('background', value)} /></section><section className="control-section"><h3>进场过渡</h3><label className="field"><span>动画效果</span><select value={selected.transition.preset} onChange={event => updateScene(scene => ({ ...scene, transition: { ...scene.transition, preset: event.target.value as TransitionPreset } }))}><option value="wave">波浪推进</option><option value="circle">正圆扩张</option><option value="slide">整页滑动</option><option value="fade">渐显</option></select></label>{selected.transition.preset === 'slide' && <label className="field"><span>移动方向</span><select value={selected.transition.direction} onChange={event => updateScene(scene => ({ ...scene, transition: { ...scene.transition, direction: event.target.value as Scene['transition']['direction'] } }))}><option value="left">向左</option><option value="right">向右</option><option value="up">向上</option><option value="down">向下</option></select></label>}{selected.transition.preset === 'circle' && <div className="field-grid"><NumberField label="圆心 X" value={selected.transition.originX} min={0} max={100} suffix="%" onChange={value => updateScene(scene => ({ ...scene, transition: { ...scene.transition, originX: value } }))} /><NumberField label="圆心 Y" value={selected.transition.originY} min={0} max={100} suffix="%" onChange={value => updateScene(scene => ({ ...scene, transition: { ...scene.transition, originY: value } }))} /></div>}<NumberField label="过场时长" value={selected.transition.durationMs} min={100} max={6000} step={100} suffix="ms" onChange={value => updateScene(scene => ({ ...scene, transition: { ...scene.transition, durationMs: value } }))} /></section><section className="control-section"><h3>人物与文字时间</h3><div className="field-grid"><NumberField label="人物开始" value={selected.characterStartMs} min={0} max={6000} step={100} suffix="ms" onChange={value => setField('characterStartMs', value)} /><NumberField label="文字开始" value={selected.textStartMs} min={0} max={6000} step={100} suffix="ms" onChange={value => setField('textStartMs', value)} /></div><NumberField label="逐帧帧率" value={selected.fps} min={1} max={60} suffix="fps" onChange={value => setField('fps', value)} /><label className="field"><span>人物混合模式</span><select value={selected.blendMode} onChange={event => setField('blendMode', event.target.value as Scene['blendMode'])}><option value="multiply">正片叠底 Multiply</option><option value="normal">普通 Normal</option></select></label></section><section className="control-section"><h3>{device === 'desktop' ? '电脑' : '手机'}布局</h3><p className="section-hint">可直接拖动画布，或在这里输入坐标。</p><h4>人物 / 主体</h4><div className="field-grid"><NumberField label="X" value={box.x} min={-800} max={dimensions[device].width} onChange={value => setBox(selected.id, 'character', { ...box, x: value })} /><NumberField label="Y" value={box.y} min={-800} max={dimensions[device].height} onChange={value => setBox(selected.id, 'character', { ...box, y: value })} /><NumberField label="宽" value={box.width} min={20} max={1800} onChange={value => setBox(selected.id, 'character', { ...box, width: value })} /><NumberField label="高" value={box.height} min={20} max={1800} onChange={value => setBox(selected.id, 'character', { ...box, height: value })} /></div><h4>文字块</h4><div className="field-grid"><NumberField label="X" value={textBox.x} min={-800} max={dimensions[device].width} onChange={value => setBox(selected.id, 'text', { ...textBox, x: value })} /><NumberField label="Y" value={textBox.y} min={-800} max={dimensions[device].height} onChange={value => setBox(selected.id, 'text', { ...textBox, y: value })} /><NumberField label="宽" value={textBox.width} min={100} max={1300} onChange={value => setBox(selected.id, 'text', { ...textBox, width: value })} /></div></section><section className="control-section"><h3>场景管理</h3><div className="button-grid"><button onClick={() => moveScene(-1)} disabled={selectedIndex === 0}>↑ 前移</button><button onClick={() => moveScene(1)} disabled={selectedIndex === project.scenes.length - 1}>↓ 后移</button><button onClick={duplicateScene}>复制场景</button><button onClick={removeScene} disabled={project.scenes.length === 1}>删除场景</button></div></section></>}
        {panel === 'theme' && <><div className="panel-heading"><span className="eyebrow">VISUAL SYSTEM</span><h2>全站风格</h2><p>每一屏继承同一套字体与文字颜色。</p></div><section className="control-section"><ColorField label="文字颜色" value={project.theme.ink} onChange={value => setProject(current => ({ ...current, theme: { ...current.theme, ink: value } }))} /><ColorField label="强调色" value={project.theme.accent} onChange={value => setProject(current => ({ ...current, theme: { ...current.theme, accent: value } }))} /><label className="field"><span>标题字体气质</span><select value={project.theme.font} onChange={event => setProject(current => ({ ...current, theme: { ...current.theme, font: event.target.value as 'serif' | 'sans' } }))}><option value="serif">衬线 / Editorial</option><option value="sans">无衬线 / Modern</option></select></label></section><section className="control-section"><h3>页面配色一览</h3><div className="palette-list">{project.scenes.map(scene => <button key={scene.id} onClick={() => { selectScene(scene.id); setPanel('scene'); }}><i style={{ background: scene.background }} />{scene.name}<span>↗</span></button>)}</div></section><section className="control-section note"><h3>关于字体</h3><p>这里使用设备可用字体预览。正式发布前，需为项目配置已获授权的网页字体，并检查中英文所有字形。</p></section></>}
        {panel === 'media' && <><div className="panel-heading"><span className="eyebrow">MEDIA LIBRARY</span><h2>素材与逐帧</h2><p>所有媒体留在当前浏览器，导出项目包才会形成可移动备份。</p></div><section className="control-section"><h3>当前场景</h3><div className="asset-stat"><strong>{selected.frameAssetIds.length}</strong><span>张动作帧</span><strong>{selected.textureAssetId ? '1' : '0'}</strong><span>张背景纹理</span></div><button className="wide-button" onClick={() => { uploadKind.current = 'frames'; imageInput.current?.click(); }}>上传透明逐帧图</button><button className="wide-button" onClick={() => videoInput.current?.click()}>从视频抽帧</button><button className="wide-button" onClick={() => { uploadKind.current = 'texture'; imageInput.current?.click(); }}>上传背景纹理</button><p className="section-hint">逐帧文件按文件名自然排序，且必须同宽同高。视频截帧保留原背景，不自动抠图。</p></section><section className="control-section"><h3>素材库</h3><p className="section-hint">{project.assets.length} 个素材 · {(project.assets.reduce((sum, asset) => sum + asset.size, 0) / 1048576).toFixed(2)} MB</p><div className="asset-list">{project.assets.slice(-12).reverse().map(asset => <div key={asset.id} className="asset-row">{urls[asset.id] ? <img src={urls[asset.id]} alt="" /> : <span className="missing-asset">?</span>}<div><strong title={asset.name}>{asset.name}</strong><small>{asset.width} × {asset.height}</small></div></div>)}</div></section></>}
      </div></aside>
    </div>
    <input ref={imageInput} className="visually-hidden" type="file" accept="image/*" multiple onChange={event => void handleImages(event.target.files)} />
    <input ref={videoInput} className="visually-hidden" type="file" accept="video/*" onChange={event => { setVideoFile(event.target.files?.[0] ?? null); event.target.value = ''; }} />
    <input ref={importInput} className="visually-hidden" type="file" accept=".frameflow,application/gzip,application/json" onChange={event => void handleImport(event.target.files?.[0])} />
    {videoFile && <VideoDialog file={videoFile} onClose={() => setVideoFile(null)} onError={reportError} onComplete={(assets, fps) => { setProject(current => ({ ...current, assets: [...current.assets, ...assets], scenes: current.scenes.map(scene => scene.id === selectedId ? { ...scene, frameAssetIds: assets.map(asset => asset.id), fps } : scene) })); setVideoFile(null); setMessage(`已生成 ${assets.length} 张 WebP 帧。`); }} />}
    {message && <div className="toast" role="status" onClick={() => setMessage('')}>{message}<button aria-label="关闭提示">×</button></div>}
  </div>;
}
