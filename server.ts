import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const ROOT_DIR = process.cwd();
const SOLARGUARD_DIR = path.join(ROOT_DIR, 'SolarGuard');
const DATA_DIR = path.join(SOLARGUARD_DIR, 'data');

const CSV_SCHEMAS: Record<string, string[]> = {
  sensor_data: [
    'timestamp',
    'mode',
    'voltage_v',
    'current_a',
    'power_w',
    'panel_temp_c',
    'cooling_temp_c',
    'temp_reduction_c',
    'z1_dust_pct',
    'z2_dust_pct',
    'z3_dust_pct',
    'z4_dust_pct',
    'selected_zones',
    'cleaning_status',
    'generated_energy_wh',
    'cleaning_energy_wh',
    'net_energy_benefit_wh',
  ],
  panel_monitoring_log: [
    'timestamp',
    'panel_id',
    'z1_dust_pct',
    'z2_dust_pct',
    'z3_dust_pct',
    'z4_dust_pct',
    'humidity_pct',
    'rain_status',
    'ldr_reading',
    'panel_temp_c',
    'voltage_v',
    'current_a',
    'power_w',
    'weather_classification',
    'cleaning_eligibility',
    'selected_zones',
    'cleaning_request_status',
    'actual_eds_status',
    'before_cleaning_dust_pct',
    'after_cleaning_dust_pct',
    'cleaning_efficiency_pct',
    'cleaning_energy_wh',
    'net_energy_benefit_wh',
  ],
  energy_data: [
    'timestamp',
    'data_source',
    'observation_period_min',
    'irradiance_wm2',
    'reference_energy_wh',
    'improved_energy_wh',
    'additional_energy_wh',
    'cleaning_energy_wh',
    'controller_energy_wh',
    'total_consumption_wh',
    'net_energy_benefit_wh',
    'balance_status',
    'notes',
  ],
  experiment_results: [
    'timestamp',
    'data_source',
    'cooling_config',
    'reference_panel_temp_c',
    'cooled_panel_temp_c',
    'cooling_assembly_temp_c',
    'temp_reduction_c',
    'avg_power_w',
    'dust_coverage_avg_pct',
    'selected_zones',
    'notes',
  ],
};

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCsvFile(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? '';
    });
    return obj;
  });
}

function appendCsvRow(dataset: string, row: Record<string, unknown>): Record<string, unknown> {
  const headers = CSV_SCHEMAS[dataset];
  if (!headers) {
    throw new Error(`Unknown dataset: ${dataset}`);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `${dataset}.csv`);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    fs.writeFileSync(filePath, headers.join(',') + '\n', 'utf-8');
  }
  const timestamp = row.timestamp ? String(row.timestamp) : new Date().toISOString().slice(0, 19);
  const fullRow: Record<string, unknown> = { ...row, timestamp };
  const line = headers.map((h) => escapeCsvCell(fullRow[h] ?? '')).join(',') + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');
  return fullRow;
}

function listSolarGuardFiles(dir: string, base = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === '__pycache__' || entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listSolarGuardFiles(path.join(dir, entry.name), rel));
    } else if (!entry.name.endsWith('.jpg') && !entry.name.endsWith('.png')) {
      files.push(rel);
    }
  }
  return files.sort();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', project: 'SolarGuard' });
  });

  app.get('/api/data/:dataset', (req, res) => {
    const { dataset } = req.params;
    if (!CSV_SCHEMAS[dataset]) {
      res.status(404).json({ error: 'Unknown dataset' });
      return;
    }
    const filePath = path.join(DATA_DIR, `${dataset}.csv`);
    res.json({ dataset, rows: parseCsvFile(filePath) });
  });

  app.post('/api/data/:dataset', (req, res) => {
    const { dataset } = req.params;
    if (!CSV_SCHEMAS[dataset]) {
      res.status(404).json({ error: 'Unknown dataset' });
      return;
    }
    try {
      const saved = appendCsvRow(dataset, req.body ?? {});
      res.status(201).json({ saved });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to append CSV' });
    }
  });

  app.get('/api/export/:dataset', (req, res) => {
    const { dataset } = req.params;
    if (!CSV_SCHEMAS[dataset]) {
      res.status(404).json({ error: 'Unknown dataset' });
      return;
    }
    const filePath = path.join(DATA_DIR, `${dataset}.csv`);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'CSV file not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset}.csv"`);
    res.send(fs.readFileSync(filePath, 'utf-8'));
  });

  app.get('/api/source-files', (_req, res) => {
    res.json({ files: listSolarGuardFiles(SOLARGUARD_DIR) });
  });

  app.get('/api/source-file', (req, res) => {
    const relPath = String(req.query.path ?? '');
    const resolved = path.resolve(SOLARGUARD_DIR, relPath);
    if (!resolved.startsWith(SOLARGUARD_DIR) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      res.status(404).json({ error: 'Source file not found' });
      return;
    }
    res.json({ path: relPath, content: fs.readFileSync(resolved, 'utf-8') });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SolarGuard server listening on http://localhost:${PORT}`);
  });
}

startServer();
