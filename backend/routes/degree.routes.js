/**
 * Degree Verification Routes
 * Handles degree PDF upload, verification, and retrieval
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const { authMiddleware, universityOnly, hecOnly } = require('../middleware/auth.middleware');
const degreeVerificationService = require('../services/degreeVerification.service');
const ledgerService = require('../services/ledger.service');
const { findStudentByRollNumber } = require('../services/studentDatabase.service');
const { findUniversityByEmail, getUniversityById, getAllUniversities } = require('../config/couchdb');

// Configure multer for PDF uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/degrees');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error, null);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `degree-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Initialize services on first request
let servicesInitialized = false;
const initializeServices = async () => {
    if (!servicesInitialized) {
        await degreeVerificationService.initialize();
        servicesInitialized = true;
    }
};

// ==================== UNIVERSITY ROUTES ====================

/**
 * Upload and verify degree PDF
 * POST /api/degrees/upload
 */
router.post('/upload', authMiddleware, universityOnly, upload.single('degree'), async (req, res) => {
    try {
        await initializeServices();

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No PDF file uploaded'
            });
        }

        const { rollNumber } = req.body;

        if (!rollNumber) {
            // Clean up uploaded file
            await fs.unlink(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Student roll number is required'
            });
        }

        // Get university info
        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            await fs.unlink(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'University not found'
            });
        }

        // Get student from database
        const student = await findStudentByRollNumber(university.registrationNumber, rollNumber);
        if (!student) {
            await fs.unlink(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'Student not found in database'
            });
        }

        // Check if student is graduated
        if (student.status !== 'graduated') {
            await fs.unlink(req.file.path);
            return res.status(400).json({
                success: false,
                message: 'Student must be graduated to verify degree'
            });
        }

        // Process and verify degree
        const studentName = student.studentName || student.name || 'Unknown';
        console.log(`Processing degree for student: ${studentName} (${rollNumber})`);
        
        const result = await degreeVerificationService.processAndVerifyDegree(
            req.file.path,
            student,
            university
        );

        // Check if verification failed due to data mismatch or template mismatch
        if (!result.verified || result.status === 'NOT_VERIFIED' || result.status === 'TEMPLATE_MISMATCH') {
            return res.status(400).json({
                success: false,
                verified: false,
                status: result.status || 'NOT_VERIFIED',
                message: result.error || 'Degree data does not match database records',
                mismatchDetails: result.mismatchDetails || [],
                matchScore: result.details?.matchScore || 0,
                templateVerification: result.details?.templateVerification || null,
                details: {
                    parsedFromPDF: result.details?.parsedData,
                    verificationDetails: result.details?.verification
                }
            });
        }

        if (!result.success) {
            return res.status(400).json({
                success: false,
                verified: false,
                status: result.status || 'ERROR',
                message: result.error || 'Degree verification failed',
                details: result.details
            });
        }

        // Successfully verified and stored
        res.json({
            success: true,
            verified: true,
            status: 'VERIFIED',
            message: 'Degree verified successfully and stored on Ledger & IPFS',
            data: result.data
        });

    } catch (error) {
        console.error('Degree upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process degree',
            error: error.message
        });
    }
});

/**
 * Get university's verified degrees
 * GET /api/degrees/university
 */
router.get('/university', authMiddleware, universityOnly, async (req, res) => {
    try {
        await initializeServices();

        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            return res.status(404).json({
                success: false,
                message: 'University not found'
            });
        }

        const degrees = await ledgerService.getUniversityDegrees(
            university._id || university.id,
            {
                limit: parseInt(req.query.limit) || 100,
                skip: parseInt(req.query.skip) || 0
            }
        );

        res.json({
            success: true,
            total: degrees.length,
            degrees: degrees.map(d => ({
                transactionId: d.transactionId,
                studentName: d.studentName,
                rollNumber: d.rollNumber,
                degreeTitle: d.degreeTitle,
                department: d.department,
                cgpa: d.cgpa,
                graduationDate: d.graduationDate,
                verifiedAt: d.verifiedAt,
                degreeHash: d.degreeHash,
                ipfsGateway: d.ipfsGateway
            }))
        });

    } catch (error) {
        console.error('Error fetching university degrees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch verified degrees',
            error: error.message
        });
    }
});

/**
 * Get students eligible for degree verification
 * GET /api/degrees/eligible-students
 */
router.get('/eligible-students', authMiddleware, universityOnly, async (req, res) => {
    try {
        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            return res.status(404).json({
                success: false,
                message: 'University not found'
            });
        }

        // Get all graduated students
        const { getUniversityStudents } = require('../services/studentDatabase.service');
        const result = await getUniversityStudents(university.registrationNumber, {
            limit: 1000,
            skip: 0
        });

        // Filter for graduated students
        const graduatedStudents = result.students.filter(s => s.status === 'graduated');

        // Check which ones already have verified degrees
        await initializeServices();
        const verifiedDegrees = await ledgerService.getUniversityDegrees(
            university._id || university.id
        );
        const verifiedRollNumbers = new Set(verifiedDegrees.map(d => d.rollNumber));

        const eligibleStudents = graduatedStudents.map(s => ({
            ...s,
            hasVerifiedDegree: verifiedRollNumbers.has(s.rollNumber)
        }));

        res.json({
            success: true,
            total: eligibleStudents.length,
            verifiedCount: verifiedRollNumbers.size,
            pendingCount: eligibleStudents.filter(s => !s.hasVerifiedDegree).length,
            students: eligibleStudents
        });

    } catch (error) {
        console.error('Error fetching eligible students:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch eligible students',
            error: error.message
        });
    }
});

