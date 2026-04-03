import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FaPlus, FaTrash, FaPen, FaUpload, FaArrowUp, FaArrowDown, FaFileAlt, FaExclamationTriangle, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import SignatureCanvas from '../../components/SignatureCanvas';
import { approvalAPI, templateAPI } from '../../services/api';
import UniversityLayout from '../../components/UniversityLayout';

const RoleManagement = () => {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [signatureMethod, setSignatureMethod] = useState('draw');

    // Template-derived state
    const [activeTemplate, setActiveTemplate] = useState(null);
    const [templateLoading, setTemplateLoading] = useState(true);
    const [requiredRoles, setRequiredRoles] = useState([]);

    const [newRole, setNewRole] = useState({
        roleName: '',
        holderName: '',
        holderEmail: '',
        holderPhone: '',
        approvalOrder: 1
    });

    useEffect(() => {
        fetchTemplate();
        fetchRoles();
    }, []);

    const fetchTemplate = async () => {
        try {
            setTemplateLoading(true);
            const response = await templateAPI.getActiveTemplate();
            if (response.data.success && response.data.template) {
                setActiveTemplate(response.data.template);
                setRequiredRoles(response.data.requiredSignatureRoles || []);
            } else {
                setActiveTemplate(null);
                setRequiredRoles([]);
            }
        } catch (error) {
            console.error('Error fetching active template:', error);
            setActiveTemplate(null);
            setRequiredRoles([]);
        } finally {
            setTemplateLoading(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await approvalAPI.getRoles();
            if (response.data.success) {
                setRoles(response.data.roles.sort((a, b) => a.approvalOrder - b.approvalOrder));
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching roles:', error);
            toast.error('Failed to load approval roles');
            setLoading(false);
        }
    };

    // Derive available roles: template required roles minus already added ones
    const getAvailableRoleOptions = () => {
        if (requiredRoles.length === 0) return [];
        return requiredRoles.filter(
            roleName => !roles.some(r => r.roleName.trim().toLowerCase() === roleName.trim().toLowerCase())
        );
    };

    const availableRoleOptions = getAvailableRoleOptions();

    // Check status of each required role
    const getRoleStatus = (roleName) => {
        const match = roles.find(r => r.roleName.trim().toLowerCase() === roleName.trim().toLowerCase());
        if (!match) return 'missing';
        if (!match.signature) return 'no-signature';
        return 'complete';
    };

    const handleAddRole = async (e) => {
        e.preventDefault();
        try {
            const response = await approvalAPI.addRole(newRole);
            if (response.data.success) {
                toast.success('Role added successfully');
                setShowAddModal(false);
                setNewRole({ roleName: '', holderName: '', holderEmail: '', holderPhone: '', approvalOrder: 1 });
                fetchRoles();
            }
        } catch (error) {
            console.error('Error adding role:', error);
            toast.error(error.response?.data?.message || 'Failed to add role');
        }
    };

    const handleDeleteRole = async (roleId) => {
        if (!window.confirm('Are you sure you want to delete this role?')) return;
        try {
            const response = await approvalAPI.deleteRole(roleId);
            if (response.data.success) {
                toast.success('Role deleted successfully');
                fetchRoles();
            }
        } catch (error) {
            console.error('Error deleting role:', error);
            toast.error('Failed to delete role');
        }
    };

    const handleSignatureSave = async (signatureData) => {
        try {
            const response = await approvalAPI.saveDrawnSignature(selectedRole.roleId, signatureData);
            if (response.data.success) {
                toast.success('Signature saved successfully');
                setShowSignatureModal(false);
                fetchRoles();
            }
        } catch (error) {
            console.error('Error saving signature:', error);
            toast.error('Failed to save signature');
        }
    };

    const handleSignatureUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('signature', file);
        try {
            const response = await approvalAPI.uploadSignature(selectedRole.roleId, formData);
            if (response.data.success) {
                toast.success('Signature uploaded successfully');
                setShowSignatureModal(false);
                fetchRoles();
            }
        } catch (error) {
            console.error('Error uploading signature:', error);
            toast.error('Failed to upload signature');
        }
    };

    const moveRole = async (roleId, direction) => {
        const roleIndex = roles.findIndex(r => r.roleId === roleId);
        if (roleIndex === -1) return;
        const newRoles = [...roles];
        const role = newRoles[roleIndex];
        if (direction === 'up' && roleIndex > 0) {
            newRoles[roleIndex] = newRoles[roleIndex - 1];
            newRoles[roleIndex - 1] = role;
        } else if (direction === 'down' && roleIndex < newRoles.length - 1) {
            newRoles[roleIndex] = newRoles[roleIndex + 1];
            newRoles[roleIndex + 1] = role;
        } else return;

        const roleOrders = newRoles.map((r, index) => ({ roleId: r.roleId, approvalOrder: index + 1 }));
        try {
            const response = await approvalAPI.reorderRoles(roleOrders);
            if (response.data.success) {
                setRoles(newRoles);
                toast.success('Order updated');
            }
        } catch (error) {
            console.error('Error reordering roles:', error);
            toast.error('Failed to update order');
        }
    };

    const getStatusBadge = (roleName) => {
        const status = getRoleStatus(roleName);
        const styles = {
            missing: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', icon: <FaTimesCircle />, label: 'Not Registered' },
            'no-signature': { bg: '#fffbeb', color: '#d97706', border: '#fde68a', icon: <FaExclamationTriangle />, label: 'Missing Signature' },
            complete: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', icon: <FaCheckCircle />, label: 'Ready' }
        };
        const s = styles[status];
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
                background: s.bg, color: s.color, border: `1px solid ${s.border}`
            }}>
                {s.icon} {s.label}
            </span>
        );
    };

    if (loading || templateLoading) {
        return (
            <UniversityLayout>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <div>Loading...</div>
                </div>
            </UniversityLayout>
        );
    }

    const allRequiredComplete = requiredRoles.length > 0 && requiredRoles.every(r => getRoleStatus(r) === 'complete');

    return (
        <UniversityLayout>
            <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
                <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                    <h1>Approval Roles Management</h1>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn btn-primary"
                        disabled={!activeTemplate || availableRoleOptions.length === 0}
                        title={!activeTemplate ? 'Upload a template first' : availableRoleOptions.length === 0 ? 'All required roles have been added' : 'Add a new approval role'}
                    >
                        <FaPlus /> Add Role
                    </button>
                </div>

                {/* ── No Template Warning ─────────────────────────────────────── */}
                {!activeTemplate && (
                    <div style={{
                        background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px',
                        padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
                        display: 'flex', alignItems: 'flex-start', gap: '1rem'
                    }}>
                        <FaExclamationTriangle style={{ color: '#ea580c', fontSize: '1.4rem', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <h3 style={{ fontWeight: 700, color: '#9a3412', marginBottom: '0.3rem', fontSize: '1rem' }}>
                                No Active Degree Template
                            </h3>
                            <p style={{ color: '#c2410c', fontSize: '0.9rem', margin: 0 }}>
                                You must upload a degree template before adding approval roles.
                                The template determines which signature roles are required (e.g., Vice Chancellor, Registrar).{' '}
                                <a href="/university/templates" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>
                                    Go to Degree Templates →
                                </a>
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Template Required Roles Status Card ─────────────────────── */}
                {activeTemplate && (
                    <div style={{
                        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
                        padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                            <FaFileAlt style={{ color: '#1a5f2a' }} />
                            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1f2937' }}>
                                Template: {activeTemplate.templateName}
                            </span>
                            {allRequiredComplete ? (
                                <span style={{ marginLeft: 'auto', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '3px 12px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <FaCheckCircle /> All roles ready for approval
                                </span>
                            ) : (
                                <span style={{ marginLeft: 'auto', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '20px', padding: '3px 12px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <FaTimesCircle /> Setup incomplete
                                </span>
                            )}
                        </div>

                        {requiredRoles.length === 0 ? (
                            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.75rem 1rem', color: '#92400e', fontSize: '0.875rem' }}>
                                ⚠️ No signature roles were detected on your template PDF. Please ensure your template includes labels like "Vice Chancellor" or "Registrar", then re-upload it.
                            </div>
                        ) : (
                            <div>
                                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.75rem', margin: '0 0 0.75rem' }}>
                                    Required roles detected on your template — all must be registered with signatures before sending degrees for approval:
                                </p>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {requiredRoles.map(roleName => (
                                        <div key={roleName} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            background: '#f9fafb', border: '1px solid #e5e7eb',
                                            borderRadius: '8px', padding: '0.5rem 0.85rem'
                                        }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#374151' }}>{roleName}</span>
                                            {getStatusBadge(roleName)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Registered Roles Table ──────────────────────────────────── */}
                {roles.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                        <p style={{ marginBottom: '1rem', color: '#666' }}>No approval roles configured yet.</p>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="btn btn-primary"
                            disabled={!activeTemplate || availableRoleOptions.length === 0}
                        >
                            Add First Role
                        </button>
                    </div>
                ) : (
                    <div className="card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Role Name</th>
                                    <th>Holder</th>
                                    <th>Email</th>
                                    <th>Signature</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((role, index) => (
                                    <tr key={role.roleId}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontWeight: '500' }}>{role.approvalOrder}</span>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    {index > 0 && (
                                                        <button onClick={() => moveRole(role.roleId, 'up')}
                                                            style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '2px' }}>
                                                            <FaArrowUp size={12} />
                                                        </button>
                                                    )}
                                                    {index < roles.length - 1 && (
                                                        <button onClick={() => moveRole(role.roleId, 'down')}
                                                            style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '2px' }}>
                                                            <FaArrowDown size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td><span style={{ fontWeight: '500' }}>{role.roleName}</span></td>
                                        <td>{role.holderName}</td>
                                        <td>{role.holderEmail}</td>
                                        <td>
                                            {role.signature
                                                ? <span className="badge badge-approved">✓ Added</span>
                                                : <span className="badge badge-rejected">✗ Missing</span>
                                            }
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => { setSelectedRole(role); setShowSignatureModal(true); }}
                                                className="text-blue-600 hover:text-blue-800 mr-3"
                                                title="Add/Update Signature"
                                            >
                                                <FaPen />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteRole(role.roleId)}
                                                className="btn btn-danger"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                                title="Delete Role"
                                            >
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── Add Role Modal ──────────────────────────────────────────── */}
                {showAddModal && (
                    <div className="modal-overlay">
                        <div className="modal">
                            <div className="modal-header">
                                <h2>Add Approval Role</h2>
                            </div>
                            <div className="modal-body">
                                <form onSubmit={handleAddRole}>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label className="form-label">Role Name *</label>
                                        {/* Only show roles required by the template */}
                                        <select
                                            value={newRole.roleName}
                                            onChange={(e) => setNewRole({ ...newRole, roleName: e.target.value })}
                                            className="form-input"
                                            required
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <option value="">-- Select Role --</option>
                                            {availableRoleOptions.map(roleName => (
                                                <option key={roleName} value={roleName}>{roleName}</option>
                                            ))}
                                        </select>
                                        {availableRoleOptions.length === 0 && requiredRoles.length > 0 && (
                                            <p style={{ color: '#16a34a', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                                ✓ All required roles ({requiredRoles.join(', ')}) have been added.
                                            </p>
                                        )}
                                        {requiredRoles.length > 0 && (
                                            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                                                Only roles required by your template are shown.
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label className="form-label">Holder Name *</label>
                                        <input
                                            type="text"
                                            value={newRole.holderName}
                                            onChange={(e) => setNewRole({ ...newRole, holderName: e.target.value })}
                                            className="form-input"
                                            placeholder="e.g., Dr. John Smith"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label className="form-label">Email *</label>
                                        <input
                                            type="email"
                                            value={newRole.holderEmail}
                                            onChange={(e) => setNewRole({ ...newRole, holderEmail: e.target.value })}
                                            className="form-input"
                                            placeholder="registrar@university.edu.pk"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label className="form-label">Phone</label>
                                        <input
                                            type="text"
                                            value={newRole.holderPhone}
                                            onChange={(e) => setNewRole({ ...newRole, holderPhone: e.target.value })}
                                            className="form-input"
                                            placeholder="+92-300-1234567"
                                        />
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Cancel</button>
                                        <button type="submit" className="btn btn-primary">Add Role</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Signature Modal ─────────────────────────────────────────── */}
                {showSignatureModal && selectedRole && (
                    <div className="modal-overlay">
                        <div className="modal" style={{ maxWidth: '800px' }}>
                            <div className="modal-header">
                                <h2>Add Signature for {selectedRole.roleName}</h2>
                            </div>
                            <div className="modal-body">
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <button onClick={() => setSignatureMethod('draw')}
                                        className={signatureMethod === 'draw' ? 'btn btn-primary' : 'btn btn-secondary'}
                                        style={{ flex: 1 }}>
                                        <FaPen style={{ display: 'inline', marginRight: '0.5rem' }} /> Draw
                                    </button>
                                    <button onClick={() => setSignatureMethod('upload')}
                                        className={signatureMethod === 'upload' ? 'btn btn-primary' : 'btn btn-secondary'}
                                        style={{ flex: 1 }}>
                                        <FaUpload style={{ display: 'inline', marginRight: '0.5rem' }} /> Upload
                                    </button>
                                </div>

                                {signatureMethod === 'draw' ? (
                                    <SignatureCanvas onSave={handleSignatureSave} />
                                ) : (
                                    <div style={{ border: '2px dashed #ddd', borderRadius: '8px', padding: '2rem', textAlign: 'center' }}>
                                        <FaUpload style={{ margin: '0 auto 1rem', fontSize: '3rem', color: '#999' }} />
                                        <p style={{ marginBottom: '1rem', color: '#666' }}>Upload signature image (PNG or JPG)</p>
                                        <input type="file" accept="image/png, image/jpeg"
                                            onChange={handleSignatureUpload}
                                            style={{ display: 'none' }} id="signature-upload" />
                                        <label htmlFor="signature-upload" className="btn btn-primary"
                                            style={{ cursor: 'pointer', display: 'inline-block' }}>
                                            Choose File
                                        </label>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button onClick={() => setShowSignatureModal(false)} className="btn btn-secondary">Close</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </UniversityLayout>
    );
};

export default RoleManagement;
