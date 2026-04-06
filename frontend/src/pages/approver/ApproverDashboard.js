import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
    FaCheck, FaTimes, FaEye, FaClock, FaCheckCircle,
    FaSearch, FaFilePdf, FaUserTie, FaGraduationCap,
    FaIdCard, FaCalendarAlt, FaChevronRight,
    FaSpinner
} from 'react-icons/fa';
import axios from 'axios';
import ApproverLayout from '../../components/ApproverLayout';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ─── helpers ────────────────────────────────────────────────────────────────

const getAuthHeaders = () => {
    const token = localStorage.getItem('approverToken');
    return { Authorization: `Bearer ${token}` };
};

const statusColor = (status) => {
    if (status === 'approved' || status === 'approved_step') return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
    if (status === 'rejected') return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    if (status === 'pending') return { bg: '#fff7ed', color: '#d97706', border: '#fed7aa' };
    return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
};

const Badge = ({ label, status }) => {
    const s = statusColor(status);
    return (
        <span style={{
            padding: '2px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600,
            background: s.bg, color: s.color, border: `1px solid ${s.border}`
        }}>
            {label}
        </span>
    );
};

// ─── Small info row ──────────────────────────────────────────────────────────

const InfoRow = ({ icon, label, value }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.55rem' }}>
        {icon && <span style={{ color: '#94a3b8', marginTop: '2px', flexShrink: 0 }}>{icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>{label}</span>
            <span style={{ fontSize: '0.88rem', color: '#1e293b', fontWeight: 500 }}>{value}</span>
        </div>
    </div>
);

// ─── PDF Viewer Modal ────────────────────────────────────────────────────────

const SIDE_W = 360;

const PdfViewerModal = ({ degree, onClose, onApprove, onReject, viewOnly }) => {
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [processing, setProcessing] = useState(false);
    const [pdfState, setPdfState] = useState('loading');
    const [pdfError, setPdfError] = useState('');
    const [blobUrl, setBlobUrl] = useState(null);

    const token = localStorage.getItem('approverToken') || '';
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const baseUrl = apiUrl.replace(/\/api$/, '');
    const directUrl = `/api/approver/degrees/${degree.degreeId}/pdf?token=${encodeURIComponent(token)}`;

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

    const handleApprove = async () => {
        setProcessing(true);
        try { await onApprove(degree); onClose(); }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to approve'); }
        finally { setProcessing(false); }
    };

    const handleReject = async () => {
        if (!rejectionReason.trim()) { toast.error('Please provide a rejection reason'); return; }
        setProcessing(true);
        try { await onReject(degree, rejectionReason); onClose(); }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to reject'); }
        finally { setProcessing(false); }
    };

    const isPending = degree.approvalWorkflow?.some(s => s.status === 'pending');

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)' }}>
            <style>{`@keyframes pdfSpin { to { transform: rotate(360deg); } }`}</style>

            {/* ── LEFT PANEL: PDF viewer — uses absolute positioning for guaranteed height ── */}
            <div style={{
                position: 'absolute',
                top: 0, left: 0, right: `${SIDE_W}px`, bottom: 0,
                background: '#1e293b',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Toolbar — fixed 52px */}
                <div style={{
                    height: '52px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0 1.25rem', background: '#0f172a',
                    borderBottom: '1px solid #334155'
                }}>
                    <FaFilePdf style={{ color: '#f87171', fontSize: '1.1rem', flexShrink: 0 }} />
                    <span style={{
                        color: '#f1f5f9', fontWeight: 600, fontSize: '0.9rem', flex: 1,
                        minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                    }}>
                        {degree.studentName || 'Degree'} — PDF Preview
                    </span>
                    {blobUrl && (
                        <a href={blobUrl} target="_blank" rel="noopener noreferrer"
                            style={{
                                color: '#94a3b8', fontSize: '0.78rem', padding: '3px 8px',
                                border: '1px solid #334155', borderRadius: '4px',
                                textDecoration: 'none', marginRight: '6px', flexShrink: 0
                            }}>
                            ↗ New Tab
                        </a>
                    )}
                    <button onClick={onClose} style={{
                        background: '#ef4444', border: 'none', color: '#fff',
                        width: '30px', height: '30px', borderRadius: '6px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0
                    }}>
                        <FaTimes />
                    </button>
                </div>

                {/* PDF content — fills remaining height via calc */}
                <div style={{ height: 'calc(100% - 52px)', position: 'relative' }}>

                    {/* Loading spinner */}
                    {pdfState === 'loading' && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: '14px', background: '#1e293b'
                        }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '50%',
                                border: '4px solid #334155', borderTopColor: '#60a5fa',
                                animation: 'pdfSpin 0.7s linear infinite'
                            }} />
                            <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Loading degree PDF…</span>
                        </div>
                    )}

                    {/* Error state */}
                    {pdfState === 'error' && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: '12px', padding: '2rem', background: '#1e293b'
                        }}>
                            <FaFilePdf style={{ color: '#f87171', fontSize: '2.5rem' }} />
                            <p style={{ color: '#f87171', fontWeight: 700, margin: 0, fontSize: '1rem' }}>
                                Could not load PDF
                            </p>
                            <p style={{ color: '#64748b', margin: 0, fontSize: '0.82rem', textAlign: 'center' }}>
                                {pdfError}
                            </p>
                            <button
                                onClick={() => window.open(directUrl, '_blank')}
                                style={{
                                    marginTop: '8px', padding: '8px 20px',
                                    background: '#3b82f6', color: '#fff',
                                    border: 'none', borderRadius: '6px',
                                    cursor: 'pointer', fontWeight: 600
                                }}
                            >
                                Open in New Tab Instead
                            </button>
                        </div>
                    )}

                    {/* PDF iframe */}
                    {pdfState === 'ready' && blobUrl && (
                        <iframe
                            key={blobUrl}
                            src={blobUrl}
                            title="Degree PDF"
                            style={{
                                position: 'absolute', inset: 0,
                                width: '100%', height: '100%',
                                border: 'none', display: 'block'
                            }}
                        />
                    )}
                </div>
            </div>

            {/* ── RIGHT PANEL: Info + Actions — absolute, 360px from right ── */}
            <div style={{
                position: 'absolute',
                top: 0, right: 0, width: `${SIDE_W}px`, bottom: 0,
                background: '#fff', borderLeft: '1px solid #e5e7eb',
                display: 'flex', flexDirection: 'column', overflowY: 'auto'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.2rem 1.4rem', borderBottom: '1px solid #e5e7eb',
                    background: '#f8fafc', flexShrink: 0
                }}>
                    <h2 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                        {viewOnly ? 'Degree Preview' : 'Degree Review'}
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                        {viewOnly
                            ? 'View-only — close and click Verify to approve/reject.'
                            : 'Review the degree PDF then approve or reject below.'}
                    </p>
                    {viewOnly && (
                        <div style={{
                            marginTop: '10px', background: '#eff6ff',
                            border: '1px solid #bfdbfe', borderRadius: '6px',
                            padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '7px'
                        }}>
                            <FaEye style={{ color: '#3b82f6', flexShrink: 0, fontSize: '0.8rem' }} />
                            <span style={{ color: '#1d4ed8', fontSize: '0.76rem', fontWeight: 600 }}>
                                View-only mode
                            </span>
                        </div>
                    )}
                </div>

                {/* Student info */}
                <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid #e5e7eb' }}>
                    <h3 style={{
                        fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        marginBottom: '12px', marginTop: 0
                    }}>
                        Student Information
                    </h3>
                    <InfoRow icon={<FaUserTie />} label="Name" value={degree.studentName || '—'} />
                    <InfoRow icon={<FaIdCard />} label="Roll No" value={degree.studentRollNumber || '—'} />
                    <InfoRow icon={<FaGraduationCap />} label="Program" value={degree.degreeProgram || '—'} />
                    <InfoRow icon={<FaGraduationCap />} label="Department" value={degree.department || '—'} />
                    <InfoRow icon={<FaCalendarAlt />} label="Session" value={degree.session || '—'} />
                    <InfoRow label="CGPA" value={degree.cgpa || '—'} />
                    <InfoRow label="Graduation" value={degree.graduationDate || '—'} />
                </div>

                {/* Workflow progress */}
                <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid #e5e7eb' }}>
                    <h3 style={{
                        fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        marginBottom: '12px', marginTop: 0
                    }}>
                        Approval Progress ({degree.currentApprovalStep || 1}/{degree.totalApprovalSteps || 1})
                    </h3>
                    {(degree.approvalWorkflow || []).map((step, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{
                                width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem',
                                background: step.status === 'approved' ? '#d1fae5' : step.status === 'pending' ? '#fef3c7' : '#f1f5f9',
                                color: step.status === 'approved' ? '#059669' : step.status === 'pending' ? '#d97706' : '#94a3b8'
                            }}>
                                {step.status === 'approved' ? <FaCheck /> : step.status === 'pending' ? <FaClock /> : <FaChevronRight />}
                            </div>
                            <div style={{ flex: 1 }}>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.83rem', color: '#1e293b' }}>{step.roleName}</p>
                                <p style={{ margin: 0, fontSize: '0.73rem', color: '#64748b' }}>
                                    {step.status === 'approved'
                                        ? `Approved ${step.approvedAt ? new Date(step.approvedAt).toLocaleDateString() : ''}`
                                        : step.status === 'pending' ? 'Awaiting approval' : 'Waiting'}
                                </p>
                            </div>
                            <Badge label={step.status} status={step.status} />
                        </div>
                    ))}
                </div>

                {/* Action area */}
                <div style={{ padding: '1.2rem 1.4rem', marginTop: 'auto' }}>
                    {isPending && !viewOnly && !showRejectForm && (
                        <>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '14px', lineHeight: 1.5, marginTop: 0 }}>
                                Your digital signature will be stamped on the degree upon approval.
                            </p>
                            <button
                                onClick={handleApprove} disabled={processing}
                                style={{
                                    width: '100%', padding: '0.75rem', marginBottom: '10px',
                                    background: processing ? '#86efac' : '#16a34a', color: '#fff',
                                    border: 'none', borderRadius: '8px', cursor: processing ? 'not-allowed' : 'pointer',
                                    fontWeight: 700, fontSize: '0.9rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                }}
                            >
                                {processing
                                    ? <><FaSpinner style={{ animation: 'pdfSpin 1s linear infinite' }} /> Processing…</>
                                    : <><FaCheck /> Verify &amp; Sign</>}
                            </button>
                            <button
                                onClick={() => setShowRejectForm(true)} disabled={processing}
                                style={{
                                    width: '100%', padding: '0.75rem',
                                    background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca',
                                    borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                }}
                            >
                                <FaTimes /> Reject
                            </button>
                        </>
                    )}

                    {isPending && !viewOnly && showRejectForm && (
                        <>
                            <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151', display: 'block', marginBottom: '8px' }}>
                                Reason for Rejection *
                            </label>
                            <textarea
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                rows={4}
                                placeholder="Provide a clear reason…"
                                style={{
                                    width: '100%', borderRadius: '7px', border: '1.5px solid #e5e7eb',
                                    padding: '8px 10px', fontSize: '0.85rem', resize: 'vertical',
                                    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
                                }}
                            />
                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                <button
                                    onClick={() => setShowRejectForm(false)}
                                    style={{
                                        flex: 1, padding: '0.65rem', background: '#f1f5f9',
                                        border: 'none', color: '#374151', borderRadius: '7px',
                                        cursor: 'pointer', fontWeight: 600
                                    }}
                                >Back</button>
                                <button
                                    onClick={handleReject} disabled={processing}
                                    style={{
                                        flex: 1, padding: '0.65rem', background: '#dc2626', color: '#fff',
                                        border: 'none', borderRadius: '7px',
                                        cursor: processing ? 'not-allowed' : 'pointer', fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                    }}
                                >
                                    {processing ? <FaSpinner style={{ animation: 'pdfSpin 1s linear infinite' }} /> : <FaTimes />}
                                    Confirm Reject
                                </button>
                            </div>
                        </>
                    )}

                    {!isPending && (
                        <div style={{
                            background: '#f0fdf4', border: '1px solid #bbf7d0',
                            borderRadius: '8px', padding: '12px',
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            <FaCheckCircle style={{ color: '#16a34a' }} />
                            <p style={{ color: '#15803d', fontSize: '0.85rem', margin: 0 }}>
                                Already acted upon.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────

const ApproverDashboard = () => {
    const [degrees, setDegrees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [searching, setSearching] = useState(false);
    const [viewingDegree, setViewingDegree] = useState(null);
    const [viewOnlyMode, setViewOnlyMode] = useState(false);

    const fetchDegrees = useCallback(async (tab) => {
        setLoading(true);
        try {
            const endpoint = tab === 'pending'
                ? `${API_URL}/approver/degrees/pending`
                : `${API_URL}/approver/degrees/history`;
            const res = await axios.get(endpoint, { headers: getAuthHeaders() });
            setDegrees(res.data.degrees || res.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to fetch degrees');
            setDegrees([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDegrees(activeTab); }, [activeTab, fetchDegrees]);

    const handleSearch = async () => {
        if (!searchTerm.trim()) { fetchDegrees(activeTab); return; }
        setSearching(true);
        try {
            const res = await axios.get(`${API_URL}/approver/degrees/search?q=${encodeURIComponent(searchTerm)}`, { headers: getAuthHeaders() });
            setDegrees(res.data.degrees || res.data || []);
        } catch (err) {
            toast.error('Search failed');
        } finally {
            setSearching(false);
        }
    };

    const handleApprove = async (degree) => {
        const res = await axios.post(
            `${API_URL}/approver/degrees/${degree.degreeId}/approve`,
            {},
            { headers: getAuthHeaders() }
        );
        toast.success(res.data.message || 'Degree approved successfully!');
        fetchDegrees(activeTab);
    };

    const handleReject = async (degree, reason) => {
        const res = await axios.post(
            `${API_URL}/approver/degrees/${degree.degreeId}/reject`,
            { rejectionReason: reason },
            { headers: getAuthHeaders() }
        );
        toast.success(res.data.message || 'Degree rejected.');
        fetchDegrees(activeTab);
    };

    const filteredDegrees = degrees.filter(d =>
        !searchTerm || (d.studentName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const tabStyle = (tab) => ({
        padding: '0.6rem 1.4rem', border: 'none', borderRadius: '6px',
        cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
        background: activeTab === tab ? '#3b82f6' : 'transparent',
        color: activeTab === tab ? '#fff' : '#64748b',
        transition: 'all 0.15s'
    });

    return (
        <ApproverLayout>
            <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
                {/* Page header */}
                <div style={{ marginBottom: '1.75rem' }}>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                        Approver Dashboard
                    </h1>
                    <p style={{ color: '#64748b', marginTop: '0.35rem', fontSize: '0.9rem' }}>
                        Review and approve degree documents
                    </p>
                </div>

                {/* Tabs + Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '4px', display: 'flex', gap: '4px' }}>
                        <button style={tabStyle('pending')} onClick={() => setActiveTab('pending')}>
                            Pending Approval
                        </button>
                        <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>
                            History
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="Search by student name…"
                            style={{
                                padding: '0.5rem 0.85rem', borderRadius: '7px',
                                border: '1.5px solid #e2e8f0', fontSize: '0.88rem',
                                outline: 'none', width: '220px'
                            }}
                        />
                        <button
                            onClick={handleSearch}
                            style={{
                                padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff',
                                border: 'none', borderRadius: '7px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600
                            }}
                        >
                            {searching ? <FaSpinner style={{ animation: 'pdfSpin 1s linear infinite' }} /> : <FaSearch />}
                            Search
                        </button>
                    </div>
                </div>

                {/* Degree list */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
                        <FaSpinner style={{ fontSize: '2rem', animation: 'pdfSpin 1s linear infinite', marginBottom: '1rem' }} />
                        <p style={{ margin: 0 }}>Loading degrees…</p>
                    </div>
                ) : filteredDegrees.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
                        <FaGraduationCap style={{ fontSize: '3rem', marginBottom: '1rem' }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>No degrees found</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {filteredDegrees.map((degree) => {
                            const isPending = degree.approvalWorkflow?.some(s => s.status === 'pending');
                            return (
                                <div key={degree.degreeId || degree._id} style={{
                                    background: '#fff', borderRadius: '12px',
                                    border: '1px solid #e2e8f0', padding: '1.25rem 1.5rem',
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                                }}>
                                    <div style={{
                                        width: '44px', height: '44px', borderRadius: '10px',
                                        background: '#eff6ff', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        <FaGraduationCap style={{ color: '#3b82f6', fontSize: '1.2rem' }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
                                            {degree.studentName || 'Unknown Student'}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                            {degree.degreeProgram || '—'} · {degree.department || '—'}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Badge
                                            label={degree.overallStatus || 'pending'}
                                            status={degree.overallStatus || 'pending'}
                                        />
                                    </div>
                                    {/* Buttons */}
                                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                        <button
                                            onClick={() => { setViewingDegree(degree); setViewOnlyMode(!isPending); }}
                                            title="View Degree"
                                            style={{
                                                padding: '0.45rem 0.9rem', borderRadius: '7px',
                                                border: '1.5px solid #bfdbfe', background: '#eff6ff',
                                                color: '#1d4ed8', cursor: 'pointer', fontWeight: 600,
                                                fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '5px'
                                            }}
                                        >
                                            <FaEye /> View Degree
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* PDF Viewer Modal */}
            {viewingDegree && (
                <PdfViewerModal
                    degree={viewingDegree}
                    viewOnly={viewOnlyMode}
                    onClose={() => setViewingDegree(null)}
                    onApprove={handleApprove}
                    onReject={handleReject}
                />
            )}

            <style>{`@keyframes pdfSpin { to { transform: rotate(360deg); } }`}</style>
        </ApproverLayout>
    );
};

export default ApproverDashboard;
