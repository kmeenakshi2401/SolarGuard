import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  OctagonAlert,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  Square,
  Upload,
} from 'lucide-react';
import { TextReportBanner } from '../components/TextReportBanner';
import type {
  DetectedPanelAnalysis,
  DustAnalysisMode,
  EDSState,
  MonitorState,
  MultiPanelAnalysisSummary,
  PanelPersistenceState,
} from '../types/solarguard';
import { runMultiPanelDustDetection } from '../utils/cvEngine';

const CLEAN_DEMO_URL = '/src/assets/images/solar_panel_clean_1794720831972.jpg';
const MULTIPANEL_DEMO_URL = '/src/assets/images/solar_multipanel_array_1794728656914.jpg';
const SINGLE_DUSTY_DEMO_URL = '/src/assets/images/solar_panel_dusty_1794720831944.jpg';

interface LiveCameraDustPageProps {
  monitorState: MonitorState;
  autoCleanEnabled: boolean;
  edsState: EDSState;
  cleanThreshold: number;
  moderateThreshold: number;
  cleanReferenceSrc: string;
  multiPanelSummary: MultiPanelAnalysisSummary | null;
  panels: DetectedPanelAnalysis[];
  persistenceMap: Record<number, PanelPersistenceState>;
  monitorLogs: string[];
  onStartMonitoring: () => void;
  onPauseMonitoring: () => void;
  onResumeMonitoring: () => void;
  onStopMonitoring: () => void;
  onToggleAutoClean: (val: boolean) => void;
  onEmergencyStop: () => void;
  onUpdateThresholds: (cleanMax: number, moderateMax: number) => void;
  onUpdateCleanReference: (src: string) => void;
  onMultiPanelDetected: (summary: MultiPanelAnalysisSummary) => void;
}

