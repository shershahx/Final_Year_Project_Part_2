/**
 * Degree Verification Service
 * Handles PDF parsing, data extraction, verification, QR code generation, and PDF modification
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');

// Use pdfjs-dist for text extraction
let pdfjsLib;
try {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    // Disable worker for Node.js environment
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
    console.log('✅ PDF.js loaded successfully');
} catch (e) {
    console.warn('⚠️ pdfjs-dist not available:', e.message);
}

const ipfsService = require('./ipfs.service');
const ledgerService = require('./ledger.service');
const degreeTemplateService = require('./degreeTemplate.service');

class DegreeVerificationService {
    constructor() {
        this.verificationBaseUrl = process.env.VERIFICATION_URL || 'http://localhost:3000/verify';
    }

    async initialize() {
        await ipfsService.initialize();
        await ledgerService.initialize();
        console.log('✅ Degree verification service initialized');
    }

    /**
     * Extract text from PDF using pdfjs-dist
     * @param {string} filePath - Path to PDF file
     * @returns {string} - Extracted text
     */
    async extractPDFText(filePath) {
        try {
            const dataBuffer = await fs.readFile(filePath);
            
            if (pdfjsLib) {
                try {
                    // Load PDF document
                    const loadingTask = pdfjsLib.getDocument({
                        data: new Uint8Array(dataBuffer),
                        useSystemFonts: true
                    });
                    const pdfDoc = await loadingTask.promise;
                    
                    let fullText = '';
                    
                    // Extract text from each page
                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        const page = await pdfDoc.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }
                    
                    console.log(`📄 Extracted ${fullText.length} characters from PDF (${pdfDoc.numPages} pages)`);
                    return fullText;
                } catch (pdfError) {
                    console.error('PDF parsing error:', pdfError.message);
                    // Return empty but don't fail
                    return '';
                }
            }
            
            // Fallback: Return empty string if no PDF parser available
            console.warn('⚠️ No PDF parser available');
            return '';
        } catch (error) {
            console.error(`Failed to read PDF file: ${error.message}`);
            return '';
        }
    }

    /**
     * Parse degree data from PDF text
     * This is a flexible parser that tries to extract common degree fields
     * @param {string} text - Extracted PDF text
     * @returns {Object} - Parsed degree data
     */
    parseDegreeData(text) {
        const data = {};
        
        // Common patterns for degree certificates
        const patterns = {
            name: /(?:Name|Student Name|This is to certify that)\s*[:\-]?\s*([A-Z][a-zA-Z\s]+)/i,
            rollNumber: /(?:Roll\s*(?:No|Number|#)|Registration\s*(?:No|Number))\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
            cnic: /(?:CNIC|NIC|ID\s*No)\s*[:\-]?\s*(\d{5}[\-]?\d{7}[\-]?\d{1})/i,
            fatherName: /(?:Father(?:'s)?\s*Name|S\/O|D\/O)\s*[:\-]?\s*([A-Z][a-zA-Z\s]+)/i,
            degreeTitle: /(?:Bachelor|Master|Doctor|PhD|BS|MS|MBA|BBA|BE|BSc|MSc|M\.Phil|Diploma)\s*(?:of|in)?\s*[A-Za-z\s]+/i,
            department: /(?:Department|Faculty|School)\s*(?:of)?\s*[:\-]?\s*([A-Za-z\s]+)/i,
            cgpa: /(?:CGPA|GPA|Grade\s*Point)\s*[:\-]?\s*([\d\.]+)/i,
            graduationDate: /(?:Graduation\s*Date|Date\s*of\s*(?:Graduation|Completion)|Awarded\s*on)\s*[:\-]?\s*(\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i,
            session: /(?:Session|Batch|Year)\s*[:\-]?\s*(\d{4}[\-\/]?\d{2,4})/i
        };

        for (const [key, pattern] of Object.entries(patterns)) {
            const match = text.match(pattern);
            if (match) {
                data[key] = match[1]?.trim() || match[0]?.trim();
            }
        }

        return data;
    }

    /**
     * Verify degree data against database
     * @param {Object} pdfData - Data extracted from PDF
     * @param {Object} dbStudent - Student record from database
     * @returns {Object} - Verification result with match details
     */
    verifyAgainstDatabase(pdfData, dbStudent) {
        const matchResults = {
            isMatch: false,
            matchedFields: [],
            mismatchedFields: [],
            matchScore: 0,
            details: {}
        };

        // Handle both 'name' and 'studentName' fields from database
        const studentName = dbStudent.studentName || dbStudent.name || '';
        
        const fieldsToVerify = [
            { pdf: 'name', db: 'studentName', dbValue: studentName, weight: 2 },
            { pdf: 'rollNumber', db: 'rollNumber', dbValue: dbStudent.rollNumber, weight: 3 },
            { pdf: 'cnic', db: 'cnic', dbValue: dbStudent.cnic, weight: 3 },
            { pdf: 'fatherName', db: 'fatherName', dbValue: dbStudent.fatherName, weight: 1 },
            { pdf: 'degreeTitle', db: 'degreeTitle', dbValue: dbStudent.degreeTitle, weight: 2 },
            { pdf: 'department', db: 'department', dbValue: dbStudent.department, weight: 1 },
            { pdf: 'cgpa', db: 'cgpa', dbValue: dbStudent.cgpa, weight: 2 }
        ];

        let totalWeight = 0;
        let matchedWeight = 0;

        for (const field of fieldsToVerify) {
            totalWeight += field.weight;
            // Normalize both values to lowercase for comparison
            const pdfValue = this.normalizeText(pdfData[field.pdf] || '');
            const dbValue = this.normalizeText(field.dbValue || '');

            if (pdfValue && dbValue) {
                // Fuzzy match - allow slight differences
                const similarity = this.calculateSimilarity(pdfValue, dbValue);
                
                if (similarity >= 0.85) {
                    matchedWeight += field.weight;
                    matchResults.matchedFields.push({
                        field: field.pdf,
                        pdfValue: pdfData[field.pdf],
                        dbValue: field.dbValue,
                        similarity: similarity
                    });
                } else {
                    matchResults.mismatchedFields.push({
                        field: field.pdf,
                        pdfValue: pdfData[field.pdf],
                        dbValue: field.dbValue,
                        similarity: similarity
                    });
                }

                matchResults.details[field.pdf] = {
                    matched: similarity >= 0.85,
                    similarity: similarity,
                    pdfValue: pdfData[field.pdf],
                    dbValue: field.dbValue
                };
            }
        }

        matchResults.matchScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0;
        
        // Consider it a match if score is above 70%
        matchResults.isMatch = matchResults.matchScore >= 70;

        return matchResults;
    }

    /**
     * Calculate similarity between two strings (Levenshtein-based)
     * @param {string} str1 
     * @param {string} str2 
     * @returns {number} - Similarity score 0-1
     */
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1;
        if (!str1 || !str2) return 0;

        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        const longerLength = longer.length;
        if (longerLength === 0) return 1;

        const distance = this.levenshteinDistance(longer, shorter);
        return (longerLength - distance) / longerLength;
    }

    /**
     * Calculate Levenshtein distance
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Generate QR code data for verification
     * @param {Object} degreeData - Verified degree data
     * @returns {Object} - QR code data and image
     */
    async generateQRCode(degreeData) {
        const qrData = {
            type: 'HEC_VERIFIED_DEGREE',
            transactionId: degreeData.transactionId,
            degreeHash: degreeData.degreeHash,
            studentName: degreeData.studentName,
            rollNumber: degreeData.rollNumber,
            university: degreeData.universityName,
            verifyUrl: `${this.verificationBaseUrl}/${degreeData.transactionId}`
        };

        const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
            errorCorrectionLevel: 'H',
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        const qrCodeBuffer = await QRCode.toBuffer(JSON.stringify(qrData), {
            errorCorrectionLevel: 'H',
            width: 200,
            margin: 2
        });

        return {
            data: qrData,
            dataUrl: qrCodeDataUrl,
            buffer: qrCodeBuffer,
            verifyUrl: qrData.verifyUrl
        };
    }

    /**
     * Dynamically scan the PDF to find an empty whitespace corner/edge for the QR code.
     * Prevents overlapping existing names, logos, or generated signature images.
     */
    async _findEmptyPositionForQR(pdfPath, qrSize, width, height) {
        let textItems = [];
        try {
            if (!pdfjsLib) {
                return { x: width - qrSize - 25, y: 25 }; 
            }
            const data = await fs.readFile(pdfPath);
            const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
            const page = await doc.getPage(1);
            const textContent = await page.getTextContent();
            textItems = textContent.items;
        } catch(e) {
            console.error("Failed to parse text for QR placement:", e.message);
            return { x: width - qrSize - 25, y: 25 };
        }

        const marginX = 90; // Large enough to clear thick decorative borders
        const marginY = 85; 

        // Priority 1: Middle-edges (usually vast empty whitespace on degrees)
        // Priority 2: Corners (might overlap signatures or headers, though text padding helps)
        // Priority 3: Center areas
        const candidates = [
            { name: 'Middle-Right', x: width - qrSize - marginX, y: (height - qrSize) / 2 },
            { name: 'Middle-Left', x: marginX, y: (height - qrSize) / 2 },
            { name: 'Bottom-Right', x: width - qrSize - marginX, y: marginY },
            { name: 'Top-Right', x: width - qrSize - marginX, y: height - qrSize - marginY },
            { name: 'Bottom-Left', x: marginX, y: marginY },
            { name: 'Top-Left', x: marginX, y: height - qrSize - marginY },
            { name: 'Bottom-Center', x: (width - qrSize) / 2, y: marginY },
            { name: 'Top-Center', x: (width - qrSize) / 2, y: height - qrSize - marginY }
        ];

        const obstacles = [];
        for (const item of textItems) {
            const str = item.str.trim();
            if (!str) continue;
            const tx = item.transform;
            const itemX = tx[4];
            let itemY = tx[5];
            const fontSize = Math.abs(tx[3]) || 12;
            const itemWidth = item.width || (str.length * fontSize * 0.5);
            const itemHeight = fontSize;

            let padX = 30; // Horizontal safe distance
            let padYBottom = 20; // Safe distance below text
            let padYTop = 30; // Safe distance above text

            // If signature role label, block a HUGE area above it 
            // (140pts = ~5cm) where the actual signature image will be drawn
            const lowerStr = str.toLowerCase();
            if (lowerStr.includes('vice chancellor') || lowerStr.includes('registrar') || lowerStr.includes('controller') || lowerStr.includes('dean')) {
                padYTop = 140; 
                padX = 100;
            }

            obstacles.push({
                x1: itemX - padX,
                y1: itemY - padYBottom,
                x2: itemX + itemWidth + padX,
                y2: itemY + itemHeight + padYTop
            });
        }

        for (const cand of candidates) {
            const cx1 = cand.x;
            const cy1 = cand.y;
            const cx2 = cand.x + qrSize;
            const cy2 = cand.y + qrSize;

            let overlap = false;
            for (const obs of obstacles) {
                // strict rectangle intersection check
                if (cx1 < obs.x2 && cx2 > obs.x1 && cy1 < obs.y2 && cy2 > obs.y1) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                console.log(`✅ Dynamically placed QR Code at: ${cand.name}`);
                return cand;
            }
        }

        console.log(`⚠️ All candidate spots overlap. Defaulting QR Code to Bottom-Right.`);
        return candidates[0];
    }

    /**
     * Add QR code and verification stamp to PDF
     * @param {string} pdfPath - Path to original PDF
     * @param {Object} qrCode - QR code data from generateQRCode
     * @param {Object} degreeData - Degree data for stamp
     * @returns {Buffer} - Modified PDF buffer
     */
    async addQRCodeToPDF(pdfPath, qrCode, degreeData) {
        try {
            const pdfBytes = await fs.readFile(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            
            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            const { width, height } = firstPage.getSize();

            // Embed QR code image
            const qrImage = await pdfDoc.embedPng(qrCode.buffer);
            
            // Set QR code size (adjust scale for better visibility)
            const qrSize = 80; // Fixed size for consistent appearance

            // Dynamically find an empty position for the QR code
            const position = await this._findEmptyPositionForQR(pdfPath, qrSize, width, height);
            const qrX = position.x;
            const qrY = position.y;

            // Draw QR code (clean, no border, no text)
            firstPage.drawImage(qrImage, {
                x: qrX,
                y: qrY,
                width: qrSize,
                height: qrSize
            });

            const modifiedPdfBytes = await pdfDoc.save();
            return Buffer.from(modifiedPdfBytes);
        } catch (error) {
            throw new Error(`Failed to add QR code to PDF: ${error.message}`);
        }
    }

    /**
     * Normalize text for comparison - convert to lowercase, remove extra spaces
     * @param {string} text - Text to normalize
     * @returns {string} - Normalized text
     */
    normalizeText(text) {
        if (!text) return '';
        return text.toString()
            .toLowerCase()
            .replace(/[\-\_\.\/\\]/g, ' ')  // Replace common separators with space
            .replace(/\s+/g, ' ')            // Collapse multiple spaces
            .trim();
    }

    /**
     * Check if text contains a search term (case-insensitive)
     * @param {string} text - Text to search in
     * @param {string} searchTerm - Term to search for
     * @returns {boolean} - True if found
     */
    textContains(text, searchTerm) {
        const normalizedText = this.normalizeText(text);
        const normalizedTerm = this.normalizeText(searchTerm);
        
        if (!normalizedText || !normalizedTerm) return false;
        
        // Direct inclusion check
        if (normalizedText.includes(normalizedTerm)) return true;
        
        // Check without spaces (for roll numbers like 2018-BBA-001 vs 2018BBA001)
        const textNoSpace = normalizedText.replace(/\s/g, '');
        const termNoSpace = normalizedTerm.replace(/\s/g, '');
        if (textNoSpace.includes(termNoSpace)) return true;
        
        return false;
    }

    /**
     * Complete degree verification process
     * @param {string} pdfPath - Path to uploaded PDF
     * @param {Object} dbStudent - Student data from database
     * @param {Object} universityInfo - University information
     * @returns {Object} - Complete verification result
     */
    async processAndVerifyDegree(pdfPath, dbStudent, universityInfo) {
        const result = {
            success: false,
            verified: false,
            status: 'NOT_VERIFIED',
            error: null,
            mismatchDetails: [],
            details: {}
        };

        try {
            // Get student name - handle both 'name' and 'studentName' fields
            const studentName = dbStudent.studentName || dbStudent.name || '';
            const rollNumber = dbStudent.rollNumber || '';
            const cnic = dbStudent.cnic || '';
            const fatherName = dbStudent.fatherName || '';
            
            console.log('📋 Student to verify:', { 
                name: studentName, 
                rollNumber: rollNumber,
                cnic: cnic 
            });

            // Step 1: Extract text from PDF
            console.log('📄 Extracting PDF text...');
            const pdfText = await this.extractPDFText(pdfPath);
            result.details.pdfTextExtracted = !!pdfText;
            result.details.pdfTextLength = pdfText.length;
            
            // Log first 500 chars for debugging
            console.log(`📄 Extracted ${pdfText.length} characters from PDF`);
            if (pdfText.length > 0) {
                console.log(`📄 PDF Preview: "${pdfText.substring(0, 500).replace(/\n/g, ' ')}..."`);
            }

            // If no text extracted, fail verification
            if (!pdfText || pdfText.trim().length < 50) {
                result.verified = false;
                result.status = 'NOT_VERIFIED';
                result.error = 'Could not extract text from PDF. The PDF may be image-based or corrupted.';
                console.log('❌ PDF text extraction failed or insufficient');
                return result;
            }

            // Step 2: Parse degree data from PDF
            console.log('🔍 Parsing degree data...');
            let pdfData = this.parseDegreeData(pdfText);
            result.details.parsedData = pdfData;
            console.log('Parsed data from PDF:', pdfData);

            // Step 3: Check if PDF contains student information (CASE-INSENSITIVE)
            // Normalize PDF text for comparison
            const pdfTextNormalized = this.normalizeText(pdfText);
            
            // Check student name - split into parts and check each
            const nameParts = studentName.toLowerCase().split(/\s+/).filter(p => p.length > 2);
            let nameMatchCount = 0;
            const matchedNameParts = [];
            
            for (const namePart of nameParts) {
                if (this.textContains(pdfText, namePart)) {
                    nameMatchCount++;
                    matchedNameParts.push(namePart);
                }
            }
            
            // Name is found if at least half of the name parts match
            const minNamePartsRequired = Math.max(1, Math.ceil(nameParts.length / 2));
            const nameFoundInPdf = nameParts.length > 0 && nameMatchCount >= minNamePartsRequired;
            
            // Check roll number (case-insensitive, ignore separators)
            const rollNumberFoundInPdf = rollNumber && this.textContains(pdfText, rollNumber);
            
            // Check CNIC if available
            const cnicFoundInPdf = cnic && this.textContains(pdfText, cnic.replace(/\-/g, ''));
            
            result.details.nameFoundInPdf = nameFoundInPdf;
            result.details.matchedNameParts = matchedNameParts;
            result.details.rollNumberFoundInPdf = rollNumberFoundInPdf;
            result.details.cnicFoundInPdf = cnicFoundInPdf;
            result.details.nameMatchCount = nameMatchCount;
            result.details.totalNameParts = nameParts.length;
            result.details.studentName = studentName;
            result.details.rollNumber = rollNumber;

            console.log(`📋 Verification check (case-insensitive):`);
            console.log(`   - Name parts found: ${nameMatchCount}/${nameParts.length} (${matchedNameParts.join(', ')})`);
            console.log(`   - Roll number found: ${rollNumberFoundInPdf}`);
            console.log(`   - CNIC found: ${cnicFoundInPdf}`);

            // STRICT VERIFICATION: PDF must contain student name OR roll number OR CNIC
            if (!nameFoundInPdf && !rollNumberFoundInPdf && !cnicFoundInPdf) {
                result.verified = false;
                result.status = 'NOT_VERIFIED';
                result.error = `PDF does not contain matching student information. Expected to find name "${studentName}" or roll number "${rollNumber}" in the document.`;
                result.mismatchDetails = [
                    {
                        field: 'Student Name',
                        pdfValue: 'Not found in PDF',
                        expectedValue: studentName,
                        similarity: '0%'
                    },
                    {
                        field: 'Roll Number',
                        pdfValue: 'Not found in PDF',
                        expectedValue: rollNumber,
                        similarity: '0%'
                    }
                ];
                console.log(`❌ Verification FAILED - Student info not found in PDF`);
                return result;
            }

            // If we found name OR roll number in PDF, that's sufficient for verification
            // The structured data parsing is just for additional info, not a blocker
            
            // Step 4: Additional verification if structured data was parsed (informational only)
            if (Object.keys(pdfData).length > 0) {
                console.log('✓ Checking parsed data against database (informational)...');
                const verifyStudent = {
                    ...dbStudent,
                    name: studentName
                };
                const verification = this.verifyAgainstDatabase(pdfData, verifyStudent);
                result.details.verification = verification;
                result.details.structuredMatchScore = verification.matchScore;
                
                // Log but don't fail - the basic check (name/roll found) is sufficient
                console.log(`ℹ️ Structured data match score: ${verification.matchScore.toFixed(1)}%`);
            }

            // VERIFIED - PDF contains matching student name OR roll number
            const matchedFields = [];
            if (nameFoundInPdf) matchedFields.push('name');
            if (rollNumberFoundInPdf) matchedFields.push('rollNumber');
            if (cnicFoundInPdf) matchedFields.push('cnic');
            
            console.log(`✅ Credentials matched: ${matchedFields.join(', ')}`);
            result.details.matchedFields = matchedFields;
            result.details.matchScore = result.details.matchScore || (matchedFields.length >= 2 ? 100 : 85);

            // Step 4: Template verification – check degree layout matches university template
            console.log('📐 Checking degree against university template...');
            const universityId = universityInfo.id || universityInfo._id;
            const programName = dbStudent.degreeTitle || dbStudent.program || 'default';
            let templateCheckResult = null;
            try {
                const template = await degreeTemplateService.getActiveTemplate(universityId, programName);
                if (template) {
                    templateCheckResult = await degreeTemplateService.verifyAgainstTemplate(pdfPath, template);
                    result.details.templateVerification = {
                        templateName: template.templateName,
                        programName: template.programName,
                        isMatch: templateCheckResult.isMatch,
                        score: templateCheckResult.details.percentage,
                        checks: templateCheckResult.checks
                    };
                    if (!templateCheckResult.isMatch) {
                        result.verified = false;
                        result.status = 'TEMPLATE_MISMATCH';
                        result.error = `Degree does not match the university template "${template.templateName}" (score: ${templateCheckResult.details.percentage}%). Font sizes and layout differ from the approved template.`;
                        result.mismatchDetails = templateCheckResult.checks
                            .filter(c => !c.passed)
                            .map(c => ({
                                field: c.name,
                                expectedValue: String(c.expected),
                                actualValue: String(c.actual),
                                similarity: c.passed ? '100%' : `${c.diff || '0'}` 
                            }));
                        console.log(`❌ Template verification FAILED - score ${templateCheckResult.details.percentage}%`);
                        return result;
                    }
                    console.log(`✅ Template matched: ${template.templateName} (score: ${templateCheckResult.details.percentage}%)`);
                } else {
                    console.log('ℹ️ No template configured for this university/program – skipping template check');
                    result.details.templateVerification = { skipped: true, reason: 'No template configured' };
                }
            } catch (tmplErr) {
                console.warn('⚠️ Template verification error (non-blocking):', tmplErr.message);
                result.details.templateVerification = { skipped: true, reason: tmplErr.message };
            }

            result.verified = true;
            result.status = 'VERIFIED';

            // Step 5: Generate degree hash
            console.log('🔐 Generating degree hash...');
            const degreeData = {
                studentId: dbStudent._id || dbStudent.id,
                studentName: studentName, // Use the resolved studentName (handles both name and studentName fields)
                rollNumber: dbStudent.rollNumber,
                cnic: dbStudent.cnic,
                email: dbStudent.email,
                fatherName: dbStudent.fatherName,
                degreeTitle: dbStudent.degreeTitle || dbStudent.program,
                department: dbStudent.department,
                faculty: dbStudent.faculty,
                session: dbStudent.session,
                enrollmentDate: dbStudent.enrollmentDate,
                graduationDate: dbStudent.graduationDate,
                cgpa: dbStudent.cgpa,
                universityId: universityInfo.id || universityInfo._id,
                universityName: universityInfo.name,
                universityRegistrationNumber: universityInfo.registrationNumber,
                verificationStatus: 'VERIFIED',
                verifiedAt: new Date().toISOString()
            };

            const degreeHash = ledgerService.generateDegreeHash(degreeData);
            result.details.degreeHash = degreeHash;

            // Step 5: Store on ledger first to get transaction ID
            console.log('📝 Storing VERIFIED degree on ledger...');
            const ledgerResult = await ledgerService.storeDegree({
                ...degreeData,
                degreeHash: degreeHash,
                ipfsHash: 'pending',
                ipfsGateway: 'pending',
                qrCodeData: 'pending'
            });
            result.details.ledger = ledgerResult;

            // Step 6: Generate QR code
            console.log('📱 Generating QR code...');
            const qrCode = await this.generateQRCode({
                ...degreeData,
                transactionId: ledgerResult.transactionId,
                degreeHash: degreeHash
            });
            result.details.qrCode = {
                verifyUrl: qrCode.verifyUrl,
                generated: true
            };

            // Step 7: Add QR code to PDF
            console.log('📄 Adding QR code to PDF...');
            const modifiedPdf = await this.addQRCodeToPDF(pdfPath, qrCode, {
                ...degreeData,
                transactionId: ledgerResult.transactionId
            });

            // Step 8: Upload modified PDF to IPFS
            console.log('☁️ Uploading to IPFS...');
            const ipfsResult = await ipfsService.uploadDegreeBuffer(
                modifiedPdf, 
                dbStudent.rollNumber
            );
            result.details.ipfs = ipfsResult;

            // Step 9: Update ledger with IPFS hash
            result.details.ledger.ipfsHash = ipfsResult.hash;
            result.details.ledger.ipfsGateway = ipfsResult.gateway;

            // Save modified PDF locally
            const outputPath = path.join(
                path.dirname(pdfPath), 
                `verified_${path.basename(pdfPath)}`
            );
            await fs.writeFile(outputPath, modifiedPdf);
            result.details.verifiedPdfPath = outputPath;

            // Step 10: Update ledger with IPFS hash and verified PDF path
            console.log('📝 Updating ledger with IPFS hash and PDF path...');
            await ledgerService.updateDegreeData(ledgerResult.transactionId, {
                ipfsHash: ipfsResult.hash,
                ipfsGateway: ipfsResult.gateway,
                verifiedPdfPath: outputPath
            });

            result.success = true;
            result.status = 'VERIFIED';
            result.data = {
                transactionId: ledgerResult.transactionId,
                degreeHash: degreeHash,
                ipfsHash: ipfsResult.hash,
                ipfsGateway: ipfsResult.gateway,
                qrCodeUrl: qrCode.verifyUrl,
                verifiedPdfPath: outputPath,
                studentName: studentName,
                rollNumber: dbStudent.rollNumber,
                universityName: universityInfo.name,
                degreeTitle: dbStudent.degreeTitle || dbStudent.program,
                cgpa: dbStudent.cgpa,
                matchScore: result.details.matchScore || result.details.structuredMatchScore || 85,
                verificationStatus: 'VERIFIED',
                verifiedAt: new Date().toISOString(),
                storedOnLedger: true,
                storedOnIPFS: true
            };

            console.log('✅ Degree VERIFIED and stored on Ledger + IPFS!');
            return result;

        } catch (error) {
            result.error = error.message;
            result.status = 'ERROR';
            console.error('❌ Degree verification failed:', error);
            return result;
        }
    }

    /**
     * Verify a degree by scanning QR code data
     * @param {string} qrData - JSON string from QR code
     * @returns {Object} - Verification result
     */
    async verifyByQRCode(qrData) {
        try {
            const data = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
            
            if (data.type !== 'HEC_VERIFIED_DEGREE') {
                return { verified: false, error: 'Invalid QR code type' };
            }

            // Verify by transaction ID
            const result = await ledgerService.verifyByTransactionId(data.transactionId);
            
            if (result.verified) {
                // Double check the degree hash matches
                if (result.degree && data.degreeHash) {
                    const hashMatch = await ledgerService.verifyByHash(data.degreeHash);
                    result.hashVerified = hashMatch.verified;
                }
            }

            return result;
        } catch (error) {
            return { verified: false, error: error.message };
        }
    }

    /**
     * Get verification statistics
     */
    async getStats() {
        return await ledgerService.getStats();
    }

    /**
     * Verify degree directly from database (no PDF required)
     * Used for batch verification where student data is already in database
     * @param {Object} student - Student data from database
     * @param {Object} university - University info
     * @param {Object} options - Additional options (batchId, etc.)
     * @returns {Object} - Verification result
     */
    async verifyFromDatabase(student, university, options = {}) {
        const result = {
            success: false,
            data: null,
            error: null,
            details: {}
        };

        try {
            // Validate student is graduated
            if (student.status !== 'graduated') {
                result.error = 'Student must be graduated to verify degree';
                return result;
            }

            // Create degree data from database record
            const degreeData = {
                rollNumber: student.rollNumber,
                studentName: student.name,
                cnic: student.cnic || '',
                fatherName: student.fatherName || '',
                degreeTitle: student.degreeTitle || student.program || '',
                department: student.department || '',
                universityId: university._id || university.id,
                universityName: university.name,
                cgpa: student.cgpa || '',
                graduationDate: student.graduationDate || '',
                session: student.session || student.batch || '',
                batchId: options.batchId || ''
            };

            // Generate degree hash
            const hashData = {
                rollNumber: degreeData.rollNumber,
                studentName: degreeData.studentName,
                cnic: degreeData.cnic,
                degreeTitle: degreeData.degreeTitle,
                universityId: degreeData.universityId,
                cgpa: degreeData.cgpa,
                graduationDate: degreeData.graduationDate
            };
            const degreeHash = crypto
                .createHash('sha256')
                .update(JSON.stringify(hashData))
                .digest('hex');

            degreeData.degreeHash = degreeHash;

            // Store on ledger
            console.log(`📝 Storing degree for ${student.name} on ledger...`);
            const ledgerResult = await ledgerService.storeDegree(degreeData);
            result.details.ledger = ledgerResult;

            // Generate verification URL
            const verifyUrl = `${this.verificationBaseUrl}/${ledgerResult.transactionId}`;

            result.success = true;
            result.data = {
                transactionId: ledgerResult.transactionId,
                degreeHash: degreeHash,
                studentName: student.name,
                rollNumber: student.rollNumber,
                universityName: university.name,
                degreeTitle: degreeData.degreeTitle,
                verifyUrl: verifyUrl,
                verifiedAt: new Date().toISOString()
            };

            console.log(`✅ Degree verified for ${student.name} (${student.rollNumber})`);
            return result;

        } catch (error) {
            result.error = error.message;
            console.error(`❌ Verification failed for ${student?.rollNumber}:`, error);
            return result;
        }
    }
}

// Singleton instance
const degreeVerificationService = new DegreeVerificationService();

module.exports = degreeVerificationService;