// ==================== BATCH UPLOAD ROUTES ====================

/**
 * Batch upload degrees (up to 100 at a time)
 * POST /api/degrees/batch-upload
 * Accepts multiple PDF files and roll numbers
 */
const batchUpload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            const uploadDir = path.join(__dirname, '../uploads/degrees/batch');
            try {
                await fs.mkdir(uploadDir, { recursive: true });
                cb(null, uploadDir);
            } catch (error) {
                cb(error, null);
            }
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, `batch-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 100 // Maximum 100 files
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

router.post('/batch-upload', authMiddleware, universityOnly, batchUpload.array('degrees', 100), async (req, res) => {
    const uploadedFiles = req.files || [];
    
    try {
        await initializeServices();

        if (!uploadedFiles.length) {
            return res.status(400).json({
                success: false,
                message: 'No PDF files uploaded'
            });
        }

        if (uploadedFiles.length > 100) {
            for (const file of uploadedFiles) {
                try { await fs.unlink(file.path); } catch (e) {}
            }
            return res.status(400).json({
                success: false,
                message: 'Maximum 100 degrees allowed per batch'
            });
        }

        // Get university info
        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            for (const file of uploadedFiles) {
                try { await fs.unlink(file.path); } catch (e) {}
            }
            return res.status(404).json({
                success: false,
                message: 'University not found'
            });
        }

        const { getUniversityStudents, findStudentByRollNumber } = require('../services/studentDatabase.service');
        
        // Get all university students for matching - fetch with high limit to get all students
        const studentsResult = await getUniversityStudents(university.registrationNumber, { limit: 10000 });
        const allStudents = studentsResult.students || studentsResult.docs || [];
        
        console.log(`📚 Found ${allStudents.length} students in university database for matching`);
        
        const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const results = {
            batchId,
            total: uploadedFiles.length,
            verified: 0,
            failed: 0,
            results: []
        };

        // Process each file - auto-detect student from PDF
        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const fileName = file.originalname;
            
            try {
                console.log(`\n📄 Processing file ${i + 1}/${uploadedFiles.length}: ${fileName}`);
                
                // Extract text from PDF to find student
                const pdfText = await degreeVerificationService.extractPDFText(file.path);
                
                if (!pdfText || pdfText.trim().length === 0) {
                    results.failed++;
                    results.results.push({
                        index: i,
                        fileName,
                        success: false,
                        error: 'Could not extract text from PDF'
                    });
                    try { await fs.unlink(file.path); } catch (e) {}
                    continue;
                }

                // Try to find matching student from PDF content
                let matchedStudent = null;
                let matchScore = 0;
                
                for (const student of allStudents) {
                    if (student.hasVerifiedDegree) continue; // Skip already verified
                    if (student.status !== 'graduated') continue; // Only graduated students
                    
                    const studentName = (student.name || student.studentName || '').toLowerCase();
                    const rollNumber = (student.rollNumber || '').toLowerCase();
                    const pdfLower = pdfText.toLowerCase();
                    
                    // Check if roll number appears in PDF
                    const rollVariations = [
                        rollNumber,
                        rollNumber.replace(/[-\/\\]/g, ''),
                        rollNumber.replace(/[-\/\\]/g, ' ')
                    ];
                    
                    let rollFound = rollVariations.some(r => r && pdfLower.includes(r));
                    let nameFound = studentName && studentName.length > 3 && pdfLower.includes(studentName);
                    
                    // Calculate match score
                    let currentScore = 0;
                    if (rollFound) currentScore += 60;
                    if (nameFound) currentScore += 40;
                    
                    if (currentScore > matchScore) {
                        matchScore = currentScore;
                        matchedStudent = student;
                    }
                    
                    // Perfect match - stop searching
                    if (currentScore >= 100) break;
                }

                if (!matchedStudent || matchScore < 50) {
                    results.failed++;
                    results.results.push({
                        index: i,
                        fileName,
                        success: false,
                        error: 'Could not match PDF to any student. Ensure the PDF contains student name and roll number.'
                    });
                    try { await fs.unlink(file.path); } catch (e) {}
                    continue;
                }

                console.log(`✓ Matched to student: ${matchedStudent.name} (${matchedStudent.rollNumber}) with score ${matchScore}%`);

                // Process and verify degree
                const verificationResult = await degreeVerificationService.processAndVerifyDegree(
                    file.path,
                    matchedStudent,
                    university,
                    { batchId }
                );

                // Check verification status - degrees are considered verified if they pass verification
                if (verificationResult.verified) {
                    results.verified++;
                    results.results.push({
                        index: i,
                        fileName,
                        rollNumber: matchedStudent.rollNumber,
                        studentName: matchedStudent.name,
                        success: true,
                        verified: true,
                        status: 'VERIFIED',
                        transactionId: verificationResult.data?.transactionId || 'Pending',
                        degreeHash: verificationResult.data?.degreeHash || 'Pending',
                        matchScore: verificationResult.details?.matchScore || 0,
                        storedOnLedger: !!verificationResult.data?.transactionId
                    });
                    console.log(`✅ Degree ${i + 1} VERIFIED successfully`);
                } else {
                    results.failed++;
                    results.results.push({
                        index: i,
                        fileName,
                        rollNumber: matchedStudent.rollNumber,
                        studentName: matchedStudent.name,
                        success: false,
                        verified: false,
                        status: verificationResult.status || 'NOT_VERIFIED',
                        error: verificationResult.error || 'Degree data does not match database records',
                        mismatchDetails: verificationResult.mismatchDetails || [],
                        matchScore: verificationResult.details?.matchScore || 0
                    });
                    console.log(`❌ Degree ${i + 1} verification FAILED: ${verificationResult.error}`);
                }

            } catch (error) {
                console.error(`Error processing degree ${i}:`, error);
                results.failed++;
                results.results.push({
                    index: i,
                    fileName,
                    success: false,
                    error: error.message
                });
                try { await fs.unlink(file.path); } catch (e) {}
            }
        }

        res.json({
            success: true,
            message: `Batch processing complete. ${results.verified}/${results.total} degrees verified.`,
            data: results
        });

    } catch (error) {
        console.error('Batch upload error:', error);
        // Clean up all uploaded files
        for (const file of uploadedFiles) {
            try { await fs.unlink(file.path); } catch (e) {}
        }
        res.status(500).json({
            success: false,
            message: 'Failed to process batch upload',
            error: error.message
        });
    }
});

/**
 * Batch verify degrees without PDF (verify from database)
 * POST /api/degrees/batch-verify
 * Accepts array of roll numbers to verify from database
 */
router.post('/batch-verify', authMiddleware, universityOnly, async (req, res) => {
    try {
        await initializeServices();

        const { rollNumbers } = req.body;

        if (!rollNumbers || !Array.isArray(rollNumbers) || rollNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Roll numbers array is required'
            });
        }

        if (rollNumbers.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 100 degrees allowed per batch'
            });
        }

        // Get university info
        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            return res.status(404).json({
                success: false,
                message: 'University not found'
            });
        }

        const { findStudentByRollNumber } = require('../services/studentDatabase.service');
        
        const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const results = {
            batchId,
            total: rollNumbers.length,
            verified: 0,
            failed: 0,
            results: []
        };

        // Process each roll number
        for (let i = 0; i < rollNumbers.length; i++) {
            const rollNumber = rollNumbers[i];
            
            try {
                // Get student from database
                const student = await findStudentByRollNumber(university.registrationNumber, rollNumber);
                
                if (!student) {
                    results.failed++;
                    results.results.push({
                        index: i,
                        rollNumber,
                        success: false,
                        error: 'Student not found in database'
                    });
                    continue;
                }

                // Check if student is graduated
                if (student.status !== 'graduated') {
                    results.failed++;
                    results.results.push({
                        index: i,
                        rollNumber,
                        studentName: student.name,
                        success: false,
                        error: 'Student must be graduated to verify degree'
                    });
                    continue;
                }

                // Check if degree already exists
                const existingDegrees = await ledgerService.getUniversityDegrees(university._id || university.id);
                const alreadyVerified = existingDegrees.find(d => d.rollNumber === rollNumber);
                
                if (alreadyVerified) {
                    results.failed++;
                    results.results.push({
                        index: i,
                        rollNumber,
                        studentName: student.name,
                        success: false,
                        error: 'Degree already verified for this student'
                    });
                    continue;
                }

                // Create degree record from database
                const verificationResult = await degreeVerificationService.verifyFromDatabase(
                    student,
                    university,
                    { batchId }
                );

                if (verificationResult.success) {
                    results.verified++;
                    results.results.push({
                        index: i,
                        rollNumber,
                        studentName: student.name,
                        success: true,
                        transactionId: verificationResult.data.transactionId,
                        degreeHash: verificationResult.data.degreeHash
                    });
                } else {
                    results.failed++;
                    results.results.push({
                        index: i,
                        rollNumber,
                        studentName: student.name,
                        success: false,
                        error: verificationResult.error || 'Verification failed'
                    });
                }

            } catch (error) {
                console.error(`Error verifying degree ${i}:`, error);
                results.failed++;
                results.results.push({
                    index: i,
                    rollNumber,
                    success: false,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Batch verification complete. ${results.verified}/${results.total} degrees verified.`,
            data: results
        });

    } catch (error) {
        console.error('Batch verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process batch verification',
            error: error.message
        });
    }
});

