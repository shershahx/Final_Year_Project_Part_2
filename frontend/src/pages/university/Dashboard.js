import React, { useState, useEffect } from 'react';
import { FiUsers, FiAward, FiFileText, FiCheckCircle, FiRefreshCw, FiClock, FiShield, FiDownload, FiXCircle, FiUpload } from 'react-icons/fi';
import { toast } from 'react-toastify';
import UniversityLayout from '../../components/UniversityLayout';
import { universityAPI, degreeAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const Dashboard = () => {
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [verifiedDegrees, setVerifiedDegrees] = useState([]);
    const [degreesLoading, setDegreesLoading] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        fetchDashboard();
        fetchVerifiedDegrees();
    }, []);

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const response = await universityAPI.getDashboard();
            if (response.data.success) {
                setDashboard(response.data.dashboard);
            }
        } catch (error) {
            toast.error('Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    const fetchVerifiedDegrees = async () => {
        try {
            setDegreesLoading(true);
            const res = await degreeAPI.getWorkflowDegrees({ status: 'verified' });
            setVerifiedDegrees(res.data.degrees || []);
        } catch (err) {
            console.error('Error loading verified degrees:', err);
        } finally {
            setDegreesLoading(false);
        }
    };

    const handleDownload = async (degreeId, fileName) => {
        try {
            setDownloadingId(degreeId);
            const token = localStorage.getItem('token');
            
            // Native fetch with relative paths utilizes proxy correctly, completely bypassing "Failed to Fetch" CORS blocking
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
            toast.success('Degree downloaded successfully');
        } catch (err) {
            console.error('Download error:', err);
            toast.error(err.message || 'Failed to download degree');
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <UniversityLayout>
            <div className="page-header">
                <div>
                    <h1>University Dashboard</h1>
                    <p>Welcome, {user?.name || 'University'}</p>
                </div>
                <button 
                    className="btn btn-secondary" 
                    onClick={fetchDashboard}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <FiRefreshCw style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    Refresh
                </button>
            </div>

            {loading ? (
                <div className="loading">
                    <div className="spinner"></div>
                </div>
            ) : (
                <>
                    {/* University Info Card */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                    <h2 style={{ color: '#1a5f2a', marginBottom: '0.5rem' }}>
                                        {dashboard?.university?.name}
                                    </h2>
                                    <p style={{ color: '#666' }}>
                                        {dashboard?.university?.city}, {dashboard?.university?.province}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FiCheckCircle style={{ color: '#28a745' }} />
                                    <span className="badge badge-approved">Verified by HEC</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-icon blue">
                                <FiUsers />
                            </div>
                            <div className="stat-content">
                                <h3>{dashboard?.stats?.totalStudents || 0}</h3>
                                <p>Total Students</p>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon green">
                                <FiAward />
                            </div>
                            <div className="stat-content">
                                <h3>{dashboard?.workflowStats?.verified || dashboard?.stats?.verifiedDegrees || 0}</h3>
                                <p>Verified Degrees</p>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon orange">
                                <FiClock />
                            </div>
                            <div className="stat-content">
                                <h3>{dashboard?.workflowStats?.pending || 0}</h3>
                                <p>Pending Approval</p>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon purple">
                                <FiUpload />
                            </div>
                            <div className="stat-content">
                                <h3>{dashboard?.workflowStats?.total || 0}</h3>
                                <p>Total Uploaded</p>
                            </div>
                        </div>
                    </div>

                    {/* Workflow Stats Breakdown */}
                    {dashboard?.workflowStats?.total > 0 && (
                        <div className="card" style={{ marginBottom: '1.5rem' }}>
                            <div className="card-header">
                                <h2><FiShield style={{ marginRight: '0.5rem', display: 'inline' }} />Degree Workflow Status</h2>
                            </div>
                            <div className="card-body">
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'Pending', count: dashboard.workflowStats.pending, color: '#d69e2e', bg: '#fefcbf', icon: <FiClock /> },
                                        { label: 'Approved', count: dashboard.workflowStats.approved, color: '#3182ce', bg: '#ebf8ff', icon: <FiCheckCircle /> },
                                        { label: 'Verified (QR)', count: dashboard.workflowStats.verified, color: '#38a169', bg: '#f0fff4', icon: <FiShield /> },
                                        { label: 'Rejected', count: dashboard.workflowStats.rejected, color: '#e53e3e', bg: '#fff5f5', icon: <FiXCircle /> }
                                    ].map((s, i) => (
                                        <div key={i} style={{
                                            flex: '1 1 150px', padding: '1rem 1.25rem', borderRadius: '10px',
                                            background: s.bg, border: `1px solid ${s.color}22`, textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '1.5rem', color: s.color, marginBottom: '0.25rem' }}>{s.icon}</div>
                                            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: s.color }}>{s.count}</div>
                                            <div style={{ fontSize: '0.8rem', color: s.color, fontWeight: '500' }}>{s.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Verified Degrees - Download Section */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2><FiDownload style={{ marginRight: '0.5rem', display: 'inline' }} />Verified Degrees - Download</h2>
                            <button 
                                onClick={fetchVerifiedDegrees} 
                                disabled={degreesLoading}
                                style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: '#718096' }}
                            >
                                <FiRefreshCw size={14} style={{ animation: degreesLoading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                            </button>
                        </div>
                        <div className="card-body">
                            {degreesLoading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <div className="spinner"></div>
                                </div>
                            ) : verifiedDegrees.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0' }}>
                                    <FiFileText style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }} />
                                    <p style={{ margin: 0, fontWeight: '500' }}>No verified degrees yet</p>
                                    <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Degrees will appear here after approval and HEC verification</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                <th style={thStyle}>#</th>
                                                <th style={thStyle}>File Name</th>
                                                <th style={thStyle}>Status</th>
                                                <th style={thStyle}>Blockchain</th>
                                                <th style={thStyle}>Verified At</th>
                                                <th style={{ ...thStyle, textAlign: 'center' }}>Download</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {verifiedDegrees.map((deg, idx) => (
                                                <tr key={deg.degreeId} style={{ borderBottom: '1px solid #edf2f7' }}>
                                                    <td style={tdStyle}>{idx + 1}</td>
                                                    <td style={tdStyle}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <FiFileText style={{ color: '#e53e3e', flexShrink: 0 }} />
                                                            <span style={{ fontWeight: '500', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                                                {deg.originalFileName || deg.degreeId}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                            padding: '0.2rem 0.65rem', borderRadius: '20px', fontSize: '0.8rem',
                                                            fontWeight: '500', background: '#f0fff4', color: '#38a169'
                                                        }}>
                                                            <FiCheckCircle size={12} /> Verified
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        {deg.blockchainTransactionId ? (
                                                            <div>
                                                                <div style={{ fontSize: '0.75rem', color: '#38a169', fontWeight: '500' }}>
                                                                    <FiShield style={{ display: 'inline', marginRight: '0.2rem' }} size={12} /> On Ledger
                                                                </div>
                                                                <div style={{ fontSize: '0.65rem', color: '#a0aec0', fontFamily: 'monospace', marginTop: '0.1rem' }}>
                                                                    {deg.blockchainTransactionId.substring(0, 20)}...
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: '#a0aec0', fontSize: '0.85rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                                                            {deg.verifiedAt ? new Date(deg.verifiedAt).toLocaleString() : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <button
                                                            onClick={() => handleDownload(deg.degreeId, deg.originalFileName)}
                                                            disabled={downloadingId === deg.degreeId}
                                                            style={{
                                                                padding: '0.4rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                                                                fontWeight: '600', cursor: 'pointer', border: 'none',
                                                                background: 'linear-gradient(135deg, #38a169, #48bb78)',
                                                                color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                                                boxShadow: '0 2px 4px rgba(56, 161, 105, 0.3)'
                                                            }}
                                                        >
                                                            {downloadingId === deg.degreeId ? (
                                                                <div className="spinner" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                                            ) : (
                                                                <FiDownload size={14} />
                                                            )}
                                                            Download
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="card">
                        <div className="card-header">
                            <h2>Quick Actions</h2>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <a href="/university/students" className="btn btn-primary">
                                    <FiUsers /> Manage Students
                                </a>
                                <a href="/university/degree-upload" className="btn btn-secondary">
                                    <FiAward /> Upload Degrees
                                </a>
                                <a href="/university/profile" className="btn btn-secondary">
                                    <FiFileText /> Update Profile
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* University Details */}
                    <div className="card">
                        <div className="card-header">
                            <h2>University Information</h2>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ fontWeight: '600', color: '#666', fontSize: '0.875rem' }}>Email</label>
                                    <p style={{ margin: '0.25rem 0 0' }}>{dashboard?.university?.email}</p>
                                </div>
                                <div>
                                    <label style={{ fontWeight: '600', color: '#666', fontSize: '0.875rem' }}>Phone</label>
                                    <p style={{ margin: '0.25rem 0 0' }}>{dashboard?.university?.phone || 'N/A'}</p>
                                </div>
                                <div>
                                    <label style={{ fontWeight: '600', color: '#666', fontSize: '0.875rem' }}>Type</label>
                                    <p style={{ margin: '0.25rem 0 0' }}>{dashboard?.university?.type}</p>
                                </div>
                                <div>
                                    <label style={{ fontWeight: '600', color: '#666', fontSize: '0.875rem' }}>Established</label>
                                    <p style={{ margin: '0.25rem 0 0' }}>{dashboard?.university?.establishedYear || 'N/A'}</p>
                                </div>
                                <div>
                                    <label style={{ fontWeight: '600', color: '#666', fontSize: '0.875rem' }}>Vice Chancellor</label>
                                    <p style={{ margin: '0.25rem 0 0' }}>{dashboard?.university?.viceChancellorName || 'N/A'}</p>
                                </div>
                                <div>
                                    <label style={{ fontWeight: '600', color: '#666', fontSize: '0.875rem' }}>Website</label>
                                    <p style={{ margin: '0.25rem 0 0' }}>
                                        {dashboard?.university?.website ? (
                                            <a href={dashboard.university.website} target="_blank" rel="noopener noreferrer">
                                                {dashboard.university.website}
                                            </a>
                                        ) : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </UniversityLayout>
    );
};

const thStyle = { padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: '#718096', fontWeight: '600' };
const tdStyle = { padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#4a5568' };

export default Dashboard;
