import React, { useState, useEffect, useCallback } from 'react';
import { 
    FiSearch, 
    FiDownload, 
    FiExternalLink, 
    FiCheckCircle,
    FiHash,
    FiFilter,
    FiX,
    FiEye,
    FiLink,
    FiUser,
    FiBook,
    FiFileText,
    FiClock,
    FiShield
} from 'react-icons/fi';
import { FaFilePdf, FaTimes } from 'react-icons/fa';
import api, { degreeAPI } from '../../services/api';
import HECLayout from '../../components/HECLayout';
import { toast } from 'react-toastify';

// ─── PDF Viewer Modal ────────────────────────────────────────────────────────
const HecPdfViewer = ({ degree, onClose, onVerify, onReject }) => {
    const [processing, setProcessing] = useState(false);
    const [pdfState, setPdfState] = useState('loading');
    const [pdfError, setPdfError] = useState('');
    const [blobUrl, setBlobUrl] = useState(null);
    const [showReject, setShowReject] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    const token = localStorage.getItem('token') || '';
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const baseUrl = apiUrl.replace(/\/api$/, '');
    const directUrl = `/api/degrees/hec/${degree.degreeId}/pdf?token=${encodeURIComponent(token)}`;

        useEffect(() => {
        let alive = true;
        let created = null;
        setPdfState('loading');
        setPdfError('');
        setBlobUrl(null);

        // Fetch ensures we download the PDF natively as a Blob so Chrome doesn't block cross-origin PDF embedding!
        fetch(directUrl)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.blob();
            })
            .then(blob => {
                if (!alive) return;
                const url = URL.createObjectURL(blob);
                created = url;
                setBlobUrl(url);
                setPdfState('ready');
            })
            .catch(err => {
                if (!alive) return;
                setPdfError(err.message || 'Failed to load PDF');
                setPdfState('error');
            });

        return () => {
            alive = false;
            if (created) URL.revokeObjectURL(created);
        };
    }, [directUrl]);

    const handleVerify = async () => {
        setProcessing(true);
        try { 
            await onVerify(degree.degreeId); 
            onClose(); 
        }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to verify. Please try again.'); }
        finally { setProcessing(false); }
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) return;
        setProcessing(true);
        try {
            await onReject(degree.degreeId, rejectReason);
            onClose();
        }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to reject. Please try again.'); }
        finally { setProcessing(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)' }}>
            <style>{`@keyframes pdfSpin { to { transform: rotate(360deg); } }`}</style>
            
            <div style={{
                position: 'absolute',
                top: 0, left: 0, right: `360px`, bottom: 0,
                background: '#1e293b',
                display: 'flex', flexDirection: 'column'
            }}>
                <div style={{
                    height: '52px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0 1.25rem', background: '#0f172a',
                    borderBottom: '1px solid #334155'
                }}>
                    <FaFilePdf style={{ color: '#f87171', fontSize: '1.1rem', flexShrink: 0 }} />
                    <span style={{
                        color: '#f1f5f9', fontWeight: 600, fontSize: '0.9rem', flex: 1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                        {degree.studentName || 'Degree'} — PDF Verification Preview
                    </span>
                    {blobUrl && (
                        <a href={blobUrl} target="_blank" rel="noopener noreferrer"
                            style={{
                                color: '#94a3b8', fontSize: '0.78rem', padding: '3px 8px',
                                border: '1px solid #334155', borderRadius: '4px',
                                textDecoration: 'none', marginRight: '6px'
                            }}>
                            ↗ New Tab
                        </a>
                    )}
                    <button onClick={onClose} style={{
                        background: '#ef4444', border: 'none', color: '#fff',
                        width: '30px', height: '30px', borderRadius: '6px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <FaTimes />
                    </button>
                </div>
                
                <div style={{ height: 'calc(100% - 52px)', position: 'relative' }}>
                    {pdfState === 'loading' && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#1e293b'
                        }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '50%',
                                border: '4px solid #334155', borderTopColor: '#60a5fa',
                                animation: 'pdfSpin 0.7s linear infinite'
                            }} />
                            <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Loading degree PDF…</span>
                        </div>
                    )}
                    
                    {pdfState === 'error' && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: '12px', background: '#1e293b'
                        }}>
                            <FaFilePdf style={{ color: '#f87171', fontSize: '2.5rem' }} />
                            <p style={{ color: '#f87171', fontWeight: 700 }}>Could not load PDF</p>
                            <p style={{ color: '#64748b', textAlign: 'center' }}>{pdfError}</p>
                        </div>
                    )}
                    
                    {pdfState === 'ready' && blobUrl && (
                        <iframe 
                            src={`${blobUrl}#toolbar=0&navpanes=0&view=FitH`} 
                            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} 
                            title="HEC Degree Viewer" 
                        />
                    )}
                </div>
            </div>

            <div style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: '360px',
                background: '#ffffff', display: 'flex', flexDirection: 'column',
                boxShadow: '-4px 0 25px rgba(0,0,0,0.1)'
            }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a', fontSize: '1.1rem', fontWeight: 700 }}>Action Required</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.86rem', lineHeight: 1.5 }}>
                        This degree has been signed by all university authorities. Please review and verify it. Once verified, it will be placed on the blockchain ledger.
                    </p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Student</div>
                        <div style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.94rem' }}>{degree.studentName || '—'}</div>
                        <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '2px' }}>Roll No: {degree.studentRollNumber || '—'}</div>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Academic</div>
                        <div style={{ color: '#0f172a', fontWeight: 500, fontSize: '0.9rem' }}>{degree.degreeProgram || '—'}</div>
                        <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '2px' }}>{degree.universityName || '—'}</div>
                    </div>
                </div>

                <div style={{ padding: '1.25rem', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                    {showReject ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Reason for rejection..."
                                rows={3}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            <button
                                onClick={handleReject}
                                disabled={processing || !rejectReason.trim()}
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none',
                                    background: (processing || !rejectReason.trim()) ? '#fca5a5' : '#ef4444',
                                    color: '#fff', fontWeight: 600, fontSize: '0.94rem', cursor: (processing || !rejectReason.trim()) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {processing ? 'Processing...' : 'Confirm Reject'}
                            </button>
                            <button
                                onClick={() => setShowReject(false)}
                                disabled={processing}
                                style={{
                                    width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                    background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                onClick={handleVerify}
                                disabled={processing || pdfState !== 'ready'}
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none',
                                    background: (processing || pdfState !== 'ready') ? '#94a3b8' : '#10b981',
                                    color: '#fff', fontWeight: 600, fontSize: '0.94rem', cursor: (processing || pdfState !== 'ready') ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    transition: 'background 0.2s',
                                    boxShadow: (processing || pdfState !== 'ready') ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)'
                                }}
                            >
                                {processing ? 'Processing...' : 'Verify Degree'}
                            </button>
                            <button
                                onClick={() => setShowReject(true)}
                                disabled={processing || pdfState !== 'ready'}
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ef4444',
                                    background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: '0.94rem', cursor: (processing || pdfState !== 'ready') ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Reject Degree
                            </button>
                            {!processing && (
                                <button
                                    onClick={onClose}
                                    style={{
                                        width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                        background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────

const VerifiedDegrees = () => {
    const [activeTab, setActiveTab] = useState('verified'); // 'pending' or 'verified'
    const [degrees, setDegrees] = useState([]);
    const [pendingDegrees, setPendingDegrees] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [universityFilter, setUniversityFilter] = useState('');
    
    // Modal states
    const [selectedDegree, setSelectedDegree] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showPdfViewer, setShowPdfViewer] = useState(false);
    
    const [downloadingId, setDownloadingId] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [degreesRes, pendingRes, statsRes] = await Promise.all([
                degreeAPI.getAllVerifiedDegrees({ limit: 500 }),
                degreeAPI.getPendingHECVerifications(),
                degreeAPI.getVerificationStats()
            ]);
            setDegrees(degreesRes.data.degrees || []);
            setPendingDegrees(pendingRes.data.degrees || []);
            setStats(statsRes.data.stats || {});
        } catch (err) {
            console.error('Error fetching data:', err);
            toast.error('Failed to load degrees data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleHECVerify = async (degreeId) => {
        try {
            await degreeAPI.verifyDegreeByHEC(degreeId);
            toast.success('Degree verified successfully!');
            fetchData();
        } catch (err) {
            console.error('Verification error:', err);
            throw err; // Passed to modal to show error toast
        }
    };

    const handleHECReject = async (degreeId, reason) => {
        try {
            await degreeAPI.rejectDegreeByHEC(degreeId, reason);
            toast.success('Degree rejected successfully');
            fetchData();
        } catch (err) {
            console.error('Rejection error:', err);
            throw err;
        }
    };

    const displayList = activeTab === 'verified' ? degrees : pendingDegrees;
    const universities = [...new Set(displayList.map(d => d.universityName))].filter(Boolean);

    const filteredDegrees = displayList.filter(d => {
        const matchesSearch = 
            d.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.rollNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.studentRollNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.cnic?.includes(searchTerm) ||
            d.degreeHash?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesUniversity = !universityFilter || d.universityName === universityFilter;
        
        return matchesSearch && matchesUniversity;
    });

    const openDetailModal = (degree) => {
        setSelectedDegree(degree);
        setShowDetailModal(true);
    };

    const openPdfViewer = (degree) => {
        setSelectedDegree(degree);
        setShowPdfViewer(true);
    };

    const closeModals = () => {
        setShowDetailModal(false);
        setShowPdfViewer(false);
        setSelectedDegree(null);
    };

    const handleDownload = async (degreeId, fileName) => {
        try {
            setDownloadingId(degreeId);
            const response = await fetch(`/api/degrees/verify/${degreeId}/download`);

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
            toast.error(err.message || 'Failed to download verified degree');
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <HECLayout>
        <div className="degree-page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>Degree Verifications</h1>
                    <p>Manage and track university degrees pending HEC verification and immutable blockchain records.</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <div className="stat-box" onClick={() => setActiveTab('pending')} style={{ cursor: 'pointer', border: activeTab === 'pending' ? '2px solid #f59e0b' : '1px solid #e2e8f0' }}>
                    <div className="stat-icon-wrapper orange">
                        <FiClock />
                    </div>
                    <div className="stat-info">
                        <label>Pending Review</label>
                        <div className="stat-value" style={{ color: '#d97706' }}>{pendingDegrees.length}</div>
                    </div>
                </div>
                <div className="stat-box" onClick={() => setActiveTab('verified')} style={{ cursor: 'pointer', border: activeTab === 'verified' ? '2px solid #10b981' : '1px solid #e2e8f0' }}>
                    <div className="stat-icon-wrapper green">
                        <FiCheckCircle />
                    </div>
                    <div className="stat-info">
                        <label>Total Verified</label>
                        <div className="stat-value">{stats?.totalVerifiedDegrees || degrees.length}</div>
                    </div>
                </div>
                <div className="stat-box">
                    <div className="stat-icon-wrapper blue">
                        <FiBook />
                    </div>
                    <div className="stat-info">
                        <label>Universities</label>
                        <div className="stat-value">{stats?.totalUniversities || universities.length}</div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                <button
                    onClick={() => { setActiveTab('pending'); setSearchTerm(''); setUniversityFilter(''); }}
                    style={{
                        padding: '0.75rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '1rem', fontWeight: 600, color: activeTab === 'pending' ? '#f59e0b' : '#64748b',
                        borderBottom: activeTab === 'pending' ? '3px solid #f59e0b' : '3px solid transparent'
                    }}
                >
                    Pending Verification ({pendingDegrees.length})
                </button>
                <button
                    onClick={() => { setActiveTab('verified'); setSearchTerm(''); setUniversityFilter(''); }}
                    style={{
                        padding: '0.75rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '1rem', fontWeight: 600, color: activeTab === 'verified' ? '#10b981' : '#64748b',
                        borderBottom: activeTab === 'verified' ? '3px solid #10b981' : '3px solid transparent'
                    }}
                >
                    Verified Records ({degrees.length})
                </button>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="filter-search">
                    <FiSearch />
                    <input
                        type="text"
                        placeholder="Search by name, roll number, or hash..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="filter-select">
                    <FiFilter />
                    <select
                        value={universityFilter}
                        onChange={(e) => setUniversityFilter(e.target.value)}
                    >
                        <option value="">All Universities</option>
                        {universities.map(uni => (
                            <option key={uni} value={uni}>{uni}</option>
                        ))}
                    </select>
                </div>

                {(searchTerm || universityFilter) && (
                    <button
                        onClick={() => { setSearchTerm(''); setUniversityFilter(''); }}
                        className="clear-filter"
                    >
                        <FiX /> Clear
                    </button>
                )}
            </div>

            {/* Degrees Table */}
            <div className="table-container">
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <div className="spinner-large" style={{ margin: '0 auto' }}></div>
                        <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading degrees...</p>
                    </div>
                ) : filteredDegrees.length === 0 ? (
                    <div className="empty-state">
                        <FiFileText />
                        <p>No degrees found in {activeTab === 'pending' ? 'Pending' : 'Verified'} tab.</p>
                    </div>
                ) : (
                    <>
                        <table>
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>University</th>
                                    <th>Degree</th>
                                    <th>Date</th>
                                    {activeTab === 'verified' && <th>Hash</th>}
                                    <th style={{ textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDegrees.map((degree) => {
                                    const studentName = degree.studentName;
                                    const rollNo = degree.rollNumber || degree.studentRollNumber;
                                    const date = activeTab === 'pending' ? degree.createdAt : degree.verifiedAt;
                                    
                                    return (
                                        <tr key={degree.degreeId || degree.transactionId}>
                                            <td>
                                                <div className="student-cell">
                                                    <span className="name">{studentName}</span>
                                                    <span className="roll">{rollNo}</span>
                                                    {degree.cnic && <span className="cnic">{degree.cnic}</span>}
                                                </div>
                                            </td>
                                            <td>{degree.universityName}</td>
                                            <td>
                                                <div className="student-cell">
                                                    <span className="name">{degree.degreeTitle || degree.degreeProgram}</span>
                                                    <span className="roll">{degree.department}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {activeTab === 'pending' ? (
                                                    <div style={{ color: '#d97706', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                        <FiClock /> <span>{new Date(date).toLocaleDateString()}</span>
                                                    </div>
                                                ) : (
                                                    <div className="verified-cell">
                                                        <FiCheckCircle />
                                                        <span>{new Date(date).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                            </td>
                                            {activeTab === 'verified' && (
                                                <td>
                                                    <span className="hash-cell" title={degree.degreeHash}>
                                                        <FiHash />
                                                        {degree.degreeHash?.substring(0, 10)}...
                                                    </span>
                                                </td>
                                            )}
                                            <td>
                                                <div className="actions-cell" style={{ justifyContent: 'center' }}>
                                                    {activeTab === 'pending' ? (
                                                        <button
                                                            onClick={() => openPdfViewer(degree)}
                                                            className="btn-success"
                                                            style={{ padding: '0.4rem 1rem', background: '#3b82f6', border: 'none', color: 'white', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}
                                                        >
                                                            <FiEye /> View & Verify
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => openDetailModal(degree)}
                                                                className="view-btn"
                                                                title="View Details"
                                                            >
                                                                <FiEye />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownload(degree.transactionId)}
                                                                className="view-btn"
                                                                style={{ color: '#10b981' }}
                                                                title="Download Verified Degree"
                                                                disabled={downloadingId === degree.transactionId}
                                                            >
                                                                <FiDownload />
                                                            </button>
                                                            <a
                                                                href={`/verify/${degree.transactionId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="link-btn"
                                                                title="Public Verification Link"
                                                            >
                                                                <FiExternalLink />
                                                            </a>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="table-footer">
                            <p>Showing {filteredDegrees.length} of {displayList.length} degrees in {activeTab} tab</p>
                        </div>
                    </>
                )}
            </div>

            {/* Pending PDF Viewer Modal */}
            {showPdfViewer && selectedDegree && (
                <HecPdfViewer 
                    degree={selectedDegree} 
                    onClose={closeModals} 
                    onVerify={handleHECVerify} 
                    onReject={handleHECReject}
                />
            )}

            {/* Verified Detail Modal */}
            {showDetailModal && selectedDegree && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h2>Verified Degree Details</h2>
                                <p className="modal-subtitle">
                                    Transaction: {selectedDegree.transactionId}
                                </p>
                            </div>
                            <button onClick={closeModals} className="modal-close">
                                <FiX />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="verification-badge">
                                <FiCheckCircle />
                                <div>
                                    <p className="badge-title">HEC Verified Degree</p>
                                    <p className="badge-date">
                                        Verified on {new Date(selectedDegree.verifiedAt).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className="info-section">
                                <h3><FiUser /> Student Information</h3>
                                <div className="info-grid">
                                    <div className="info-item">
                                        <label>Full Name</label>
                                        <span>{selectedDegree.studentName}</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Roll Number</label>
                                        <span>{selectedDegree.rollNumber}</span>
                                    </div>
                                    {selectedDegree.cnic && (
                                        <div className="info-item">
                                            <label>CNIC</label>
                                            <span>{selectedDegree.cnic}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="info-section">
                                <h3><FiBook /> Academic Information</h3>
                                <div className="info-grid">
                                    <div className="info-item">
                                        <label>University</label>
                                        <span>{selectedDegree.universityName}</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Degree Title</label>
                                        <span>{selectedDegree.degreeTitle}</span>
                                    </div>
                                    <div className="info-item">
                                        <label>Department</label>
                                        <span>{selectedDegree.department}</span>
                                    </div>
                                    <div className="info-item">
                                        <label>CGPA</label>
                                        <span className="cgpa">{selectedDegree.cgpa}</span>
                                    </div>
                                    {selectedDegree.graduationDate && (
                                        <div className="info-item">
                                            <label>Graduation Date</label>
                                            <span>{new Date(selectedDegree.graduationDate).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="info-section">
                                <h3><FiLink /> Blockchain & IPFS</h3>
                                <div className="blockchain-info">
                                    <div className="hash-box">
                                        <label>Degree Hash (SHA-256)</label>
                                        <code>{selectedDegree.degreeHash}</code>
                                    </div>
                                    <div className="hash-box">
                                        <label>Transaction ID</label>
                                        <code>{selectedDegree.transactionId}</code>
                                    </div>
                                    {selectedDegree.ipfsGateway && (
                                        <div className="ipfs-link">
                                            <label>IPFS Gateway</label>
                                            <a href={selectedDegree.ipfsGateway} target="_blank" rel="noopener noreferrer">
                                                {selectedDegree.ipfsGateway}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button 
                                onClick={() => handleDownload(selectedDegree.transactionId)} 
                                className="btn-success" 
                                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', marginRight: '10px' }}
                                disabled={downloadingId === selectedDegree.transactionId}
                            >
                                <FiDownload /> {downloadingId === selectedDegree.transactionId ? 'Downloading...' : 'Download PDF'}
                            </button>
                            <a href={`/verify/${selectedDegree.transactionId}`} target="_blank" rel="noopener noreferrer" className="btn-success">
                                <FiExternalLink /> Public Link
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </HECLayout>
    );
};

export default VerifiedDegrees;
