import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { reportsAPI } from '../api/client';
import { getAlerts, getTestTimeSeries, severityClass, formatDate } from '../api/health';
import { BarChart2, AlertTriangle, TrendingUp, Loader } from 'lucide-react';
import './Analytics.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const LINE_OPTS = (label, color) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#fff',
      borderColor: '#E2E8F0',
      borderWidth: 1,
      titleColor: '#0F172A',
      bodyColor: '#475569',
      padding: 12,
      cornerRadius: 10,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#94A3B8', font: { size: 12 } },
    },
    y: {
      grid: { color: '#F1F5F9' },
      ticks: { color: '#94A3B8', font: { size: 12 } },
    },
  },
});

function buildLineData(series, label, color) {
  return {
    labels: series.map((p) => formatDate(p.date)),
    datasets: [{
      label,
      data: series.map((p) => p.value),
      borderColor: color,
      backgroundColor: `${color}18`,
      pointBackgroundColor: color,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.4,
    }],
  };
}

const TRACK_TESTS = [
  { key: 'glucose',      label: 'Glucose',      unit: 'mg/dL',   color: '#2563EB' },
  { key: 'haemoglobin',  label: 'Haemoglobin',  unit: 'g/dL',    color: '#10B981' },
  { key: 'cholesterol',  label: 'Cholesterol',   unit: 'mg/dL',   color: '#F59E0B' },
  { key: 'tsh',          label: 'TSH',           unit: 'mIU/L',   color: '#8B5CF6' },
  { key: 'creatinine',   label: 'Creatinine',    unit: 'mg/dL',   color: '#EF4444' },
  { key: 'platelet',     label: 'Platelets',     unit: '×10³/µL', color: '#06B6D4' },
];

