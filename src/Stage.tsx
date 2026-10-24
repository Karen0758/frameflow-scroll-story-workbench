import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { clamp, dimensions, type Box, type Device, type Project, type Scene, type Transition } from './model';

type DragTarget = 'character' | 'text';
interface StageProps {
  project: Project;
  selectedId: string;
  device: Device;
  urls: Record<string, string>;
  playing: boolean;
  scrubMs: number;
  onSelect: (id: string) => void;
  onBox: (sceneId: string, target: DragTarget, box: Box) => void;
}

function maskFor(transition: Transition, progress: number, width: number, height: number): CSSProperties {
  const p = clamp(progress, 0, 1);
  if (transition.preset === 'circle') {
    const x = width * transition.originX / 100;
    const y = height * transition.originY / 100;
    const radius = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y)) * p;
    return { clipPath: `circle(${radius}px at ${x}px ${y}px)` };
  }
  if (transition.preset === 'wave') {
    const y0 = 1020 - p * 1300;
    const y3 = 1250 - p * 1530;
    const path = `M0 1000 L0 ${y0} C260 ${y0 - 55} 520 ${y0 + 35} 760 ${y3 - 65} C880 ${y3 - 36} 940 ${y3 - 10} 1000 ${y3} L1000 1000 Z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"><path fill="white" d="${path}"/></svg>`;
    const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    return { maskImage: url, WebkitMaskImage: url, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' };
  }
  if (transition.preset === 'fade') return { opacity: p };
  const sign = transition.direction === 'left' || transition.direction === 'up' ? 1 : -1;
  const dx = transition.direction === 'left' || transition.direction === 'right' ? sign * (1 - p) * 100 : 0;
  const dy = transition.direction === 'up' || transition.direction === 'down' ? sign * (1 - p) * 100 : 0;
  return { transform: `translate(${dx}%, ${dy}%)` };
}

function layerStyle(box: Box, device: Device): CSSProperties {
  const d = dimensions[device];
  return {
    left: `${box.x / d.width * 100}%`, top: `${box.y / d.height * 100}%`,
    width: `${box.width / d.width * 100}%`, height: `${box.height / d.height * 100}%`,
  };
}

function SceneView({ scene, project, device, urls, timeMs, editable, onDragStart }: {
  scene: Scene; project: Project; device: Device; urls: Record<string, string>; timeMs: number;
  editable: boolean; onDragStart?: (event: React.PointerEvent, target: DragTarget) => void;
}) {
  const layout = scene.layouts[device];
  const textureUrl = scene.textureAssetId ? urls[scene.textureAssetId] : undefined;
  const frameIndex = timeMs < scene.characterStartMs ? 0 : clamp(Math.floor((timeMs - scene.characterStartMs) * scene.fps / 1000), 0, scene.frameAssetIds.length - 1);
  const characterUrl = urls[scene.frameAssetIds[Math.max(0, frameIndex)]];
  return <div className="scene-surface" style={{ backgroundColor: scene.background, color: project.theme.ink }}>
    {textureUrl && <img className="scene-texture" src={textureUrl} alt="" draggable={false} />}
    <div className={`scene-character ${editable ? 'editable-layer' : ''}`} style={{ ...layerStyle(layout.character, device), mixBlendMode: characterUrl ? scene.blendMode : 'normal' }} onPointerDown={editable ? event => onDragStart?.(event, 'character') : undefined}>
      {characterUrl ? <img src={characterUrl} alt="人物或主体" draggable={false} /> : <div className="character-placeholder"><span>01 / SUBJECT</span><strong>人物<br />或主体</strong><small>上传透明逐帧图或从视频截取画面</small></div>}
    </div>
    {(editable || timeMs >= scene.textStartMs) && <div className={`scene-copy ${editable ? 'editable-layer' : 'copy-appear'}`} style={{ ...layerStyle(layout.text, device), fontFamily: project.theme.font === 'serif' ? 'Georgia, "Songti SC", serif' : 'Arial, "PingFang SC", sans-serif' }} onPointerDown={editable ? event => onDragStart?.(event, 'text') : undefined}>
      <span className="scene-kicker">FRAMEFLOW / {scene.name}</span>
      <h2>{scene.title}</h2>
      <p>{scene.body}</p>
    </div>}
    <div className="scene-index">{scene.name} <span>·</span> {scene.id.slice(0, 4).toUpperCase()}</div>
  </div>;
}

