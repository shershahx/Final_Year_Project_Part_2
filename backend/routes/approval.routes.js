const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');

// Middleware
const { authMiddleware } = require('../middleware/auth.middleware');

// Services
const signatureManagementService = require('../services/signatureManagement.service');
const approvalWorkflowService = require('../services/approvalWorkflow.service');
const pdfSignatureService = require('../services/pdfSignature.service');
const degreeTemplateService = require('../services/degreeTemplate.service');
const { findUniversityByEmail } = require('../config/couchdb');

// Multer configuration for signature upload
const signatureStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/signatures'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'signature-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadSignature = multer({
    storage: signatureStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only PNG and JPEG images are allowed for signatures'));
        }
    }
});

// ============= ROLE MANAGEMENT ENDPOINTS =============

/**
 * @route   POST /api/approval/roles
 * @desc    Add new approval role
 * @access  University Only
 */
router.post('/roles', authMiddleware, [
    body('roleName').notEmpty().withMessage('Role name is required'),
    body('holderName').notEmpty().withMessage('Holder name is required'),
    body('holderEmail').isEmail().withMessage('Valid email is required'),
    body('approvalOrder').optional().isInt().withMessage('Approval order must be a number')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        // Ensure user is university
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const roleData = req.body;

        // ── Template-based role validation ──────────────────────────────────
        // Get the active degree template for this university
        let activeTemplate = null;
        try {
            activeTemplate = await degreeTemplateService.getActiveTemplate(universityId);
        } catch (e) {
            console.warn('Could not fetch template for role validation:', e.message);
        }

        if (!activeTemplate) {
            return res.status(400).json({
                success: false,
                message: 'No degree template found. Please upload a degree template first before adding approval roles. The template determines which roles are required.'
            });
        }

        const requiredRoles = activeTemplate.profile?.requiredSignatureRoles || [];

        if (requiredRoles.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No signature roles were detected on your degree template. Please ensure your template PDF includes signature labels such as "Vice Chancellor" or "Registrar", then re-upload the template.'
            });
        }

        // Normalize and check that the requested role is in the template's required roles
        const normalizedRequested = roleData.roleName.trim().toLowerCase();
        const normalizedRequired = requiredRoles.map(r => r.trim().toLowerCase());

        const isAllowed = normalizedRequired.some(r => {
            // Allow partial matches: e.g. "Controller" matches "Controller of Examinations"
            return normalizedRequested === r || r.startsWith(normalizedRequested) || normalizedRequested.startsWith(r);
        });

        if (!isAllowed) {
            return res.status(400).json({
                success: false,
                message: `The role "${roleData.roleName}" is not required by your degree template. Your template only requires: ${requiredRoles.join(', ')}. You can only add roles that appear on your degree template.`
            });
        }
        // ────────────────────────────────────────────────────────────────────

        const result = await signatureManagementService.addApprovalRole(universityId, roleData);

        res.json(result);
    } catch (error) {
        console.error('Error adding approval role:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   GET /api/approval/roles
 * @desc    Get all approval roles
 * @access  University Only
 */
router.get('/roles', authMiddleware, async (req, res) => {
    try {
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const result = await signatureManagementService.getApprovalRoles(universityId);

        res.json(result);
    } catch (error) {
        console.error('Error getting approval roles:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   PUT /api/approval/roles/:roleId
 * @desc    Update approval role
 * @access  University Only
 */
router.put('/roles/:roleId', authMiddleware, async (req, res) => {
    try {
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const { roleId } = req.params;
        const updateData = req.body;

        const result = await signatureManagementService.updateApprovalRole(universityId, roleId, updateData);

        res.json(result);
    } catch (error) {
        console.error('Error updating approval role:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   DELETE /api/approval/roles/:roleId
 * @desc    Delete approval role
 * @access  University Only
 */
router.delete('/roles/:roleId', authMiddleware, async (req, res) => {
    try {
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const { roleId } = req.params;

        const result = await signatureManagementService.deleteApprovalRole(universityId, roleId);

        res.json(result);
    } catch (error) {
        console.error('Error deleting approval role:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   POST /api/approval/roles/:roleId/reset-password
 * @desc    Reset approver password and return new temp password to university admin
 * @access  University Only
 */
router.post('/roles/:roleId/reset-password', authMiddleware, async (req, res) => {
    try {
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const { roleId } = req.params;

        const result = await signatureManagementService.resetApproverPassword(universityId, roleId);
        res.json(result);
    } catch (error) {
        console.error('Error resetting approver password:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   POST /api/approval/roles/:roleId/signature/draw
 * @desc    Save drawn signature
 * @access  University Only
 */
router.post('/roles/:roleId/signature/draw', authMiddleware, [
    body('signatureData').notEmpty().withMessage('Signature data is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const { roleId } = req.params;
        const { signatureData } = req.body;

        const result = await signatureManagementService.updateRoleSignature(
            universityId,
            roleId,
            signatureData,
            'drawn'
        );

        res.json(result);
    } catch (error) {
        console.error('Error saving drawn signature:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   POST /api/approval/roles/:roleId/signature/upload
 * @desc    Upload signature image
 * @access  University Only
 */
router.post('/roles/:roleId/signature/upload', authMiddleware, uploadSignature.single('signature'), async (req, res) => {
    try {
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No signature file uploaded' });
        }

        const universityId = req.user.id;
        const { roleId } = req.params;

        // Read file and convert to base64
        const fs = require('fs');
        const signatureBuffer = fs.readFileSync(req.file.path);
        const signatureBase64 = `data:${req.file.mimetype};base64,${signatureBuffer.toString('base64')}`;

        const result = await signatureManagementService.updateRoleSignature(
            universityId,
            roleId,
            signatureBase64,
            'uploaded'
        );

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        res.json(result);
    } catch (error) {
        console.error('Error uploading signature:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   POST /api/approval/roles/reorder
 * @desc    Reorder approval roles
 * @access  University Only
 */
router.post('/roles/reorder', authMiddleware, async (req, res) => {
    try {
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const { roleOrders } = req.body; // Array of {roleId, approvalOrder}

        const result = await signatureManagementService.reorderApprovalRoles(universityId, roleOrders);

        res.json(result);
    } catch (error) {
        console.error('Error reordering roles:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// ============= APPROVAL WORKFLOW ENDPOINTS =============

/**
 * @route   GET /api/approval/pending
 * @desc    Get pending approvals for logged-in approver
 * @access  Approver Only
 */
router.get('/pending', authMiddleware, async (req, res) => {
    try {
        // Get approver email from token
        const approverEmail = req.user.email;

        const result = await approvalWorkflowService.getPendingApprovals(approverEmail);

        res.json(result);
    } catch (error) {
        console.error('Error getting pending approvals:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   POST /api/approval/:degreeId/approve
 * @desc    Approve a degree
 * @access  Approver Only
 */
router.post('/:degreeId/approve', authMiddleware, async (req, res) => {
    try {
        const { degreeId } = req.params;
        const approverEmail = req.user.email;

        const result = await approvalWorkflowService.processApproval(degreeId, approverEmail, 'approve');

        res.json(result);
    } catch (error) {
        console.error('Error approving degree:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   POST /api/approval/:degreeId/reject
 * @desc    Reject a degree
 * @access  Approver Only
 */
router.post('/:degreeId/reject', authMiddleware, [
    body('reason').notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { degreeId } = req.params;
        const approverEmail = req.user.email;
        const { reason } = req.body;

        const result = await approvalWorkflowService.processApproval(degreeId, approverEmail, 'reject', reason);

        res.json(result);
    } catch (error) {
        console.error('Error rejecting degree:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   GET /api/approval/approved
 * @desc    Get approved degrees (ready for blockchain)
 * @access  University Only
 */
router.get('/approved', authMiddleware, async (req, res) => {
    try {
        if (req.user.userType !== 'university') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const universityId = req.user.id;
        const result = await approvalWorkflowService.getApprovedDegrees(universityId);

        res.json(result);
    } catch (error) {
        console.error('Error getting approved degrees:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * @route   GET /api/approval/:degreeId/status
 * @desc    Get approval status of a degree
 * @access  Authenticated
 */
router.get('/:degreeId/status', authMiddleware, async (req, res) => {
    try {
        const { degreeId } = req.params;

        const degree = await approvalWorkflowService.getDegreeDocument(degreeId);

        res.json({
            success: true,
            status: degree.overallStatus,
            currentStep: degree.currentApprovalStep,
            totalSteps: degree.totalApprovalSteps,
            workflow: degree.approvalWorkflow
        });
    } catch (error) {
        console.error('Error getting approval status:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;
