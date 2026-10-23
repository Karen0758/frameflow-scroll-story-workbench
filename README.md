# Frameflow · 逐帧叙事网页工作台

一个在浏览器里编排滚动叙事页面的本地工作台。你可以定义场景数量、人物逐帧图、背景纹理、文案、桌面与手机布局，以及转场和出场时间。适合先做交互样稿，再把设计交给正式网站开发。

## 3 分钟开始

需要 Node.js 20.19+ 或 22.12+ 及现代 Chromium 浏览器。

```bash
git clone https://github.com/Karen0758/frameflow-scroll-story-workbench.git
cd frameflow-scroll-story-workbench
npm ci
npm run dev
```

打开终端显示的地址，通常是 `http://127.0.0.1:5173/`。也可以在页面中选择「导入项目包」，打开 [`templates/starter.frameflow`](templates/starter.frameflow)。

## 你能做什么

- 增加、复制、删除、调整场景顺序；编辑每屏标题、正文、底色及统一的字体气质。
- 为每屏选择波浪、正圆扩张、平移或渐显转场，分别设置过场、人物和文字时间。
- 上传已去背的同尺寸人物帧、背景纹理；或从视频中选择时段，在浏览器内抽取固定尺寸 WebP 帧（最多 120 张）。
- 在画布中拖动人物和文字；电脑、手机使用独立位置与尺寸。预览按钮、滚轮和滑动切页。
- 将配置和媒体一起导出成 `.frameflow` 文件，日后在同一浏览器或另一台电脑导入继续编辑。

详细操作、素材准备、常见问题见 [使用说明书](docs/USER_GUIDE.md)。从零规划内容可用 [新项目表](templates/NEW_PROJECT_BRIEF.md) 和 [制作流程](docs/PROCESS_TEMPLATE.md)。

## 轻量 Skill

仓库内的 [`skills/frameflow/SKILL.md`](skills/frameflow/SKILL.md) 可让 Codex 按同一流程协助准备视频帧、搭建场景、检查头脚和影子，并交付可编辑项目包。安装方式见 [使用说明书的 Skill 一节](docs/USER_GUIDE.md#6-使用-skill)。

## 当前边界

Frameflow v0.1 是**本地编辑器和交互预览**。`npm run build` 构建的是工作台，不会导出最终可部署的叙事网站。视频抽帧只统一输出画幅，不会自动去背、修复缺失的头脚、校正镜头缩放或重建阴影。需要正片叠底的独立人物，应先准备透明帧。工作台无账户同步；素材保存在当前浏览器，记得定期导出项目包。

本仓库不含用户视频、人物或私有网站素材。代码按 [MIT License](LICENSE) 使用；你上传的素材仍由素材权利人决定使用范围。
