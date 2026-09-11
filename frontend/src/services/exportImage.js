/**
 * Shared export plumbing: turning a stored photo into something Excel and
 * jsPDF can embed, and the geometry for placing it inside a cell.
 *
 * This used to live inside clientExport.js. The Mini Plan exporter needs the
 * same conversion and the same EMU maths, and BUG-015 is exactly what happens
 * when image-placement arithmetic is copied instead of shared — the second
 * copy gets the units wrong and nobody notices until a photo comes out as a
 * vertical sliver. One implementation, imported by both.
 */

export function sanitizeFilename(name) {
  return (name || 'Report').replace(/[\\/*?:"<>|]/g, '_').trim();
}

/**
 * Convert any image URL or data URL (PNG, JPEG, WEBP, BMP, AVIF, a Zalo
 * clipboard blob) into clean JPEG base64, and report its EXACT natural aspect
 * ratio so nothing downstream has to guess and squash it.
 */
export function getImageData(url) {
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      const nw = img.naturalWidth || img.width || 800;
      const nh = img.naturalHeight || img.height || 600;
      const maxDim = 800;
      let w = nw;
      let h = nh;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Transparent PNGs would encode to black in JPEG without this.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({
        base64: dataUrl.split(',')[1],
        extension: 'jpeg',
        dataUrl,
        aspectRatio: nw / nh,
        width: w,
        height: h,
      });
    };

    img.onerror = () => {
      console.warn('Image load error during export:', String(url).substring(0, 40));
      if (String(url).startsWith('data:image')) {
        const parts = String(url).split(',');
        resolve({ base64: parts[1], extension: 'jpeg', dataUrl: url, aspectRatio: 1.33, width: 800, height: 600 });
      } else {
        resolve(null);
      }
    };

    img.src = url;
  });
}

// --- Excel geometry ------------------------------------------------
//
// ExcelJS's FRACTIONAL anchor cannot place an image accurately: its Anchor
// class converts a fraction with `column.width * 10000` and `row.height *
// 10000`, and neither of those is an EMU measurement. The two errors differ
// per axis (a width-22 column is off by 6.9x, a 92 pt row by 1.27x), so a
// rectangle that is mathematically correct in fractions comes out squashed
// horizontally. That was BUG-015. We compute the rectangle ourselves and hand
// ExcelJS NATIVE EMU offsets, which it writes through untouched.

export const EMU_PER_PX = 9525;                     // 914400 EMU per inch / 96 dpi
export const colWidthToPx = (width) => width * 7 + 5;
export const rowPointsToPx = (points) => points * (96 / 72);
export const pxToPoints = (px) => px * (72 / 96);
export const emu = (px) => Math.round(px * EMU_PER_PX);

/**
 * Letterbox an image inside an arbitrary rectangle of ONE cell and return the
 * ExcelJS native anchor.
 *
 * Scaling uses a SINGLE factor (the smaller of the two fits) so the aspect
 * ratio cannot drift per axis — the specific mistake BUG-015 was made of.
 *
 * @param colIndex  0-based column of the cell
 * @param rowIndex  0-based row of the cell
 * @param boxX,boxY offset of the sub-rectangle inside the cell, in px
 * @param boxW,boxH size of the sub-rectangle, in px
 */
export function imageAnchor(colIndex, rowIndex, boxX, boxY, boxW, boxH, aspectRatio) {
  const ar = aspectRatio > 0 ? aspectRatio : 4 / 3;

  let drawW = boxW;
  let drawH = drawW / ar;
  if (drawH > boxH) { drawH = boxH; drawW = drawH * ar; }

  const offX = boxX + (boxW - drawW) / 2;
  const offY = boxY + (boxH - drawH) / 2;

  return {
    tl: { nativeCol: colIndex, nativeColOff: emu(offX), nativeRow: rowIndex, nativeRowOff: emu(offY) },
    br: { nativeCol: colIndex, nativeColOff: emu(offX + drawW), nativeRow: rowIndex, nativeRowOff: emu(offY + drawH) },
    drawW,
    drawH,
  };
}

/**
 * How to tile N photos inside one cell: the grid, and the box each photo gets.
 * Used identically by the Excel and the PDF exporter so a plan printed both
 * ways looks the same.
 */
export function photoGrid(count, cellWidthPx, { maxCols = 3, gap = 3 } = {}) {
  const n = Math.max(1, count);
  const cols = Math.min(n, n > 6 ? maxCols + 1 : maxCols);
  const rows = Math.ceil(n / cols);
  const tileW = (cellWidthPx - gap * (cols + 1)) / cols;
  const tileH = tileW * 0.75;              // a 4:3 box; taller images letterbox inside it
  return { cols, rows, tileW, tileH, gap, heightPx: rows * (tileH + gap) + gap };
}

export function tileBox(index, grid) {
  const r = Math.floor(index / grid.cols);
  const c = index % grid.cols;
  return {
    x: grid.gap + c * (grid.tileW + grid.gap),
    y: grid.gap + r * (grid.tileH + grid.gap),
    w: grid.tileW,
    h: grid.tileH,
  };
}

/** Trigger a browser download for an exported blob. */
export function downloadBlob(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, 100);
}
