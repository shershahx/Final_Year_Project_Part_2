const nano = require('nano');
const path = require('path');
const fsPromises = require('fs').promises;

const couchdbUrl = process.env.COUCHDB_URL || 'http://admin:adminpw@localhost:5984';
const couch = nano(couchdbUrl);

class ApprovalWorkflowService {
    constructor() {
        this.couchdb = couch;
    }

    async _ensureWorkflowIndexes(db) {
        try {
            await db.createIndex({
                index: { fields: ['universityId', 'docType', 'overallStatus'] },
                name: 'idx-uni-doctype-status'
            });
            await db.createIndex({
                index: { fields: ['universityId', 'docType'] },
                name: 'idx-uni-doctype'
            });
            await db.createIndex({
                index: { fields: ['degreeId'] },
                name: 'idx-degreeId'
            });
            console.log('✅ degree_workflows indexes created');
        } catch (err) {
            console.error('Index creation warning:', err.message);
        }
    }

    /**
     * Create approval workflow for uploaded degree
     */
    async createApprovalWorkflow(degreeData, universityId) {
        try {
            // Get university and its approval roles
            const universityDb = this.couchdb.use('university_users');
            const university = await universityDb.get(universityId);

            if (!university.approvalRoles || university.approvalRoles.length === 0) {
                throw new Error('No approval roles configured for this university');
            }

            // Sort roles by approval order
            const sortedRoles = university.approvalRoles
                .filter(r => r.isActive)
                .sort((a, b) => a.approvalOrder - b.approvalOrder);

            // Create workflow steps
            const approvalWorkflow = sortedRoles.map((role, index) => ({
                roleId: role.roleId,
                roleName: role.roleName,
                approverName: role.holderName,
                approverEmail: role.holderEmail,
                status: index === 0 ? 'pending' : 'waiting', // First one is pending, rest waiting
                approvedAt: null,
                rejectedAt: null,
                rejectionReason: null,
                signaturePosition: degreeData.signaturePositions ? 
                    degreeData.signaturePositions[role.roleId] || null : null,
                approvalOrder: role.approvalOrder
            }));

            // Create degree document with workflow
            const degreeId = `DEG_WORKFLOW_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            const degreeDocument = {
                _id: degreeId,
                degreeId: degreeId,
                docType: 'degree_with_workflow',
                
                // Student information
                studentRollNumber: degreeData.rollNumber,
                studentName: degreeData.studentName,
                cnic: degreeData.cnic || '',
                fatherName: degreeData.fatherName || '',
                degreeProgram: degreeData.degreeProgram,
                department: degreeData.department || '',
                cgpa: degreeData.cgpa || '',
                session: degreeData.session || '',
                graduationDate: degreeData.graduationDate || '',
                
                // University information
                universityId: universityId,
                universityName: university.name,
                
                // PDF information
                originalPdfPath: degreeData.pdfPath,
                originalPdfUrl: degreeData.pdfUrl,
                currentPdfPath: degreeData.pdfPath, // Will be updated as signatures are added
                currentPdfUrl: degreeData.pdfUrl,
                pdfFileName: degreeData.pdfFileName || '',
                
                // Workflow status
                overallStatus: 'pending_approval', // pending_approval, approved, rejected, on_blockchain
                currentApprovalStep: 1,
                totalApprovalSteps: sortedRoles.length,
                approvalWorkflow: approvalWorkflow,
                
                // Signature positions (coordinates on PDF)
                signaturePositions: degreeData.signaturePositions || {},
                
                // Metadata
                uploadedBy: degreeData.uploadedBy,
                uploadedAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
                submittedToBlockchain: false,
                blockchainTransactionId: null
            };

            // Save to database - use a dedicated degrees workflow database
            const dbName = 'degree_workflows';
            let db;
            try {
                db = this.couchdb.use(dbName);
                await db.info(); // Check if DB exists
            } catch (dbErr) {
                // Create the database if it doesn't exist
                console.log(`Creating database: ${dbName}`);
                await this.couchdb.db.create(dbName);
                db = this.couchdb.use(dbName);
                // Create indexes for queries
                await this._ensureWorkflowIndexes(db);
            }
            await db.insert(degreeDocument);

            // Send notification to first approver
            await this.sendApprovalNotification(approvalWorkflow[0], degreeDocument);

            return {
                success: true,
                degreeId: degreeId,
                workflow: approvalWorkflow
            };
        } catch (error) {
            console.error('Error creating approval workflow:', error);
            throw error;
        }
    }

    /**
     * Process approval action
     */
    async processApproval(degreeId, approverEmail, action, rejectionReason = null) {
        try {
            // action can be 'approve' or 'reject'
            
            // Get degree document
            const degree = await this.getDegreeDocument(degreeId);

            // Find current approval step
            const currentStep = degree.approvalWorkflow.find(step => 
                step.status === 'pending' && step.approverEmail === approverEmail
            );

            if (!currentStep) {
                throw new Error('No pending approval found for this approver');
            }

            if (action === 'approve') {
                // Mark as approved
                currentStep.status = 'approved';
                currentStep.approvedAt = new Date().toISOString();

                // Add signature to PDF
                await this.addSignatureToDegree(degree, currentStep);

                // Check if there are more steps
                const nextStep = degree.approvalWorkflow.find(step => step.status === 'waiting');
                
                if (nextStep) {
                    // Move to next approver
                    nextStep.status = 'pending';
                    degree.currentApprovalStep++;
                    
                    // Send notification to next approver
                    await this.sendApprovalNotification(nextStep, degree);
                } else {
                    // All approved!
                    degree.overallStatus = 'approved';
                    degree.currentApprovalStep = degree.totalApprovalSteps;
                    
                    // Notify university admin
                    await this.sendFullyApprovedNotification(degree);
                }
            } else if (action === 'reject') {
                // Mark as rejected
                currentStep.status = 'rejected';
                currentStep.rejectedAt = new Date().toISOString();
                currentStep.rejectionReason = rejectionReason;
                
                degree.overallStatus = 'rejected';
                
                // Notify university admin
                await this.sendRejectionNotification(degree, currentStep);
            }

            degree.lastUpdatedAt = new Date().toISOString();

            // Update degree document
            await this.updateDegreeDocument(degree);

            return {
                success: true,
                status: degree.overallStatus,
                currentStep: degree.currentApprovalStep
            };
        } catch (error) {
            console.error('Error processing approval:', error);
            throw error;
        }
    }

    /**
     * Get pending approvals for a specific approver
     */
    async getPendingApprovals(approverEmail) {
        try {
            // Search in degree_workflows database
            const allDbs = ['degree_workflows'];

            let pendingDegrees = [];

            for (const dbName of allDbs) {
                try {
                    const db = this.couchdb.use(dbName);
                    
                    const queryString = {
                        selector: {
                            docType: 'degree_with_workflow',
                            overallStatus: 'pending_approval',
                            approvalWorkflow: {
                                $elemMatch: {
                                    approverEmail: approverEmail,
                                    status: 'pending'
                                }
                            }
                        }
                    };

                    const result = await db.find(queryString);
                    
                    if (result.docs.length > 0) {
                        pendingDegrees = pendingDegrees.concat(result.docs);
                    }
                } catch (dbError) {
                    console.error(`Error querying database ${dbName}:`, dbError);
                }
            }

            return {
                success: true,
                count: pendingDegrees.length,
                degrees: pendingDegrees
            };
        } catch (error) {
            console.error('Error getting pending approvals:', error);
            throw error;
        }
    }

    /**
     * Get approved degrees (ready for blockchain submission)
     */
    async getApprovedDegrees(universityId) {
        try {
            const dbName = 'degree_workflows';
            const db = this.couchdb.use(dbName);

            const queryString = {
                selector: {
                    docType: 'degree_with_workflow',
                    overallStatus: 'approved',
                    submittedToBlockchain: false
                }
            };

            const result = await db.find(queryString);

            return {
                success: true,
                count: result.docs.length,
                degrees: result.docs
            };
        } catch (error) {
            console.error('Error getting approved degrees:', error);
            throw error;
        }
    }

    /**
     * Mark degree as submitted to blockchain
     */
    async markAsSubmittedToBlockchain(degreeId, transactionId) {
        try {
            const degree = await this.getDegreeDocument(degreeId);
            
            degree.submittedToBlockchain = true;
            degree.blockchainTransactionId = transactionId;
            degree.overallStatus = 'on_blockchain';
            degree.submittedToBlockchainAt = new Date().toISOString();
            degree.lastUpdatedAt = new Date().toISOString();

            await this.updateDegreeDocument(degree);

            return {
                success: true,
                message: 'Degree marked as submitted to blockchain'
            };
        } catch (error) {
            console.error('Error marking as submitted:', error);
            throw error;
        }
    }

    /**
     * Helper: Get degree document
     */
    async getDegreeDocument(degreeId) {
        try {
            // Search in degree_workflows database
            const allDbs = ['degree_workflows'];

            for (const dbName of allDbs) {
                try {
                    const db = this.couchdb.use(dbName);
                    const degree = await db.get(degreeId);
                    if (degree) {
                        degree._dbName = dbName; // Store db name for updates
                        return degree;
                    }
                } catch (err) {
                    // Document not in this database, continue
                    continue;
                }
            }

            throw new Error('Degree document not found');
        } catch (error) {
            throw error;
        }
    }

    /**
     * Helper: Update degree document
     */
    async updateDegreeDocument(degree) {
        try {
            const dbName = degree._dbName;
            delete degree._dbName; // Remove temporary field

            const db = this.couchdb.use(dbName);
            await db.insert(degree);

            return true;
        } catch (error) {
            console.error('Error updating degree document:', error);
            throw error;
        }
    }

    /**
     * Helper: Add signature to degree PDF
     * Signature is auto-placed at the designated position on the degree
     * (detected from PDF text labels like "Vice Chancellor", "Registrar", etc.)
     */
    async addSignatureToDegree(degree, approvalStep) {
        try {
            // This will call the PDF signature service
            const pdfSignatureService = require('./pdfSignature.service');
            
            // Auto-detect signature position from the PDF text labels.
            // The degree already has designated spots for each role's signature
            // (e.g. "Vice Chancellor", "Registrar", "Controller of Examinations").
            // No manual position needed — the system finds the correct spot automatically.
            const result = await pdfSignatureService.addSignatureToPdf(
                degree.currentPdfPath,
                approvalStep,
                null  // null position = auto-detect from PDF text labels
            );

            if (result.success) {
                degree.currentPdfPath = result.newPdfPath;
                degree.currentPdfUrl = result.newPdfUrl;
            }

            return result;
        } catch (error) {
            console.error('Error adding signature to degree:', error);
            // Don't throw error, just log it - approval can still proceed
            return { success: false, error: error.message };
        }
    }

    /**
     * Helper: Send notification to approver
     */
    async sendApprovalNotification(approvalStep, degree) {
        try {
            // TODO: Implement email notification
            console.log(`
                Notification: Degree pending approval
                To: ${approvalStep.approverEmail}
                Role: ${approvalStep.roleName}
                Student: ${degree.studentName}
                Roll No: ${degree.studentRollNumber}
            `);

            // You can integrate with your email service here
            // const emailService = require('../config/email');
            // await emailService.sendApprovalNotification(approvalStep, degree);

            return true;
        } catch (error) {
            console.error('Error sending notification:', error);
            return false;
        }
    }

    /**
     * Helper: Send rejection notification
     */
    async sendRejectionNotification(degree, rejectedStep) {
        try {
            console.log(`
                Notification: Degree rejected
                By: ${rejectedStep.roleName} - ${rejectedStep.approverName}
                Student: ${degree.studentName}
                Reason: ${rejectedStep.rejectionReason}
            `);
            return true;
        } catch (error) {
            console.error('Error sending rejection notification:', error);
            return false;
        }
    }

    /**
     * Helper: Send fully approved notification
     */
    async sendFullyApprovedNotification(degree) {
        try {
            console.log(`
                Notification: Degree fully approved
                Student: ${degree.studentName}
                All approvals completed. Ready for blockchain submission.
            `);
            return true;
        } catch (error) {
            console.error('Error sending approved notification:', error);
            return false;
        }
    }

    // ============== HEC VERIFICATION PIPELINE ==============

    /**
     * Run HEC verification after all approvers have signed
     * 1. Store degree on ledger (verified_degrees_ledger)
     * 2. Generate QR code with transaction ID
     * 3. Add QR code to the signed PDF
     * 4. Save final verified PDF
     */
    async runHECVerification(degree, universityId) {
        try {
            const degreeVerificationService = require('./degreeVerification.service');
            const ledgerService = require('./ledger.service');

            // Initialize services if needed
            try {
                await degreeVerificationService.initialize();
            } catch (initErr) {
                // May already be initialized
            }

            // Get university info for ledger
            const universityDb = this.couchdb.use('university_users');
            const university = await universityDb.get(universityId);

            // 1. Store degree on the ledger
            console.log('📋 Step 1: Storing degree on HEC ledger...');
            const ledgerData = {
                studentId: degree.studentRollNumber || degree.degreeId,
                studentName: degree.studentName || '',
                rollNumber: degree.studentRollNumber || '',
                cnic: degree.cnic || '',
                email: '',
                fatherName: degree.fatherName || '',
                degreeTitle: degree.degreeProgram || '',
                department: degree.department || '',
                faculty: '',
                session: degree.session || '',
                enrollmentDate: '',
                graduationDate: degree.graduationDate || '',
                cgpa: degree.cgpa || '',
                universityId: universityId,
                universityName: university.name || university.universityName || '',
                universityRegistrationNumber: university.registrationNumber || '',
                verifiedBy: 'HEC_SYSTEM',
                ipfsHash: '',
                ipfsGateway: '',
                qrCodeData: null,
                verifiedPdfPath: null
            };

            const ledgerResult = await ledgerService.storeDegree(ledgerData);
            console.log(`✅ Stored on ledger. TxnID: ${ledgerResult.transactionId}, Hash: ${ledgerResult.degreeHash}`);

            // 2. Generate QR code
            console.log('📋 Step 2: Generating QR code...');
            const qrCode = await degreeVerificationService.generateQRCode({
                transactionId: ledgerResult.transactionId,
                degreeHash: ledgerResult.degreeHash,
                studentName: degree.studentName || '',
                rollNumber: degree.studentRollNumber || '',
                universityName: university.name || university.universityName || ''
            });

            // 3. Add QR code to the signed PDF
            console.log('📋 Step 3: Adding QR code to signed PDF...');
            const pdfPath = degree.currentPdfPath || degree.originalPdfPath;

            if (!pdfPath) {
                throw new Error('No PDF path available for QR code addition');
            }

            const modifiedPdfBuffer = await degreeVerificationService.addQRCodeToPDF(
                pdfPath,
                qrCode,
                { transactionId: ledgerResult.transactionId }
            );

            // 4. Save the final verified PDF
            const uploadsDir = path.join(__dirname, '../uploads/degrees/verified');
            await fsPromises.mkdir(uploadsDir, { recursive: true });

            const verifiedFileName = `verified_${degree.degreeId}_${Date.now()}.pdf`;
            const verifiedPdfPath = path.join(uploadsDir, verifiedFileName);
            await fsPromises.writeFile(verifiedPdfPath, modifiedPdfBuffer);
            console.log(`✅ Verified PDF saved: ${verifiedPdfPath}`);

            // 5. Update ledger entry with the verified PDF path
            try {
                const ledgerDb = require('nano')(this.couchdb.config.url).use('verified_degrees_ledger');
                const ledgerDoc = await ledgerDb.get(ledgerResult.ledgerId);
                ledgerDoc.verifiedPdfPath = verifiedPdfPath;
                ledgerDoc.qrCodeData = qrCode.data;
                await ledgerDb.insert(ledgerDoc);
            } catch (updateErr) {
                console.error('Could not update ledger with PDF path:', updateErr.message);
            }

            return {
                success: true,
                transactionId: ledgerResult.transactionId,
                degreeHash: ledgerResult.degreeHash,
                verifiedPdfPath: verifiedPdfPath,
                qrCodeData: qrCode.data
            };

        } catch (error) {
            console.error('HEC verification pipeline error:', error);
            throw error;
        }
    }

    // ============== APPROVER PORTAL METHODS ==============

    /**
     * Get pending approvals for a specific role (used by approver portal)
     */
    async getPendingApprovalsForRole(universityId, roleId) {
        try {
            const dbName = 'degree_workflows';
            let db;
            try {
                db = this.couchdb.use(dbName);
                await db.info();
            } catch (err) {
                // Database might not exist yet
                return { success: true, degrees: [], count: 0 };
            }

            const query = {
                selector: {
                    docType: 'degree_with_workflow',
                    overallStatus: 'pending_approval',
                    approvalWorkflow: {
                        $elemMatch: {
                            roleId: roleId,
                            status: 'pending'
                        }
                    }
                },
                limit: 200
            };

            const result = await db.find(query);

            const degrees = result.docs.map(degree => {
                const myStep = degree.approvalWorkflow.find(
                    step => step.roleId === roleId && step.status === 'pending'
                );
                return {
                    degreeId: degree.degreeId || degree._id,
                    studentName: degree.studentName,
                    studentRollNumber: degree.studentRollNumber,
                    degreeProgram: degree.degreeProgram,
                    department: degree.department || '',
                    cgpa: degree.cgpa || '',
                    session: degree.session || '',
                    graduationDate: degree.graduationDate || '',
                    currentApprovalStep: degree.currentApprovalStep,
                    totalApprovalSteps: degree.totalApprovalSteps,
                    currentPdfUrl: degree.currentPdfUrl,
                    uploadedAt: degree.uploadedAt,
                    approvalWorkflow: myStep ? [myStep] : []
                };
            });

            return {
                success: true,
                degrees: degrees,
                count: degrees.length
            };
        } catch (error) {
            console.error('Error getting pending approvals for role:', error);
            throw error;
        }
    }

    /**
     * Get approved degrees for a specific role (history)
     */
    async getApprovedDegreesForRole(universityId, roleId) {
        try {
            const dbName = 'degree_workflows';
            let db;
            try {
                db = this.couchdb.use(dbName);
                await db.info();
            } catch (err) {
                return { success: true, degrees: [], count: 0 };
            }

            const query = {
                selector: {
                    docType: 'degree_with_workflow',
                    approvalWorkflow: {
                        $elemMatch: {
                            roleId: roleId,
                            status: 'approved'
                        }
                    }
                },
                limit: 200
            };

            const result = await db.find(query);

            const degrees = result.docs.map(degree => {
                const myStep = degree.approvalWorkflow.find(
                    step => step.roleId === roleId && step.status === 'approved'
                );
                return {
                    degreeId: degree.degreeId || degree._id,
                    studentName: degree.studentName,
                    studentRollNumber: degree.studentRollNumber,
                    degreeProgram: degree.degreeProgram,
                    department: degree.department || '',
                    cgpa: degree.cgpa || '',
                    session: degree.session || '',
                    graduationDate: degree.graduationDate || '',
                    overallStatus: degree.overallStatus,
                    currentPdfUrl: degree.currentPdfUrl,
                    approvedAt: myStep?.approvedAt || '',
                    approvalStatus: 'approved'
                };
            });

            return {
                success: true,
                degrees: degrees,
                count: degrees.length
            };
        } catch (error) {
            console.error('Error getting approved degrees for role:', error);
            throw error;
        }
    }

    /**
     * Search degrees for a specific role
     */
    async searchDegreesForRole(universityId, roleId, searchTerm) {
        try {
            const dbName = 'degree_workflows';
            let db;
            try {
                db = this.couchdb.use(dbName);
                await db.info();
            } catch (err) {
                return { success: true, degrees: [], count: 0 };
            }

            // Search by student name or roll number
            const query = {
                selector: {
                    docType: 'degree_with_workflow',
                    approvalWorkflow: {
                        $elemMatch: {
                            roleId: roleId
                        }
                    },
                    $or: [
                        { studentName: { $regex: `(?i)${searchTerm}` } },
                        { studentRollNumber: { $regex: `(?i)${searchTerm}` } }
                    ]
                },
                limit: 100
            };

            const result = await db.find(query);

            const degrees = result.docs.map(degree => {
                const myStep = degree.approvalWorkflow.find(
                    step => step.roleId === roleId
                );
                return {
                    degreeId: degree.degreeId || degree._id,
                    studentName: degree.studentName,
                    studentRollNumber: degree.studentRollNumber,
                    degreeProgram: degree.degreeProgram,
                    department: degree.department || '',
                    cgpa: degree.cgpa || '',
                    session: degree.session || '',
                    graduationDate: degree.graduationDate || '',
                    overallStatus: degree.overallStatus,
                    currentApprovalStep: degree.currentApprovalStep,
                    totalApprovalSteps: degree.totalApprovalSteps,
                    currentPdfUrl: degree.currentPdfUrl,
                    approvalStatus: myStep?.status || 'unknown',
                    approvedAt: myStep?.approvedAt || null,
                    approvalWorkflow: myStep ? [myStep] : []
                };
            });

            return {
                success: true,
                degrees: degrees,
                count: degrees.length
            };
        } catch (error) {
            console.error('Error searching degrees for role:', error);
            throw error;
        }
    }

    /**
     * Approve a step for a specific role (used by approver portal)
     * @param {string} degreeId
     * @param {string} universityId
     * @param {string} roleId
     */
    async approveStep(degreeId, universityId, roleId) {
        try {
            const dbName = 'degree_workflows';
            const db = this.couchdb.use(dbName);

            const degree = await db.get(degreeId);

            // Find the step for this role
            const stepIndex = degree.approvalWorkflow.findIndex(
                step => step.roleId === roleId && step.status === 'pending'
            );

            if (stepIndex === -1) {
                throw new Error('No pending approval found for your role');
            }

            // Get the approver's signature from university doc
            const universityDb = this.couchdb.use('university_users');
            const university = await universityDb.get(universityId);
            const role = university.approvalRoles?.find(r => r.roleId === roleId);

            if (!role || !role.signature) {
                throw new Error('Please add your signature before approving degrees. Go to Profile & Signature section.');
            }

            // Mark step as approved
            degree.approvalWorkflow[stepIndex].status = 'approved';
            degree.approvalWorkflow[stepIndex].approvedAt = new Date().toISOString();

            // Try to add signature to PDF
            try {
                await this.addSignatureToDegree(degree, degree.approvalWorkflow[stepIndex]);
            } catch (sigErr) {
                console.error('Signature addition to PDF failed (non-blocking):', sigErr.message);
            }

            // Check if there are more steps
            const nextStep = degree.approvalWorkflow.find(step => step.status === 'waiting');

            if (nextStep) {
                // Move to next approver
                nextStep.status = 'pending';
                degree.currentApprovalStep++;
                await this.sendApprovalNotification(nextStep, degree);
            } else {
                // All approved — Wait for HEC Verification
                console.log(`✅ All approvers have signed degree ${degreeId}. Waiting for HEC verification...`);
                degree.overallStatus = 'approved';
                degree.currentApprovalStep = degree.totalApprovalSteps;

                await this.sendFullyApprovedNotification(degree);
            }

            degree.lastUpdatedAt = new Date().toISOString();
            await db.insert(degree);

            return {
                success: true,
                message: 'Degree approved successfully. Your signature has been added.',
                status: degree.overallStatus,
                currentStep: degree.currentApprovalStep
            };
        } catch (error) {
            console.error('Error in approveStep:', error);
            throw error;
        }
    }

    /**
     * Reject a step for a specific role (used by approver portal)
     */
    async rejectStep(degreeId, universityId, roleId, reason) {
        try {
            const dbName = 'degree_workflows';
            const db = this.couchdb.use(dbName);

            const degree = await db.get(degreeId);

            // Find the step for this role
            const stepIndex = degree.approvalWorkflow.findIndex(
                step => step.roleId === roleId && step.status === 'pending'
            );

            if (stepIndex === -1) {
                throw new Error('No pending approval found for your role');
            }

            // Mark step as rejected
            degree.approvalWorkflow[stepIndex].status = 'rejected';
            degree.approvalWorkflow[stepIndex].rejectedAt = new Date().toISOString();
            degree.approvalWorkflow[stepIndex].rejectionReason = reason;

            degree.overallStatus = 'rejected';
            degree.lastUpdatedAt = new Date().toISOString();

            await db.insert(degree);

            await this.sendRejectionNotification(degree, degree.approvalWorkflow[stepIndex]);

            return {
                success: true,
                message: 'Degree rejected.',
                status: degree.overallStatus
            };
        } catch (error) {
            console.error('Error in rejectStep:', error);
            throw error;
        }
    }
}

module.exports = new ApprovalWorkflowService();
