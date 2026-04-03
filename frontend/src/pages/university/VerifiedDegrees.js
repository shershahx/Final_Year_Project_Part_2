import React, { useState, useEffect, useCallback } from 'react';
import { 
    FiCheck, 
    FiX, 
    FiFileText, 
    FiCheckCircle,
    FiClock,
    FiDownload,
    FiRefreshCw,
    FiShield,
    FiAlertCircle,
    FiAward
} from 'react-icons/fi';
import { degreeAPI } from '../../services/api';
import UniversityLayout from '../../components/UniversityLayout';

const VerifiedDegrees = () => {
    const [degrees, setDegrees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [downloadingId, setDownloadingId] = useState(null);
    const [retryingId, setRetryingId] = useState(null);
    const [error, setError] = useState(null);

    const loadDegrees = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (statusFilter) params.status = statusFilter;
            const res = await degreeAPI.getWorkflowDegrees(params);
            setDegrees(res.data.degrees || []);
        } catch (err) {
            console.error('Error loading degrees:', err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        loadDegrees();
    }, [loadDegrees]);

    const handleDownload = async (degreeId, fileName) => {
        try {
            setDownloadingId(degreeId);
            
            const token = localStorage.getItem('token');
            
            const response = await fetch(`/api/degrees/workflow/${degreeId}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const isJson = response.headers.get('content-type')?.includes('application/json');
                if (isJson) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Download failed');
                }
                throw new Error(`Download failed with status ${response.status}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || `verified_${degreeId}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => window.URL.revokeObjectURL(url), 10000);
        } catch (err) {
            console.error('Download error:', err);
            setError(err.message || 'Failed to download verified degree');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleRetryVerification = async (degreeId) => {
        try {
            setRetryingId(degreeId);
            await degreeAPI.retryVerification(degreeId);
            await loadDegrees();
        } catch (err) {
            console.error('Retry error:', err);
            setError('Failed to retry verification');
        } finally {
            setRetryingId(null);
        }
    };

    return (
        <UniversityLayout>
            <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1a202c', marginBottom: '0.5rem' }}>
                        <FiAward style={{ display: 'inline', marginRight: '0.75rem', color: '#38a169' }} />
                        Verified Degrees
                    </h1>
                    <p style={{ color: '#718096', fontSize: '0.95rem' }}>
                        Track degree approval status and download verified degrees with QR codes.
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        background: '#fff5f5', border: '1px solid #fc8181', borderRadius: '10px',
                        padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
                    }}>
                        <FiAlertCircle style={{ color: '#e53e3e', fontSize: '1.25rem', flexShrink: 0, marginTop: '2px' }} />
                        <p style={{ color: '#c53030', margin: 0, fontWeight: '500', fontSize: '0.9rem' }}>{error}</p>
                        <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', marginLeft: 'auto' }}><FiX /></button>
                    </div>
                )}

                {/* Filter bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {[
                            { value: '', label: 'All' },
                            { value: 'pending', label: 'Pending' },
                            { value: 'approved', label: 'Approved' },
                            { value: 'verified', label: 'Verified' },
                            { value: 'rejected', label: 'Rejected' }
                        ].map(f => (
                            <button
                                key={f.value}
                                onClick={() => setStatusFilter(f.value)}
                                style={{
                                    padding: '0.4rem 1rem', borderRadius: '20px', fontSize: '0.85rem', cursor: 'pointer',
                                    border: statusFilter === f.value ? '2px solid #3182ce' : '1px solid #e2e8f0',
                                    background: statusFilter === f.value ? '#ebf8ff' : '#fff',
                                    color: statusFilter === f.value ? '#3182ce' : '#718096',
                                    fontWeight: statusFilter === f.value ? '600' : '400'
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={loadDegrees} style={{
                        padding: '0.4rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px',
                        background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem',
                        fontSize: '0.85rem', color: '#718096'
                    }}>
                        <FiRefreshCw size={14} /> Refresh
                    </button>
                </div>

                {/* Degrees table */}
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                        <div className="spinner" style={{ width: 36, height: 36, border: '4px solid #e2e8f0', borderTop: '4px solid #3182ce', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : degrees.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                        <FiFileText style={{ fontSize: '3rem', color: '#cbd5e0', marginBottom: '1rem' }} />
                        <h3 style={{ color: '#718096', fontWeight: '500', marginBottom: '0.5rem' }}>No degrees found</h3>
                        <p style={{ color: '#a0aec0', fontSize: '0.9rem' }}>
                            {statusFilter ? `No degrees with status "${statusFilter}".` : 'Upload some degrees to get started.'}
                        </p>
                    </div>
                ) : (
                    <div className="card" style={{ overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f7fafc' }}>
                                        <th style={thStyle}>#</th>
                                        <th style={thStyle}>File</th>
                                        <th style={thStyle}>Approval Progress</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Blockchain</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {degrees.map((deg, idx) => (
                                        <tr key={deg.degreeId} style={{ borderTop: '1px solid #edf2f7' }}>
                                            <td style={tdStyle}>{idx + 1}</td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <FiFileText style={{ color: '#e53e3e', flexShrink: 0 }} size={14} />
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.85rem', color: '#2d3748', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                                                            {deg.originalFileName || deg.degreeId}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#a0aec0' }}>
                                                            {new Date(deg.createdAt).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                                    {(deg.approvalSteps || []).map((step, si) => (
                                                        <span key={si} style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                            padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem',
                                                            fontWeight: '500',
                                                            background: step.status === 'approved' ? '#f0fff4' : step.status === 'rejected' ? '#fff5f5' : '#fefcbf',
                                                            color: step.status === 'approved' ? '#38a169' : step.status === 'rejected' ? '#e53e3e' : '#d69e2e'
                                                        }}>
                                                            {step.status === 'approved' ? <FiCheck size={10} /> : step.status === 'rejected' ? <FiX size={10} /> : <FiClock size={10} />}
                                                            {step.roleName}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <StatusBadge status={deg.overallStatus} />
                                            </td>
                                            <td style={tdStyle}>
                                                {deg.submittedToBlockchain ? (
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: '#38a169', fontWeight: '500' }}>
                                                            <FiShield style={{ display: 'inline', marginRight: '0.2rem' }} size={12} /> On Ledger
                                                        </div>
                                                        {deg.blockchainTransactionId && (
                                                            <div style={{ fontSize: '0.65rem', color: '#a0aec0', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                                                                {deg.blockchainTransactionId.substring(0, 16)}...
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                {deg.overallStatus === 'verified' && (
                                                    <button
                                                        onClick={() => handleDownload(deg.degreeId, deg.originalFileName)}
                                                        disabled={downloadingId === deg.degreeId}
                                                        style={{
                                                            padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem',
                                                            fontWeight: '500', cursor: 'pointer', border: 'none',
                                                            background: 'linear-gradient(135deg, #38a169, #48bb78)',
                                                            color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                                                        }}
                                                    >
                                                        {downloadingId === deg.degreeId ? (
                                                            <div className="spinner" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                                        ) : (
                                                            <FiDownload size={14} />
                                                        )}
                                                        Download
                                                    </button>
                                                )}
                                                {deg.overallStatus === 'approved' && (
                                                    <span style={{ fontSize: '0.8rem', color: '#d69e2e', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                        <FiClock size={12} /> Awaiting HEC
                                                    </span>
                                                )}
                                                {deg.overallStatus === 'pending' && (
                                                    <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Awaiting approvals</span>
                                                )}
                                                {deg.overallStatus === 'rejected' && (
                                                    <span style={{ fontSize: '0.8rem', color: '#e53e3e' }}>Rejected</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </UniversityLayout>
    );
};

// ---- Helper components ----
const thStyle = { padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: '#718096', fontWeight: '600' };
const tdStyle = { padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#4a5568' };

const StatusBadge = ({ status }) => {
    const config = {
        pending: { bg: '#fefcbf', color: '#d69e2e', icon: <FiClock size={12} />, label: 'Pending' },
        approved: { bg: '#ebf8ff', color: '#3182ce', icon: <FiCheck size={12} />, label: 'Awaiting HEC' },
        verified: { bg: '#f0fff4', color: '#38a169', icon: <FiCheckCircle size={12} />, label: 'Verified' },
        rejected: { bg: '#fff5f5', color: '#e53e3e', icon: <FiX size={12} />, label: 'Rejected' }
    };
    const c = config[status] || config.pending;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.2rem 0.65rem', borderRadius: '20px', fontSize: '0.8rem',
            fontWeight: '500', background: c.bg, color: c.color
        }}>
            {c.icon} {c.label}
        </span>
    );
};

export default VerifiedDegrees;
