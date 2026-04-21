import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportsAPI } from '../api/client';
import { analyzeTest, severityClass, formatDateTime } from '../api/health';
import { Upload as UploadIcon, FileText, CheckCircle, AlertTriangle, X, Loader } from 'lucide-react';
import './Upload.css';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.tiff,.webp';

export default function Upload() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError('');
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  const clearFile = () => { setFile(null); setResult(null); setError(''); setProgress(0); };

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);
    setError('');
    setProgress(0);

    const formData = new FormData();
    formData.append('patient_id', user.id);
    formData.append('patient_name', user.username);
    formData.append('file', file);

    try {
      const data = await reportsAPI.addReport(formData);
      setResult(data);
      setProgress(100);
    } catch (err) {
      const msg = err?.response?.data?.detail;
      setError(typeof msg === 'string' ? msg : (Array.isArray(msg) ? msg.map((m) => m.msg).join(', ') : 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const allAlerts = result?.tests ? result.tests.map((t) => ({ test: t, anomaly: analyzeTest(t) })).filter((x) => x.anomaly) : [];

  return (
    <div className="page-content">
      <h1 className="page-title">Upload Report</h1>
      <p className="page-subtitle">Upload a lab report or prescription — we'll extract and analyze it automatically.</p>

      <div className="upload-layout">
        {/* Drop zone */}
        <div className="card upload-card">
          <label
            className={`dropzone ${dragOver ? 'dropzone--active' : ''} ${file ? 'dropzone--has-file' : ''}`}
            htmlFor="report-file-input"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input
              id="report-file-input"
              type="file"
              accept={ACCEPTED}
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {!file ? (
              <>
                <div className="dropzone-icon">
                  <UploadIcon size={32} />
                </div>
                <div className="dropzone-title">Drop your file here</div>
                <div className="dropzone-sub">or click to browse</div>
                <div className="dropzone-formats">PDF, PNG, JPG, JPEG, TIFF, WEBP</div>
              </>
            ) : (
              <div className="dropzone-selected">
                <FileText size={28} className="dropzone-selected-icon" />
                <div className="dropzone-selected-name">{file.name}</div>
                <div className="dropzone-selected-size">{formatFileSize(file.size)}</div>
              </div>
            )}
          </label>

          {file && (
            <div className="upload-actions">
              <button className="btn btn-secondary btn-sm" onClick={clearFile} disabled={uploading}>
                <X size={14} /> Clear
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading}
                id="upload-submit-btn"
              >
                {uploading
                  ? <><Loader size={16} className="spin" /> Uploading…</>
                  : <><UploadIcon size={16} /> Upload & Analyze</>
                }
              </button>
            </div>
          )}

          {/* Progress bar */}
          {uploading && (
            <div className="upload-progress-wrap">
              <div className="upload-progress-bar">
                <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="upload-progress-status">
                {progress < 100 ? 'Uploading…' : 'Processing with AI…'}
              </div>
            </div>
          )}

          {error && (
            <div className="upload-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Results panel */}
        {result && (
          <div className="upload-result">
            <div className="card upload-success-banner">
              <CheckCircle size={20} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <div>
                <div className="upload-success-title">Report uploaded successfully</div>
                <div className="upload-success-sub">
                  Status: <strong>{result.status}</strong> · {formatDateTime(result.created_at)}
                </div>
              </div>
            </div>

            {/* Extracted info */}
            <div className="card">
              <h2 className="section-title" style={{ marginBottom: 'var(--space-4)' }}>Extracted Information</h2>
              <div className="extracted-meta">
                {result.doctor && <div className="extracted-meta-row"><span>Doctor</span><strong>{result.doctor}</strong></div>}
                {result.lab_no && <div className="extracted-meta-row"><span>Lab No.</span><strong>{result.lab_no}</strong></div>}
                <div className="extracted-meta-row"><span>Patient</span><strong>{result.patient_name}</strong></div>
              </div>
            </div>

            {/* Test results */}
            {result.tests && result.tests.length > 0 ? (
              <div className="card">
                <div className="section-header">
                  <h2 className="section-title">Lab Results</h2>
                  {allAlerts.length > 0 && (
                    <span className="badge badge-danger">{allAlerts.length} anomal{allAlerts.length > 1 ? 'ies' : 'y'}</span>
                  )}
                </div>
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>Test</th>
                        <th>Result</th>
                        <th>Unit</th>
                        <th>Reference Range</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.tests.map((t, i) => {
                        const anomaly = analyzeTest(t);
                        return (
                          <tr key={i} className={anomaly ? `result-row--${anomaly.severity}` : ''}>
                            <td className="result-name">{t.name}</td>
                            <td className="result-val">
                              <strong>{t.result}</strong>
                            </td>
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
              </div>
            ) : (
              <div className="card">
                <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                  <div className="empty-state-icon"><Loader size={20} className="spin" /></div>
                  <h3>Extracting data…</h3>
                  <p>The report is being processed in the background. Check Records shortly.</p>
                </div>
              </div>
            )}

            {/* Alerts from upload */}
            {allAlerts.length > 0 && (
              <div className="card">
                <h2 className="section-title" style={{ marginBottom: 'var(--space-4)' }}>🚨 Detected Anomalies</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {allAlerts.map(({ test, anomaly }, i) => (
                    <div key={i} className={`alert-row alert-row--${anomaly.severity}`}>
                      <div className="alert-row-left">
                        <AlertTriangle size={16} className={`alert-icon alert-icon--${anomaly.severity}`} />
                        <div>
                          <div className="alert-name">{test.name}</div>
                          <div className="alert-meta">
                            {test.result} {test.unit}
                            {test.reference_range && ` · Ref: ${test.reference_range}`}
                          </div>
                        </div>
                      </div>
                      <span className={`badge ${severityClass(anomaly.severity)}`}>{anomaly.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