export default function Stage({ project, selectedId, device, urls, playing, scrubMs, onSelect, onBox }: StageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneIndex = Math.max(0, project.scenes.findIndex(scene => scene.id === selectedId));
  const scene = project.scenes[sceneIndex];
  const [transition, setTransition] = useState<{ from: number; to: number; started: number; progress: number } | null>(null);
  const [sceneStart, setSceneStart] = useState(performance.now());
  const [clock, setClock] = useState(0);
  const touchStart = useRef<number | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!playing) { setTransition(null); busyRef.current = false; setClock(0); return; }
    setSceneStart(performance.now());
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (now: number) => {
      setClock(now - sceneStart);
      if (transition) {
        const duration = project.scenes[transition.to].transition.durationMs;
        const progress = clamp((now - transition.started) / duration, 0, 1);
        if (progress >= 1) {
          const target = project.scenes[transition.to];
          setTransition(null);
          busyRef.current = false;
          setSceneStart(transition.started);
          onSelect(target.id);
        } else setTransition(current => current ? { ...current, progress } : current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sceneStart, transition, project.scenes, onSelect]);

  function go(direction: -1 | 1) {
    if (!playing || busyRef.current) return;
    const next = sceneIndex + direction;
    if (next < 0 || next >= project.scenes.length) return;
    busyRef.current = true;
    setTransition({ from: sceneIndex, to: next, started: performance.now(), progress: 0 });
  }

  function startDrag(event: React.PointerEvent, target: DragTarget) {
    event.preventDefault();
    event.stopPropagation();
    const element = stageRef.current;
    if (!element) return;
    const start = { x: event.clientX, y: event.clientY };
    const origin = { ...scene.layouts[device][target] };
    const bounds = element.getBoundingClientRect();
    const onMove = (move: PointerEvent) => {
      const box = {
        ...origin,
        x: Math.round(origin.x + (move.clientX - start.x) * dimensions[device].width / bounds.width),
        y: Math.round(origin.y + (move.clientY - start.y) * dimensions[device].height / bounds.height),
      };
      onBox(scene.id, target, box);
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  const currentTime = playing ? clock : scrubMs;
  const fromScene = transition ? project.scenes[transition.from] : scene;
  const toScene = transition ? project.scenes[transition.to] : null;
  const previewTime = transition ? performance.now() - transition.started : currentTime;
  return <div className={`stage-shell ${device}`}>
    <div className="stage-topline"><span>{playing ? '实时预览 · 滚动或滑动切页' : '编辑画布 · 拖动图层调整位置'}</span><span>{dimensions[device].width} × {dimensions[device].height}</span></div>
    <div ref={stageRef} className="stage" style={{ aspectRatio: `${dimensions[device].width} / ${dimensions[device].height}` }}
      onWheel={event => { if (playing) { event.preventDefault(); go(event.deltaY > 0 ? 1 : -1); } }}
      onTouchStart={event => { if (playing) touchStart.current = event.touches[0]?.clientY ?? null; }}
      onTouchEnd={event => { if (playing && touchStart.current !== null) { const delta = touchStart.current - (event.changedTouches[0]?.clientY ?? touchStart.current); if (Math.abs(delta) > 50) go(delta > 0 ? 1 : -1); touchStart.current = null; } }}>
      <SceneView scene={fromScene} project={project} device={device} urls={urls} timeMs={currentTime} editable={!playing} onDragStart={startDrag} />
      {toScene && <div className="incoming-scene" style={maskFor(toScene.transition, transition!.progress, stageRef.current?.clientWidth ?? 1000, stageRef.current?.clientHeight ?? 700)}>
        <SceneView scene={toScene} project={project} device={device} urls={urls} timeMs={previewTime} editable={false} />
      </div>}
      {playing && <div className="preview-controls"><button aria-label="上一页" onClick={() => go(-1)} disabled={sceneIndex === 0 || !!transition}>↑</button><span>{sceneIndex + 1} / {project.scenes.length}</span><button aria-label="下一页" onClick={() => go(1)} disabled={sceneIndex === project.scenes.length - 1 || !!transition}>↓</button></div>}
      {playing && !transition && sceneIndex < project.scenes.length - 1 && <div className="stage-scroll-hint" aria-label="继续下滑"><span>继续下滑</span><svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 2v25M4 19l8 8 8-8" /></svg></div>}
    </div>
  </div>;
}
