import type {
  CleaningDecision,
  DustClassification,
  EnergyBalanceReport,
  PanelWeatherDecision,
  PowerEfficiencyForecast,
  TelemetryPoint,
  WeatherDecisionConfig,
  WeatherInputs,
} from '../types/solarguard';

export function classifyDustLevel(
  dustPercentage: number,
  cleanMaxPct = 10,
  moderateMaxPct = 25
): DustClassification {
  if (dustPercentage <= cleanMaxPct) return 'Clean';
  if (dustPercentage <= moderateMaxPct) return 'Moderate dust';
  return 'Dusty - cleaning recommended';
}

export function calculateCleaningEfficiency(beforeDustPct: number, afterDustPct: number): number {
  if (beforeDustPct <= 0) return 0;
  const eff = ((beforeDustPct - Math.max(0, afterDustPct)) / beforeDustPct) * 100;
  return Number(Math.max(-100, Math.min(100, eff)).toFixed(2));
}

export function calculatePanelEfficiencyPct(
  powerW: number,
  irradianceWm2: number,
  panelAreaM2 = 0.036
): number {
  if (irradianceWm2 <= 10 || panelAreaM2 <= 0) return 0;
  const eff = (Math.max(0, powerW) / (irradianceWm2 * panelAreaM2)) * 100;
  return Number(Math.max(0, Math.min(35, eff)).toFixed(2));
}

export function evaluatePowerEfficiencyAndRuntime(params: {
  powerHistoryW: number[];
  irradianceWm2: number;
  panelAreaM2: number;
  ratedEfficiencyPct: number;
  panelTempC: number;
  avgDustPct: number;
  soilingRatePctPerDay: number;
  cleaningThresholdPct: number;
  batteryCapacityWh: number;
  loadPowerW: number;
}): PowerEfficiencyForecast {
  const history = params.powerHistoryW.length ? params.powerHistoryW : [0];
  const effSeries = history.map((p) =>
    calculatePanelEfficiencyPct(p, params.irradianceWm2, params.panelAreaM2)
  );
  const currentPower = history[history.length - 1];
  const currentEff = effSeries[effSeries.length - 1];
  const earliestEff = effSeries[0];
  const minEff = Math.min(...effSeries);
  const maxEff = Math.max(...effSeries);
  const avgEff = Number((effSeries.reduce((a, b) => a + b, 0) / effSeries.length).toFixed(2));
  const deltaEff = Number((currentEff - earliestEff).toFixed(2));
  const retention =
    params.ratedEfficiencyPct > 0
      ? Number(((currentEff / params.ratedEfficiencyPct) * 100).toFixed(1))
      : 0;

  const effectiveDaylightHours = Number(
    Math.max(0, Math.min(10, (params.irradianceWm2 / 1000) * 6.5)).toFixed(1)
  );
  const dustHeadroom = Math.max(0, params.cleaningThresholdPct - params.avgDustPct);
  const daysBeforeCleaning = Number(
    (dustHeadroom / Math.max(0.2, params.soilingRatePctPerDay)).toFixed(1)
  );
  const thermalMargin = Number((65 - params.panelTempC).toFixed(1));
  const netSurplusW = Math.max(0.1, currentPower - 0.15);
  const safeLoad = Math.max(0.2, params.loadPowerW);
  const autonomyHours = Number(
    (
      params.batteryCapacityWh / safeLoad +
      (currentPower >= safeLoad ? effectiveDaylightHours * (netSurplusW / safeLoad) : 0)
    ).toFixed(1)
  );

  const trendWord = deltaEff > 0.1 ? 'improved' : deltaEff < -0.1 ? 'declined' : 'remained steady';
  const summaryReport =
    `At ${params.irradianceWm2.toFixed(0)} W/m² over a ${params.panelAreaM2.toFixed(3)} m² active area, the panel is currently converting solar irradiance at ${currentEff.toFixed(2)}% efficiency (${retention.toFixed(1)}% of its ${params.ratedEfficiencyPct.toFixed(1)}% STC rating). ` +
    `Earlier in this monitoring run, efficiency varied between ${minEff.toFixed(2)}% and ${maxEff.toFixed(2)}% (mean ${avgEff.toFixed(2)}%) and has ${trendWord} by ${deltaEff >= 0 ? '+' : ''}${deltaEff.toFixed(2)}% from the initial baseline. ` +
    `With ${params.avgDustPct.toFixed(1)}% average dust and a ${thermalMargin >= 0 ? '+' : ''}${thermalMargin.toFixed(1)} °C margin below the 65 °C thermal derating limit, the system is projected to maintain effective generation for ~${effectiveDaylightHours.toFixed(1)} hours today (~${autonomyHours.toFixed(1)} hours combined load autonomy with ${params.batteryCapacityWh.toFixed(0)} Wh storage) and ~${daysBeforeCleaning.toFixed(1)} day(s) before reaching the ${params.cleaningThresholdPct.toFixed(0)}% cleaning trigger.`;

  return {
    instantaneousPowerW: Number(currentPower.toFixed(3)),
    currentEfficiencyPct: currentEff,
    ratedEfficiencyPct: params.ratedEfficiencyPct,
    efficiencyRetentionPct: retention,
    minEarlierEfficiencyPct: minEff,
    maxEarlierEfficiencyPct: maxEff,
    avgEarlierEfficiencyPct: avgEff,
    efficiencyDeltaPct: deltaEff,
    estimatedEffectiveDaylightHours: effectiveDaylightHours,
    estimatedDaysBeforeCleaning: daysBeforeCleaning,
    thermalMarginToDerateC: thermalMargin,
    batteryAutonomyHours: autonomyHours,
    summaryReport,
  };
}

