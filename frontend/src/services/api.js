import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Log the API URL being used
console.log('API Configuration:', {
    API_URL,
    environment: process.env.NODE_ENV
});

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true,
    timeout: 30000 // 30 seconds timeout
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Network error handling
        if (!error.response) {
            console.error('Network Error:', error.message);
            console.error('API URL:', API_URL);
            // This is a network error (no response from server)
            if (error.code === 'ECONNABORTED') {
                console.error('Request timeout');
            } else if (error.code === 'ERR_NETWORK') {
                console.error('Network connection failed. Please check if backend is running on', API_URL);
            }
            return Promise.reject(error);
        }
        
        if (error.response?.status === 401) {
            // Only redirect if user was previously logged in (has token)
            // Don't redirect for login/verify failures
            const isAuthEndpoint = error.config?.url?.includes('/auth/');
            if (!isAuthEndpoint && localStorage.getItem('token')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/';
            }
        }
        return Promise.reject(error);
    }
);

export default api;

// Auth API calls
export const authAPI = {
    hecLogin: (credentials) => api.post('/auth/hec/login', credentials),
    universityLogin: (credentials) => api.post('/auth/university/login', credentials),
    universityRegister: (data) => api.post('/auth/university/register', data),
    unifiedLogin: (credentials) => api.post('/auth/login', credentials),
    changePassword: (data) => api.post('/auth/change-password', data),
    checkStatus: (email) => api.get(`/auth/university/status/${email}`),
    getProfile: () => api.get('/auth/profile'),
    verifyToken: () => api.get('/auth/verify')
};

// HEC API calls
export const hecAPI = {
    getDashboardStats: () => api.get('/hec/dashboard/stats'),
    // Get ALL students from ALL universities
    getAllStudents: (params) => api.get('/hec/all-students', { params }),
    // Employees
    getEmployees: () => api.get('/hec/employees'),
    addEmployee: (data) => api.post('/hec/employees', data),
    updateEmployee: (id, data) => api.put(`/hec/employees/${id}`, data),
    deleteEmployee: (id) => api.delete(`/hec/employees/${id}`),
    // Universities
    getAllUniversities: () => api.get('/hec/universities'),
    getPendingUniversities: () => api.get('/hec/universities/pending'),
    getUniversity: (id) => api.get(`/hec/universities/${id}`),
    approveUniversity: (id) => api.post(`/hec/universities/${id}/approve`),
    rejectUniversity: (id, reason) => api.post(`/hec/universities/${id}/reject`, { reason }),
    updateUniversityStatus: (id, status) => api.put(`/hec/universities/${id}/status`, { status }),
    revokeUniversity: (id, reason) => api.post(`/hec/universities/${id}/revoke`, { reason }),
    // Students from specific university
    getUniversityStudents: (universityCode, params) => api.get(`/hec/universities/${universityCode}/students`, { params }),
    getUniversityStudentStats: (universityCode) => api.get(`/hec/universities/${universityCode}/student-stats`),
    // Student search
    searchStudents: (params) => api.get('/hec/students/search', { params })
};

// University API calls
export const universityAPI = {
    getDashboard: () => api.get('/university/dashboard'),
    getProfile: () => api.get('/university/profile'),
    updateProfile: (data) => api.put('/university/profile', data),
    // Students - Legacy
    getStudents: (params) => api.get('/university/students', { params }),
    addStudent: (data) => api.post('/university/students', data),
    // Student Database - File Upload & Import
    uploadStudentFile: (formData) => api.post('/university/students/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // 60s for file uploads
    }),
    directUploadStudents: (formData) => api.post('/university/students/direct-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000 // 120s for direct upload
    }),
    importStudents: (data) => api.post('/university/students/import', data),
    getStudentById: (id) => api.get(`/university/students/${id}`),
    updateStudent: (id, data) => api.put(`/university/students/${id}`, data),
    deleteStudent: (id) => api.delete(`/university/students/${id}`),
    getImportHistory: () => api.get('/university/imports/history'),
    // Degrees
    getDegrees: () => api.get('/university/degrees'),
    issueDegree: (data) => api.post('/university/degrees', data),
    // Reports
    getReports: () => api.get('/university/reports')
};

