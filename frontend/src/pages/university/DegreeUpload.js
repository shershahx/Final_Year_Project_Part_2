import React, { useState, useEffect, useCallback } from 'react';
import { 
    FiUpload, 
    FiCheck, 
    FiX, 
    FiFileText, 
    FiAlertCircle,
    FiCheckCircle,
    FiClock,
    FiTrash2,
    FiSend,
    FiLayers
} from 'react-icons/fi';
import { degreeAPI, approvalAPI, templateAPI } from '../../services/api';
import UniversityLayout from '../../components/UniversityLayout';

const DegreeUpload = () => {
    const [loading, setLoading] = useState(true);
    const [hasTemplates, setHasTemplates] = useState(false);

    // Role validation state
    const [requiredRoles, setRequiredRoles] = useState([]);       // roles required by template
    const [missingRoles, setMissingRoles] = useState([]);         // required but not registered
    const [missingSignatures, setMissingSignatures] = useState([]); // registered but no signature
    const [rolesReady, setRolesReady] = useState(false);          // all required roles complete

    const [activeTab, setActiveTab] = useState('upload');

    // Batch upload state
    const [batchFiles, setBatchFiles] = useState([]);
    const [batchUploading, setBatchUploading] = useState(false);
    const [batchProgress, setBatchProgress] = useState(0);
    const [batchResults, setBatchResults] = useState(null);
    const [error, setError] = useState(null);
    const [dragOver, setDragOver] = useState(false);

    const MAX_BATCH_SIZE = 100;

    const checkRequirements = useCallback(async () => {
        try {
            setLoading(true);

            const [rolesRes, templateRes] = await Promise.all([
                approvalAPI.getRoles(),
                templateAPI.getActiveTemplate()
            ]);

            // Template check
            const hasActiveTemplate = !!(templateRes.data.success && templateRes.data.template);
            setHasTemplates(hasActiveTemplate);

            const templateRequiredRoles = templateRes.data.requiredSignatureRoles || [];
            setRequiredRoles(templateRequiredRoles);

            // Role check
            const registeredRoles = (rolesRes.data.roles || []).filter(r => r.isActive !== false);

            if (templateRequiredRoles.length === 0 || !hasActiveTemplate) {
                // No template or no required roles detected — fall back to simple check
                const hasAnyRoles = registeredRoles.length > 0;
                setRolesReady(hasAnyRoles);
                setMissingRoles([]);
                setMissingSignatures([]);
            } else {
                const missing = [];
                const noSig = [];

                for (const roleName of templateRequiredRoles) {
                    const norm = roleName.trim().toLowerCase();
                    const matched = registeredRoles.find(r => {
                        const rNorm = r.roleName.trim().toLowerCase();
                        return rNorm === norm || rNorm.startsWith(norm) || norm.startsWith(rNorm);
                    });
                    if (!matched) {
                        missing.push(roleName);
                    } else if (!matched.signature) {
                        noSig.push(roleName);
                    }
                }

                setMissingRoles(missing);
                setMissingSignatures(noSig);
                setRolesReady(missing.length === 0 && noSig.length === 0);
            }
        } catch (err) {
            console.error('Error checking requirements:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkRequirements();
    }, [checkRequirements]);

    // File handling
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
        addFiles(files);
    };

    const addFiles = (files) => {
        if (files.length === 0) {
            setError('Please select PDF files only');
            return;
        }
        if (batchFiles.length + files.length > MAX_BATCH_SIZE) {
            setError(`Maximum ${MAX_BATCH_SIZE} files allowed. You have ${batchFiles.length}, trying to add ${files.length}.`);
            return;
        }
        setBatchFiles(prev => [...prev, ...files]);
        setError(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
        addFiles(files);
    };

    const removeFile = (index) => {
        setBatchFiles(prev => {
            const newFiles = [...prev];
            newFiles.splice(index, 1);
            return newFiles;
        });
    };

    const clearAll = () => {
        setBatchFiles([]);
        setBatchResults(null);
        setError(null);
    };

    const handleUploadForApproval = async () => {
        if (batchFiles.length === 0) {
            setError('Please add at least one PDF file');
            return;
        }

        try {
            setBatchUploading(true);
            setBatchProgress(0);
            setError(null);
            setBatchResults(null);

            const formData = new FormData();
            batchFiles.forEach((file) => {
                formData.append('degrees', file);
            });

            const response = await degreeAPI.batchUploadForApproval(formData, (progress) => {
                setBatchProgress(Math.round((progress.loaded / progress.total) * 100));
            });

            setBatchResults(response.data.data);
            setBatchFiles([]);
        } catch (err) {
            console.error('Upload error:', err);
            const msg = err.response?.data?.message || 'Failed to upload degrees for approval';
            setError(msg);
        } finally {
            setBatchUploading(false);
        }
    };

    if (loading) {
        return (
            <UniversityLayout>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
                    <div className="spinner" style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTop: '4px solid #3182ce', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                </div>
            </UniversityLayout>
        );
    }

    return (
        <UniversityLayout>
            <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1a202c', marginBottom: '0.5rem' }}>
                        <FiUpload style={{ display: 'inline', marginRight: '0.75rem', color: '#3182ce' }} />
                        Degree Management
                    </h1>
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

                        {/* No template warning */}
                        {!hasTemplates && (
                            <div style={{
                                background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px',
                                padding: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem'
                            }}>
                                <FiAlertCircle style={{ color: '#ea580c', fontSize: '1.5rem', flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <h3 style={{ fontWeight: '600', color: '#9a3412', marginBottom: '0.25rem' }}>No Degree Template Uploaded</h3>
                                    <p style={{ color: '#c2410c', fontSize: '0.9rem', margin: 0 }}>
                                        Go to <a href="/university/templates" style={{ color: '#2563eb', textDecoration: 'underline' }}>Degree Templates</a> and upload your template PDF first.
                                        The template determines which approval roles are required.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Missing roles warning */}
                        {hasTemplates && missingRoles.length > 0 && (
                            <div style={{
                                background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '12px',
                                padding: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem'
                            }}>
                                <FiAlertCircle style={{ color: '#dc2626', fontSize: '1.5rem', flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <h3 style={{ fontWeight: '600', color: '#991b1b', marginBottom: '0.25rem' }}>Required Roles Not Registered</h3>
                                    <p style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '0 0 0.4rem' }}>
                                        Your template requires the following roles to be registered:{' '}
                                        <strong>{missingRoles.join(', ')}</strong>
                                    </p>
                                    <a href="/university/role-management" style={{ color: '#2563eb', textDecoration: 'underline', fontSize: '0.9rem' }}>
                                        Go to Role Management →
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* Missing signatures warning */}
                        {hasTemplates && missingSignatures.length > 0 && missingRoles.length === 0 && (
                            <div style={{
                                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px',
                                padding: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem'
                            }}>
                                <FiAlertCircle style={{ color: '#d97706', fontSize: '1.5rem', flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <h3 style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.25rem' }}>Signatures Missing</h3>
                                    <p style={{ color: '#a16207', fontSize: '0.9rem', margin: '0 0 0.4rem' }}>
                                        The following roles are registered but missing signatures:{' '}
                                        <strong>{missingSignatures.join(', ')}</strong>
                                    </p>
                                    <a href="/university/role-management" style={{ color: '#2563eb', textDecoration: 'underline', fontSize: '0.9rem' }}>
                                        Add signatures in Role Management →
                                    </a>
                                </div>
                            </div>
                        )}

                        {/* All ready banner */}
                        {hasTemplates && rolesReady && requiredRoles.length > 0 && (
                            <div style={{
                                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
                                padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem'
                            }}>
                                <FiCheckCircle style={{ color: '#16a34a', fontSize: '1.3rem', flexShrink: 0 }} />
                                <p style={{ color: '#15803d', fontSize: '0.9rem', margin: 0, fontWeight: '500' }}>
                                    ✓ All required roles ({requiredRoles.join(', ')}) are registered with signatures. Ready to send degrees for approval.
                                </p>
                            </div>
                        )}

                        {/* Upload Area */}
                        <div className="card" style={{ marginBottom: '2rem' }}>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#2d3748', margin: 0 }}>
                                        <FiLayers style={{ display: 'inline', marginRight: '0.5rem' }} />
                                        Batch Upload ({batchFiles.length}/{MAX_BATCH_SIZE} files)
                                    </h2>
                                    {batchFiles.length > 0 && (
                                        <button onClick={clearAll} style={{
                                            background: 'none', border: '1px solid #e53e3e', color: '#e53e3e', padding: '0.35rem 0.75rem',
                                            borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem'
                                        }}>
                                            <FiTrash2 size={14} /> Clear All
                                        </button>
                                    )}
                                </div>

                                {/* Drop zone */}
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => (hasTemplates && rolesReady) && document.getElementById('batch-file-input').click()}
                                    title={!hasTemplates ? 'Upload a degree template first' : !rolesReady ? 'Register all required roles with signatures first' : ''}
                                    style={{
                                        border: `2px dashed ${dragOver ? '#3182ce' : '#cbd5e0'}`,
                                        borderRadius: '12px', padding: '2.5rem 2rem', textAlign: 'center',
                                        cursor: (hasTemplates && rolesReady) ? 'pointer' : 'not-allowed',
                                        background: dragOver ? '#ebf8ff' : '#f7fafc',
                                        transition: 'all 0.2s ease',
                                        opacity: (hasTemplates && rolesReady) ? 1 : 0.45,
                                        pointerEvents: (hasTemplates && rolesReady) ? 'auto' : 'none'
                                    }}
                                >
                                    <FiUpload style={{ fontSize: '2.5rem', color: dragOver ? '#3182ce' : '#a0aec0', marginBottom: '0.75rem' }} />
                                    <p style={{ fontWeight: '600', color: '#4a5568', marginBottom: '0.25rem', fontSize: '1rem' }}>
                                        Drag & drop degree PDFs here
                                    </p>
                                    <p style={{ color: '#a0aec0', fontSize: '0.85rem', margin: 0 }}>
                                        or click to browse. Up to {MAX_BATCH_SIZE} PDF files, 10MB each.
                                    </p>
                                    <input id="batch-file-input" type="file" accept="application/pdf" multiple
                                        onChange={handleFileSelect} style={{ display: 'none' }} />
                                </div>

                                {/* File list */}
                                {batchFiles.length > 0 && (
                                    <div style={{ marginTop: '1.25rem' }}>
                                        <div style={{ maxHeight: '250px', overflowY: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            {batchFiles.map((file, index) => (
                                                <div key={index} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '0.6rem 1rem',
                                                    borderBottom: index < batchFiles.length - 1 ? '1px solid #edf2f7' : 'none',
                                                    background: index % 2 === 0 ? '#fff' : '#f7fafc'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                                                        <FiFileText style={{ color: '#e53e3e', flexShrink: 0 }} />
                                                        <span style={{ fontSize: '0.875rem', color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {file.name}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                        <button onClick={(e) => { e.stopPropagation(); removeFile(index); }} style={{
                                                            background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', padding: '2px'
                                                        }}><FiX size={16} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <button onClick={handleUploadForApproval} disabled={batchUploading} style={{
                                            marginTop: '1.25rem', width: '100%', padding: '0.85rem',
                                            background: batchUploading ? '#a0aec0' : 'linear-gradient(135deg, #2b6cb0, #3182ce)',
                                            color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem',
                                            fontWeight: '600', cursor: batchUploading ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                        }}>
                                            {batchUploading ? (
                                                <>
                                                    <div className="spinner" style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                                    Uploading... {batchProgress}%
                                                </>
                                            ) : (
                                                <><FiSend size={18} /> Send {batchFiles.length} Degree{batchFiles.length > 1 ? 's' : ''} for Approval</>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Batch Results */}
                        {batchResults && (
                            <div className="card" style={{ marginBottom: '2rem' }}>
                                <div style={{ padding: '1.5rem' }}>
                                    <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#2d3748', marginBottom: '1rem' }}>Upload Results</h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                        <div style={{ background: '#f7fafc', borderRadius: '10px', padding: '1rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#2d3748' }}>{batchResults.total}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#718096' }}>Total</div>
                                        </div>
                                        <div style={{ background: '#f0fff4', borderRadius: '10px', padding: '1rem', textAlign: 'center', border: '1px solid #c6f6d5' }}>
                                            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#38a169' }}>{batchResults.sentForApproval}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#38a169' }}>Sent for Approval</div>
                                        </div>
                                        <div style={{ background: batchResults.failed > 0 ? '#fff5f5' : '#f7fafc', borderRadius: '10px', padding: '1rem', textAlign: 'center', border: `1px solid ${batchResults.failed > 0 ? '#fed7d7' : '#e2e8f0'}` }}>
                                            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: batchResults.failed > 0 ? '#e53e3e' : '#a0aec0' }}>{batchResults.failed}</div>
                                            <div style={{ fontSize: '0.8rem', color: batchResults.failed > 0 ? '#e53e3e' : '#718096' }}>Failed</div>
                                        </div>
                                    </div>
                                    <div style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: '#f7fafc' }}>
                                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: '#718096', fontWeight: '600' }}>#</th>
                                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: '#718096', fontWeight: '600' }}>File</th>
                                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: '#718096', fontWeight: '600' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {batchResults.results.map((result, idx) => (
                                                    <tr key={idx} style={{ borderTop: '1px solid #edf2f7' }}>
                                                        <td style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#718096' }}>{idx + 1}</td>
                                                        <td style={{ padding: '0.65rem 1rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                <FiFileText style={{ color: '#e53e3e', flexShrink: 0 }} size={14} />
                                                                <span style={{ fontSize: '0.85rem', color: '#4a5568' }}>{result.fileName}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                                            {result.success ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#f0fff4', color: '#38a169', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '500' }}>
                                                                    <FiCheckCircle size={13} /> Sent
                                                                </span>
                                                            ) : (
                                                                <div>
                                                                    <span title={result.error} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#fff5f5', color: '#e53e3e', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '500', cursor: 'help' }}>
                                                                        <FiX size={13} /> {result.templateCheck ? 'Template Mismatch' : 'Failed'}
                                                                    </span>
                                                                    {result.templateCheck && (
                                                                        <div style={{ fontSize: '0.75rem', color: '#e53e3e', marginTop: '4px' }}>
                                                                            Score: {result.templateCheck.score}% — 
                                                                            {result.templateCheck.checks?.map(c => c.name).join(', ')}
                                                                        </div>
                                                                    )}
                                                                    {!result.templateCheck && result.error && (
                                                                        <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>{result.error}</div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
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
        approved: { bg: '#ebf8ff', color: '#3182ce', icon: <FiCheck size={12} />, label: 'Approved' },
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

export default DegreeUpload;