// ==================== HEC ROUTES ====================

/**
 * Get all pending degrees for HEC Verification
 * GET /api/degrees/hec/pending
 */
router.get('/hec/pending', authMiddleware, hecOnly, async (req, res) => {
    try {
        const nano = require('nano')('http://admin:adminpw@localhost:5984');
        let workflowDb;
        try {
            workflowDb = nano.use('degree_workflows');
            await workflowDb.info();
        } catch (e) {
            return res.json({ success: true, degrees: [], total: 0 });
        }

        const result = await workflowDb.find({
            selector: {
                docType: 'degree_with_workflow',
                overallStatus: 'approved'
            },
            limit: 500
        });

        const degrees = (result.docs || []).map(doc => ({
            degreeId: doc.degreeId || doc._id,
            studentName: doc.studentName || '',
            studentRollNumber: doc.studentRollNumber || '',
            degreeProgram: doc.degreeProgram || '',
            department: doc.department || '',
            cgpa: doc.cgpa || '',
            graduationDate: doc.graduationDate || '',
            universityName: doc.universityName || '',
            originalFileName: doc.pdfFileName || doc.studentName || doc.degreeId,
            overallStatus: doc.overallStatus,
            createdAt: doc.uploadedAt || doc.createdAt,
            universityId: doc.universityId
        })).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        res.json({ success: true, degrees, total: degrees.length });
    } catch (error) {
        console.error('List HEC pending degrees error:', error);
        res.status(500).json({ success: false, message: 'Failed to list pending degrees', error: error.message });
    }
});