// Degree Verification API calls
export const degreeAPI = {
    // University endpoints
    uploadDegree: (formData) => api.post('/degrees/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000 // 2 minutes for upload and processing
    }),
    getUniversityDegrees: (params) => api.get('/degrees/university', { params }),
    getEligibleStudents: () => api.get('/degrees/eligible-students'),
    
    // Batch upload endpoints
    batchUpload: (formData, onProgress) => api.post('/degrees/batch-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 minutes for batch processing
        onUploadProgress: onProgress
    }),
    batchUploadForApproval: (formData, onProgress) => api.post('/degrees/batch-upload-for-approval', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
        onUploadProgress: onProgress
    }),

    // Workflow degree listing & download
    getWorkflowDegrees: (params) => api.get('/degrees/workflow/list', { params }),
    downloadVerifiedDegree: (degreeId) => api.get(`/degrees/workflow/${degreeId}/download`, {
        responseType: 'blob',
        timeout: 120000
    }),
    retryVerification: (degreeId) => api.post(`/degrees/workflow/${degreeId}/retry-verification`),
    batchVerify: (rollNumbers) => api.post('/degrees/batch-verify', { rollNumbers }, {
        timeout: 600000 // 10 minutes for batch processing
    }),
    
    // HEC endpoints
    getAllVerifiedDegrees: (params) => api.get('/degrees/all', { params }),
    getPendingHECVerifications: () => api.get('/degrees/hec/pending'),
    verifyDegreeByHEC: (degreeId) => api.post(`/degrees/hec/${degreeId}/verify`),
    rejectDegreeByHEC: (degreeId, reason) => api.post(`/degrees/hec/${degreeId}/reject`, { rejectionReason: reason }),
    getVerificationStats: () => api.get('/degrees/stats'),
    
    // Public verification endpoints
    verifyByTransactionId: (transactionId) => api.get(`/degrees/verify/${transactionId}`),
    verifyByHash: (hash) => api.get(`/degrees/verify-hash/${hash}`),
    verifyByQRCode: (qrData) => api.post('/degrees/verify-qr', { qrData }),
    downloadDegree: (transactionId) => api.get(`/degrees/download/${transactionId}`, {
        responseType: 'blob',
        timeout: 120000
    })
};

// HEC Student Search API calls
export const hecStudentAPI = {
    searchStudents: (params) => api.get('/hec/students/search', { params }),
    searchByCNIC: (cnic) => api.get(`/hec/students/cnic/${cnic}`),
    verifyStudent: (data) => api.post('/hec/students/verify', data),
    getUniversityStudents: (universityCode, params) => api.get(`/hec/universities/${universityCode}/students`, { params }),
    getUniversityStudentStats: (universityCode) => api.get(`/hec/universities/${universityCode}/student-stats`)
};

// Approval Workflow API calls
export const approvalAPI = {
    // Role Management
    addRole: (data) => api.post('/approval/roles', data),
    getRoles: () => api.get('/approval/roles'),
    updateRole: (roleId, data) => api.put(`/approval/roles/${roleId}`, data),
    deleteRole: (roleId) => api.delete(`/approval/roles/${roleId}`),
    reorderRoles: (roleOrders) => api.put('/approval/roles/reorder', { roleOrders }),
    
    // Signature Management
    saveDrawnSignature: (roleId, signature) => api.post(`/approval/roles/${roleId}/signature/draw`, { signature }),
    uploadSignature: (roleId, formData) => api.post(`/approval/roles/${roleId}/signature/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    
    // Approval Workflow
    getPendingApprovals: () => api.get('/approval/pending'),
    approveDegree: (degreeId) => api.post(`/approval/${degreeId}/approve`),
    rejectDegree: (degreeId, reason) => api.post(`/approval/${degreeId}/reject`, { reason }),
    getApprovedDegrees: () => api.get('/approval/approved'),
    submitToBlockchain: (degreeId) => api.post(`/approval/${degreeId}/submit-blockchain`),
    
    // Degree Upload with Workflow
    uploadWithWorkflow: (formData) => api.post('/degrees/upload-with-workflow', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000 // 2 minutes
    })
};

// Network API calls - Real-time Hyperledger Fabric network status
export const networkAPI = {
    getStatus: () => api.get('/network/status'),
    getComponentHealth: (component) => api.get(`/network/health/${component}`)
};

// Degree Template API calls
export const templateAPI = {
    uploadTemplate: (formData) => api.post('/templates/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
    }),
    getTemplates: () => api.get('/templates'),
    getActiveTemplate: () => api.get('/templates/active'),
    deleteTemplate: (templateId) => api.delete(`/templates/${templateId}`),
    toggleTemplate: (templateId, isActive) => api.put(`/templates/${templateId}/toggle`, { isActive })
};