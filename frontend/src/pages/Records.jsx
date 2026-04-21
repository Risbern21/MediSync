import { useState, useEffect } from 'react';
import { reportsAPI } from '../api/client';
import { getAlerts, analyzeTest, severityClass, formatDate, formatDateTime } from '../api/health';
import { FileText, Search, AlertTriangle, ChevronDown, ChevronUp, Trash2, Loader, RefreshCw } from 'lucide-react';
import './Records.css';

const STATUS_OPTIONS = ['', 'processing', 'pending', 'reviewed', 'archived'];

export default function Records() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetchReports = (status = statusFilter) => {
    setLoading(true);
    setError('');
    const params = { limit: 100 };
    if (status) params.status = status;
    reportsAPI.getAll(params)
      .then((data) => {
        const sorted = [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setReports(sorted);
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Failed to load reports.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchReports(); }, []); // eslint-disable-line

  const handleStatusFilter = (s) => {
    setStatusFilter(s);
    fetchReports(s);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this report? This action cannot be undone.')) return;
    setDeleting(id);
    try {
      await reportsAPI.delete(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (expanded === id) setExpanded(null);
    } catch (err) {
      alert(err?.response?.data?.detail || 'Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

  const filtered = reports.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.patient_name?.toLowerCase().includes(q) ||
      r.doctor?.toLowerCase().includes(q) ||
      r.lab_no?.toLowerCase().includes(q) ||
      r.tests?.some((t) => t.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page-content">
      <div className="records-header">
        <div>
          <h1 className="page-title">Records</h1>
          <p className="page-subtitle">{loading ? 'Loading…' : `${filtered.length} report${filtered.length !== 1 ? 's' : ''}`}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => fetchReports()} disabled={loading} id="records-refresh-btn">
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="records-filters">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            id="records-search"
            className="form-input search-input"
            type="search"
            placeholder="Search by patient, doctor, test name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="status-filters">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s || 'all'}
              className={`status-btn ${statusFilter === s ? 'status-btn--active' : ''}`}
              onClick={() => handleStatusFilter(s)}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="upload-error" style={{ borderRadius: 'var(--radius)', borderTop: 'none', border: `1px solid var(--danger)`, marginBottom: 'var(--space-4)' }}>
          <AlertTriangle size={16} />{error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 88, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state card">
          <div className="empty-state-icon"><FileText size={24} /></div>
          <h3>{reports.length === 0 ? 'No reports yet' : 'No matching reports'}</h3>
          <p>{reports.length === 0 ? 'Upload your first lab report to get started.' : 'Try adjusting your search or filters.'}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="records-list">
          {filtered.map((r) => {
            const alerts = getAlerts([r]);
            const isExpanded = expanded === r.id;
            return (
              <div key={r.id} className={`record-card card ${isExpanded ? 'record-card--expanded' : ''}`}>
                {/* Card Header */}
                <div className="record-card-header" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                  <div className="record-card-icon">
                    <FileText size={20} />
                  </div>

                  <div className="record-card-info">
                    <div className="record-card-name">{r.patient_name}</div>
                    <div className="record-card-meta">
                      {formatDate(r.created_at)}
                      {r.doctor && <> · Dr. {r.doctor}</>}
                      {r.lab_no && <> · Lab #{r.lab_no}</>}
                      {r.tests?.length > 0 && <> · {r.tests.length} tests</>}
                    </div>
                  </div>

                  <div className="record-card-badges">
                    <span className={`badge badge-${statusBadge(r.status)}`}>{r.status}</span>
                    {alerts.length > 0 && (
                      <span className="badge badge-danger">
                        <AlertTriangle size={10} /> {alerts.length}
                      </span>
                    )}
                  </div>

                  <div className="record-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-sm record-delete-btn"
                      onClick={(e) => handleDelete(r.id, e)}
                      disabled={deleting === r.id}
                      aria-label="Delete report"
                    >
                      {deleting === r.id ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>

                  <div className="record-expand-icon">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="record-detail">
                    <div className="divider" />

                    {/* Alerts section */}
                    {alerts.length > 0 && (
                      <div className="record-alerts">
                        <div className="record-detail-title">🚨 Anomalies</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                          {alerts.map((a, i) => (
                            <div key={i} className={`badge ${severityClass(a.severity)}`}>
                              {a.testName}: {a.value} {a.unit} ({a.label})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tests table */}
                    {r.tests?.length > 0 ? (
                      <>
                        <div className="record-detail-title">Lab Results</div>
                        <div className="results-table-wrap">
                          <table className="results-table">
                            <thead>
                              <tr>
                                <th>Test</th><th>Result</th><th>Unit</th><th>Ref Range</th><th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.tests.map((t, i) => {
                                const anomaly = analyzeTest(t);
                                return (
                                  <tr key={i} className={anomaly ? `result-row--${anomaly.severity}` : ''}>
                                    <td className="result-name">{t.name}</td>
                                    <td className="result-val"><strong>{t.result}</strong></td>
                                    <td className="result-unit">{t.unit || '—'}</td>
                                    <td className="result-range">{t.reference_range || '—'}</td>
                                    <td>
                                      {anomaly
                                        ? <span className={`badge ${severityClass(anomaly.severity)}`}>{anomaly.label}</span>
                                        : <span className="badge badge-success">Normal</span>
                                      }
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="record-detail-empty">
                        <Loader size={16} className="spin" />
                        <span>Extraction in progress — check back shortly.</span>
                      </div>
                    )}

                    <div className="record-detail-footer">
                      <span>Report ID: <code>{r.id}</code></span>
                      <span>Uploaded: {formatDateTime(r.created_at)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function statusBadge(status) {
  const map = { processing: 'warning', pending: 'primary', reviewed: 'success', archived: 'neutral' };
  return map[status] ?? 'neutral';
}
