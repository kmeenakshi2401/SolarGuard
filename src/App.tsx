import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CloudSun,
  Cpu,
  Database,
  LayoutDashboard,
  Sliders,
  Sun,
  Thermometer,
  Usb,
  Video,
  Zap,
} from 'lucide-react';
import type {
  CleaningLogEntry,
  CsvRow,
  DetectedPanelAnalysis,
  EDSCleaningEvent,
  EDSDriverMode,
  EDSState,
  EnergyBalanceReport,
  MonitorState,
  MultiPanelAnalysisSummary,
  NavPageId,
  OperatingMode,
  PanelPersistenceState,
  TelemetryPoint,
  WeatherDecisionConfig,
  WeatherInputs,
} from './types/solarguard';
import {
  calculateAccumulatedEnergyWh,
  calculateCleaningEfficiency,
  calculateInstantaneousPower,
  calculateNetEnergyBenefit,
  calculateTemperatureReduction,
  evaluateCleaningDecision,
  evaluatePanelWeatherDecision,
  parseEsp32SerialLine,
} from './utils/calculations';
import { HomePage } from './pages/HomePage';
import { LiveCameraDustPage } from './pages/LiveCameraDustPage';
import { WeatherMonitoringPage } from './pages/WeatherMonitoringPage';
import { DecisionsPage } from './pages/DecisionsPage';
import { EdsControlPage } from './pages/EdsControlPage';
import { CleaningControlPage } from './pages/CleaningControlPage';
import { ThermalMonitoringPage } from './pages/ThermalMonitoringPage';
import { PowerMonitoringPage } from './pages/PowerMonitoringPage';
import { EnergyAnalysisPage } from './pages/EnergyAnalysisPage';
import { DataReportsPage } from './pages/DataReportsPage';