export function evaluatePanelWeatherDecision(
  panelId: number,
  zonePercentages: number[],
  weather: WeatherInputs,
  config: WeatherDecisionConfig,
  emergencyStop = false
): PanelWeatherDecision {
  const pcts = zonePercentages.map((p) => Math.max(0, Math.min(100, Number(p) || 0)));
  const maxDust = Math.max(...pcts);
  const avgDust = pcts.reduce((a, b) => a + b, 0) / 4;
  const isHot = weather.panelTempC >= config.panelTempThresholdC;
  const passiveCoolingActive = isHot;
  const tempStatus = `${isHot ? 'Hot' : 'Normal'} (${weather.panelTempC.toFixed(1)} °C)`;
  const powerLossPct =
    weather.referencePowerW > 0
      ? Math.max(0, ((weather.referencePowerW - weather.powerW) / weather.referencePowerW) * 100)
      : 0;

  const humidityStatus =
    weather.dht22Connected && weather.humidityPct !== null
      ? `${weather.humidityPct > config.maxHumidityPct ? 'High' : 'Acceptable'} (${weather.humidityPct.toFixed(1)}%)`
      : 'DHT22 Disconnected (Unmeasured)';

  const rainStatus =
    weather.rainSensorConnected && weather.rainDetected !== null
      ? weather.rainDetected
        ? 'Rain Detected'
        : 'Dry (No Rain)'
      : 'Rain Sensor Disconnected (Unmeasured)';

  const dustCondition =
    maxDust <= config.minDustForCleaningPct
      ? `Clean (Max ${maxDust.toFixed(1)}%)`
      : maxDust <= config.criticalDustPct
        ? `Light/Moderate Dust (Max ${maxDust.toFixed(1)}%)`
        : `Very Dusty / Critical (Max ${maxDust.toFixed(1)}%)`;

  if (emergencyStop) {
    return {
      panelId,
      zonePercentages: pcts,
      atmosphericCondition: 'Safety Lockout',
      dustCondition,
      humidityStatus,
      rainStatus,
      panelTempStatus: tempStatus,
      passiveCoolingActive,
      recommendedAction: 'System halted (Emergency Stop active)',
      cleaningEligible: false,
      selectedZones: [false, false, false, false],
      zoneCommand: 'ZONE:0000',
      reason: `Panel ${panelId}: Cleaning disabled. Emergency Stop is engaged.`,
      conditionCode: 'ESTOP_LOCK',
    };
  }

  if (
    !weather.isSimulated &&
    config.requireWeatherSensorsInHardware &&
    (!weather.dht22Connected || !weather.rainSensorConnected)
  ) {
    return {
      panelId,
      zonePercentages: pcts,
      atmosphericCondition: 'Sensors Unavailable',
      dustCondition,
      humidityStatus,
      rainStatus,
      panelTempStatus: tempStatus,
      passiveCoolingActive,
      recommendedAction: 'Wait — connect DHT22 and Rain sensor for safe weather gating',
      cleaningEligible: false,
      selectedZones: [false, false, false, false],
      zoneCommand: 'ZONE:0000',
      reason: `Panel ${panelId}: Cleaning disabled for safety. Missing DHT22 or Rain sensor telemetry.`,
      conditionCode: 'SENSOR_MISSING',
    };
  }

  if (weather.rainSensorConnected && weather.rainDetected) {
    return {
      panelId,
      zonePercentages: pcts,
      atmosphericCondition: 'Rainy / Wet',
      dustCondition,
      humidityStatus,
      rainStatus,
      panelTempStatus: tempStatus,
      passiveCoolingActive,
      recommendedAction: 'Suspend EDS cleaning; wait until panel dries',
      cleaningEligible: false,
      selectedZones: [false, false, false, false],
      zoneCommand: 'ZONE:0000',
      reason: `Panel ${panelId}: Cleaning suspended. Rain detected on surface.`,
      conditionCode: 'COND_5_RAIN',
    };
  }

  if (weather.dht22Connected && weather.humidityPct !== null && weather.humidityPct > config.maxHumidityPct) {
    return {
      panelId,
      zonePercentages: pcts,
      atmosphericCondition: 'High Humidity / Fog / Dew',
      dustCondition,
      humidityStatus,
      rainStatus,
      panelTempStatus: tempStatus,
      passiveCoolingActive,
      recommendedAction: `Postpone EDS cleaning until RH <= ${config.maxHumidityPct.toFixed(0)}%`,
      cleaningEligible: false,
      selectedZones: [false, false, false, false],
      zoneCommand: 'ZONE:0000',
      reason: `Panel ${panelId}: Cleaning postponed. Humidity (${weather.humidityPct.toFixed(1)}%) exceeds ${config.maxHumidityPct.toFixed(0)}% threshold.`,
      conditionCode: 'COND_6_HIGH_HUMIDITY',
    };
  }

  if (weather.ldrConnected && weather.ldrPct !== null && weather.ldrPct < config.minLightIntensityPct) {
    if (maxDust <= config.criticalDustPct) {
      return {
        panelId,
        zonePercentages: pcts,
        atmosphericCondition: 'Low Irradiance / Night',
        dustCondition,
        humidityStatus,
        rainStatus,
        panelTempStatus: tempStatus,
        passiveCoolingActive,
        recommendedAction: 'Monitor only (low light intensity)',
        cleaningEligible: false,
        selectedZones: [false, false, false, false],
        zoneCommand: 'ZONE:0000',
        reason: `Panel ${panelId}: Monitoring only. Light intensity (${weather.ldrPct.toFixed(0)}%) is below ${config.minLightIntensityPct.toFixed(0)}%.`,
        conditionCode: 'LOW_LIGHT_MONITOR',
      };
    }
  }

  if (maxDust <= config.minDustForCleaningPct) {
    if (isHot) {
      return {
        panelId,
        zonePercentages: pcts,
        atmosphericCondition: 'Dry & Hot',
        dustCondition,
        humidityStatus,
        rainStatus,
        panelTempStatus: tempStatus,
        passiveCoolingActive: true,
        recommendedAction: 'Do not clean; rely on passive PCM cooling',
        cleaningEligible: false,
        selectedZones: [false, false, false, false],
        zoneCommand: 'ZONE:0000',
        reason: `Panel ${panelId}: No cleaning required. Dust is below threshold; passive PCM cooling handles thermal load.`,
        conditionCode: 'COND_3_DRY_CLEAN_HOT',
      };
    }
    return {
      panelId,
      zonePercentages: pcts,
      atmosphericCondition: 'Dry & Mild',
      dustCondition,
      humidityStatus,
      rainStatus,
      panelTempStatus: tempStatus,
      passiveCoolingActive: false,
      recommendedAction: 'Idle mode (save energy)',
      cleaningEligible: false,
      selectedZones: [false, false, false, false],
      zoneCommand: 'ZONE:0000',
      reason: `Panel ${panelId}: No cleaning required. Dust coverage is below the threshold.`,
      conditionCode: 'COND_4_DRY_CLEAN_MILD',
    };
  }

  if (maxDust <= config.criticalDustPct && powerLossPct < config.minPowerLossPct) {
    return {
      panelId,
      zonePercentages: pcts,
      atmosphericCondition: 'Dry',
      dustCondition,
      humidityStatus,
      rainStatus,
      panelTempStatus: tempStatus,
      passiveCoolingActive,
      recommendedAction: 'Continue monitoring (insignificant power loss)',
      cleaningEligible: false,
      selectedZones: [false, false, false, false],
      zoneCommand: 'ZONE:0000',
      reason: `Panel ${panelId}: Monitoring only. Light dust (avg ${avgDust.toFixed(1)}%) with ${powerLossPct.toFixed(1)}% power loss.`,
      conditionCode: 'COND_7_LIGHT_DUST_MONITOR',
    };
  }

  let selected = pcts.map(
    (p) => p > config.criticalDustPct || (p > config.minDustForCleaningPct && powerLossPct >= config.minPowerLossPct)
  );
  if (!selected.some(Boolean)) {
    selected = pcts.map((p) => p > config.minDustForCleaningPct);
  }
  const zoneNumbers = selected.map((on, i) => (on ? String(i + 1) : null)).filter(Boolean).join(', ');
  const mask = selected.map((on) => (on ? '1' : '0')).join('');

  return {
    panelId,
    zonePercentages: pcts,
    atmosphericCondition: isHot ? 'Dry & Hot' : 'Dry & Mild',
    dustCondition,
    humidityStatus,
    rainStatus,
    panelTempStatus: tempStatus,
    passiveCoolingActive,
    recommendedAction:
      maxDust > config.criticalDustPct && powerLossPct >= config.minPowerLossPct
        ? `Priority selective clean: Zones ${zoneNumbers}`
        : isHot
          ? `Clean Zones ${zoneNumbers}; passive PCM cooling active`
          : `Clean dusty Zones ${zoneNumbers}`,
    cleaningEligible: true,
    selectedZones: selected,
    zoneCommand: `ZONE:${mask}`,
    reason: `Panel ${panelId}: Cleaning permitted. Zones ${zoneNumbers} are dusty, humidity is acceptable, and no rain is detected.`,
    conditionCode: isHot ? 'COND_1_DRY_DUSTY_HOT' : 'COND_2_DRY_DUSTY_MILD',
  };
}

