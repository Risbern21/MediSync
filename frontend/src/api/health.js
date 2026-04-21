/**
 * Client-side medical intelligence layer.
 * Compares lab test values against standard reference ranges.
 * Used when backend doesn't provide explicit anomaly flags.
 */

// Standard medical reference ranges by common test names (case-insensitive match)
const REFERENCE_RANGES = {
  // Blood Tests
  haemoglobin:   { low: 12.0, high: 17.5, unit: 'g/dL' },
  hemoglobin:    { low: 12.0, high: 17.5, unit: 'g/dL' },
  hgb:           { low: 12.0, high: 17.5, unit: 'g/dL' },
  hb:            { low: 12.0, high: 17.5, unit: 'g/dL' },
  glucose:       { low: 70,   high: 100,  unit: 'mg/dL' },
  'fasting glucose': { low: 70, high: 99, unit: 'mg/dL' },
  'blood glucose': { low: 70, high: 140, unit: 'mg/dL' },
  cholesterol:   { low: 0,    high: 200,  unit: 'mg/dL' },
  'total cholesterol': { low: 0, high: 200, unit: 'mg/dL' },
  'ldl cholesterol':   { low: 0, high: 100, unit: 'mg/dL' },
  ldl:           { low: 0,    high: 100,  unit: 'mg/dL' },
  'hdl cholesterol':   { low: 40, high: 300, unit: 'mg/dL' },
  hdl:           { low: 40,   high: 300,  unit: 'mg/dL' },
  triglycerides: { low: 0,    high: 150,  unit: 'mg/dL' },
  // Blood Pressure (systolic / diastolic embedded in result)
  'systolic bp':     { low: 90, high: 120, unit: 'mmHg' },
  'diastolic bp':    { low: 60, high: 80,  unit: 'mmHg' },
  // Thyroid
  tsh:           { low: 0.4,  high: 4.0,  unit: 'mIU/L' },
  't3':          { low: 80,   high: 200,  unit: 'ng/dL' },
  't4':          { low: 5.1,  high: 14.1, unit: 'µg/dL' },
  // Kidney
  creatinine:    { low: 0.6,  high: 1.2,  unit: 'mg/dL' },
  bun:           { low: 7,    high: 25,   unit: 'mg/dL' },
  urea:          { low: 7,    high: 20,   unit: 'mg/dL' },
  // Liver
  alt:           { low: 7,    high: 56,   unit: 'U/L' },
  ast:           { low: 10,   high: 40,   unit: 'U/L' },
  bilirubin:     { low: 0.1,  high: 1.2,  unit: 'mg/dL' },
  // CBC
  wbc:           { low: 4.5,  high: 11.0, unit: '×10³/µL' },
  rbc:           { low: 4.5,  high: 5.5,  unit: '×10⁶/µL' },
  platelet:      { low: 150,  high: 400,  unit: '×10³/µL' },
  platelets:     { low: 150,  high: 400,  unit: '×10³/µL' },
  hematocrit:    { low: 36,   high: 52,   unit: '%' },
  // Vitamins
  'vitamin d':   { low: 20,   high: 100,  unit: 'ng/mL' },
  'vitamin b12': { low: 200,  high: 900,  unit: 'pg/mL' },
  ferritin:      { low: 12,   high: 300,  unit: 'ng/mL' },
  iron:          { low: 60,   high: 170,  unit: 'µg/dL' },
};

/**
 * Parse a reference range string like "12.0 - 17.0" or "< 200" or "> 40"
 */
function parseRange(rangeStr) {
  if (!rangeStr) return null;
  const s = rangeStr.trim();
  const dashMatch = s.match(/^([<>]?\s*[\d.]+)\s*[-–]\s*([\d.]+)/);
  if (dashMatch) return { low: parseFloat(dashMatch[1]), high: parseFloat(dashMatch[2]) };
  const ltMatch = s.match(/^<\s*([\d.]+)/);
  if (ltMatch) return { low: 0, high: parseFloat(ltMatch[1]) };
  const gtMatch = s.match(/^>\s*([\d.]+)/);
  if (gtMatch) return { low: parseFloat(gtMatch[1]), high: Infinity };
  return null;
}

/**
 * Analyse a single TestSchema object and return anomaly info.
 * @returns {null | { severity: 'high'|'low'|'critical', label: string }}
 */
export function analyzeTest(test) {
  if (!test?.name || !test?.result) return null;

  const value = parseFloat(test.result);
  if (isNaN(value)) return null;

  // Try backend-provided reference_range first
  let range = parseRange(test.reference_range);

  // Fall back to built-in table
  if (!range) {
    const key = test.name.trim().toLowerCase();
    const ref = REFERENCE_RANGES[key];
    if (ref) range = { low: ref.low, high: ref.high };
  }

  if (!range) return null;

  const ratio = range.high > 0 ? value / range.high : 1;

  if (value < range.low) {
    return {
      severity: ratio < 0.7 ? 'critical' : 'low',
      label: value < range.low * 0.7 ? 'Critically Low' : 'Low',
      value,
      low: range.low,
      high: range.high,
    };
  }
  if (value > range.high) {
    return {
      severity: ratio > 1.5 ? 'critical' : 'high',
      label: value > range.high * 1.5 ? 'Critically High' : 'High',
      value,
      low: range.low,
      high: range.high,
    };
  }

  return null; // normal
}

/**
 * Analyse all tests across all reports and return a flat list of alerts.
 */
export function getAlerts(reports = []) {
  const alerts = [];
  for (const report of reports) {
    if (!report.tests?.length) continue;
    for (const test of report.tests) {
      const result = analyzeTest(test);
      if (result) {
        alerts.push({
          ...result,
          testName: test.name,
          unit: test.unit,
          referenceRange: test.reference_range,
          reportId: report.id,
          patientName: report.patient_name,
          reportDate: report.created_at,
        });
      }
    }
  }
  return alerts;
}

/**
 * Extract a time-series for a named test (e.g. "glucose") from all reports.
 * Returns [{date, value}] sorted by date ascending.
 */
export function getTestTimeSeries(reports = [], testName) {
  const key = testName.toLowerCase();
  const series = [];
  for (const report of reports) {
    if (!report.tests?.length) continue;
    const match = report.tests.find((t) => t.name.toLowerCase().includes(key));
    if (match) {
      const v = parseFloat(match.result);
      if (!isNaN(v)) {
        series.push({ date: report.created_at, value: v, reportId: report.id });
      }
    }
  }
  return series.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Return severity CSS class for a test
 */
export function severityClass(severity) {
  if (!severity) return 'badge-success';
  if (severity === 'critical') return 'badge-danger';
  if (severity === 'high' || severity === 'low') return 'badge-warning';
  return 'badge-success';
}

/**
 * Format a date string nicely
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}