interface SerialPortLike {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

const INITIAL_TELEMETRY: TelemetryPoint[] = (() => {
  const baseMs = Date.now() - 5 * 60_000;
  return [0, 1, 2, 3, 4, 5].map((step) => {
    const tMs = baseMs + step * 60_000;
    const v = Number((5.82 + step * 0.08).toFixed(2));
    const i = Number((0.64 + step * 0.02).toFixed(3));
    return {
      timestamp: new Date(tMs).toISOString().slice(0, 19),
      epochMs: tMs,
      voltageV: v,
      currentA: i,
      powerW: calculateInstantaneousPower(v, i),
      panelTempC: Number((47.4 - step * 0.35).toFixed(2)),
      coolingTempC: Number((39.8 - step * 0.3).toFixed(2)),
      referenceTempC: 51.4,
      humidityPct: 54.0,
      ambientTempC: 32.2,
      rainDetected: false,
      ldrPct: 82.0,
      dht22Valid: true,
      rainSensorValid: true,
      ldrValid: true,
      source: 'SIMULATION',
    };
  });
})();

const INITIAL_PANELS: DetectedPanelAnalysis[] = [
  {
    panelId: 1,
    bbox: { x: 24, y: 36, w: 185, h: 278 },
    confidence: 0.95,
    partiallyVisible: false,
    overallDustPercentage: 22.5,
    zones: [
      { zoneId: 1, zoneName: 'Zone 1 (Top-Left)', dustPercentage: 5.0, classification: 'Clean', cleaningRecommended: false, boundingBoxCount: 0 },
      { zoneId: 2, zoneName: 'Zone 2 (Top-Right)', dustPercentage: 32.0, classification: 'Dusty - cleaning recommended', cleaningRecommended: true, boundingBoxCount: 4 },
      { zoneId: 3, zoneName: 'Zone 3 (Bottom-Left)', dustPercentage: 8.0, classification: 'Clean', cleaningRecommended: false, boundingBoxCount: 0 },
      { zoneId: 4, zoneName: 'Zone 4 (Bottom-Right)', dustPercentage: 45.0, classification: 'Dusty - cleaning recommended', cleaningRecommended: true, boundingBoxCount: 6 },
    ],
  },
  {
    panelId: 2,
    bbox: { x: 228, y: 36, w: 185, h: 278 },
    confidence: 0.94,
    partiallyVisible: false,
    overallDustPercentage: 16.5,
    zones: [
      { zoneId: 1, zoneName: 'Zone 1 (Top-Left)', dustPercentage: 10.0, classification: 'Clean', cleaningRecommended: false, boundingBoxCount: 0 },
      { zoneId: 2, zoneName: 'Zone 2 (Top-Right)', dustPercentage: 12.0, classification: 'Moderate dust', cleaningRecommended: false, boundingBoxCount: 1 },
      { zoneId: 3, zoneName: 'Zone 3 (Bottom-Left)', dustPercentage: 38.0, classification: 'Dusty - cleaning recommended', cleaningRecommended: true, boundingBoxCount: 5 },
      { zoneId: 4, zoneName: 'Zone 4 (Bottom-Right)', dustPercentage: 6.0, classification: 'Clean', cleaningRecommended: false, boundingBoxCount: 0 },
    ],
  },
  {
    panelId: 3,
    bbox: { x: 432, y: 36, w: 185, h: 278 },
    confidence: 0.93,
    partiallyVisible: false,
    overallDustPercentage: 7.75,
    zones: [
      { zoneId: 1, zoneName: 'Zone 1 (Top-Left)', dustPercentage: 4.0, classification: 'Clean', cleaningRecommended: false, boundingBoxCount: 0 },
      { zoneId: 2, zoneName: 'Zone 2 (Top-Right)', dustPercentage: 7.0, classification: 'Clean', cleaningRecommended: false, boundingBoxCount: 0 },
      { zoneId: 3, zoneName: 'Zone 3 (Bottom-Left)', dustPercentage: 9.0, classification: 'Clean', cleaningRecommended: false, boundingBoxCount: 0 },
      { zoneId: 4, zoneName: 'Zone 4 (Bottom-Right)', dustPercentage: 11.0, classification: 'Moderate dust', cleaningRecommended: false, boundingBoxCount: 1 },
    ],
  },
];

const NAV_ITEMS: { id: NavPageId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home Dashboard', icon: LayoutDashboard },
  { id: 'vision', label: 'Live Camera & Calibration', icon: Video },
  { id: 'weather', label: 'Weather Sensors', icon: CloudSun },
  { id: 'decisions', label: 'Decision Engine', icon: BrainCircuit },
  { id: 'eds', label: 'EDS & Verification', icon: Cpu },
  { id: 'cleaning', label: 'LED Zone Control', icon: Sliders },
  { id: 'thermal', label: 'Thermal Analysis', icon: Thermometer },
  { id: 'power', label: 'Power Monitoring', icon: Zap },
  { id: 'energy', label: 'Energy Analysis', icon: BarChart3 },
  { id: 'reports', label: 'Data & Reports', icon: Database },
];

export default function App() {
  const [activePage, setActivePage] = useState<NavPageId>('home');
  const [mode, setMode] = useState<OperatingMode>('SIMULATION');
  const [simAutoStream, setSimAutoStream] = useState<boolean>(true);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>(INITIAL_TELEMETRY);

  // Multi-panel state (Change 1)
  const [panels, setPanels] = useState<DetectedPanelAnalysis[]>(INITIAL_PANELS);
  const [multiPanelSummary, setMultiPanelSummary] = useState<MultiPanelAnalysisSummary | null>(null);
  const [zoneDust, setZoneDust] = useState<number[]>([5.0, 32.0, 8.0, 45.0]);
  const [cleanThreshold, setCleanThreshold] = useState<number>(10);
  const [moderateThreshold, setModerateThreshold] = useState<number>(25);
  const [cleanReferenceSrc, setCleanReferenceSrc] = useState<string>(
    '/src/assets/images/solar_panel_clean_1794720831972.jpg'
  );

  // Weather & Decision Engine state (Change 2)
  const [simWeather, setSimWeather] = useState({
    humidityPct: 54.0,
    ambientTempC: 32.4,
    rainDetected: false,
    ldrPct: 82.0,
  });
  const [weatherConfig, setWeatherConfig] = useState<WeatherDecisionConfig>({
    maxHumidityPct: 80,
    minDustForCleaningPct: 10,
    criticalDustPct: 25,
    panelTempThresholdC: 45,
    minLightIntensityPct: 20,
    minPowerLossPct: 8,
    requireWeatherSensorsInHardware: true,
  });

  // EDS Controller & Safety Interlock state (Change 3)
  const [edsDriverMode, setEdsDriverMode] = useState<EDSDriverMode>('SIMULATION');
  const [edsState, setEdsState] = useState<EDSState>('IDLE');
  const [hardwareInterlockClosed, setHardwareInterlockClosed] = useState<boolean>(false);
  const [selectedEdsPanelId, setSelectedEdsPanelId] = useState<number>(1);
  const [edsEvents, setEdsEvents] = useState<EDSCleaningEvent[]>([]);

  // Continuous Monitoring & Anti-Flap Safeguards (Change 4 & 7)
  const [monitorState, setMonitorState] = useState<MonitorState>('STOPPED');
  const [autoCleanEnabled, setAutoCleanEnabled] = useState<boolean>(true);
  const [persistenceMap, setPersistenceMap] = useState<Record<number, PanelPersistenceState>>({});
  const [monitorLogs, setMonitorLogs] = useState<string[]>([]);

  // Legacy LED control state
  const [manualOverrideEnabled, setManualOverrideEnabled] = useState<boolean>(false);
  const [manualZones, setManualZones] = useState<boolean[]>([false, true, false, true]);
  const [activeLeds, setActiveLeds] = useState<boolean[]>([false, false, false, false]);
  const [cleaningStatus, setCleaningStatus] = useState<string>('IDLE');
  const [emergencyStop, setEmergencyStop] = useState<boolean>(false);
  const [cleaningLogs, setCleaningLogs] = useState<CleaningLogEntry[]>([]);

  const [energyReport, setEnergyReport] = useState<EnergyBalanceReport>(() =>
    calculateNetEnergyBenefit({
      referenceEnergyWh: 3.62,
      improvedEnergyWh: 4.4805,
      edsCleaningEnergyWh: 0.082,
      controllerEnergyWh: 0.145,
      dataSource: 'SIMULATION',
      observationPeriodMin: 60,
      irradianceWm2: 820,
    })
  );

  const [sensorRows, setSensorRows] = useState<CsvRow[]>([]);
  const [panelMonitorRows, setPanelMonitorRows] = useState<CsvRow[]>([]);
  const [energyRows, setEnergyRows] = useState<CsvRow[]>([]);
  const [experimentRows, setExperimentRows] = useState<CsvRow[]>([]);

  const [serialConnected, setSerialConnected] = useState(false);
  const [serialPortLabel, setSerialPortLabel] = useState('Not connected');
  const serialPortRef = useRef<SerialPortLike | null>(null);
  const serialReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const simStepRef = useRef(0);

  const showNotice = useCallback((msg: string) => setBannerMessage(msg), []);
  const appendMonitorLog = useCallback((msg: string) => {
    const stamp = new Date().toTimeString().slice(0, 8);
    setMonitorLogs((prev) => [`[${stamp}] ${msg}`, ...prev].slice(0, 80));
  }, []);

  useEffect(() => {
    if (!bannerMessage) return;
    const t = setTimeout(() => setBannerMessage(null), 4500);
    return () => clearTimeout(t);
  }, [bannerMessage]);

  const loadCsvDatasets = useCallback(async () => {
    try {
      const [sRes, pRes, eRes, xRes] = await Promise.all([
        fetch('/api/data/sensor_data').then((r) => r.json()),
        fetch('/api/data/panel_monitoring_log').then((r) => r.json()),
        fetch('/api/data/energy_data').then((r) => r.json()),
        fetch('/api/data/experiment_results').then((r) => r.json()),
      ]);
      if (Array.isArray(sRes.rows)) setSensorRows(sRes.rows);
      if (Array.isArray(pRes.rows)) setPanelMonitorRows(pRes.rows);
      if (Array.isArray(eRes.rows)) setEnergyRows(eRes.rows);
      if (Array.isArray(xRes.rows)) setExperimentRows(xRes.rows);
    } catch {
      // Safe fallback
    }
  }, []);

  useEffect(() => {
    loadCsvDatasets();
  }, [loadCsvDatasets]);

  // Simulation stream generator (clearly tagged SIMULATION)
  useEffect(() => {
    if (mode !== 'SIMULATION' || !simAutoStream) return;
    const interval = setInterval(() => {
      simStepRef.current += 1;
      const step = simStepRef.current;
      const avgDust = zoneDust.reduce((a, b) => a + b, 0) / 4;
      const dustFactor = Math.max(0.55, 1 - avgDust / 140);
      const voltageV = Number((6.18 + 0.14 * Math.sin(step * 0.45) * dustFactor).toFixed(2));
      const currentA = Number(((0.76 + 0.05 * Math.cos(step * 0.35)) * dustFactor).toFixed(3));
      const powerW = calculateInstantaneousPower(voltageV, currentA);
      const panelTempC = Number((46.4 + 1.1 * Math.sin(step * 0.25)).toFixed(2));
      const coolingTempC = Number((38.4 + 0.7 * Math.sin(step * 0.25)).toFixed(2));
      const now = new Date();

      setTelemetry((prev) => [
        ...prev.slice(-39),
        {
          timestamp: now.toISOString().slice(0, 19),
          epochMs: now.getTime(),
          voltageV,
          currentA,
          powerW,
          panelTempC,
          coolingTempC,
          referenceTempC: 51.4,
          humidityPct: simWeather.humidityPct,
          ambientTempC: simWeather.ambientTempC,
          rainDetected: simWeather.rainDetected,
          ldrPct: simWeather.ldrPct,
          dht22Valid: true,
          rainSensorValid: true,
          ldrValid: true,
          source: 'SIMULATION',
        },
      ]);
    }, 3000);
    return () => clearInterval(interval);
  }, [mode, simAutoStream, zoneDust, simWeather]);

  const latestTelemetry = telemetry[telemetry.length - 1];

  const weatherInputs: WeatherInputs = useMemo(() => {
    if (mode === 'SIMULATION') {
      return {
        humidityPct: simWeather.humidityPct,
        rainDetected: simWeather.rainDetected,
        ambientTempC: simWeather.ambientTempC,
        panelTempC: latestTelemetry.panelTempC,
        coolingTempC: latestTelemetry.coolingTempC,
        ldrPct: simWeather.ldrPct,
        powerW: latestTelemetry.powerW,
        referencePowerW: 4.6,
        dht22Connected: true,
        rainSensorConnected: true,
        ldrConnected: true,
        isSimulated: true,
      };
    }
    return {
      humidityPct: latestTelemetry.humidityPct,
      rainDetected: latestTelemetry.rainDetected,
      ambientTempC: latestTelemetry.ambientTempC,
      panelTempC: latestTelemetry.panelTempC,
      coolingTempC: latestTelemetry.coolingTempC,
      ldrPct: latestTelemetry.ldrPct,
      powerW: latestTelemetry.powerW,
      referencePowerW: 4.6,
      dht22Connected: latestTelemetry.dht22Valid,
      rainSensorConnected: latestTelemetry.rainSensorValid,
      ldrConnected: latestTelemetry.ldrValid,
      isSimulated: false,
    };
  }, [mode, simWeather, latestTelemetry]);

  const panelDecisions = useMemo(
    () =>
      panels.map((p) =>
        evaluatePanelWeatherDecision(
          p.panelId,
          p.zones.map((z) => z.dustPercentage),
          weatherInputs,
          weatherConfig,
          emergencyStop
        )
      ),
    [panels, weatherInputs, weatherConfig, emergencyStop]
  );

  const disconnectWebSerial = useCallback(async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel();
        serialReaderRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
    } catch {
      // Safe cleanup
    } finally {
      setSerialConnected(false);
      setSerialPortLabel('Disconnected');
    }
  }, []);

  const connectWebSerial = async () => {
    const navSerial = (navigator as unknown as { serial?: { requestPort: () => Promise<SerialPortLike> } }).serial;
    if (!navSerial) {
      showNotice('Web Serial requires Chrome or Edge on desktop. Use Python SerialHandler for COM ports.');
      return;
    }
    try {
      const port = await navSerial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setSerialConnected(true);
      setSerialPortLabel('USB Serial @ 115200');
      setMode('HARDWARE');
      showNotice('Connected to ESP32 via USB Serial at 115200 baud.');

      if (port.readable) {
        const decoder = new TextDecoderStream();
        port.readable.pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>).catch(() => {});
        const reader = decoder.readable.getReader();
        serialReaderRef.current = reader;

        let buffer = '';
        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += value;
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() ?? '';
              for (const line of lines) {
                const pkt = parseEsp32SerialLine(line);
                if (pkt) setTelemetry((prev) => [...prev.slice(-39), pkt]);
              }
            }
          } catch {
            // Stream closed
          }
        })();
      }
    } catch (err) {
      showNotice(err instanceof Error ? `Serial error: ${err.message}` : 'Serial cancelled.');
    }
  };

  const writeSerialCommand = useCallback(
    async (cmd: string): Promise<boolean> => {
      const port = serialPortRef.current;
      if (!port || !port.writable || !serialConnected) return false;
      try {
        const writer = port.writable.getWriter();
        await writer.write(new TextEncoder().encode(cmd.trim() + '\n'));
        writer.releaseLock();
        return true;
      } catch {
        return false;
      }
    },
    [serialConnected]
  );

  const executeEdsCycle = useCallback(
    async (panelId: number, triggeredBy: 'AUTO' | 'MANUAL') => {
      const panel = panels.find((p) => p.panelId === panelId);
      const dec = panelDecisions.find((d) => d.panelId === panelId);
      if (!panel || !dec) return;

      const beforeAvg = panel.overallDustPercentage;
      const nowStr = new Date().toISOString().slice(0, 19);
      const mask = dec.zoneCommand.replace('ZONE:', '');
      const channels = dec.selectedZones
        .map((on, idx) => (on ? `CH${idx + 1}` : null))
        .filter((v): v is string => Boolean(v));

      if (emergencyStop || !dec.cleaningEligible || channels.length === 0) {
        setEdsState('CLEANING_DISABLED_SAFETY');
        const blockedEvent: EDSCleaningEvent = {
          id: `${Date.now()}-${panelId}`,
          timestamp: nowStr,
          panelId,
          zoneMask: '0000',
          channels: [],
          driverMode: edsDriverMode,
          status: 'CLEANING_DISABLED_SAFETY',
          durationSec: 0,
          beforeDustPct: beforeAvg,
          afterDustPct: null,
          cleaningEfficiencyPct: null,
          energyConsumedWh: 0,
          notes: dec.reason,
        };
        setEdsEvents((prev) => [blockedEvent, ...prev]);
        appendMonitorLog(`Panel ${panelId} (${triggeredBy}): ${dec.reason}`);
        showNotice(dec.reason);
        return;
      }

      if (edsDriverMode === 'LED_DEMO_ONLY') {
        if (mode === 'HARDWARE' && serialConnected) {
          await writeSerialCommand(dec.zoneCommand);
        }
        setActiveLeds([...dec.selectedZones]);
        setEdsState('CLEANING_DISABLED_SAFETY');
        const ledEvent: EDSCleaningEvent = {
          id: `${Date.now()}-${panelId}`,
          timestamp: nowStr,
          panelId,
          zoneMask: mask,
          channels,
          driverMode: edsDriverMode,
          status: 'CLEANING_DISABLED_SAFETY',
          durationSec: 0,
          beforeDustPct: beforeAvg,
          afterDustPct: null,
          cleaningEfficiencyPct: null,
          energyConsumedWh: 0,
          notes: 'Indicator LEDs activated for demonstration only. HV EDS electrostatic cleaning NOT performed.',
        };
        setEdsEvents((prev) => [ledEvent, ...prev]);
        appendMonitorLog(`Panel ${panelId}: LED demo ${dec.zoneCommand} (HV EDS disabled).`);
        showNotice('Indicator LEDs activated for demo only — electrostatic cleaning not reported.');
        return;
      }

      if (edsDriverMode === 'ISOLATED_HARDWARE_DRIVER' && !hardwareInterlockClosed) {
        setEdsState('CLEANING_DISABLED_SAFETY');
        showNotice('Blocked: Isolated HV EDS hardware interlock is OPEN.');
        return;
      }

      // Execute Simulation or Verified Isolated Driver Cycle + Post-Cleaning Verification
      setEdsState('CLEANING_ACTIVE');
      if (edsDriverMode === 'ISOLATED_HARDWARE_DRIVER' && mode === 'HARDWARE' && serialConnected) {
        await writeSerialCommand(`EDS_REQ:P${panelId}:${mask}`);
      }

      const durationSec = 12;
      const energyConsumedWh = Number((((2.4 * (channels.length / 4)) * durationSec) / 3600).toFixed(5));
      const updatedZones = panel.zones.map((z, idx) => {
        if (!dec.selectedZones[idx]) return z;
        const reduced = Number((z.dustPercentage * 0.2).toFixed(1));
        return {
          ...z,
          dustPercentage: reduced,
          classification: reduced <= cleanThreshold ? 'Clean' : 'Moderate dust',
          cleaningRecommended: false,
        } as const;
      });
      const afterAvg = Number((updatedZones.reduce((a, z) => a + z.dustPercentage, 0) / 4).toFixed(2));
      const efficiencyPct = calculateCleaningEfficiency(beforeAvg, afterAvg);

      setPanels((prev) =>
        prev.map((p) =>
          p.panelId === panelId ? { ...p, zones: updatedZones, overallDustPercentage: afterAvg } : p
        )
      );
      if (panelId === 1) {
        setZoneDust(updatedZones.map((z) => z.dustPercentage));
      }
      setActiveLeds([...dec.selectedZones]);
      setEdsState('CLEANING_COMPLETED');

      const completedEvent: EDSCleaningEvent = {
        id: `${Date.now()}-${panelId}`,
        timestamp: nowStr,
        panelId,
        zoneMask: mask,
        channels,
        driverMode: edsDriverMode,
        status: 'CLEANING_COMPLETED',
        durationSec,
        beforeDustPct: beforeAvg,
        afterDustPct: afterAvg,
        cleaningEfficiencyPct: efficiencyPct,
        energyConsumedWh,
        notes: `${triggeredBy} 4-phase EDS (${channels.join(', ')}) verified: ${beforeAvg.toFixed(1)}% → ${afterAvg.toFixed(1)}% (${efficiencyPct.toFixed(1)}% eff).`,
      };
      setEdsEvents((prev) => [completedEvent, ...prev]);
      appendMonitorLog(completedEvent.notes);
      showNotice(completedEvent.notes);

      // Append to panel_monitoring_log.csv
      fetch('/api/data/panel_monitoring_log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panel_id: `Panel ${panelId}`,
          z1_dust_pct: updatedZones[0].dustPercentage,
          z2_dust_pct: updatedZones[1].dustPercentage,
          z3_dust_pct: updatedZones[2].dustPercentage,
          z4_dust_pct: updatedZones[3].dustPercentage,
          humidity_pct: weatherInputs.humidityPct ?? '',
          rain_status: dec.rainStatus,
          ldr_reading: weatherInputs.ldrPct ?? '',
          panel_temp_c: weatherInputs.panelTempC,
          voltage_v: latestTelemetry.voltageV,
          current_a: latestTelemetry.currentA,
          power_w: latestTelemetry.powerW,
          weather_classification: dec.atmosphericCondition,
          cleaning_eligibility: 'Permitted',
          selected_zones: mask,
          cleaning_request_status: 'CLEANING_COMPLETED',
          actual_eds_status: edsDriverMode,
          before_cleaning_dust_pct: beforeAvg,
          after_cleaning_dust_pct: afterAvg,
          cleaning_efficiency_pct: efficiencyPct,
          cleaning_energy_wh: energyConsumedWh,
          net_energy_benefit_wh: energyReport.netEnergyBenefitWh,
        }),
      })
        .then(() => loadCsvDatasets())
        .catch(() => {});
    },
    [
      panels,
      panelDecisions,
      emergencyStop,
      edsDriverMode,
      mode,
      serialConnected,
      writeSerialCommand,
      hardwareInterlockClosed,
      cleanThreshold,
      appendMonitorLog,
      showNotice,
      weatherInputs,
      latestTelemetry,
      energyReport.netEnergyBenefitWh,
      loadCsvDatasets,
    ]
  );

  // Continuous Monitoring Autonomous Loop (3-frame persistence + 45s demo cooldown + hysteresis)
  useEffect(() => {
    if (monitorState !== 'RUNNING') return;
    const timer = setInterval(() => {
      const nowMs = Date.now();
      setPersistenceMap((prev) => {
        const next = { ...prev };
        for (const dec of panelDecisions) {
          const cur = next[dec.panelId] ?? {
            panelId: dec.panelId,
            consecutiveDustyFrames: 0,
            lastCleanEpochMs: 0,
            attemptsThisSession: 0,
          };
          const maxDust = Math.max(...dec.zonePercentages);

          if (maxDust <= 18) {
            next[dec.panelId] = { ...cur, consecutiveDustyFrames: 0 };
          } else if (dec.cleaningEligible && dec.selectedZones.some(Boolean)) {
            const nextCount = cur.consecutiveDustyFrames + 1;
            const cooldownOk = nowMs - cur.lastCleanEpochMs >= 45_000;
            if (autoCleanEnabled && nextCount >= 3 && cooldownOk && cur.attemptsThisSession < 5) {
              next[dec.panelId] = {
                panelId: dec.panelId,
                consecutiveDustyFrames: 0,
                lastCleanEpochMs: nowMs,
                attemptsThisSession: cur.attemptsThisSession + 1,
              };
              executeEdsCycle(dec.panelId, 'AUTO');
            } else {
              next[dec.panelId] = { ...cur, consecutiveDustyFrames: nextCount };
              if (nextCount < 3) {
                appendMonitorLog(`Panel ${dec.panelId}: Confirming dust persistence (${nextCount}/3 frames).`);
              }
            }
          }
        }
        return next;
      });
    }, 2500);
    return () => clearInterval(timer);
  }, [monitorState, panelDecisions, autoCleanEnabled, executeEdsCycle, appendMonitorLog]);

  const decision = useMemo(
    () =>
      evaluateCleaningDecision(
        zoneDust,
        moderateThreshold,
        manualOverrideEnabled ? manualZones : null,
        emergencyStop
      ),
    [zoneDust, moderateThreshold, manualOverrideEnabled, manualZones, emergencyStop]
  );

  const accumulatedEnergyWh = useMemo(() => calculateAccumulatedEnergyWh(telemetry), [telemetry]);

  const handleSendCommand = async () => {
    if (emergencyStop) {
      showNotice('Blocked: Emergency Stop is active.');
      return;
    }
    const activeIndices = decision.selectedZones
      .map((flag, i) => (flag ? String(i + 1) : null))
      .filter(Boolean);
    const nextStatus = activeIndices.length ? `ACTIVE_ZONES_${activeIndices.join('_')}` : 'IDLE';
    const hwOk = mode === 'HARDWARE' && serialConnected ? await writeSerialCommand(decision.command) : false;

    setActiveLeds([...decision.selectedZones]);
    setCleaningStatus(nextStatus);
    setCleaningLogs((prev) => [
      {
        id: `${Date.now()}`,
        timestamp: new Date().toISOString().slice(0, 19),
        command: decision.command,
        zoneMask: decision.zoneMask,
        status: nextStatus,
        mode,
        targetDriver: mode === 'HARDWARE' && hwOk ? 'ESP32_LED_ARRAY' : 'SIMULATED_LED_ARRAY',
        notes: hwOk ? `Sent ${decision.command} over USB Serial` : `Indicator LED state ${decision.command} applied (demo only).`,
      },
      ...prev,
    ]);
    showNotice(`Dispatched ${decision.command} (${nextStatus}).`);
  };

  const handleEmergencyStop = async () => {
    setEmergencyStop(true);
    setEdsState('CLEANING_DISABLED_SAFETY');
    setMonitorState('PAUSED');
    setActiveLeds([false, false, false, false]);
    setCleaningStatus('EMERGENCY_STOP');
    if (mode === 'HARDWARE' && serialConnected) await writeSerialCommand('ESTOP');
    appendMonitorLog('EMERGENCY STOP engaged. All channels de-energized.');
    showNotice('Emergency Stop engaged. All zone LEDs and EDS channels locked OFF.');
  };

  const handleResetEmergencyStop = async () => {
    setEmergencyStop(false);
    setEdsState('IDLE');
    setActiveLeds([false, false, false, false]);
    setCleaningStatus('IDLE');
    if (mode === 'HARDWARE' && serialConnected) await writeSerialCommand('RESET');
    appendMonitorLog('Emergency Stop reset. Controller IDLE.');
    showNotice('Safety lock cleared.');
  };

  const handleLogSnapshot = async () => {
    const payload = {
      mode,
      voltage_v: latestTelemetry.voltageV,
      current_a: latestTelemetry.currentA,
      power_w: latestTelemetry.powerW,
      panel_temp_c: latestTelemetry.panelTempC,
      cooling_temp_c: latestTelemetry.coolingTempC,
      temp_reduction_c: calculateTemperatureReduction(latestTelemetry.referenceTempC, latestTelemetry.panelTempC),
      z1_dust_pct: zoneDust[0],
      z2_dust_pct: zoneDust[1],
      z3_dust_pct: zoneDust[2],
      z4_dust_pct: zoneDust[3],
      selected_zones: decision.zoneMask,
      cleaning_status: cleaningStatus,
      generated_energy_wh: accumulatedEnergyWh,
      cleaning_energy_wh: energyReport.edsCleaningEnergyWh,
      net_energy_benefit_wh: energyReport.netEnergyBenefitWh,
    };
    const res = await fetch('/api/data/sensor_data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadCsvDatasets();
      showNotice('Appended current telemetry snapshot to sensor_data.csv.');
    }
  };

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activePage)?.label ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 lg:flex">
      <aside className="w-full shrink-0 border-b border-slate-800/80 bg-[#0B1221] p-5 lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-400">
            <Sun className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-base font-bold tracking-tight text-slate-100">SOLARGUARD</div>
            <div className="text-[11px] text-slate-400">Autonomous Multi-Panel EDS</div>
          </div>
        </div>

        <div className="mt-5 space-y-2 border-y border-slate-800/80 py-3.5">
          <div className="text-[11px] font-medium text-slate-400">Operating Mode</div>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-[#070B14] p-1">
            <button
              onClick={() => setMode('SIMULATION')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'SIMULATION' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Simulation
            </button>
            <button
              onClick={() => setMode('HARDWARE')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'HARDWARE' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hardware
            </button>
          </div>

          {mode === 'SIMULATION' ? (
            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
              <span>Telemetry Stream</span>
              <button
                onClick={() => setSimAutoStream((v) => !v)}
                className={`font-mono text-xs ${simAutoStream ? 'text-emerald-400' : 'text-slate-500'}`}
              >
                {simAutoStream ? 'RUNNING' : 'PAUSED'}
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="text-xs text-slate-400">
                ESP32 Serial:{' '}
                <span className={`font-mono ${serialConnected ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {serialConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {!serialConnected ? (
                <button
                  onClick={connectWebSerial}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500"
                >
                  <Usb className="h-3.5 w-3.5" />
                  Connect ESP32 Port
                </button>
              ) : (
                <button
                  onClick={disconnectWebSerial}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/30 px-3 py-1.5 text-xs font-medium text-rose-200"
                >
                  Disconnect ESP32
                </button>
              )}
            </div>
          )}
        </div>

        <nav className="mt-4 flex flex-row gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-sky-600/15 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 bg-[#0B1221]/60 px-6 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-200">SolarGuard</span>
            <span aria-hidden="true">/</span>
            <span>{activeNavLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-sky-400">
              {panels.length} Panels ({panels.length * 4} Zones)
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-300">Monitor: {monitorState}</span>
          </div>

          <button
            onClick={handleLogSnapshot}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-500 whitespace-nowrap shrink-0"
          >
            <Activity className="h-3.5 w-3.5" />
            Log Snapshot to CSV
          </button>
        </header>

        {bannerMessage && (
          <div className="border-b border-sky-500/30 bg-sky-950/40 px-6 py-2.5 text-xs text-sky-200">
            {bannerMessage}
          </div>
        )}

        <main className="mx-auto w-full max-w-[1280px] flex-1 p-6 lg:p-8">
          {activePage === 'home' && (
            <HomePage
              mode={mode}
              serialConnected={serialConnected}
              serialPortLabel={serialPortLabel}
              latest={latestTelemetry}
              accumulatedEnergyWh={accumulatedEnergyWh}
              zoneDust={zoneDust}
              cleanThreshold={cleanThreshold}
              moderateThreshold={moderateThreshold}
              decision={decision}
              cleaningStatus={cleaningStatus}
              activeLeds={activeLeds}
              energyReport={energyReport}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'vision' && (
            <LiveCameraDustPage
              monitorState={monitorState}
              autoCleanEnabled={autoCleanEnabled}
              edsState={edsState}
              cleanThreshold={cleanThreshold}
              moderateThreshold={moderateThreshold}
              cleanReferenceSrc={cleanReferenceSrc}
              multiPanelSummary={multiPanelSummary}
              panels={panels}
              persistenceMap={persistenceMap}
              monitorLogs={monitorLogs}
              onStartMonitoring={() => {
                setMonitorState('RUNNING');
                appendMonitorLog('Continuous autonomous monitoring started.');
              }}
              onPauseMonitoring={() => {
                setMonitorState('PAUSED');
                appendMonitorLog('Continuous monitoring paused.');
              }}
              onResumeMonitoring={() => {
                setMonitorState('RUNNING');
                appendMonitorLog('Continuous monitoring resumed.');
              }}
              onStopMonitoring={() => {
                setMonitorState('STOPPED');
                appendMonitorLog('Continuous monitoring stopped.');
              }}
              onToggleAutoClean={setAutoCleanEnabled}
              onEmergencyStop={handleEmergencyStop}
              onUpdateThresholds={(c, m) => {
                setCleanThreshold(c);
                setModerateThreshold(m);
              }}
              onUpdateCleanReference={(src) => {
                setCleanReferenceSrc(src);
                showNotice('Updated clean baseline reference image.');
              }}
              onMultiPanelDetected={(summary) => {
                setMultiPanelSummary(summary);
                if (summary.panels.length > 0) {
                  setPanels(summary.panels);
                  setZoneDust(summary.panels[0].zones.map((z) => z.dustPercentage));
                }
                appendMonitorLog(
                  `Detected ${summary.panelsDetectedCount} panel(s) across ${summary.panelsDetectedCount * 4} zones (${summary.methodSummary}).`
                );
              }}
            />
          )}

          {activePage === 'weather' && (
            <WeatherMonitoringPage
              mode={mode}
              weather={weatherInputs}
              sampleDecision={panelDecisions[0]}
              simWeather={simWeather}
              onUpdateSimWeather={(patch) => setSimWeather((prev) => ({ ...prev, ...patch }))}
            />
          )}

          {activePage === 'decisions' && (
            <DecisionsPage
              decisions={panelDecisions}
              config={weatherConfig}
              onUpdateConfig={(patch) => setWeatherConfig((prev) => ({ ...prev, ...patch }))}
            />
          )}

          {activePage === 'eds' && (
            <EdsControlPage
              driverMode={edsDriverMode}
              edsState={edsState}
              hardwareInterlockClosed={hardwareInterlockClosed}
              emergencyStop={emergencyStop}
              decisions={panelDecisions}
              selectedPanelId={selectedEdsPanelId}
              events={edsEvents}
              onSelectPanel={setSelectedEdsPanelId}
              onChangeDriverMode={(nextMode) => {
                setEdsDriverMode(nextMode);
                setEdsState(nextMode === 'LED_DEMO_ONLY' ? 'CLEANING_DISABLED_SAFETY' : 'EDS_DRIVER_READY');
              }}
              onToggleInterlock={setHardwareInterlockClosed}
              onDispatchEds={(pid) => executeEdsCycle(pid, 'MANUAL')}
              onEmergencyStop={handleEmergencyStop}
              onResetEmergencyStop={handleResetEmergencyStop}
            />
          )}

          {activePage === 'cleaning' && (
            <CleaningControlPage
              mode={mode}
              serialConnected={serialConnected}
              serialPortLabel={serialPortLabel}
              zoneDust={zoneDust}
              moderateThreshold={moderateThreshold}
              decision={decision}
              manualOverrideEnabled={manualOverrideEnabled}
              manualZones={manualZones}
              activeLeds={activeLeds}
              cleaningStatus={cleaningStatus}
              emergencyStop={emergencyStop}
              logs={cleaningLogs}
              onToggleManualOverride={setManualOverrideEnabled}
              onToggleManualZone={(idx) => setManualZones((prev) => prev.map((v, i) => (i === idx ? !v : v)))}
              onSendCommand={handleSendCommand}
              onEmergencyStop={handleEmergencyStop}
              onResetEmergencyStop={handleResetEmergencyStop}
              onConnectWebSerial={connectWebSerial}
            />
          )}

          {activePage === 'thermal' && (
            <ThermalMonitoringPage
              mode={mode}
              history={telemetry}
              experimentRows={experimentRows}
              onAppendExperiment={async (row) => {
                const res = await fetch('/api/data/experiment_results', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(row),
                });
                if (res.ok) {
                  await loadCsvDatasets();
                  showNotice('Appended thermal cooling trial to experiment_results.csv.');
                }
              }}
            />
          )}

          {activePage === 'power' && (
            <PowerMonitoringPage
              history={telemetry}
              accumulatedEnergyWh={accumulatedEnergyWh}
              avgDustPct={
                panels.length
                  ? panels.reduce((a, p) => a + p.overallDustPercentage, 0) / panels.length
                  : zoneDust.reduce((a, b) => a + b, 0) / 4
              }
              cleaningThresholdPct={moderateThreshold}
              ldrPct={weatherInputs.ldrPct}
            />
          )}

          {activePage === 'energy' && (
            <EnergyAnalysisPage
              mode={mode}
              report={energyReport}
              onUpdateReport={async (report, saveToCsv, notes) => {
                setEnergyReport(report);
                if (saveToCsv) {
                  const res = await fetch('/api/data/energy_data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      data_source: report.dataSource,
                      observation_period_min: report.observationPeriodMin,
                      irradiance_wm2: report.irradianceWm2,
                      reference_energy_wh: report.referenceEnergyWh,
                      improved_energy_wh: report.improvedEnergyWh,
                      additional_energy_wh: report.additionalEnergyWh,
                      cleaning_energy_wh: report.edsCleaningEnergyWh,
                      controller_energy_wh: report.controllerEnergyWh,
                      total_consumption_wh: report.totalConsumptionWh,
                      net_energy_benefit_wh: report.netEnergyBenefitWh,
                      balance_status: report.balanceStatus,
                      notes,
                    }),
                  });
                  if (res.ok) {
                    await loadCsvDatasets();
                    showNotice('Saved Net Energy Benefit calculation to energy_data.csv.');
                  }
                } else {
                  showNotice('Updated Net Energy Benefit metrics.');
                }
              }}
            />
          )}

          {activePage === 'reports' && (
            <DataReportsPage
              sensorRows={sensorRows}
              panelMonitorRows={panelMonitorRows}
              energyRows={energyRows}
              experimentRows={experimentRows}
              cleaningLogs={cleaningLogs}
              onRefreshData={loadCsvDatasets}
            />
          )}
        </main>
      </div>
    </div>
  );
}