/**
 * Get pending degree PDF
 * GET /api/degrees/hec/:degreeId/pdf
 */
router.get('/hec/:degreeId/pdf', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'hec_university_secret_key_2024';
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (decoded.role !== 'super_admin' && !decoded.isHEC && decoded.type !== 'hec_member') {
            return res.status(403).json({ success: false, message: 'HEC Access denied' });
        }

        const nano = require('nano')('http://admin:adminpw@localhost:5984');
        const workflowDb = nano.use('degree_workflows');
        const degreeId = req.params.degreeId;

        const degree = await workflowDb.get(degreeId);
        
        let targetPdf = degree.currentPdfPath || degree.originalPdfPath;
        if (!targetPdf) {
            return res.status(404).json({ success: false, message: 'PDF file not available' });
        }

        const fs = require('fs');
        const path = require('path');
        const absolutePath = path.resolve(targetPdf);

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: 'PDF file not found on disk' });
        }

        const stat = fs.statSync(absolutePath);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="degree_preview.pdf"');

        const readStream = fs.createReadStream(absolutePath);
        readStream.pipe(res);
    } catch (error) {
        console.error('Error serving HEC PDF preview:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

/**
 * Verify a degree by HEC (puts it on Blockchain + QR code)
 * POST /api/degrees/hec/:degreeId/verify
 */
router.post('/hec/:degreeId/verify', authMiddleware, hecOnly, async (req, res) => {
    try {
        const nano = require('nano')('http://admin:adminpw@localhost:5984');
        const workflowDb = nano.use('degree_workflows');
        const { degreeId } = req.params;

        let degree;
        try {
            degree = await workflowDb.get(degreeId);
        } catch (e) {
            return res.status(404).json({ success: false, message: 'Degree not found' });
        }

        if (degree.overallStatus !== 'approved') {
            return res.status(400).json({
                success: false,
                message: `Can only verify approved degrees. Current status: ${degree.overallStatus}`
            });
        }

        const approvalWorkflowService = require('../services/approvalWorkflow.service');

        // Pass universityId from the degree document
        const verifyResult = await approvalWorkflowService.runHECVerification(degree, degree.universityId);

        // Update degree in DB
        const latestDoc = await workflowDb.get(degree._id);
        latestDoc.overallStatus = 'verified';
        latestDoc.submittedToBlockchain = true;
        latestDoc.blockchainTransactionId = verifyResult.transactionId;
        latestDoc.degreeHash = verifyResult.degreeHash;
        latestDoc.verifiedPdfPath = verifyResult.verifiedPdfPath;
        latestDoc.qrCodeData = verifyResult.qrCodeData;
        latestDoc.verifiedAt = new Date().toISOString();
        latestDoc.hecVerifiedBy = req.user.email; // Record who verified it
        await workflowDb.insert(latestDoc);

        res.json({
            success: true,
            message: 'Degree successfully verified by HEC and submitted to blockchain',
            data: {
                transactionId: verifyResult.transactionId,
                degreeHash: verifyResult.degreeHash
            }
        });

    } catch (error) {
        console.error('HEC manual verify error:', error);
        res.status(500).json({ success: false, message: 'HEC verification failed', error: error.message });
    }
});

/**
 * Reject a degree by HEC
 * POST /api/degrees/hec/:degreeId/reject
 */
router.post('/hec/:degreeId/reject', authMiddleware, hecOnly, async (req, res) => {
    try {
        const nano = require('nano')('http://admin:adminpw@localhost:5984');
        const workflowDb = nano.use('degree_workflows');
        const { degreeId } = req.params;
        const { rejectionReason } = req.body;

        let degree;
        try {
            degree = await workflowDb.get(degreeId);
        } catch (e) {
            return res.status(404).json({ success: false, message: 'Degree not found' });
        }

        if (degree.overallStatus !== 'approved') {
            return res.status(400).json({
                success: false,
                message: `Can only reject approved degrees. Current status: ${degree.overallStatus}`
            });
        }

        degree.overallStatus = 'rejected';
        degree.hecRejectedBy = req.user.email;
        degree.hecRejectionReason = rejectionReason || 'No reason provided';
        degree.rejectedAt = new Date().toISOString();
        
        await workflowDb.insert(degree);

        res.json({
            success: true,
            message: 'Degree successfully rejected by HEC'
        });

    } catch (error) {
        console.error('HEC manual reject error:', error);
        res.status(500).json({ success: false, message: 'HEC rejection failed', error: error.message });
    }
});

/**
 * Get all verified degrees (HEC only)
 * GET /api/degrees/all
 */
router.get('/all', authMiddleware, hecOnly, async (req, res) => {
    try {
        await initializeServices();

        const degrees = await ledgerService.getAllVerifiedDegrees({
            limit: parseInt(req.query.limit) || 100,
            skip: parseInt(req.query.skip) || 0
        });

        res.json({
            success: true,
            total: degrees.length,
            degrees: degrees.map(d => ({
                transactionId: d.transactionId,
                studentName: d.studentName,
                rollNumber: d.rollNumber,
                cnic: d.cnic,
                degreeTitle: d.degreeTitle,
                department: d.department,
                universityName: d.universityName,
                cgpa: d.cgpa,
                graduationDate: d.graduationDate,
                verifiedAt: d.verifiedAt,
                degreeHash: d.degreeHash,
                ipfsGateway: d.ipfsGateway
            }))
        });

    } catch (error) {
        console.error('Error fetching all degrees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch verified degrees',
            error: error.message
        });
    }
});

/**
 * Get verification statistics (HEC only)
 * GET /api/degrees/stats
 */
router.get('/stats', authMiddleware, hecOnly, async (req, res) => {
    try {
        await initializeServices();
        const stats = await degreeVerificationService.getStats();

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
});

// ==================== PUBLIC VERIFICATION ROUTES ====================

/**
 * Verify degree by transaction ID (Public)
 * GET /api/degrees/verify/:transactionId
 */
router.get('/verify/:transactionId', async (req, res) => {
    try {
        await initializeServices();

        const { transactionId } = req.params;
        const result = await ledgerService.verifyByTransactionId(transactionId);

        if (!result.verified) {
            return res.status(404).json({
                success: false,
                verified: false,
                message: 'Degree not found or not verified'
            });
        }

        res.json({
            success: true,
            verified: true,
            message: 'Degree is verified by HEC',
            degree: result.degree
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: error.message
        });
    }
});

/**
 * Verify degree by hash (Public)
 * GET /api/degrees/verify-hash/:hash
 */
router.get('/verify-hash/:hash', async (req, res) => {
    try {
        await initializeServices();

        const { hash } = req.params;
        const result = await ledgerService.verifyByHash(hash);

        if (!result.verified) {
            return res.status(404).json({
                success: false,
                verified: false,
                message: 'Degree not found or not verified'
            });
        }

        res.json({
            success: true,
            verified: true,
            message: 'Degree is verified by HEC',
            degree: result.degree
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: error.message
        });
    }
});

/**
 * Verify by QR code data (Public)
 * POST /api/degrees/verify-qr
 */
router.post('/verify-qr', async (req, res) => {
    try {
        await initializeServices();

        const { qrData } = req.body;
        
        if (!qrData) {
            return res.status(400).json({
                success: false,
                message: 'QR code data is required'
            });
        }

        const result = await degreeVerificationService.verifyByQRCode(qrData);

        if (!result.verified) {
            return res.status(404).json({
                success: false,
                verified: false,
                message: result.error || 'Degree not found or not verified'
            });
        }

        res.json({
            success: true,
            verified: true,
            message: 'Degree is verified by HEC',
            degree: result.degree,
            hashVerified: result.hashVerified
        });

    } catch (error) {
        console.error('QR verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: error.message
        });
    }
});

/**
 * Download verified degree PDF with QR code
 * GET /api/degrees/download/:transactionId
 */
router.get('/download/:transactionId', async (req, res) => {
    try {
        await initializeServices();

        const { transactionId } = req.params;
        const result = await ledgerService.verifyByTransactionId(transactionId);

        if (!result.verified) {
            return res.status(404).json({
                success: false,
                message: 'Degree not found'
            });
        }

        // Try to find the verified PDF locally first
        const uploadsDir = path.join(__dirname, '../uploads/degrees');
        let pdfPath = null;
        
        // Check if degree has stored PDF path
        if (result.degree.verifiedPdfPath) {
            try {
                await fs.access(result.degree.verifiedPdfPath);
                pdfPath = result.degree.verifiedPdfPath;
                console.log('📁 Found verified PDF at stored path:', pdfPath);
            } catch (e) {
                console.log('⚠️ PDF not found at stored path, searching directory...');
            }
        }

        // If not found, look for verified PDF matching the roll number
        if (!pdfPath) {
            try {
                const files = await fs.readdir(uploadsDir);
                const rollNumber = result.degree.rollNumber;
                
                // Try to find file that contains the roll number
                for (const file of files) {
                    if (file.startsWith('verified_') && file.endsWith('.pdf')) {
                        // Check if filename contains roll number
                        if (rollNumber && file.toLowerCase().includes(rollNumber.toLowerCase().replace(/[-\/\\]/g, ''))) {
                            pdfPath = path.join(uploadsDir, file);
                            console.log('📁 Found verified PDF by roll number match:', pdfPath);
                            break;
                        }
                    }
                }

                // If still not found, try the most recent verified PDF
                if (!pdfPath) {
                    const verifiedFiles = files.filter(f => f.startsWith('verified_') && f.endsWith('.pdf'));
                    if (verifiedFiles.length > 0) {
                        // Get file stats to find most recent
                        const fileStats = await Promise.all(
                            verifiedFiles.map(async (f) => {
                                const filePath = path.join(uploadsDir, f);
                                const stats = await fs.stat(filePath);
                                return { file: f, path: filePath, mtime: stats.mtime };
                            })
                        );
                        // Sort by modification time, most recent first
                        fileStats.sort((a, b) => b.mtime - a.mtime);
                        pdfPath = fileStats[0].path;
                        console.log('📁 Using most recent verified PDF:', pdfPath);
                    }
                }
            } catch (e) {
                console.log('⚠️ Error searching for verified PDF:', e.message);
            }
        }

        if (pdfPath) {
            const fileName = `${result.degree.studentName || 'Student'}_${result.degree.rollNumber || 'degree'}_verified.pdf`;
            const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
            
            const fileBuffer = await fs.readFile(pdfPath);
            console.log('✅ Sending verified PDF:', pdfPath, '| Size:', fileBuffer.length, 'bytes');
            return res.send(fileBuffer);
        }

        // Fallback to IPFS gateway if available
        if (result.degree.ipfsGateway && result.degree.ipfsGateway !== 'pending') {
            console.log('🌐 Redirecting to IPFS gateway:', result.degree.ipfsGateway);
            return res.redirect(result.degree.ipfsGateway);
        }

        res.status(404).json({
            success: false,
            message: 'Verified PDF not available. Please contact the university.'
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download degree',
            error: error.message
        });
    }
});

/**
 * Upload degree with approval workflow
 * Creates approval workflow with signature positions
 */

/**
 * Batch upload degrees for approval workflow
 * POST /api/degrees/batch-upload-for-approval
 * Accepts multiple PDFs, sends each directly for VC/Registrar/Controller approval
 * No student database required - just uploads PDFs as-is
 */
router.post('/batch-upload-for-approval', authMiddleware, universityOnly, batchUpload.array('degrees', 100), async (req, res) => {
    const uploadedFiles = req.files || [];

    try {
        if (!uploadedFiles.length) {
            return res.status(400).json({ success: false, message: 'No PDF files uploaded' });
        }

        // Get university info
        const university = await findUniversityByEmail(req.user.email);
        if (!university) {
            for (const file of uploadedFiles) {
                try { await fs.unlink(file.path); } catch (e) {}
            }
            return res.status(404).json({ success: false, message: 'University not found' });
        }

        // Check if university has approval roles configured
        if (!university.approvalRoles || university.approvalRoles.filter(r => r.isActive).length === 0) {
            for (const file of uploadedFiles) {
                try { await fs.unlink(file.path); } catch (e) {}
            }
            return res.status(400).json({
                success: false,
                message: 'No approval roles configured. Please add VC/Registrar roles first in Role Management.'
            });
        }

        const universityId = university._id || university.id || university.registrationNumber;

        console.log(`📚 Batch approval upload: ${uploadedFiles.length} files for university ${university.name}`);

        // Load approval workflow service
        const approvalWorkflowService = require('../services/approvalWorkflow.service');
        const degreeTemplateService = require('../services/degreeTemplate.service');

        const results = {
            total: uploadedFiles.length,
            sentForApproval: 0,
            failed: 0,
            templateFailed: 0,
            results: []
        };

        // Try to get active template for this university
        let activeTemplate = null;
        try {
            activeTemplate = await degreeTemplateService.getActiveTemplate(universityId);
        } catch (e) {
            console.log('ℹ️ No template check available:', e.message);
        }

        // ── Validate all required template roles are registered with signatures ──
        if (activeTemplate) {
            const requiredRoles = activeTemplate.profile?.requiredSignatureRoles || [];
            if (requiredRoles.length > 0) {
                const activeRegisteredRoles = (university.approvalRoles || []).filter(r => r.isActive !== false);

                const missingRoles = [];
                const missingSignatures = [];

                for (const requiredRole of requiredRoles) {
                    const normalizedRequired = requiredRole.trim().toLowerCase();
                    // Find a matching registered role
                    const matchedRole = activeRegisteredRoles.find(r => {
                        const normalizedRegistered = r.roleName.trim().toLowerCase();
                        return normalizedRegistered === normalizedRequired ||
                            normalizedRegistered.startsWith(normalizedRequired) ||
                            normalizedRequired.startsWith(normalizedRegistered);
                    });

                    if (!matchedRole) {
                        missingRoles.push(requiredRole);
                    } else if (!matchedRole.signature) {
                        missingSignatures.push(requiredRole);
                    }
                }

                if (missingRoles.length > 0 || missingSignatures.length > 0) {
                    for (const file of uploadedFiles) {
                        try { await fs.unlink(file.path); } catch (e) {}
                    }

                    let errorMessage = `Cannot send degrees for verification. Your degree template requires the following:`;

                    if (missingRoles.length > 0) {
                        errorMessage += ` Missing roles (not registered): ${missingRoles.join(', ')}.`;
                    }
                    if (missingSignatures.length > 0) {
                        errorMessage += ` Roles missing signatures: ${missingSignatures.join(', ')}.`;
                    }
                    errorMessage += ' Please go to Role Management to register all required roles and add their signatures.';

                    return res.status(400).json({
                        success: false,
                        message: errorMessage,
                        details: {
                            requiredRoles,
                            missingRoles,
                            missingSignatures
                        }
                    });
                }

                console.log(`✅ All ${requiredRoles.length} required template roles are registered with signatures`);
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const fileName = file.originalname;

            try {
                console.log(`📄 Processing file ${i + 1}/${uploadedFiles.length}: ${fileName}`);

                // Template verification check (if template exists)
                if (activeTemplate) {
                    const tmplResult = await degreeTemplateService.verifyAgainstTemplate(file.path, activeTemplate);
                    if (!tmplResult.isMatch) {
                        results.templateFailed++;
                        results.failed++;
                        results.results.push({
                            index: i,
                            fileName,
                            success: false,
                            error: `Degree does not match university template "${activeTemplate.templateName}" (score: ${tmplResult.details.percentage}%). Font sizes/layout differ from the approved template.`,
                            templateCheck: {
                                score: tmplResult.details.percentage,
                                checks: tmplResult.checks.filter(c => !c.passed).map(c => ({
                                    name: c.name, expected: c.expected, actual: c.actual
                                }))
                            }
                        });
                        try { await fs.unlink(file.path); } catch (e) {}
                        continue;
                    }
                    console.log(`✅ Template matched: ${activeTemplate.templateName} (score: ${tmplResult.details.percentage}%)`);
                }

                // Extract a clean name from the filename (remove .pdf extension)
                const cleanName = path.basename(fileName, path.extname(fileName))
                    .replace(/[-_]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                // Create approval workflow for this degree - no student matching needed
                const degreeData = {
                    studentName: cleanName || 'From PDF',
                    rollNumber: '',
                    cnic: '',
                    fatherName: '',
                    degreeProgram: '',
                    department: '',
                    cgpa: '',
                    session: '',
                    graduationDate: '',
                    pdfPath: file.path,
                    pdfFileName: fileName,
                    uploadedBy: req.user.email,
                    signaturePositions: {}
                };

                const workflowResult = await approvalWorkflowService.createApprovalWorkflow(degreeData, universityId);

                results.sentForApproval++;
                results.results.push({
                    index: i,
                    fileName,
                    success: true,
                    degreeId: workflowResult.degreeId,
                    status: 'sent_for_approval'
                });

                console.log(`✅ Degree ${i + 1} sent for approval - workflow created`);

            } catch (error) {
                console.error(`Error processing degree ${i + 1}:`, error);
                results.failed++;
                results.results.push({
                    index: i,
                    fileName,
                    success: false,
                    error: error.message
                });
                try { await fs.unlink(file.path); } catch (e) {}
            }
        }

        res.json({
            success: true,
            message: `Batch complete. ${results.sentForApproval}/${results.total} degrees sent for approval.`,
            data: results
        });

    } catch (error) {
        console.error('Batch approval upload error:', error);
        for (const file of uploadedFiles) {
            try { await fs.unlink(file.path); } catch (e) {}
        }
        res.status(500).json({
            success: false,
            message: 'Failed to process batch upload for approval',
            error: error.message
        });
    }
});

router.post('/upload-with-workflow', authMiddleware, universityOnly, upload.single('degree'), async (req, res) => {
    try {
        console.log('📋 Upload with workflow request received');
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No PDF file uploaded'
            });
        }

        const {
            studentName,
            studentRollNumber,
            degreeProgram,
            department,
            cgpa,
            session,
            graduationDate,
            signaturePositions,
            approvalRoleIds
        } = req.body;

        // Validate required fields
        if (!studentName || !studentRollNumber || !degreeProgram || !department || !cgpa || !graduationDate) {
            return res.status(400).json({
                success: false,
                message: 'Missing required degree information'
            });
        }

        if (!signaturePositions || !approvalRoleIds) {
            return res.status(400).json({
                success: false,
                message: 'Missing signature positions or approval roles'
            });
        }

        const positions = JSON.parse(signaturePositions);
        const roleIds = JSON.parse(approvalRoleIds);

        // Store PDF temporarily
        const pdfPath = req.file.path;
        
        // Load approval workflow service
        const approvalWorkflowService = require('../services/approvalWorkflow.service');

        // Create approval workflow
        const workflowResult = await approvalWorkflowService.createApprovalWorkflow({
            universityId: req.user.universityId,
            universityName: req.user.universityName,
            degreeData: {
                studentName,
                studentRollNumber,
                degreeProgram,
                department,
                cgpa,
                session,
                graduationDate
            },
            pdfPath,
            approvalRoleIds: roleIds,
            signaturePositions: positions
        });

        console.log('✅ Approval workflow created successfully');

        res.json({
            success: true,
            message: 'Degree uploaded and approval workflow initiated',
            data: {
                degreeId: workflowResult.degreeId,
                workflowId: workflowResult.workflowId,
                totalSteps: workflowResult.totalSteps,
                currentStep: workflowResult.currentStep
            }
        });

    } catch (error) {
        console.error('Upload with workflow error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload degree with workflow',
            error: error.message
        });
    }
});