export const LiveCameraDustPage: React.FC<LiveCameraDustPageProps> = ({
  monitorState,
  autoCleanEnabled,
  edsState,
  cleanThreshold,
  moderateThreshold,
  cleanReferenceSrc,
  multiPanelSummary,
  panels,
  persistenceMap,
  monitorLogs,
  onStartMonitoring,
  onPauseMonitoring,
  onResumeMonitoring,
  onStopMonitoring,
  onToggleAutoClean,
  onEmergencyStop,
  onUpdateThresholds,
  onUpdateCleanReference,
  onMultiPanelDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraConnected, setCameraConnected] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameSrc, setFrameSrc] = useState<string>(MULTIPANEL_DEMO_URL);
  const [sourceLabel, setSourceLabel] = useState<string>('3-Panel Laboratory Array');
  const [pixelDiffThreshold, setPixelDiffThreshold] = useState<number>(24);
  const [lightingCompensation, setLightingCompensation] = useState<boolean>(true);
  const [analysisMode, setAnalysisMode] = useState<DustAnalysisMode>('AUTO');
  const [isScanning, setIsScanning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const connectWebcam = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser webcam API unavailable. Upload a panel photo or load a bench preset.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraConnected(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera disconnected or permission denied (${err.message}).`
          : 'Camera unavailable.'
      );
    }
  };

  const disconnectWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraConnected(false);
  };

  const runDetectionOnSource = async (
    targetSrc: string,
    label: string,
    refOverride?: string,
    modeOverride?: DustAnalysisMode
  ) => {
    setIsScanning(true);
    setAnalysisError(null);
    try {
      const prev = panels.map((p) => ({ panelId: p.panelId, bbox: p.bbox }));
      const summary = await runMultiPanelDustDetection(
        refOverride ?? cleanReferenceSrc,
        targetSrc,
        {
          cleanMaxPct: cleanThreshold,
          moderateMaxPct: moderateThreshold,
          pixelDiffThreshold,
          enableLightingCompensation: lightingCompensation,
          analysisMode: modeOverride ?? analysisMode,
          sourceLabel: label,
        },
        prev
      );
      onMultiPanelDetected(summary);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Optical analysis failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const captureFromWebcam = (target: 'reference' | 'current') => {
    if (!videoRef.current || !cameraConnected) return;
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    if (target === 'reference') {
      onUpdateCleanReference(dataUrl);
      runDetectionOnSource(frameSrc, sourceLabel, dataUrl);
    } else {
      setFrameSrc(dataUrl);
      setSourceLabel('Webcam Frame Capture');
      runDetectionOnSource(dataUrl, 'Webcam Frame Capture');
    }
  };

  useEffect(() => {
    if (monitorState !== 'RUNNING' || !cameraConnected) return;
    const timer = setInterval(() => {
      if (!videoRef.current) return;
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.9);
      setFrameSrc(dataUrl);
      setSourceLabel('Live Webcam Stream');
      runDetectionOnSource(dataUrl, 'Live Webcam Stream');
    }, 2500);
    return () => clearInterval(timer);
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'reference' | 'current') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (target === 'reference') {
          onUpdateCleanReference(reader.result);
          runDetectionOnSource(frameSrc, sourceLabel, reader.result);
        } else {
          const nextLabel = `Uploaded Image (${file.name})`;
          setFrameSrc(reader.result);
          setSourceLabel(nextLabel);
          runDetectionOnSource(reader.result, nextLabel);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const avgArrayDust = panels.length
    ? panels.reduce((acc, p) => acc + p.overallDustPercentage, 0) / panels.length
    : 0;
  const maxZoneDust = panels.length
    ? Math.max(...panels.flatMap((p) => p.zones.map((z) => z.dustPercentage)))
    : 0;
  const dirtyPanelsCount = panels.filter((p) =>
    p.zones.some((z) => z.dustPercentage > moderateThreshold)
  ).length;

  const reportSummary =
    panels.length === 0
      ? `No photovoltaic panels were segmented in ${sourceLabel}. Adjust framing or switch between preset views to inspect panel boundaries.`
      : `Segmented ${panels.length} solar panel(s) (${panels.length * 4} independent zones) from ${multiPanelSummary?.sourceLabel ?? sourceLabel} using ${multiPanelSummary?.methodSummary ?? 'Intrinsic PV Surface + Edge-Tolerant Analysis'}. Mean array soiling is ${avgArrayDust.toFixed(1)}% with a peak zone reading of ${maxZoneDust.toFixed(1)}%. ${dirtyPanelsCount === 0 ? 'All detected zones fall within acceptable optical limits and require no selective cleaning.' : `${dirtyPanelsCount} panel(s) exceed the ${moderateThreshold}% cleaning trigger and are queued for weather-gated selective EDS dispatch.`}`;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs font-mono tracking-wider text-sky-400">UNIFIED OPTICAL INSPECTION &amp; CALIBRATION</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-100">
            Live Camera, Multi-Panel Detection &amp; Dust Calibration
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {monitorState === 'STOPPED' || monitorState === 'FAULT_RECOVERY' ? (
            <button
              onClick={onStartMonitoring}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              Start Monitoring
            </button>
          ) : monitorState === 'RUNNING' ? (
            <button
              onClick={onPauseMonitoring}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-950/30 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-900/40 whitespace-nowrap"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          ) : (
            <button
              onClick={onResumeMonitoring}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
          <button
            onClick={onStopMonitoring}
            disabled={monitorState === 'STOPPED'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 disabled:opacity-40 whitespace-nowrap"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </button>
          <button
            onClick={() => runDetectionOnSource(frameSrc, sourceLabel)}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60 whitespace-nowrap"
          >
            <ScanLine className="h-3.5 w-3.5" />
            {isScanning ? 'Analyzing...' : 'Analyze Frame'}
          </button>
          <button
            onClick={onEmergencyStop}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-500 whitespace-nowrap"
          >
            <OctagonAlert className="h-3.5 w-3.5" />
            Emergency Stop
          </button>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-950/20 px-4 py-3 text-xs text-sky-100">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <p>
          Precision Soiling Pipeline: Each detected panel is cropped inside its 5% frame margin and checked against the
          reference cell grid via Normalized Cross-Correlation (NCC). When an uploaded panel has a different layout or
          perspective from the stored reference, <span className="font-mono text-sky-300">AUTO</span> mode switches to
          Intrinsic PV Surface Soiling Analysis so crisp silver busbars, cell gaps, and dark blue/charcoal silicon cells
          are never falsely flagged as dust.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Monitoring Loop</div>
          <div
            className={`mt-1.5 font-mono text-lg font-semibold ${
              monitorState === 'RUNNING'
                ? 'text-emerald-400'
                : monitorState === 'PAUSED'
                  ? 'text-amber-300'
                  : 'text-slate-300'
            }`}
          >
            {monitorState}
          </div>
          <label className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Auto-Clean Trigger</span>
            <input
              type="checkbox"
              checked={autoCleanEnabled}
              onChange={(e) => onToggleAutoClean(e.target.checked)}
              className="h-4 w-4 accent-sky-500"
            />
          </label>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Active Input Stream</div>
          <div className={`mt-1.5 font-mono text-lg font-semibold ${cameraConnected ? 'text-emerald-400' : 'text-sky-300'}`}>
            {cameraConnected ? 'WEBCAM LIVE' : 'UPLOAD / BENCH'}
          </div>
          <div className="mt-1 truncate text-xs text-slate-400">{sourceLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">Detected Panels &amp; Mean Dust</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {panels.length} <span className="text-xs text-slate-400">· {avgArrayDust.toFixed(1)}% avg</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">{panels.length * 4} independent zones</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-4">
          <div className="text-xs text-slate-400">EDS Driver / Method</div>
          <div className="mt-1.5 truncate font-mono text-sm font-semibold text-sky-300">{edsState}</div>
          <div className="mt-1 truncate text-xs text-slate-400">
            {multiPanelSummary?.methodSummary ?? `Mode: ${analysisMode}`}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5">
          <h3 className="text-sm font-semibold text-slate-100">1. Camera, Uploads &amp; Calibration</h3>

          <div className="flex flex-wrap gap-2">
            {!cameraConnected ? (
              <button
                onClick={connectWebcam}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500"
              >
                <Camera className="h-3.5 w-3.5" />
                Start Webcam
              </button>
            ) : (
              <button
                onClick={disconnectWebcam}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/30 px-3 py-1.5 text-xs font-medium text-rose-200"
              >
                Stop Webcam
              </button>
            )}
            <button
              onClick={() => {
                setFrameSrc(MULTIPANEL_DEMO_URL);
                setSourceLabel('3-Panel Laboratory Array');
                runDetectionOnSource(MULTIPANEL_DEMO_URL, '3-Panel Laboratory Array');
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500"
            >
              3-Panel Array
            </button>
            <button
              onClick={() => {
                setFrameSrc(CLEAN_DEMO_URL);
                setSourceLabel('Single Clean Panel Bench');
                runDetectionOnSource(CLEAN_DEMO_URL, 'Single Clean Panel Bench');
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:border-emerald-500"
            >
              Clean Panel
            </button>
            <button
              onClick={() => {
                setFrameSrc(SINGLE_DUSTY_DEMO_URL);
                setSourceLabel('Single Dusty Panel Bench');
                runDetectionOnSource(SINGLE_DUSTY_DEMO_URL, 'Single Dusty Panel Bench');
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:border-amber-500"
            >
              Dusty Panel
            </button>
          </div>

          {cameraActiveNotice(cameraConnected, videoRef, captureFromWebcam)}
          {cameraError && <p className="text-xs text-amber-300">{cameraError}</p>}

          <div className="grid grid-cols-1 gap-2 border-t border-slate-800 pt-3">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800 bg-[#090F1D] px-3 py-2 text-xs text-slate-300 hover:border-sky-500">
              <span className="inline-flex items-center gap-2">
                <Upload className="h-3.5 w-3.5 text-sky-400" />
                Upload Panel Frame to Analyze
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'current')} />
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800 bg-[#090F1D] px-3 py-2 text-xs text-slate-300 hover:border-emerald-500">
              <span className="inline-flex items-center gap-2">
                <Upload className="h-3.5 w-3.5 text-emerald-400" />
                Upload Clean Baseline Reference
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'reference')} />
            </label>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-3 text-xs">
            <div>
              <label className="mb-1 block text-slate-300">Detection Method</label>
              <select
                value={analysisMode}
                onChange={(e) => {
                  const nextMode = e.target.value as DustAnalysisMode;
                  setAnalysisMode(nextMode);
                  runDetectionOnSource(frameSrc, sourceLabel, undefined, nextMode);
                }}
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-xs text-slate-100"
              >
                <option value="AUTO">AUTO (NCC Alignment Check + Intrinsic Fallback)</option>
                <option value="INTRINSIC_SURFACE">INTRINSIC_SURFACE (Any Clean/Dusty Photo)</option>
                <option value="REFERENCE_DIFF">REFERENCE_DIFF (Fixed Camera Only)</option>
              </select>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-slate-300">
                <span>Clean Upper Limit</span>
                <span className="font-mono tabular-nums">{cleanThreshold}%</span>
              </div>
              <input
                type="range"
                min={2}
                max={20}
                step={0.5}
                value={cleanThreshold}
                onChange={(e) =>
                  onUpdateThresholds(Number(e.target.value), Math.max(Number(e.target.value) + 2, moderateThreshold))
                }
                className="w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-slate-300">
                <span>Cleaning Trigger Threshold</span>
                <span className="font-mono tabular-nums">&gt; {moderateThreshold}%</span>
              </div>
              <input
                type="range"
                min={12}
                max={50}
                step={0.5}
                value={moderateThreshold}
                onChange={(e) => onUpdateThresholds(cleanThreshold, Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-slate-300">
                <span>Optical Sensitivity Delta</span>
                <span className="font-mono tabular-nums">{pixelDiffThreshold}</span>
              </div>
              <input
                type="range"
                min={12}
                max={50}
                step={1}
                value={pixelDiffThreshold}
                onChange={(e) => setPixelDiffThreshold(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>

            <label className="flex items-center justify-between pt-1 text-slate-300">
              <span>Illumination Gain Normalization</span>
              <input
                type="checkbox"
                checked={lightingCompensation}
                onChange={(e) => setLightingCompensation(e.target.checked)}
                className="h-4 w-4 accent-sky-500"
              />
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0E1628] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                2. Clean Baseline vs Annotated Panel &amp; 4-Zone Segmentation
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                {multiPanelSummary?.methodSummary ?? 'Click Analyze Frame or upload any solar panel photo'}
              </p>
            </div>
            <button
              onClick={() => runDetectionOnSource(frameSrc, sourceLabel)}
              className="text-xs text-sky-400 hover:underline"
            >
              Re-analyze Frame
            </button>
          </div>

          {analysisError && <p className="text-xs text-rose-400">{analysisError}</p>}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs text-slate-400">Clean Baseline Reference</div>
              <img
                src={cleanReferenceSrc}
                alt="Clean reference solar panel"
                referrerPolicy="no-referrer"
                className="aspect-video w-full rounded-lg border border-slate-800 bg-[#070B14] object-contain"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs text-slate-400">Annotated Multi-Panel &amp; 4-Zone Output</div>
              <img
                src={multiPanelSummary?.annotatedDataUrl || frameSrc}
                alt="Multi-panel detection and 4-zone segmentation view"
                referrerPolicy="no-referrer"
                className="aspect-video w-full rounded-lg border border-slate-800 bg-[#070B14] object-contain"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 md:grid-cols-2">
            <div className="space-y-2.5">
              <div className="text-xs font-medium text-slate-300">Per-Panel 4-Zone Dust Breakdown</div>
              {panels.map((panel) => {
                const persist = persistenceMap[panel.panelId];
                return (
                  <div key={panel.panelId} className="rounded-lg border border-slate-800 bg-[#090F1D] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-sky-300">
                        Panel {panel.panelId} · {Math.round(panel.confidence * 100)}% · Avg {panel.overallDustPercentage.toFixed(1)}%
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Persist: {persist?.consecutiveDustyFrames ?? 0}/3
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1.5 font-mono text-xs tabular-nums">
                      {panel.zones.map((z) => (
                        <div key={z.zoneId} className="rounded border border-slate-800 bg-[#070B14] px-2 py-1 text-center">
                          <div className="text-[10px] text-slate-400">Z{z.zoneId}</div>
                          <div
                            className={
                              z.dustPercentage <= cleanThreshold
                                ? 'text-emerald-400'
                                : z.dustPercentage <= moderateThreshold
                                  ? 'text-amber-300'
                                  : 'text-rose-400'
                            }
                          >
                            {z.dustPercentage.toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#090F1D] p-3">
              <div className="mb-2 text-xs font-medium text-slate-300">Autonomous Vision &amp; Persistence Log</div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto font-mono text-[11px] text-slate-400">
                {monitorLogs.length === 0 ? (
                  <p>No monitoring events logged yet.</p>
                ) : (
                  monitorLogs.slice(0, 12).map((line, i) => <div key={i}>{line}</div>)
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <TextReportBanner
        title="OPTICAL VISION & CALIBRATION REPORT"
        summary={reportSummary}
        highlights={[
          `Active analysis mode: ${analysisMode} (${multiPanelSummary?.methodSummary ?? 'Ready'})`,
          `Thresholds: Clean <= ${cleanThreshold}% · Moderate ${cleanThreshold}–${moderateThreshold}% · Trigger > ${moderateThreshold}%`,
          `Panels segmented: ${panels.length} (${panels.length * 4} zones) · Peak zone: ${maxZoneDust.toFixed(1)}%`,
        ]}
      />
    </div>
  );
};

function cameraActiveNotice(
  cameraConnected: boolean,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  captureFromWebcam: (target: 'reference' | 'current') => void
) {
  if (!cameraConnected) return null;
  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="aspect-video w-full rounded-lg border border-slate-700 bg-black object-cover"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => captureFromWebcam('reference')}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:border-emerald-500"
        >
          Capture Clean Ref
        </button>
        <button
          onClick={() => captureFromWebcam('current')}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:border-sky-500"
        >
          Capture &amp; Analyze
        </button>
      </div>
    </div>
  );
}
