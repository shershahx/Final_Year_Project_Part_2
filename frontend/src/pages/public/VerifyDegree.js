import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { 
    FiCheckCircle, 
    FiXCircle, 
    FiSearch, 
    FiShield,
    FiUser,
    FiBook,
    FiCalendar,
    FiHash,
    FiDownload,
    FiExternalLink,
    FiLoader,
    FiCamera,
    FiLogIn,
    FiUserPlus,
    FiMenu,
    FiX
} from 'react-icons/fi';
import { degreeAPI } from '../../services/api';
import Logo from '../../components/Logo';

const Navbar = () => {
    const [menuOpen, setMenuOpen] = React.useState(false);
    
    return (
        <nav style={{ 
            background: 'rgba(13, 51, 23, 0.98)', 
            backdropFilter: 'blur(20px)',
            padding: '1rem 2rem',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            boxShadow: '0 4px 30px rgba(0,0,0,0.15)'
        }}>
            <div style={{ 
                maxWidth: '1280px', 
                margin: '0 auto', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center' 
            }}>
                <Link to="/" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.75rem', 
                    textDecoration: 'none',
                    color: 'white'
                }}>
                    <Logo size={45} showText={true} textColor="white" />
                </Link>
                
                {/* Mobile Menu Button */}
                <button 
                    onClick={() => setMenuOpen(!menuOpen)}
                    style={{ 
                        display: 'none',
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '0.5rem'
                    }}
                    className="mobile-menu-btn"
                >
                    {menuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
                </button>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }} className="nav-links">
                    <div style={{ display: 'flex', gap: '2rem' }}>
                        {[
                            { to: '/', label: 'Home' },
                            { to: '/verify', label: 'Verify Degree', active: true },
                            { to: '/about', label: 'About' },
                            { to: '/contact', label: 'Contact' }
                        ].map((link, i) => (
                            <Link key={i} to={link.to} style={{ 
                                color: link.active ? 'white' : 'rgba(255,255,255,0.8)', 
                                textDecoration: 'none', 
                                fontWeight: '600', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.375rem',
                                fontSize: '0.9375rem',
                                padding: '0.5rem 0',
                                borderBottom: link.active ? '2px solid #4ade80' : '2px solid transparent',
                                transition: 'all 0.2s'
                            }}>
                                {link.label}
                            </Link>
                        ))}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <Link to="/login" style={{ 
                            padding: '0.625rem 1.5rem', 
                            background: 'linear-gradient(135deg, #1a5f2a, #2d8a3e)', 
                            border: '2px solid #1a5f2a',
                            color: 'white', 
                            borderRadius: '10px',
                            textDecoration: 'none',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.9375rem',
                            boxShadow: '0 4px 15px rgba(26, 95, 42, 0.3)'
                        }}>
                            <FiLogIn size={18} /> Login
                        </Link>
                        <Link to="/university/register" style={{ 
                            padding: '0.625rem 1.5rem', 
                            background: 'linear-gradient(135deg, #1a5f2a, #2d8a3e)', 
                            color: 'white', 
                            borderRadius: '10px',
                            textDecoration: 'none',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.9375rem',
                            boxShadow: '0 4px 15px rgba(26, 95, 42, 0.3)'
                        }}>
                            <FiUserPlus size={18} /> Register
                        </Link>
                    </div>
                </div>
            </div>
            
            <style>{`
                @media (max-width: 768px) {
                    .mobile-menu-btn { display: block !important; }
                    .nav-links { 
                        display: ${menuOpen ? 'flex' : 'none'} !important;
                        flex-direction: column;
                        position: absolute;
                        top: 100%;
                        left: 0;
                        right: 0;
                        background: rgba(13, 51, 23, 0.98);
                        padding: 1rem 2rem 2rem;
                        gap: 1.5rem;
                    }
                }
            `}</style>
        </nav>
    );
};