// ============== WORKFLOW DEGREE LISTING & DOWNLOAD ==============

/**
 * List all workflow degrees for a university (with optional status filter)
 * Supports: ?status=pending|approved|verified|rejected
 */
router.get('/workflow/list', authMiddleware, universityOnly, async (req, res) => {
    try {
        const nano = require('nano')('http://admin:adminpw@localhost:5984');
        let workflowDb;
        try {
            workflowDb = nano.use('degree_workflows');
            await workflowDb.info();
        } catch (e) {
            // DB doesn't exist yet — return empty
            return res.json({ success: true, degrees: [], total: 0 });
        }

        const universityId = req.user.universityId || req.user.id;
        const statusFilter = req.query.status;

        // Map frontend status to actual DB status
        let dbStatusFilter = statusFilter;
        if (statusFilter === 'pending') dbStatusFilter = 'pending_approval';

        const result = await workflowDb.find({
            selector: {
                universityId: universityId,
                docType: 'degree_with_workflow',
                ...(dbStatusFilter ? { overallStatus: dbStatusFilter } : {})
            },
            limit: 500
        });

        const degrees = (result.docs || []).map(doc => ({
            degreeId: doc.degreeId,
            studentName: doc.studentName || '',
            studentRollNumber: doc.studentRollNumber || '',
            degreeProgram: doc.degreeProgram || '',
            department: doc.department || '',
            cgpa: doc.cgpa || '',
            graduationDate: doc.graduationDate || '',
            originalFileName: doc.pdfFileName || doc.originalFileName || doc.studentName || doc.degreeId,
            overallStatus: doc.overallStatus === 'pending_approval' ? 'pending' : doc.overallStatus,
            submittedToBlockchain: doc.submittedToBlockchain || false,
            blockchainTransactionId: doc.blockchainTransactionId || null,
            degreeHash: doc.degreeHash || null,
            verifiedAt: doc.verifiedAt || null,
            createdAt: doc.uploadedAt || doc.createdAt,
            approvalSteps: (doc.approvalWorkflow || doc.approvalSteps || []).map(s => ({
                roleName: s.roleName,
                status: s.status,
                approvedAt: s.approvedAt || null
            }))
        })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, degrees, total: degrees.length });
    } catch (error) {
        console.error('List workflow degrees error:', error);
        res.status(500).json({ success: false, message: 'Failed to list degrees', error: error.message });
    }
});

