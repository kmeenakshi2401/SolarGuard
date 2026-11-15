export type OperatingMode = 'SIMULATION' | 'HARDWARE';

export type NavPageId =
  | 'home'
  | 'vision'
  | 'weather'
  | 'decisions'
  | 'eds'
  | 'cleaning'
  | 'thermal'
  | 'power'
  | 'energy'
  | 'reports';

export type DustAnalysisMode = 'AUTO' | 'INTRINSIC_SURFACE' | 'REFERENCE_DIFF';

export type DustClassification = 'Clean' | 'Moderate dust' | 'Dusty - cleaning recommended';

export interface TelemetryPoint {
  timestamp: string;
  epochMs: number;
  voltageV: number;
  currentA: number;
  powerW: number;
  panelTempC: number;
  coolingTempC: number;
  referenceTempC: number;
  humidityPct: number | null;
  ambientTempC: number | null;
  rainDetected: boolean | null;
  ldrPct: number | null;
  dht22Valid: boolean;
  rainSensorValid: boolean;
  ldrValid: boolean;
  source: 'SIMULATION' | 'HARDWARE_ESP32';
}

export interface ZoneDustResult {
  zoneId: number;
  zoneName: string;
  dustPercentage: number;
  classification: DustClassification;
  cleaningRecommended: boolean;
  boundingBoxCount: number;
}

export interface DetectedPanelAnalysis {
  panelId: number;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  partiallyVisible: boolean;
  zones: ZoneDustResult[];
  overallDustPercentage: number;
  methodUsed?: string;
}

export interface MultiPanelAnalysisSummary {
  panels: DetectedPanelAnalysis[];
  panelsDetectedCount: number;
  annotatedDataUrl: string;
  analyzedAt: string;
  sourceLabel: string;
  methodSummary: string;
  warning: string | null;
}

export interface PowerEfficiencyForecast {
  instantaneousPowerW: number;
  currentEfficiencyPct: number;
  ratedEfficiencyPct: number;
  efficiencyRetentionPct: number;
  minEarlierEfficiencyPct: number;
  maxEarlierEfficiencyPct: number;
  avgEarlierEfficiencyPct: number;
  efficiencyDeltaPct: number;
  estimatedEffectiveDaylightHours: number;
  estimatedDaysBeforeCleaning: number;
  thermalMarginToDerateC: number;
  batteryAutonomyHours: number;
  summaryReport: string;
}

export interface WeatherDecisionConfig {
  maxHumidityPct: number;
  minDustForCleaningPct: number;
  criticalDustPct: number;
  panelTempThresholdC: number;
  minLightIntensityPct: number;
  minPowerLossPct: number;
  requireWeatherSensorsInHardware: boolean;
}

export interface WeatherInputs {
  humidityPct: number | null;
  rainDetected: boolean | null;
  ambientTempC: number | null;
  panelTempC: number;
  coolingTempC: number;
  ldrPct: number | null;
  powerW: number;
  referencePowerW: number;
  dht22Connected: boolean;
  rainSensorConnected: boolean;
  ldrConnected: boolean;
  isSimulated: boolean;
}

export interface PanelWeatherDecision {
  panelId: number;
  zonePercentages: number[];
  atmosphericCondition: string;
  dustCondition: string;
  humidityStatus: string;
  rainStatus: string;
  panelTempStatus: string;
  passiveCoolingActive: boolean;
  recommendedAction: string;
  cleaningEligible: boolean;
  selectedZones: boolean[];
  zoneCommand: string;
  reason: string;
  conditionCode: string;
}

export type EDSDriverMode = 'SIMULATION' | 'LED_DEMO_ONLY' | 'ISOLATED_HARDWARE_DRIVER';

export type EDSState =
  | 'IDLE'
  | 'CLEANING_REQUESTED'
  | 'CLEANING_PERMITTED'
  | 'EDS_DRIVER_READY'
  | 'CLEANING_ACTIVE'
  | 'CLEANING_COMPLETED'
  | 'CLEANING_FAILED'
  | 'CLEANING_DISABLED_SAFETY';

export interface EDSCleaningEvent {
  id: string;
  timestamp: string;
  panelId: number;
  zoneMask: string;
  channels: string[];
  driverMode: EDSDriverMode;
  status: EDSState;
  durationSec: number;
  beforeDustPct: number;
  afterDustPct: number | null;
  cleaningEfficiencyPct: number | null;
  energyConsumedWh: number;
  notes: string;
}

export type MonitorState = 'STOPPED' | 'RUNNING' | 'PAUSED' | 'FAULT_RECOVERY';

export interface PanelPersistenceState {
  panelId: number;
  consecutiveDustyFrames: number;
  lastCleanEpochMs: number;
  attemptsThisSession: number;
}

export interface CleaningDecision {
  zonePercentages: number[];
  zoneRecommendations: boolean[];
  selectedZones: boolean[];
  zoneMask: string;
  command: string;
  statusMessages: string[];
  manualOverrideActive: boolean;
  emergencyStopActive: boolean;
}

export interface CleaningLogEntry {
  id: string;
  timestamp: string;
  command: string;
  zoneMask: string;
  status: string;
  mode: OperatingMode;
  targetDriver: string;
  notes: string;
}

export interface EnergyBalanceReport {
  referenceEnergyWh: number;
  improvedEnergyWh: number;
  additionalEnergyWh: number;
  edsCleaningEnergyWh: number;
  controllerEnergyWh: number;
  totalConsumptionWh: number;
  netEnergyBenefitWh: number;
  energyGainPct: number;
  balanceStatus: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  dataSource: 'SIMULATION' | 'EXPERIMENTAL';
  observationPeriodMin: number;
  irradianceWm2: number;
}

export interface CsvRow {
  [key: string]: string;
}
