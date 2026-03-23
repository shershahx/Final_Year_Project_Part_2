/**
 * Template Routes
 * Handles degree template upload, retrieval, and management for universities
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const { authMiddleware, universityOnly } = require('../middleware/auth.middleware');
const degreeTemplateService = require('../services/degreeTemplate.service');
const { findUniversityByEmail } = require('../config/couchdb');

// Configure multer for template PDF uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/templates');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error, null);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `template-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for templates'));
        }
    }
});

// All routes require university auth
router.use(authMiddleware);
router.use(universityOnly);

/**
 * Upload / update a degree template
 * POST /api/templates/upload
 */
router.post('/upload', upload.single('template'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No PDF file uploaded' });
        }

        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            await fs.unlink(req.file.path);
            return res.status(404).json({ success: false, message: 'University not found' });
        }

        const { templateName } = req.body;

        const template = await degreeTemplateService.saveTemplate(
            university._id || university.id,
            {
                templateName: templateName || 'Degree Template',
                pdfPath: req.file.path
            }
        );

        res.json({
            success: true,
            message: 'Degree template saved successfully',
            template: {
                id: template._id,
                templateName: template.templateName,
                programName: 'All Programs',
                isActive: template.isActive,
                requiredSignatureRoles: template.profile.requiredSignatureRoles || [],
                profile: {
                    titleFontSize: template.profile.titleFontSize,
                    headingFontSize: template.profile.headingFontSize,
                    bodyFontSize: template.profile.bodyFontSize,
                    pageCount: template.profile.pageCount,
                    totalTextItems: template.profile.totalTextItems,
                    fontSizes: template.profile.sortedFontSizes,
                    requiredSignatureRoles: template.profile.requiredSignatureRoles || []
                },
                createdAt: template.createdAt,
                updatedAt: template.updatedAt
            }
        });
    } catch (error) {
        console.error('Template upload error:', error);
        if (req.file) {
            try { await fs.unlink(req.file.path); } catch (e) { /* ignore */ }
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get the active template for this university (with required signature roles)
 * GET /api/templates/active
 */
router.get('/active', async (req, res) => {
    try {
        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            return res.status(404).json({ success: false, message: 'University not found' });
        }

        const universityId = university._id || university.id;
        const template = await degreeTemplateService.getActiveTemplate(universityId);

        if (!template) {
            return res.json({
                success: true,
                template: null,
                requiredSignatureRoles: [],
                message: 'No active template found'
            });
        }

        res.json({
            success: true,
            template: {
                id: template._id,
                templateName: template.templateName,
                isActive: template.isActive,
                requiredSignatureRoles: template.profile?.requiredSignatureRoles || [],
                profile: {
                    pageCount: template.profile?.pageCount,
                    requiredSignatureRoles: template.profile?.requiredSignatureRoles || []
                }
            },
            requiredSignatureRoles: template.profile?.requiredSignatureRoles || []
        });
    } catch (error) {
        console.error('Get active template error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get all templates for this university
 * GET /api/templates
 */
router.get('/', async (req, res) => {
    try {
        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            return res.status(404).json({ success: false, message: 'University not found' });
        }

        const templates = await degreeTemplateService.getTemplates(university._id || university.id);

        res.json({
            success: true,
            total: templates.length,
            templates: templates.map(t => ({
                id: t._id,
                templateName: t.templateName,
                programName: 'All Programs',
                isActive: t.isActive,
                requiredSignatureRoles: t.profile?.requiredSignatureRoles || [],
                profile: {
                    titleFontSize: t.profile?.titleFontSize,
                    headingFontSize: t.profile?.headingFontSize,
                    bodyFontSize: t.profile?.bodyFontSize,
                    pageCount: t.profile?.pageCount,
                    totalTextItems: t.profile?.totalTextItems,
                    fontSizes: t.profile?.sortedFontSizes,
                    requiredSignatureRoles: t.profile?.requiredSignatureRoles || []
                },
                createdAt: t.createdAt,
                updatedAt: t.updatedAt
            }))
        });
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Delete a template
 * DELETE /api/templates/:templateId
 */
router.delete('/:templateId', async (req, res) => {
    try {
        await degreeTemplateService.deleteTemplate(req.params.templateId);
        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Toggle template active/inactive
 * PUT /api/templates/:templateId/toggle
 */
router.put('/:templateId/toggle', async (req, res) => {
    try {
        const { isActive } = req.body;
        const template = await degreeTemplateService.toggleTemplate(req.params.templateId, isActive);
        res.json({
            success: true,
            message: `Template ${isActive ? 'activated' : 'deactivated'}`,
            template: {
                id: template._id,
                templateName: template.templateName,
                programName: 'All Programs',
                isActive: template.isActive
            }
        });
    } catch (error) {
        console.error('Toggle template error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
