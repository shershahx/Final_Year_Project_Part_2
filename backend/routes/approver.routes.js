const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const signatureManagementService = require('../services/signatureManagement.service');
const approvalWorkflowService = require('../services/approvalWorkflow.service');

const JWT_SECRET = process.env.JWT_SECRET || 'hec-university-jwt-secret-key';

// Approver authentication middleware
// Accepts token from Authorization header OR ?token= query param (for PDF iframe)
const approverAuth = (req, res, next) => {
    try {
        let token = null;

        // Try Authorization header first
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
        // Fallback: query string (used for PDF viewing in iframe/embed)
        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.type !== 'approver') {
            return res.status(403).json({ success: false, message: 'Invalid token type' });
        }

        req.approver = decoded;
        next();
    } catch (error) {
        console.error('Approver auth error:', error.message);
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const result = await signatureManagementService.approverLogin(email, password);

        if (!result.success) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                type: 'approver',
                roleId: result.approver.roleId,
                roleName: result.approver.roleName,
                holderName: result.approver.holderName,
                holderEmail: result.approver.holderEmail,
                universityId: result.approver.universityId,
                universityName: result.approver.universityName
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            approver: result.approver
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ success: false, message: error.message || 'Invalid credentials' });
    }
});

// Get profile
router.get('/profile', approverAuth, async (req, res) => {
    try {
        const result = await signatureManagementService.getApproverProfile(
            req.approver.universityId,
            req.approver.roleId
        );
        res.json(result);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update password
router.put('/password', approverAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const result = await signatureManagementService.updateApproverPassword(
            req.approver.universityId,
            req.approver.roleId,
            currentPassword,
            newPassword
        );

        res.json(result);
    } catch (error) {
        console.error('Password update error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Save drawn signature
router.post('/signature/draw', approverAuth, async (req, res) => {
    try {
        const { signatureData } = req.body;

        if (!signatureData) {
            return res.status(400).json({ success: false, message: 'Signature data is required' });
        }

        const result = await signatureManagementService.saveSignature(
            req.approver.universityId,
            req.approver.roleId,
            signatureData,
            'drawn'
        );

        res.json(result);
    } catch (error) {
        console.error('Signature save error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Save signature placement position
router.post('/signature/position', approverAuth, async (req, res) => {
    try {
        const { signaturePosition } = req.body;

        if (!signaturePosition || signaturePosition.xPercent == null || signaturePosition.yPercent == null) {
            return res.status(400).json({ success: false, message: 'Signature position (xPercent, yPercent) is required' });
        }

        const result = await signatureManagementService.saveSignaturePosition(
            req.approver.universityId,
            req.approver.roleId,
            signaturePosition
        );

        res.json(result);
    } catch (error) {
        console.error('Signature position save error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get signature position
router.get('/signature/position', approverAuth, async (req, res) => {
    try {
        const result = await signatureManagementService.getSignaturePosition(
            req.approver.universityId,
            req.approver.roleId
        );
        res.json(result);
    } catch (error) {
        console.error('Get signature position error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get signature
router.get('/signature', approverAuth, async (req, res) => {
    try {
        const result = await signatureManagementService.getSignature(
            req.approver.universityId,
            req.approver.roleId
        );
        res.json(result);
    } catch (error) {
        console.error('Get signature error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get pending degrees
router.get('/degrees/pending', approverAuth, async (req, res) => {
    try {
        const result = await approvalWorkflowService.getPendingApprovalsForRole(
            req.approver.universityId,
            req.approver.roleId
        );
        res.json(result);
    } catch (error) {
        console.error('Pending degrees error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get approved degrees
router.get('/degrees/approved', approverAuth, async (req, res) => {
    try {
        const result = await approvalWorkflowService.getApprovedDegreesForRole(
            req.approver.universityId,
            req.approver.roleId
        );
        res.json(result);
    } catch (error) {
        console.error('Approved degrees error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Search degrees
router.get('/degrees/search', approverAuth, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({ success: false, message: 'Search query is required' });
        }

        const result = await approvalWorkflowService.searchDegreesForRole(
            req.approver.universityId,
            req.approver.roleId,
            q.trim()
        );
        res.json(result);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Approve degree step
router.post('/degrees/:degreeId/approve', approverAuth, async (req, res) => {
    try {
        const result = await approvalWorkflowService.approveStep(
            req.params.degreeId,
            req.approver.universityId,
            req.approver.roleId
        );
        res.json(result);
    } catch (error) {
        console.error('Approve error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Reject degree step
router.post('/degrees/:degreeId/reject', approverAuth, async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        }

        const result = await approvalWorkflowService.rejectStep(
            req.params.degreeId,
            req.approver.universityId,
            req.approver.roleId,
            reason.trim()
        );
        res.json(result);
    } catch (error) {
        console.error('Reject error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/approver/degrees/:degreeId
 * Get full degree details (for viewer panel)
 */
router.get('/degrees/:degreeId', approverAuth, async (req, res) => {
    try {
        const degree = await approvalWorkflowService.getDegreeDocument(req.params.degreeId);

        // Security: approver must belong to the same university as the degree
        if (degree.universityId !== req.approver.universityId) {
            return res.status(403).json({ success: false, message: 'Access denied: degree belongs to a different university' });
        }

        res.json({
            success: true,
            degree: {
                degreeId: degree.degreeId || degree._id,
                studentName: degree.studentName,
                studentRollNumber: degree.studentRollNumber,
                cnic: degree.cnic,
                fatherName: degree.fatherName,
                degreeProgram: degree.degreeProgram,
                department: degree.department,
                cgpa: degree.cgpa,
                session: degree.session,
                graduationDate: degree.graduationDate,
                universityName: degree.universityName,
                overallStatus: degree.overallStatus,
                currentApprovalStep: degree.currentApprovalStep,
                totalApprovalSteps: degree.totalApprovalSteps,
                approvalWorkflow: degree.approvalWorkflow,
                uploadedAt: degree.uploadedAt,
                hasPdf: !!(degree.currentPdfPath || degree.originalPdfPath)
            }
        });
    } catch (error) {
        console.error('Degree detail error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/approver/degrees/:degreeId/pdf
 * Stream degree PDF to authenticated approver (in-browser view)
 */
router.get('/degrees/:degreeId/pdf', approverAuth, async (req, res) => {
    try {
        const degree = await approvalWorkflowService.getDegreeDocument(req.params.degreeId);

        // Security: approver must belong to the same university as the degree
        if (degree.universityId !== req.approver.universityId) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const pdfPath = degree.currentPdfPath || degree.originalPdfPath;

        if (!pdfPath) {
            return res.status(404).json({ success: false, message: 'No PDF file found for this degree' });
        }

        // Resolve absolute path safely
        const absolutePath = path.isAbsolute(pdfPath)
            ? pdfPath
            : path.join(__dirname, '..', pdfPath);

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: 'PDF file not found on server' });
        }

        const stat = fs.statSync(absolutePath);
        const fileName = path.basename(absolutePath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stat.size);
        // inline = browser renders it; attachment = browser downloads it
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'private, no-cache');

        const fileStream = fs.createReadStream(absolutePath);
        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('Error streaming PDF:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Failed to stream PDF' });
            }
        });
    } catch (error) {
        console.error('PDF view error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
