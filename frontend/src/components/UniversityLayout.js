import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiHome, FiUser, FiUsers, FiLogOut, FiChevronRight, FiMenu, FiX, FiUpload, FiSettings, FiFileText } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const UniversityLayout = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const menuItems = [
        { path: '/university/dashboard', icon: <FiHome />, label: 'Dashboard' },
        { path: '/university/profile', icon: <FiUser />, label: 'Profile' },
        { path: '/university/students', icon: <FiUsers />, label: 'Students' },
        { path: '/university/degree-upload', icon: <FiUpload />, label: 'Degree Upload' },
        { path: '/university/verified-degrees', icon: <FiFileText />, label: 'Verified Degrees' },
        { path: '/university/templates', icon: <FiFileText />, label: 'Degree Templates' },
        { path: '/university/role-management', icon: <FiSettings />, label: 'Approval Roles' }
    ];

    // Responsive styles
    const styles = {
        container: {
            minHeight: '100vh',
            background: '#f8fafc'
        },
        navbar: {
            background: 'linear-gradient(135deg, #1a5f2a 0%, #2d8a3e 50%, #155724 100%)',
            padding: '0.75rem 1rem',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 4px 20px rgba(26, 95, 42, 0.25)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        navbarBrand: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            textDecoration: 'none',
            color: 'white'
        },
        brandIcon: {
            fontSize: '1.75rem',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
        },
        brandText: {
            fontWeight: '700',
            fontSize: '1.1rem',
            letterSpacing: '-0.02em'
        },
        brandSubtext: {
            display: 'block',
            fontSize: '0.65rem',
            opacity: 0.8,
            fontWeight: '400',
            marginTop: '-2px'
        },
        mobileMenuBtn: {
            display: 'none',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            padding: '0.5rem',
            color: 'white',
            cursor: 'pointer'
        },
        navbarRight: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
        },
        userCard: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: 'rgba(255,255,255,0.1)',
            padding: '0.5rem 1rem',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)'
        },
        userAvatar: {
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        userName: {
            fontWeight: '600',
            fontSize: '0.875rem',
            color: 'white'
        },
        userRole: {
            fontSize: '0.65rem',
            opacity: 0.75,
            color: 'white'
        },
        logoutBtn: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'all 0.2s'
        },
        dashboardContainer: {
            display: 'flex',
            minHeight: 'calc(100vh - 60px)',
            position: 'relative'
        },
        overlay: {
            display: sidebarOpen ? 'block' : 'none',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 90
        },
        sidebar: {
            width: '280px',
            minWidth: '280px',
            background: 'white',
            borderRight: '1px solid #e2e8f0',
            padding: '1.5rem 0.75rem',
            boxShadow: '4px 0 20px rgba(0,0,0,0.03)',
            position: 'relative',
            transition: 'transform 0.3s ease',
            zIndex: 95,
            display: 'flex',
            flexDirection: 'column'
        },
        sidebarMenuLabel: {
            padding: '0 0.75rem',
            marginBottom: '1.5rem'
        },
        sidebarLabelText: {
            fontSize: '0.65rem',
            fontWeight: '600',
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
        },
        sidebarMenu: {
            listStyle: 'none',
            padding: 0,
            margin: 0,
            flex: 1
        },
        menuItem: {
            marginBottom: '0.375rem'
        },
        sidebarFooter: {
            marginTop: 'auto',
            padding: '1rem 0.5rem 0',
            borderTop: '1px solid #f1f5f9'
        },
        blockchainCard: {
            background: 'linear-gradient(135deg, #1a5f2a, #2d8a3e)',
            padding: '1rem',
            borderRadius: '14px',
            color: 'white'
        },
        blockchainHeader: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem'
        },
        blockchainTitle: {
            fontSize: '0.75rem',
            fontWeight: '600'
        },
        blockchainText: {
            fontSize: '0.65rem',
            opacity: 0.8,
            lineHeight: 1.4
        },
        mainContent: {
            flex: 1,
            padding: '1.5rem',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            minHeight: 'calc(100vh - 60px)',
            overflowY: 'auto',
            overflowX: 'hidden'
        }
    };

    // Media query styles (applied via CSS classes in index.css, but also inline for completeness)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const isTablet = typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024;

    return (
        <div style={styles.container}>
            {/* Responsive CSS */}
            <style>{`
                @media (max-width: 1024px) {
                    .uni-navbar-user-info { display: none !important; }
                    .uni-logout-text { display: none !important; }
                    .uni-brand-subtext { display: none !important; }
                }
                @media (max-width: 768px) {
                    .uni-mobile-menu-btn { display: flex !important; }
                    .uni-sidebar { 
                        position: fixed !important; 
                        top: 0 !important;
                        left: 0 !important;
                        height: 100vh !important;
                        transform: translateX(-100%) !important;
                        z-index: 95 !important;
                    }
                    .uni-sidebar.open { transform: translateX(0) !important; }
                    .uni-main-content { padding: 1rem !important; }
                    .uni-navbar { padding: 0.75rem 1rem !important; }
                }
                @media (max-width: 480px) {
                    .uni-brand-text { font-size: 0.95rem !important; }
                    .uni-brand-icon { font-size: 1.5rem !important; }
                    .uni-main-content { padding: 0.75rem !important; }
                }
            `}</style>

            {/* Navbar */}
            <nav className="uni-navbar" style={styles.navbar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Mobile Menu Button */}
                    <button 
                        className="uni-mobile-menu-btn"
                        style={styles.mobileMenuBtn}
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
                    </button>
                    
                    <Link to="/university/dashboard" style={styles.navbarBrand}>
                        <Logo size={40} showText={true} textColor="white" />
                    </Link>
                </div>
                
                <div style={styles.navbarRight}>
                    <div className="uni-navbar-user-info" style={styles.userCard}>
                        <div style={styles.userAvatar}>
                            <FiUser style={{ color: 'white' }} />
                        </div>
                        <div>
                            <div style={styles.userName}>{user?.name || 'University'}</div>
                            <div style={styles.userRole}>Administrator</div>
                        </div>
                    </div>
                    <button onClick={handleLogout} style={styles.logoutBtn}>
                        <FiLogOut size={16} />
                        <span className="uni-logout-text">Logout</span>
                    </button>
                </div>
            </nav>

            {/* Mobile Overlay */}
            <div 
                style={styles.overlay} 
                onClick={() => setSidebarOpen(false)}
            />

            {/* Dashboard Layout */}
            <div style={styles.dashboardContainer}>
                {/* Sidebar */}
                <aside 
                    className={`uni-sidebar ${sidebarOpen ? 'open' : ''}`}
                    style={styles.sidebar}
                >
                    <div style={styles.sidebarMenuLabel}>
                        <p style={styles.sidebarLabelText}>Main Menu</p>
                    </div>
                    <ul style={styles.sidebarMenu}>
                        {menuItems.map((item) => {
                            const isActive = location.pathname === item.path;
                            return (
                                <li key={item.path} style={styles.menuItem}>
                                    <Link 
                                        to={item.path}
                                        onClick={() => setSidebarOpen(false)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.875rem',
                                            padding: '0.875rem 1rem',
                                            borderRadius: '12px',
                                            textDecoration: 'none',
                                            fontWeight: isActive ? '600' : '500',
                                            fontSize: '0.9375rem',
                                            color: isActive ? '#1a5f2a' : '#64748b',
                                            background: isActive ? 'linear-gradient(135deg, #e8f5e9, rgba(26, 95, 42, 0.08))' : 'transparent',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            position: 'relative'
                                        }}
                                    >
                                        {isActive && (
                                            <div style={{
                                                position: 'absolute',
                                                left: 0,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '3px',
                                                height: '60%',
                                                background: 'linear-gradient(180deg, #1a5f2a, #2d8a3e)',
                                                borderRadius: '0 4px 4px 0'
                                            }} />
                                        )}
                                        <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                                        <span style={{ flex: 1 }}>{item.label}</span>
                                        {isActive && <FiChevronRight size={16} style={{ opacity: 0.5 }} />}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                    
                    {/* Sidebar Footer */}
                    <div style={styles.sidebarFooter}>
                        <div style={styles.blockchainCard}>
                            <div style={styles.blockchainHeader}>
                                <span>⛓️</span>
                                <span style={styles.blockchainTitle}>Blockchain Network</span>
                            </div>
                            <p style={styles.blockchainText}>Connected to HEC Network</p>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="uni-main-content" style={styles.mainContent}>
                    {children}
                </main>
            </div>
        </div>
    );
};

export default UniversityLayout;