export function evaluateCleaningDecision(
  zonePercentages: number[],
  thresholdPct = 25,
  manualOverride: boolean[] | null = null,
  emergencyStop = false
): CleaningDecision {
  const cleaned = zonePercentages.map((p) => Math.max(0, Math.min(100, Number(p) || 0)));
  const autoRecs = cleaned.map((pct) => pct > thresholdPct);

  if (emergencyStop) {
    return {
      zonePercentages: cleaned,
      zoneRecommendations: autoRecs,
      selectedZones: [false, false, false, false],
      zoneMask: '0000',
      command: 'ZONE:0000',
      statusMessages: [0, 1, 2, 3].map((i) => `Zone ${i + 1}: Halted (Emergency Stop Active)`),
      manualOverrideActive: false,
      emergencyStopActive: true,
    };
  }

  const overrideActive = manualOverride !== null && manualOverride.length === 4;
  const selected = overrideActive ? manualOverride.map(Boolean) : [...autoRecs];
  const mask = selected.map((s) => (s ? '1' : '0')).join('');
  const messages = selected.map((isSelected, idx) => {
    if (isSelected) {
      return `Zone ${idx + 1}: ${overrideActive ? 'Manual override ON' : 'Cleaning recommended'} (${cleaned[idx].toFixed(1)}%)`;
    }
    return `Zone ${idx + 1}: No cleaning (${cleaned[idx].toFixed(1)}%)`;
  });

  return {
    zonePercentages: cleaned,
    zoneRecommendations: autoRecs,
    selectedZones: selected,
    zoneMask: mask,
    command: `ZONE:${mask}`,
    statusMessages: messages,
    manualOverrideActive: overrideActive,
    emergencyStopActive: false,
  };
}

