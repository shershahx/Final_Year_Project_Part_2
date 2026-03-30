import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Public Pages
import HomePage from './pages/public/HomePage';
import AboutPage from './pages/public/AboutPage';
import ContactPage from './pages/public/ContactPage';

// Auth Pages
import HECLogin from './pages/auth/HECLogin';
import UniversityLogin from './pages/auth/UniversityLogin';
import UniversityRegister from './pages/auth/UniversityRegister';
import Login from './pages/auth/Login';
import ChangePassword from './pages/auth/ChangePassword';

// HEC Dashboard Pages
import HECDashboard from './pages/hec/Dashboard';
import HECEmployees from './pages/hec/Employees';
import HECProfile from './pages/hec/Profile';
import PendingUniversities from './pages/hec/PendingUniversities';
import AllUniversities from './pages/hec/AllUniversities';
import StudentSearch from './pages/hec/StudentSearch';

// University Dashboard Pages
import UniversityDashboard from './pages/university/Dashboard';
import UniversityProfile from './pages/university/Profile';
import Students from './pages/university/Students';
import DegreeUpload from './pages/university/DegreeUpload';
import UniversityVerifiedDegrees from './pages/university/VerifiedDegrees';
import RoleManagement from './pages/university/RoleManagement';
import TemplateManagement from './pages/university/TemplateManagement';
import AuthCallback from './pages/university/AuthCallback';
import CompleteProfile from './pages/university/CompleteProfile';
import PendingApproval from './pages/university/PendingApproval';

// Approver Pages
import ApproverDashboard from './pages/approver/ApproverDashboard';
import ApproverLogin from './pages/approver/ApproverLogin';
import ApproverProfile from './pages/approver/ApproverProfile';

// HEC Additional Pages
import VerifiedDegrees from './pages/hec/VerifiedDegrees';

// Public Verification Pages
import VerifyDegree from './pages/public/VerifyDegree';

// Context
import { AuthProvider } from './context/AuthContext';

// Protected Route Component
import ProtectedRoute from './components/ProtectedRoute';

function App() {
    return (
        <AuthProvider>
            <Router>
                <div className="app-container">
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/" element={<HomePage />} />
                        <Route path="/home" element={<HomePage />} />
                        <Route path="/about" element={<AboutPage />} />
                        <Route path="/contact" element={<ContactPage />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/change-password" element={<ChangePassword />} />
                        <Route path="/hec/login" element={<HECLogin />} />
                        <Route path="/university/login" element={<UniversityLogin />} />
                        <Route path="/university/register" element={<UniversityRegister />} />
                        <Route path="/university/auth-callback" element={<AuthCallback />} />
                        <Route path="/university/complete-profile" element={<CompleteProfile />} />
                        <Route path="/university/pending" element={<PendingApproval />} />

                        {/* HEC Protected Routes */}
                        <Route path="/hec/dashboard" element={
                            <ProtectedRoute userType="hecEmployee">
                                <HECDashboard />
                            </ProtectedRoute>
                        } />
                        <Route path="/hec/profile" element={
                            <ProtectedRoute userType="hecEmployee">
                                <HECProfile />
                            </ProtectedRoute>
                        } />
                        <Route path="/hec/employees" element={
                            <ProtectedRoute userType="hecEmployee">
                                <HECEmployees />
                            </ProtectedRoute>
                        } />
                        <Route path="/hec/universities/pending" element={
                            <ProtectedRoute userType="hecEmployee">
                                <PendingUniversities />
                            </ProtectedRoute>
                        } />
                        <Route path="/hec/universities" element={
                            <ProtectedRoute userType="hecEmployee">
                                <AllUniversities />
                            </ProtectedRoute>
                        } />
                        <Route path="/hec/students" element={
                            <ProtectedRoute userType="hecEmployee">
                                <StudentSearch />
                            </ProtectedRoute>
                        } />
                        <Route path="/hec/verified-degrees" element={
                            <ProtectedRoute userType="hecEmployee">
                                <VerifiedDegrees />
                            </ProtectedRoute>
                        } />

                        {/* University Protected Routes */}
                        <Route path="/university/dashboard" element={
                            <ProtectedRoute userType="university">
                                <UniversityDashboard />
                            </ProtectedRoute>
                        } />
                        <Route path="/university/profile" element={
                            <ProtectedRoute userType="university">
                                <UniversityProfile />
                            </ProtectedRoute>
                        } />
                        <Route path="/university/students" element={
                            <ProtectedRoute userType="university">
                                <Students />
                            </ProtectedRoute>
                        } />
                        <Route path="/university/degree-upload" element={
                            <ProtectedRoute userType="university">
                                <DegreeUpload />
                            </ProtectedRoute>
                        } />
                        <Route path="/university/verified-degrees" element={
                            <ProtectedRoute userType="university">
                                <UniversityVerifiedDegrees />
                            </ProtectedRoute>
                        } />
                        <Route path="/university/role-management" element={
                            <ProtectedRoute userType="university">
                                <RoleManagement />
                            </ProtectedRoute>
                        } />
                        <Route path="/university/templates" element={
                            <ProtectedRoute userType="university">
                                <TemplateManagement />
                            </ProtectedRoute>
                        } />

                        {/* Approver Routes */}
                        <Route path="/approver/login" element={<ApproverLogin />} />
                        <Route path="/approver/dashboard" element={<ApproverDashboard />} />
                        <Route path="/approver/profile" element={<ApproverProfile />} />

                        {/* Public Verification Routes */}
                        <Route path="/verify" element={<VerifyDegree />} />
                        <Route path="/verify/:transactionId" element={<VerifyDegree />} />

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    <ToastContainer 
                        position="top-right"
                        autoClose={3000}
                        hideProgressBar={false}
                        newestOnTop
                        closeOnClick
                        pauseOnFocusLoss
                        draggable
                        pauseOnHover
                    />
                </div>
            </Router>
        </AuthProvider>
    );
}

export default App;
