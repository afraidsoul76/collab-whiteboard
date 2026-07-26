import type { Item } from "./types";

// Font size derived from the brush size for text items.
export const fontSizeFor = (size: number) => Math.max(14, size * 5);

// Render a single item onto a 2D context. Coordinates are normalized (0..1) and
// scaled to the given pixel width/height, so the same item renders identically
// on any screen size. Used both for the live canvas and PNG export.
export function drawItem(
  ctx: CanvasRenderingContext2D,
  item: Item,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (item.kind === "path") {
    // Eraser strokes cut through everything drawn before them.
    ctx.globalCompositeOperation = item.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.erase ? item.size * 2.5 : item.size;
    const pts = item.points;
    if (pts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * w, pts[i].y * h);
      }
      if (pts.length === 1) {
        // A single tap: nudge slightly so round caps render a dot.
        ctx.lineTo(pts[0].x * w + 0.01, pts[0].y * h + 0.01);
      }
      ctx.stroke();
    }
  } else if (item.kind === "shape") {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.size;
    const x1 = item.from.x * w;
    const y1 = item.from.y * h;
    const x2 = item.to.x * w;
    const y2 = item.to.y * h;
    ctx.beginPath();
    if (item.shape === "rect") {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.stroke();
    } else if (item.shape === "ellipse") {
      ctx.ellipse(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.abs(x2 - x1) / 2,
        Math.abs(y2 - y1) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      // line or arrow
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (item.shape === "arrow") {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(10, item.size * 3);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - head * Math.cos(angle - Math.PI / 6),
          y2 - head * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - head * Math.cos(angle + Math.PI / 6),
          y2 - head * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      }
    }
  } else {
    // text
    ctx.fillStyle = item.color;
    ctx.font = `${fontSizeFor(item.size)}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(item.text, item.at.x * w, item.at.y * h);
  }

  ctx.restore();
}