export function calculateTemperatureReduction(referenceTempC: number, cooledTempC: number): number {
  return Number((referenceTempC - cooledTempC).toFixed(2));
}

export function calculateInstantaneousPower(voltageV: number, currentA: number): number {
  return Number((Math.max(0, voltageV) * Math.max(0, currentA)).toFixed(4));
}

export function calculateAccumulatedEnergyWh(samples: TelemetryPoint[], maxGapSeconds = 300): number {
  if (samples.length < 2) return 0;
  const ordered = [...samples].sort((a, b) => a.epochMs - b.epochMs);
  let totalWh = 0;
  for (let i = 1; i < ordered.length; i++) {
    const dtSec = (ordered[i].epochMs - ordered[i - 1].epochMs) / 1000;
    if (dtSec <= 0 || dtSec > maxGapSeconds) continue;
    const avgPower = 0.5 * (Math.max(0, ordered[i - 1].powerW) + Math.max(0, ordered[i].powerW));
    totalWh += (avgPower * dtSec) / 3600;
  }
  return Number(totalWh.toFixed(5));
}

export function calculateNetEnergyBenefit(params: {
  referenceEnergyWh: number;
  improvedEnergyWh: number;
  edsCleaningEnergyWh: number;
  controllerEnergyWh: number;
  dataSource: 'SIMULATION' | 'EXPERIMENTAL';
  observationPeriodMin: number;
  irradianceWm2: number;
}): EnergyBalanceReport {
  const refWh = Math.max(0, params.referenceEnergyWh);
  const impWh = Math.max(0, params.improvedEnergyWh);
  const edsWh = Math.max(0, params.edsCleaningEnergyWh);
  const ctrlWh = Math.max(0, params.controllerEnergyWh);

  const additionalEnergyWh = Number((impWh - refWh).toFixed(4));
  const totalConsumptionWh = Number((edsWh + ctrlWh).toFixed(4));
  const netEnergyBenefitWh = Number((additionalEnergyWh - totalConsumptionWh).toFixed(4));
  const energyGainPct = refWh > 0 ? Number((((impWh - refWh) / refWh) * 100).toFixed(2)) : 0;

  let balanceStatus: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' = 'NEUTRAL';
  if (netEnergyBenefitWh > 0.0001) balanceStatus = 'POSITIVE';
  else if (netEnergyBenefitWh < -0.0001) balanceStatus = 'NEGATIVE';

  return {
    referenceEnergyWh: Number(refWh.toFixed(4)),
    improvedEnergyWh: Number(impWh.toFixed(4)),
    additionalEnergyWh,
    edsCleaningEnergyWh: Number(edsWh.toFixed(4)),
    controllerEnergyWh: Number(ctrlWh.toFixed(4)),
    totalConsumptionWh,
    netEnergyBenefitWh,
    energyGainPct,
    balanceStatus,
    dataSource: params.dataSource,
    observationPeriodMin: params.observationPeriodMin,
    irradianceWm2: params.irradianceWm2,
  };
}