export default function Analytics() {
  const [reports, setReports] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('trends');

  useEffect(() => {
    reportsAPI.getAll({ limit: 100 })
      .then((data) => {
        const sorted = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        setReports(sorted);
        setAlerts(getAlerts(sorted));
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Failed to load data.'))
      .finally(() => setLoading(false));
  }, []);

  const series = TRACK_TESTS.map((t) => ({
    ...t,
    data: getTestTimeSeries(reports, t.key),
  })).filter((t) => t.data.length >= 1);

  const alertsByType = alerts.reduce((acc, a) => {
    acc[a.testName] = (acc[a.testName] || 0) + 1;
    return acc;
  }, {});

  const alertBarData = {
    labels: Object.keys(alertsByType),
    datasets: [{
      label: 'Alert Count',
      data: Object.values(alertsByType),
      backgroundColor: Object.keys(alertsByType).map((_, i) => ['#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4', '#10B981'][i % 5] + '80'),
      borderColor: Object.keys(alertsByType).map((_, i) => ['#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4', '#10B981'][i % 5]),
      borderWidth: 2,
      borderRadius: 8,
    }],
  };

  const critical = alerts.filter((a) => a.severity === 'critical');
  const warnings = alerts.filter((a) => a.severity !== 'critical');

  return (
    <div className="page-content">
      <div className="analytics-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Trends and insights from your lab data.</p>
        </div>
      </div>

      {/* Summary metric strip */}
      <div className="analytics-strip">
        <div className="analytics-stat">
          <div className="analytics-stat-val">{reports.length}</div>
          <div className="analytics-stat-lbl">Total Reports</div>
        </div>
        <div className="analytics-stat-divider" />
        <div className="analytics-stat">
          <div className="analytics-stat-val" style={{ color: 'var(--danger)' }}>{critical.length}</div>
          <div className="analytics-stat-lbl">Critical Alerts</div>
        </div>
        <div className="analytics-stat-divider" />
        <div className="analytics-stat">
          <div className="analytics-stat-val" style={{ color: 'var(--warning)' }}>{warnings.length}</div>
          <div className="analytics-stat-lbl">Warnings</div>
        </div>
        <div className="analytics-stat-divider" />
        <div className="analytics-stat">
          <div className="analytics-stat-val">{series.length}</div>
          <div className="analytics-stat-lbl">Tracked Metrics</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="analytics-tabs">
        {[['trends', 'Trends'], ['alerts', 'Alerts']].map(([id, label]) => (
          <button
            key={id}
            className={`analytics-tab ${activeTab === id ? 'analytics-tab--active' : ''}`}
            onClick={() => setActiveTab(id)}
            id={`analytics-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="upload-error" style={{ borderRadius: 'var(--radius)', border: '1px solid var(--danger)', borderTop: 'none', marginBottom: 'var(--space-4)' }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {[1,2].map((i) => <div key={i} className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : activeTab === 'trends' ? (
        <TrendsTab series={series} alertBarData={alertBarData} reports={reports} />
      ) : (
        <AlertsTab alerts={alerts} />
      )}
    </div>
  );
}

function TrendsTab({ series, alertBarData, reports }) {
  if (series.length === 0 && reports.length === 0) {
    return (
      <div className="empty-state card">
        <div className="empty-state-icon"><BarChart2 size={24} /></div>
        <h3>No data to chart yet</h3>
        <p>Upload lab reports to see your health trends over time.</p>
      </div>
    );
  }

  return (
    <div className="analytics-grid">
      {series.map((t) => (
        <div key={t.key} className="card analytics-chart-card">
          <div className="analytics-chart-header">
            <div>
              <h3 className="analytics-chart-title">{t.label}</h3>
              <div className="analytics-chart-sub">{t.unit} · {t.data.length} data point{t.data.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="analytics-chart-latest">
              <span style={{ color: t.color, fontSize: '1.5rem', fontWeight: 700 }}>
                {t.data[t.data.length - 1]?.value}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t.unit}</span>
            </div>
          </div>
          <div className="analytics-chart-area">
            <Line data={buildLineData(t.data, t.label, t.color)} options={LINE_OPTS(t.label, t.color)} />
          </div>
        </div>
      ))}

      {/* Alert frequency bar chart */}
      {Object.keys(alertBarData.labels ?? []).length > 0 && alertBarData.labels.length > 0 && (
        <div className="card analytics-chart-card analytics-chart-card--wide">
          <div className="analytics-chart-header">
            <div>
              <h3 className="analytics-chart-title">Alert Frequency by Test</h3>
              <div className="analytics-chart-sub">Total anomalies detected across all reports</div>
            </div>
          </div>
          <div className="analytics-chart-area">
            <Bar
              data={alertBarData}
              options={{
                ...LINE_OPTS(),
                plugins: { ...LINE_OPTS().plugins, legend: { display: false } },
              }}
            />
          </div>
        </div>
      )}

      {series.length === 0 && reports.length > 0 && (
        <div className="empty-state card analytics-chart-card--wide">
          <div className="empty-state-icon"><TrendingUp size={24} /></div>
          <h3>No extractable metrics yet</h3>
          <p>Reports are being processed or no matching test values were found.</p>
        </div>
      )}
    </div>
  );
}

function AlertsTab({ alerts }) {
  if (alerts.length === 0) {
    return (
      <div className="empty-state card">
        <div className="empty-state-icon">✅</div>
        <h3>No anomalies detected</h3>
        <p>All your lab values are within normal reference ranges.</p>
      </div>
    );
  }

  const critical = alerts.filter((a) => a.severity === 'critical');
  const rest = alerts.filter((a) => a.severity !== 'critical');
  const ordered = [...critical, ...rest];

  return (
    <div className="card">
      <div className="section-header">
        <h2 className="section-title">All Detected Anomalies</h2>
        <span>{alerts.length} total</span>
      </div>
      <div className="alerts-full-list">
        {ordered.map((a, i) => (
          <div key={i} className={`alert-row alert-row--${a.severity}`}>
            <div className="alert-row-left">
              <AlertTriangle size={16} className={`alert-icon alert-icon--${a.severity}`} />
              <div>
                <div className="alert-name">{a.testName}</div>
                <div className="alert-meta">
                  Value: <strong>{a.value}</strong> {a.unit}
                  {a.low != null && ` · Normal: ${a.low}–${a.high}`}
                </div>
                <div className="alert-report-ref">
                  {a.patientName} · {formatDate(a.reportDate)}
                </div>
              </div>
            </div>
            <span className={`badge ${severityClass(a.severity)}`}>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
