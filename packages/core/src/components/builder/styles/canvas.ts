import { css } from 'lit';

export const canvasStyles = css`    main.center { grid-area: center; padding: 0; overflow: hidden; background: var(--rb-canvas-bg); min-width: 0; min-height: 0; display: flex; flex-direction: column; }
    .center-scroll { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
    .crumb-bar {
      height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 10px; flex: none;
      background: #f8fafc; border-bottom: 1px solid #dfe4ec; font-size: 11.5px; color: #4a5568; white-space: nowrap;
    }
    .crumb-bar .crumb { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
    .crumb-bar .crumb b { color: #1b2433; }
    .crumb-bar .sep { color: #7a8699; }
    .crumb-bar .sp { flex: 1; }
    .crumb-bar .chip { border: 1px solid #dfe4ec; background: #fff; border-radius: 20px; padding: 1px 10px; display: flex; gap: 5px; align-items: center; }
    .crumb-bar .dot { width: 7px; height: 7px; border-radius: 50%; background: #22a06b; flex: none; }
    .canvas {
      width: 100%; margin: 0 auto; background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }
    .canvas-zoom {
      margin: 0 auto;
      position: relative;
    }
    .canvas-zoom .canvas {
      margin: 0;
    }
    .band {
      border-bottom: 1px dashed #cbd5e1;
      position: relative;
      background-image: linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px);
      background-size: 20px 20px;
      box-sizing: border-box;
    }
    .band-label {
      position: absolute;
      top: 2px;
      inset-inline-start: 2px;
      font-size: 10px;
      color: #94a3b8;
      background: rgba(255,255,255,0.7);
      padding: 0 4px;
      border-radius: 3px;
      pointer-events: none;
    }
    .band-drop-on { background-color: rgba(37,99,235,0.06); }
    .marquee {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid #2563eb;
      background: rgba(37,99,235,0.12);
      pointer-events: none;
      z-index: 3;
    }
    .element {
      position: absolute;
      box-sizing: border-box;
      border: 1px dashed rgba(90, 105, 130, 0.45);
      outline: 1px dashed transparent;
      outline-offset: 0;
      padding: 0;
      cursor: move;
      overflow: hidden;
      font-size: 11px;
      line-height: 1.2;
      background: rgba(255,255,255,0.6);
    }
    .element:hover:not(.selected) { outline-color: #94a3b8; }
    .element.selected {
      outline: 1.5px solid #f0752a;
      box-shadow: none;
      overflow: visible;
    }
    .element .el-body {
      box-sizing: border-box;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      line-height: 1.2;
      padding-block: 1px;
      padding-inline: 2px 2.4em;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }
    .element .kind { display: none; }
    .element.field { color: #1d5a9e; }
    .element.image .el-body, .element.qr .el-body {
      align-items: center; justify-content: center; gap: 2px; text-align: center;
    }
    .element.image .el-body {
      background: repeating-linear-gradient(45deg, #f2f5fa 0 6px, #e9eef6 6px 12px);
      color: #5b6b82;
    }
    .element.qr .el-body { background: #fff; padding: 2px; }
    .element.qr .qr-mark { width: 100%; height: 100%; display: block; }
    .col-head {
      position: absolute; box-sizing: border-box; background: #0f8a7c; color: #fff; font-weight: 700;
      font-size: 11px; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap;
    }
    .element.richtext {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .element.richtext .element-preview {
      flex: 1;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-word;
      pointer-events: none;
    }
    .element.richtext.selected {
      overflow: visible;
    }
    .element.line {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: rgba(255, 255, 255, 0.35);
    }
    .element.line .kind,
    .element.line > div:not(.line-stroke):not(.resize-handles) {
      display: none;
    }
    .element.line .line-stroke {
      width: 100%;
      height: 100%;
      flex: none;
      pointer-events: none;
    }
    .element .kind { color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
    .resize-handles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
    }
    .resize-handle {
      position: absolute;
      width: 8px;
      height: 8px;
      margin: -4px;
      background: #f0752a;
      border: 1px solid #fff;
      border-radius: 1px;
      pointer-events: auto;
      box-sizing: border-box;
      opacity: 0;
      touch-action: none;
    }
    .element.selected .resize-handle { opacity: 1; }
    .resize-n {
      inset-inline-start: 50%;
      top: -4px;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    .resize-s {
      inset-inline-start: 50%;
      bottom: -4px;
      transform: translateX(-50%);
      cursor: ns-resize;
    }
    .resize-e {
      inset-inline-end: -4px;
      inset-block-start: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
    .resize-w {
      inset-inline-start: -4px;
      inset-block-start: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;
    }
    .resize-ne {
      inset-inline-end: -4px;
      top: -4px;
      cursor: nesw-resize;
    }
    .resize-nw {
      inset-inline-start: -4px;
      top: -4px;
      cursor: nwse-resize;
    }
    .resize-se {
      inset-inline-end: -4px;
      bottom: -4px;
      cursor: nwse-resize;
    }
    .resize-sw {
      inset-inline-start: -4px;
      bottom: -4px;
      cursor: nesw-resize;
    }
`;
