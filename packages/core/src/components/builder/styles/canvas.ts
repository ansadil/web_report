import { css } from 'lit';

export const canvasStyles = css`    main.center { grid-area: center; padding: 16px; overflow: auto; background: var(--rb-canvas-bg); min-width: 0; min-height: 0; }
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
      border: none;
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
      outline: 2px solid #2563eb;
      box-shadow: 0 0 0 2px rgba(37,99,235,0.2);
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
    .element .kind {
      position: absolute;
      top: 0;
      inset-inline-end: 0;
      z-index: 1;
      line-height: 1;
      pointer-events: none;
      background: rgba(255,255,255,0.9);
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
      background: #2563eb;
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
