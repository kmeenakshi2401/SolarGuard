import type {
  DetectedPanelAnalysis,
  DustAnalysisMode,
  MultiPanelAnalysisSummary,
  ZoneDustResult,
} from '../types/solarguard';
import { classifyDustLevel } from './calculations';

export interface CvDetectionOptions {
  cleanMaxPct: number;
  moderateMaxPct: number;
  pixelDiffThreshold: number;
  enableLightingCompensation: boolean;
  analysisMode: DustAnalysisMode;
  sourceLabel: string;
}

const TARGET_W = 640;
const TARGET_H = 360;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Unable to load image source: ${src}`));
    img.src = src;
  });
}

function getLuminanceStats(data: Uint8ClampedArray): { mean: number; std: number } {
  let sum = 0;
  const count = data.length / 4;
  const lums = new Float32Array(count);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lums[p] = y;
    sum += y;
  }
  const mean = sum / count;
  let sq = 0;
  for (let p = 0; p < count; p++) {
    const d = lums[p] - mean;
    sq += d * d;
  }
  return { mean, std: Math.sqrt(sq / count) + 1e-5 };
}

/**
 * Normalized Cross-Correlation (0..1) on luminance to check if the current panel
 * matches the cell grid geometry of the stored clean reference image.
 */
function computeNormalizedCorrelation(refData: Uint8ClampedArray, curData: Uint8ClampedArray): number {
  const n = refData.length / 4;
  const rStat = getLuminanceStats(refData);
  const cStat = getLuminanceStats(curData);
  let dot = 0;
  for (let i = 0; i < refData.length; i += 4) {
    const ry = 0.299 * refData[i] + 0.587 * refData[i + 1] + 0.114 * refData[i + 2];
    const cy = 0.299 * curData[i] + 0.587 * curData[i + 1] + 0.114 * curData[i + 2];
    dot += ((ry - rStat.mean) / rStat.std) * ((cy - cStat.mean) / cStat.std);
  }
  return Math.max(0, Math.min(1, dot / Math.max(1, n)));
}

/**
 * Precision 4-Zone Dust Estimation for a single rectified panel crop.
 * Prevents clean solar panels from falsely flagging dust due to shifted silver busbars,
 * frame borders, or exposure/white-balance differences.
 */
function computePrecisionZoneDust(
  refCanvas: HTMLCanvasElement,
  curCanvas: HTMLCanvasElement,
  options: CvDetectionOptions
): { zones: ZoneDustResult[]; overallDustPercentage: number; methodUsed: string } {
  const w = curCanvas.width;
  const h = curCanvas.height;
  const refData = refCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const curData = curCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;

  // Exclude outer 5% aluminum frame margin from dust scoring
  const marginX = Math.floor(w * 0.05);
  const marginY = Math.floor(h * 0.05);

  const ncc = computeNormalizedCorrelation(refData, curData);
  const useIntrinsic =
    options.analysisMode === 'INTRINSIC_SURFACE' ||
    (options.analysisMode === 'AUTO' && ncc < 0.42);

  const rawMask = new Uint8Array(w * h);

  if (useIntrinsic) {
    // Intrinsic PV Surface Soiling Analysis (Reference-Independent)
    // Clean PV cells: dark navy/blue/charcoal (B >= R - 10, moderate/low lum)
    // Clean silver busbars & backsheet lines: crisp neutral white/silver (|max-min| < 26, sharp edge or high lum)
    // Dust/soiling: warm tan/brown/ochre deposits (R - B > 14) OR matte grayish veil inside low-gradient cell areas
    const lums = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) {
      lums[p] = 0.299 * curData[p * 4] + 0.587 * curData[p * 4 + 1] + 0.114 * curData[p * 4 + 2];
    }

    const thresh = Math.max(16, options.pixelDiffThreshold * 0.9);
    for (let y = marginY; y < h - marginY; y++) {
      for (let x = marginX; x < w - marginX; x++) {
        const p = y * w + x;
        const idx = p * 4;
        const r = curData[idx];
        const g = curData[idx + 1];
        const b = curData[idx + 2];

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const chroma = maxC - minC;
        const lum = lums[p];

        // Compute local Sobel-like gradient magnitude to protect crisp clean busbars & grid lines
        const gx = Math.abs(lums[p + 1] - lums[p - 1]);
        const gy = Math.abs(lums[p + w] - lums[p - w]);
        const grad = gx + gy;

        const isCleanSilverOrGrid = chroma < 26 && (lum > 142 || grad > 36);
        const isCleanBlueOrDarkCell = lum < 118 && r <= b + 12 && chroma < 55;

        if (isCleanSilverOrGrid || isCleanBlueOrDarkCell) {
          continue;
        }

        // Warm earthy sand/dust signature (tan/brown/yellowish dust over dark PV silicon)
        const warmDustScore = Math.max(0, (r - b) * 1.5 + Math.max(0, g - b) * 0.65);
        // Matte gray/chalky dust veil inside smooth cell region (not blue, not crisp silver busbar)
        const matteVeilScore = lum > 95 && grad < 26 && b < r + 8 ? (lum - 95) * 0.6 : 0;

        if (Math.max(warmDustScore, matteVeilScore) >= thresh) {
          rawMask[p] = 1;
        }
      }
    }
  } else {
    // Aligned Reference Diff with per-channel luminance compensation + 3x3 edge-jitter erosion
    let gain = 1;
    let refMean = 0;
    let curMean = 0;
    if (options.enableLightingCompensation) {
      const rStat = getLuminanceStats(refData);
      const cStat = getLuminanceStats(curData);
      refMean = rStat.mean;
      curMean = cStat.mean;
      gain = Math.max(0.75, Math.min(1.35, rStat.std / cStat.std));
    }

    const deltaGrid = new Float32Array(w * h);
    for (let y = marginY; y < h - marginY; y++) {
      for (let x = marginX; x < w - marginX; x++) {
        const p = y * w + x;
        const i = p * 4;
        const r1 = refData[i];
        const g1 = refData[i + 1];
        const b1 = refData[i + 2];

        let r2 = curData[i];
        let g2 = curData[i + 1];
        let b2 = curData[i + 2];

        if (options.enableLightingCompensation) {
          const y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
          const deltaY = (y2 - curMean) * gain + refMean - y2;
          r2 = Math.max(0, Math.min(255, r2 + deltaY * 0.65));
          g2 = Math.max(0, Math.min(255, g2 + deltaY * 0.65));
          b2 = Math.max(0, Math.min(255, b2 + deltaY * 0.65));
        }

        const y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
        const y2n = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
        const lumDiff = Math.abs(y2n - y1) * 0.45;
        const chromaDiff =
          Math.hypot(r2 - g2 - (r1 - g1), 0.5 * (r2 + g2) - b2 - (0.5 * (r1 + g1) - b1)) * 1.2;
        deltaGrid[p] = Math.hypot(lumDiff, chromaDiff);
      }
    }

    // 3x3 morphological erosion on delta scores eliminates +/-1px busbar misalignment
    for (let y = marginY + 1; y < h - marginY - 1; y++) {
      for (let x = marginX + 1; x < w - marginX - 1; x++) {
        let minVal = 999;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const v = deltaGrid[(y + dy) * w + (x + dx)];
            if (v < minVal) minVal = v;
          }
        }
        if (minVal >= options.pixelDiffThreshold) {
          rawMask[y * w + x] = 1;
        }
      }
    }
  }

  // Morphological 3x3 opening (remove isolated 1-pixel noise specks)
  const cleanMask = new Uint8Array(w * h);
  for (let y = marginY + 1; y < h - marginY - 1; y++) {
    for (let x = marginX + 1; x < w - marginX - 1; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          neighbors += rawMask[(y + dy) * w + (x + dx)];
        }
      }
      if (neighbors >= 5) {
        cleanMask[y * w + x] = 1;
      }
    }
  }

  const midX = Math.floor(w / 2);
  const midY = Math.floor(h / 2);
  const quadrants = [
    { id: 1, name: 'Zone 1 (Top-Left)', x1: marginX, y1: marginY, x2: midX, y2: midY },
    { id: 2, name: 'Zone 2 (Top-Right)', x1: midX, y1: marginY, x2: w - marginX, y2: midY },
    { id: 3, name: 'Zone 3 (Bottom-Left)', x1: marginX, y1: midY, x2: midX, y2: h - marginY },
    { id: 4, name: 'Zone 4 (Bottom-Right)', x1: midX, y1: midY, x2: w - marginX, y2: h - marginY },
  ];

  const zones: ZoneDustResult[] = quadrants.map((q) => {
    let dirty = 0;
    let total = 0;
    for (let y = q.y1; y < q.y2; y++) {
      for (let x = q.x1; x < q.x2; x++) {
        total++;
        if (cleanMask[y * w + x] === 1) dirty++;
      }
    }
    const pct = Number(((dirty / Math.max(1, total)) * 100).toFixed(2));
    const classification = classifyDustLevel(pct, options.cleanMaxPct, options.moderateMaxPct);
    return {
      zoneId: q.id,
      zoneName: q.name,
      dustPercentage: pct,
      classification,
      cleaningRecommended: pct > options.moderateMaxPct,
      boundingBoxCount: Math.round(dirty / 180),
    };
  });

  const overallDustPercentage = Number(
    (zones.reduce((acc, z) => acc + z.dustPercentage, 0) / 4).toFixed(2)
  );

  return {
    zones,
    overallDustPercentage,
    methodUsed: useIntrinsic
      ? `Intrinsic PV Surface Analysis (NCC=${ncc.toFixed(2)})`
      : `Aligned Reference + Edge-Tolerance (NCC=${ncc.toFixed(2)})`,
  };
}

function boxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/**
 * Multi-Panel Detection -> Per-Panel Region Extraction -> Precision 4-Zone Dust Segmentation.
 */
export async function runMultiPanelDustDetection(
  referencePanelSrc: string,
  frameSrc: string,
  options: CvDetectionOptions,
  previousPanels: { panelId: number; bbox: { x: number; y: number; w: number; h: number } }[] = []
): Promise<MultiPanelAnalysisSummary> {
  const [refImg, frameImg] = await Promise.all([loadImage(referencePanelSrc), loadImage(frameSrc)]);

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = TARGET_W;
  frameCanvas.height = TARGET_H;
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true })!;
  frameCtx.drawImage(frameImg, 0, 0, TARGET_W, TARGET_H);

  const gw = 160;
  const gh = 90;
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = gw;
  gridCanvas.height = gh;
  const gridCtx = gridCanvas.getContext('2d', { willReadFrequently: true })!;
  gridCtx.drawImage(frameCanvas, 0, 0, gw, gh);
  const gData = gridCtx.getImageData(0, 0, gw, gh).data;

  const pvMask = new Uint8Array(gw * gh);
  for (let p = 0; p < gw * gh; p++) {
    const r = gData[p * 4];
    const g = gData[p * 4 + 1];
    const b = gData[p * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isDarkPv = lum < 122 && b >= r - 28;
    const isDustyPv = lum < 152 && r > g && b < 135 && Math.abs(r - b) < 80;
    if (isDarkPv || isDustyPv) pvMask[p] = 1;
  }

  // 3x3 close bridges internal busbars within a panel without merging separate panels spaced apart
  const dilated = new Uint8Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      let any = 0;
      for (let dy = -1; dy <= 1 && !any; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (pvMask[(y + dy) * gw + (x + dx)]) any = 1;
        }
      }
      dilated[y * gw + x] = any;
    }
  }

  const visited = new Uint8Array(gw * gh);
  const rawBoxes: { x: number; y: number; w: number; h: number; area: number }[] = [];
  const scaleX = TARGET_W / gw;
  const scaleY = TARGET_H / gh;

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const start = y * gw + x;
      if (!dilated[start] || visited[start]) continue;

      const queue = [start];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;

      while (queue.length > 0) {
        const idx = queue.pop()!;
        const cx = idx % gw;
        const cy = Math.floor(idx / gw);
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [idx - 1, idx + 1, idx - gw, idx + gw];
        for (const nIdx of neighbors) {
          if (nIdx >= 0 && nIdx < gw * gh && dilated[nIdx] && !visited[nIdx]) {
            const nx = nIdx % gw;
            if (Math.abs(nx - cx) <= 1) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }
      }

      const areaRatio = count / (gw * gh);
      if (areaRatio < 0.045 || areaRatio > 0.99) continue;

      const bx = Math.max(0, Math.floor(minX * scaleX));
      const by = Math.max(0, Math.floor(minY * scaleY));
      const bw = Math.min(TARGET_W - bx, Math.ceil((maxX - minX + 1) * scaleX));
      const bh = Math.min(TARGET_H - by, Math.ceil((maxY - minY + 1) * scaleY));
      const aspect = bw / Math.max(1, bh);
      if (bw >= 48 && bh >= 48 && aspect >= 0.35 && aspect <= 3.5) {
        rawBoxes.push({ x: bx, y: by, w: bw, h: bh, area: bw * bh });
      }
    }
  }

  rawBoxes.sort((a, b) => b.area - a.area);
  const keptBoxes: { x: number; y: number; w: number; h: number }[] = [];
  for (const box of rawBoxes) {
    if (!keptBoxes.some((k) => boxIoU(box, k) > 0.4)) {
      keptBoxes.push({ x: box.x, y: box.y, w: box.w, h: box.h });
    }
  }
  keptBoxes.sort((a, b) => a.x - b.x);

  // Fallback for full-bleed close-up single solar panel uploads
  if (keptBoxes.length === 0) {
    keptBoxes.push({ x: 16, y: 12, w: TARGET_W - 32, h: TARGET_H - 24 });
  }

  let nextId = previousPanels.length ? Math.max(...previousPanels.map((p) => p.panelId)) + 1 : 1;
  const usedPrev = new Set<number>();

  const refCropCanvas = document.createElement('canvas');
  refCropCanvas.width = 240;
  refCropCanvas.height = 240;
  refCropCanvas.getContext('2d')!.drawImage(refImg, 0, 0, 240, 240);

  const panels: DetectedPanelAnalysis[] = [];
  let methodSummary = '';

  for (const box of keptBoxes) {
    let assignedId: number | null = null;
    let bestIou = 0;
    for (const prev of previousPanels) {
      if (usedPrev.has(prev.panelId)) continue;
      const iou = boxIoU(box, prev.bbox);
      if (iou >= 0.3 && iou > bestIou) {
        bestIou = iou;
        assignedId = prev.panelId;
      }
    }
    if (assignedId !== null) {
      usedPrev.add(assignedId);
    } else {
      assignedId = nextId++;
    }

    const panelCropCanvas = document.createElement('canvas');
    panelCropCanvas.width = 240;
    panelCropCanvas.height = 240;
    panelCropCanvas
      .getContext('2d')!
      .drawImage(frameCanvas, box.x, box.y, box.w, box.h, 0, 0, 240, 240);

    const { zones, overallDustPercentage, methodUsed } = computePrecisionZoneDust(
      refCropCanvas,
      panelCropCanvas,
      options
    );
    methodSummary = methodUsed;

    const partiallyVisible =
      box.x <= 4 || box.y <= 4 || box.x + box.w >= TARGET_W - 4 || box.y + box.h >= TARGET_H - 4;
    const confidence = Number(
      (0.88 + Math.min(0.09, ((box.w * box.h) / (TARGET_W * TARGET_H)) * 0.2)).toFixed(2)
    );

    const maxPct = Math.max(...zones.map((z) => z.dustPercentage));
    const borderColor =
      maxPct <= options.cleanMaxPct
        ? '#22C55E'
        : maxPct <= options.moderateMaxPct
          ? '#F59E0B'
          : '#EF4444';

    frameCtx.strokeStyle = borderColor;
    frameCtx.lineWidth = 2.5;
    frameCtx.strokeRect(box.x, box.y, box.w, box.h);

    const midX = box.x + box.w / 2;
    const midY = box.y + box.h / 2;
    frameCtx.strokeStyle = 'rgba(203, 213, 225, 0.75)';
    frameCtx.lineWidth = 1;
    frameCtx.beginPath();
    frameCtx.moveTo(midX, box.y);
    frameCtx.lineTo(midX, box.y + box.h);
    frameCtx.moveTo(box.x, midY);
    frameCtx.lineTo(box.x + box.w, midY);
    frameCtx.stroke();

    const tag = `Panel ${assignedId} (${Math.round(confidence * 100)}%)`;
    frameCtx.fillStyle = 'rgba(7, 11, 20, 0.9)';
    frameCtx.fillRect(box.x, Math.max(0, box.y - 22), Math.min(box.w, 165), 22);
    frameCtx.fillStyle = borderColor;
    frameCtx.font = '600 11px "JetBrains Mono", monospace';
    frameCtx.fillText(tag, box.x + 6, Math.max(15, box.y - 7));

    const anchors = [
      [box.x + 6, box.y + 18],
      [midX + 6, box.y + 18],
      [box.x + 6, midY + 18],
      [midX + 6, midY + 18],
    ];
    zones.forEach((z, zi) => {
      const [zx, zy] = anchors[zi];
      const zCol =
        z.dustPercentage <= options.cleanMaxPct
          ? '#4ADE80'
          : z.dustPercentage <= options.moderateMaxPct
            ? '#FBBF24'
            : '#F87171';
      frameCtx.fillStyle = 'rgba(7, 11, 20, 0.85)';
      frameCtx.fillRect(zx - 2, zy - 12, 62, 16);
      frameCtx.fillStyle = zCol;
      frameCtx.font = '600 10px "JetBrains Mono", monospace';
      frameCtx.fillText(`Z${z.zoneId}:${z.dustPercentage.toFixed(0)}%`, zx + 1, zy);
    });

    panels.push({
      panelId: assignedId,
      bbox: box,
      confidence,
      partiallyVisible,
      zones,
      overallDustPercentage,
      methodUsed,
    });
  }

  return {
    panels,
    panelsDetectedCount: panels.length,
    annotatedDataUrl: frameCanvas.toDataURL('image/jpeg', 0.92),
    analyzedAt: new Date().toISOString().slice(0, 19),
    sourceLabel: options.sourceLabel,
    methodSummary,
    warning: null,
  };
}