/**
 * Download the verified PDF (with QR code + signatures) for a specific degree
 */
router.get('/workflow/:degreeId/download', authMiddleware, universityOnly, async (req, res) => {
    try {
        const nano = require('nano')('http://admin:adminpw@localhost:5984');
        const workflowDb = nano.use('degree_workflows');
        const { degreeId } = req.params;

        // Find the degree - degreeId IS the doc _id
        let degree;
        try {
            degree = await workflowDb.get(degreeId);
        } catch (e) {
            return res.status(404).json({ success: false, message: 'Degree not found' });
        }

        // Verify ownership
        if (degree.universityId !== (req.user.universityId || req.user.id)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (degree.overallStatus !== 'verified') {
            return res.status(400).json({
                success: false,
                message: `Degree is not yet verified. Current status: ${degree.overallStatus}`
            });
        }

        const filePath = degree.verifiedPdfPath;
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'Verified PDF file not found' });
        }

        // Check file exists
        try {
            await require('fs').promises.access(filePath);
        } catch {
            return res.status(404).json({ success: false, message: 'Verified PDF file has been moved or deleted' });
        }

        const rawFileName = degree.pdfFileName
            ? `verified_${degree.pdfFileName}`
            : `verified_${degreeId}.pdf`;
        
        // CRITICAL FIX: Express Content-Disposition crashes (causing Network Error / Socket Hang Up) 
        // if fileName contains spaces or invalid characters in some configurations.
        const fileName = rawFileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

        // Use Express's native sendFile which handles content-length, ranges, and ETags cleanly without socket drops
        const path = require('path');
        return res.sendFile(path.resolve(filePath), {
            headers: {
                'Content-Disposition': `attachment; filename="${fileName}"`
            }
        }, (err) => {
            if (err) {
                console.error("sendFile error:", err);
            }
        });

    } catch (error) {
        console.error('Download verified degree error:', error);
        res.status(500).json({ success: false, message: 'Failed to download degree', error: error.message });
    }
});