export function parseEsp32SerialLine(line: string): TelemetryPoint | null {
  const cleaned = line.trim();
  if (!cleaned.startsWith('DATA,')) return null;
  const parts = cleaned.split(',');
  if (parts.length !== 6 && parts.length !== 11) return null;

  const voltageV = Number(parts[1]);
  const currentA = Number(parts[2]);
  const powerW = Number(parts[3]);
  const panelTempC = Number(parts[4]);
  const coolingTempC = Number(parts[5]);

  if (
    [voltageV, currentA, powerW, panelTempC, coolingTempC].some((n) => Number.isNaN(n)) ||
    voltageV < 0 ||
    voltageV > 36 ||
    currentA < 0 ||
    currentA > 10 ||
    powerW < 0
  ) {
    return null;
  }

  let humidityPct: number | null = null;
  let ambientTempC: number | null = null;
  let rainDetected: boolean | null = null;
  let ldrPct: number | null = null;
  let dht22Valid = false;
  let rainSensorValid = false;
  let ldrValid = false;

  if (parts.length === 11) {
    const rawHum = Number(parts[6]);
    const rawAmb = Number(parts[7]);
    const rawRain = Number(parts[8]);
    const rawLdr = Number(parts[9]);
    const mask = Number(parts[10]);

    if ((mask & 8) !== 0 && !Number.isNaN(rawHum) && rawHum >= 0 && rawHum <= 100 && !Number.isNaN(rawAmb)) {
      humidityPct = Number(rawHum.toFixed(1));
      ambientTempC = Number(rawAmb.toFixed(2));
      dht22Valid = true;
    }
    if (rawRain === 0 || rawRain === 1) {
      rainDetected = rawRain === 1;
      rainSensorValid = true;
    }
    if (!Number.isNaN(rawLdr) && rawLdr >= 0 && rawLdr <= 100) {
      ldrPct = Number(rawLdr.toFixed(1));
      ldrValid = true;
    }
  }

  const now = new Date();
  return {
    timestamp: now.toISOString().slice(0, 19),
    epochMs: now.getTime(),
    voltageV: Number(voltageV.toFixed(3)),
    currentA: Number(currentA.toFixed(3)),
    powerW: Number(powerW.toFixed(4)),
    panelTempC: Number(panelTempC.toFixed(2)),
    coolingTempC: Number(coolingTempC.toFixed(2)),
    referenceTempC: 51.4,
    humidityPct,
    ambientTempC,
    rainDetected,
    ldrPct,
    dht22Valid,
    rainSensorValid,
    ldrValid,
    source: 'HARDWARE_ESP32',
  };
}