const VerifyDegree = () => {
    const { transactionId } = useParams();
    const [searchParams] = useSearchParams();
    
    const [verificationResult, setVerificationResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchInput, setSearchInput] = useState('');
    const [searchType, setSearchType] = useState('transaction');
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (transactionId) {
            verifyByTransaction(transactionId);
        }
        
        const hashParam = searchParams.get('hash');
        if (hashParam) {
            verifyByHash(hashParam);
        }
    }, [transactionId, searchParams]);

    const handleQRCodeUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setLoading(true);
            setError(null);
            
            // Use jsQR library to decode QR code from image
            const image = new Image();
            image.src = URL.createObjectURL(file);
            
            image.onload = async () => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = image.width;
                canvas.height = image.height;
                context.drawImage(image, 0, 0);
                
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                
                // Try to decode with a simple approach - look for JSON data
                try {
                    // For now, let user paste the data manually
                    const qrData = prompt('Please paste the QR code data (Transaction ID or Hash):');
                    if (qrData) {
                        try {
                            const parsedData = JSON.parse(qrData);
                            if (parsedData.transactionId) {
                                await verifyByTransaction(parsedData.transactionId);
                            } else if (parsedData.degreeHash) {
                                await verifyByHash(parsedData.degreeHash);
                            }
                        } catch {
                            // If not JSON, treat as direct transaction ID or hash
                            if (qrData.startsWith('TXN_')) {
                                await verifyByTransaction(qrData);
                            } else {
                                await verifyByHash(qrData);
                            }
                        }
                    }
                } catch (err) {
                    setError('Could not read QR code. Please try entering the transaction ID manually.');
                }
                setLoading(false);
            };
        } catch (err) {
            setError('Failed to process QR code image');
            setLoading(false);
        }
    };

    const verifyByTransaction = async (txId) => {
        try {
            setLoading(true);
            setError(null);
            setVerificationResult(null);
            
            const response = await degreeAPI.verifyByTransactionId(txId);
            
            if (response.data.success && response.data.verified) {
                setVerificationResult({
                    verified: true,
                    degree: response.data.degree
                });
            } else {
                setVerificationResult({ verified: false });
            }
        } catch (err) {
            console.error('Verification error:', err);
            if (err.response?.status === 404) {
                setVerificationResult({ verified: false });
            } else {
                setError('Verification service temporarily unavailable');
            }
        } finally {
            setLoading(false);
        }
    };

    const verifyByHash = async (hash) => {
        try {
            setLoading(true);
            setError(null);
            setVerificationResult(null);
            
            const response = await degreeAPI.verifyByHash(hash);
            
            if (response.data.success && response.data.verified) {
                setVerificationResult({
                    verified: true,
                    degree: response.data.degree
                });
            } else {
                setVerificationResult({ verified: false });
            }
        } catch (err) {
            console.error('Verification error:', err);
            if (err.response?.status === 404) {
                setVerificationResult({ verified: false });
            } else {
                setError('Verification service temporarily unavailable');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (transactionId) => {
        try {
            setDownloading(true);
            // Use native fetch cleanly resolving to proxy avoiding CORS Network Errors with Binary blob drops
            const response = await fetch(`/api/degrees/verify/${transactionId}/download`);

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
            link.download = `verified_${transactionId}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => window.URL.revokeObjectURL(url), 10000);
        } catch (err) {
            console.error('Download error:', err);
            setError(err.message || 'Failed to download degree');
        } finally {
            setDownloading(false);
        }
    };

    const handleSearch = () => {
        if (!searchInput.trim()) {
            setError('Please enter a transaction ID or degree hash');
            return;
        }

        if (searchType === 'transaction') {
            verifyByTransaction(searchInput.trim());
        } else {
            verifyByHash(searchInput.trim());
        }
    };

    return (
        <div className="verify-page" style={{ paddingTop: '80px' }}>
            <Navbar />
            
            {/* Header */}
            <header className="verify-header">
                <div className="header-content">
                    <FiShield className="header-icon" />
                    <div>
                        <h1>HEC Degree Verification</h1>
                        <p>Higher Education Commission of Pakistan</p>
                    </div>
                </div>
            </header>

            <main className="verify-main">
                {/* Search Section */}
                {!transactionId && (
                    <div className="search-card">
                        <h2>Verify a Degree</h2>
                        <p>
                            Enter the transaction ID or degree hash from the QR code, or scan the QR code on the degree certificate
                        </p>

                        {/* QR Scanner Option */}
                        <div style={{ 
                            marginBottom: '1.5rem', 
                            textAlign: 'center',
                            padding: '1.5rem',
                            background: '#f0fdf4',
                            borderRadius: '12px',
                            border: '2px dashed #86efac'
                        }}>
                            <FiCamera style={{ fontSize: '2.5rem', color: '#16a34a', marginBottom: '0.5rem' }} />
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#15803d', marginBottom: '0.5rem' }}>
                                Scan QR Code
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: '#166534', marginBottom: '1rem' }}>
                                Upload or scan the QR code from the degree certificate
                            </p>
                            <label style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                                color: 'white',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                            }}>
                                <FiCamera /> Upload QR Code Image
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleQRCodeUpload}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>

                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '1rem', 
                            marginBottom: '1.5rem' 
                        }}>
                            <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                            <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '500' }}>
                                OR ENTER MANUALLY
                            </span>
                            <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                        </div>

                        {/* Search Type Toggle */}
                        <div className="search-toggle">
                            <button
                                onClick={() => setSearchType('transaction')}
                                className={searchType === 'transaction' ? 'active' : ''}
                            >
                                Transaction ID
                            </button>
                            <button
                                onClick={() => setSearchType('hash')}
                                className={searchType === 'hash' ? 'active' : ''}
                            >
                                Degree Hash
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="search-input-group">
                            <div className="search-input">
                                <FiSearch />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder={
                                        searchType === 'transaction'
                                            ? 'Enter transaction ID (e.g., TXN_1234567890_abc123)'
                                            : 'Enter degree hash (SHA-256)'
                                    }
                                />
                            </div>
                            <button
                                onClick={handleSearch}
                                disabled={loading}
                                className="search-btn"
                            >
                                {loading ? (
                                    <FiLoader className="spinner" />
                                ) : (
                                    <>
                                        <FiSearch /> Verify
                                    </>
                                )}
                            </button>
                        </div>

                        {/* QR Scanner Hint */}
                        <div className="qr-hint">
                            <FiCamera />
                            <div>
                                <p className="hint-title">Scan QR Code</p>
                                <p>
                                    Use your phone's camera to scan the QR code on the degree certificate.
                                    It will automatically open this verification page.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="loading-card">
                        <div className="spinner-large"></div>
                        <p>Verifying degree on blockchain...</p>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="error-card">
                        <FiXCircle />
                        <p>{error}</p>
                        <button onClick={() => setError(null)}>Try Again</button>
                    </div>
                )}

                {/* Verification Result */}
                {verificationResult && !loading && (
                    <div>
                        {verificationResult.verified ? (
                            <>
                                {/* Success Banner */}
                                <div className="result-success">
                                    <div className="result-icon">
                                        <FiCheckCircle />
                                    </div>
                                    <h2>Degree Verified</h2>
                                    <p>This degree has been verified by the Higher Education Commission of Pakistan</p>
                                </div>

                                {/* Degree Details */}
                                <div className="degree-details-card">
                                    {/* Student Info */}
                                    <div className="details-section">
                                        <h3><FiUser /> Student Information</h3>
                                        <div className="details-grid">
                                            <div className="detail-item">
                                                <label>Full Name</label>
                                                <span>{verificationResult.degree.studentName}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Roll Number</label>
                                                <span>{verificationResult.degree.rollNumber}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Academic Info */}
                                    <div className="details-section alt">
                                        <h3><FiBook /> Academic Information</h3>
                                        <div className="details-grid">
                                            <div className="detail-item">
                                                <label>University</label>
                                                <span>{verificationResult.degree.universityName}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Degree Program</label>
                                                <span>{verificationResult.degree.degreeTitle}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Department</label>
                                                <span>{verificationResult.degree.department}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>CGPA</label>
                                                <span className="cgpa-value">{verificationResult.degree.cgpa}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Verification Info */}
                                    <div className="details-section">
                                        <h3><FiShield /> Verification Details</h3>
                                        <div className="verification-details">
                                            <div className="verification-row">
                                                <FiCalendar />
                                                <label>Verified On:</label>
                                                <span>{new Date(verificationResult.degree.verifiedAt).toLocaleString()}</span>
                                            </div>
                                            {verificationResult.degree.graduationDate && (
                                                <div className="verification-row">
                                                    <FiCalendar />
                                                    <label>Graduation:</label>
                                                    <span>{new Date(verificationResult.degree.graduationDate).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                            {verificationResult.degree.transactionId && (
                                                <div className="verification-row">
                                                    <FiHash />
                                                    <label>Transaction:</label>
                                                    <code>{verificationResult.degree.transactionId}</code>
                                                </div>
                                            )}
                                            {verificationResult.degree.degreeHash && (
                                                <div className="verification-row">
                                                    <FiHash />
                                                    <label>Degree Hash:</label>
                                                    <code>{verificationResult.degree.degreeHash}</code>
                                                </div>
                                            )}
                                            
                                        </div>
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', padding: '0 1.5rem 1.5rem' }}>
                                        <button 
                                            onClick={() => handleDownload(verificationResult.degree.transactionId)}
                                            style={{
                                                padding: '0.75rem 1.5rem',
                                                background: 'linear-gradient(135deg, #1a5f2a, #2d8a3e)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                            disabled={downloading}
                                        >
                                            {downloading ? <FiLoader className="spinner" /> : <FiDownload />}
                                            {downloading ? 'Downloading...' : 'Download Verified Degree'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* Not Verified */
                            <div className="result-error">
                                <div className="result-icon">
                                    <FiXCircle />
                                </div>
                                <h2>Degree Not Verified</h2>
                                <p>
                                    This degree could not be found in the HEC blockchain ledger. 
                                    The degree may not have been verified or the verification details may be incorrect.
                                </p>
                                <button
                                    onClick={() => {
                                        setVerificationResult(null);
                                        setSearchInput('');
                                    }}
                                    className="btn-retry"
                                >
                                    Try Another Search
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Info Section */}
                {!verificationResult && !loading && !transactionId && (
                    <div className="info-cards">
                        <div className="info-card">
                            <div className="info-icon green">
                                <FiShield />
                            </div>
                            <h3>Blockchain Verified</h3>
                            <p>All degrees are stored on an immutable blockchain ledger</p>
                        </div>
                        <div className="info-card">
                            <div className="info-icon blue">
                                <FiHash />
                            </div>
                            <h3>Unique Hash</h3>
                            <p>Each degree has a unique cryptographic hash for authenticity</p>
                        </div>
                        <div className="info-card">
                            <div className="info-icon purple">
                                <FiExternalLink />
                            </div>
                            <h3>IPFS Storage</h3>
                            <p>Degree PDFs are stored on decentralized IPFS network</p>
                        </div>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="verify-footer">
                <p>© {new Date().getFullYear()} Higher Education Commission of Pakistan</p>
                <p>Blockchain-based Degree Verification System</p>
            </footer>
        </div>
    );
};

export default VerifyDegree;