/**
 * Retry HEC verification for a degree that is approved but verification failed
 */
router.post('/workflow/:degreeId/retry-verification', authMiddleware, universityOnly, async (req, res) => {
    try {
        const nano = require('nano')('http://admin:adminpw@localhost:5984');
        const workflowDb = nano.use('degree_workflows');
        const { degreeId } = req.params;

        let degree;
        try {
            degree = await workflowDb.get(degreeId);
        } catch (e) {
            return res.status(404).json({ success: false, message: 'Degree not found' });
        }

        if (degree.universityId !== (req.user.universityId || req.user.id)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (degree.overallStatus !== 'approved') {
            return res.status(400).json({
                success: false,
                message: `Can only retry verification for approved degrees. Current status: ${degree.overallStatus}`
            });
        }

        const approvalWorkflowService = require('../services/approvalWorkflow.service');

        const verifyResult = await approvalWorkflowService.runHECVerification(degree, req.user.universityId || req.user.id);

        // Update degree in DB
        const latestDoc = await workflowDb.get(degree._id);
        latestDoc.overallStatus = 'verified';
        latestDoc.submittedToBlockchain = true;
        latestDoc.blockchainTransactionId = verifyResult.transactionId;
        latestDoc.degreeHash = verifyResult.degreeHash;
        latestDoc.verifiedPdfPath = verifyResult.verifiedPdfPath;
        latestDoc.qrCodeData = verifyResult.qrCodeData;
        latestDoc.verifiedAt = new Date().toISOString();
        await workflowDb.insert(latestDoc);

        res.json({
            success: true,
            message: 'Degree verified and QR code added successfully',
            data: {
                transactionId: verifyResult.transactionId,
                degreeHash: verifyResult.degreeHash
            }
        });

    } catch (error) {
        console.error('Retry verification error:', error);
        res.status(500).json({ success: false, message: 'HEC verification failed', error: error.message });
    }
});

module.exports = router;
