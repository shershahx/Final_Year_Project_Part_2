const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const nano = require('nano');
const sharp = require('sharp');

const couchdbUrl = process.env.COUCHDB_URL || 'http://admin:adminpw@localhost:5984';
const couch = nano(couchdbUrl);

class PdfSignatureService {
    constructor() {
        this.uploadsDir = path.join(__dirname, '../uploads');
        this.signaturesDir = path.join(this.uploadsDir, 'signatures');

        // Ensure directories exist
        if (!fs.existsSync(this.signaturesDir)) {
            fs.mkdirSync(this.signaturesDir, { recursive: true });
        }

        // Keywords to match roles to their designated area on the PDF
        // Registrar also maps to "controller of examinations" (same spot on many degrees)
        this.roleKeywords = {
            'vice chancellor': ['vice chancellor', 'vice-chancellor', 'vc'],
            'controller': ['controller of examinations', 'controller', 'examination controller'],
            'registrar': ['registrar', 'academic registrar', 'controller of examinations', 'controller'],
            'dean': ['dean', 'dean of faculty']
        };

        // Signature image dimensions (pts) — sized to look like a real hand-written signature
        // Kept compact so it fits naturally above the label line on a degree
        this.sigWidth = 260;
        this.sigHeight = 85;
    }

    /**
     * Scan PDF text to find the page and position of a signature label
     * e.g. find where "Vice Chancellor" text is printed on the degree
     */
    async _findSignatureAreaInPdf(pdfPath, roleName) {
        try {
            const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
            const data = new Uint8Array(fs.readFileSync(pdfPath));
            const doc = await pdfjsLib.getDocument(data).promise;

            const roleNameLower = roleName.toLowerCase();

            // Determine which keywords to search for based on role name
            let searchKeywords = [roleNameLower];
            for (const [key, keywords] of Object.entries(this.roleKeywords)) {
                if (keywords.some(kw => roleNameLower.includes(kw) || kw.includes(roleNameLower))) {
                    searchKeywords = keywords;
                    break;
                }
            }

            // Collect ALL matching text items across all pages so we can
            // pick the best match (longest keyword match = most specific)
            let bestMatch = null;
            let bestMatchLen = 0;

            for (let p = 1; p <= doc.numPages; p++) {
                const page = await doc.getPage(p);
                const viewport = page.getViewport({ scale: 1.0 });
                const pageHeight = viewport.height;
                const textContent = await page.getTextContent();

                for (const item of textContent.items) {
                    const text = item.str.trim().toLowerCase();
                    for (const kw of searchKeywords) {
                        if (text.includes(kw) && kw.length > bestMatchLen) {
                            const tx = item.transform;
                            const textX = tx[4];
                            const textY = tx[5];
                            const fontSize = Math.abs(tx[3]) || Math.abs(tx[0]) || 12;
                            const textWidth = item.width || (text.length * fontSize * 0.5);

                            bestMatch = {
                                found: true,
                                pageIndex: p - 1,
                                labelX: textX,
                                labelY: textY,
                                labelWidth: textWidth,
                                fontSize: fontSize,
                                pageHeight: pageHeight,
                                matchedText: item.str.trim(),
                                matchedKeyword: kw
                            };
                            bestMatchLen = kw.length;
                        }
                    }
                }
            }

            if (bestMatch) {
                console.log(`📍 Best match for "${roleName}": "${bestMatch.matchedText}" (keyword: "${bestMatch.matchedKeyword}") on page ${bestMatch.pageIndex + 1} at x=${Math.round(bestMatch.labelX)}, y=${Math.round(bestMatch.labelY)}, fontSize=${Math.round(bestMatch.fontSize)}`);
                return bestMatch;
            }

            console.log(`⚠️ No signature area found for role "${roleName}" in PDF`);
            return { found: false };
        } catch (error) {
            console.error('Error scanning PDF for signature area:', error.message);
            return { found: false };
        }
    }

    /**
     * Add signature to PDF document
     * Auto-detects the correct position by scanning for the role label text on the PDF
     */
    async addSignatureToPdf(pdfPath, approvalStep, signaturePosition) {
        try {
            // Read the PDF file
            const existingPdfBytes = fs.readFileSync(pdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);

            // Get signature from university (via approver's role)
            const signature = await this.getSignatureForRole(approvalStep.roleId, approvalStep.approverEmail);

            if (!signature) {
                console.warn('No signature found for role:', approvalStep.roleName);
                return { success: false, error: 'Signature not found' };
            }

            // Convert base64 signature to raw image bytes
            const rawImageBytes = await this.base64ToImageBytes(signature);

            // Remove white/light background so only the ink strokes remain (transparent PNG)
            const signatureImageBytes = await this.removeSignatureBackground(rawImageBytes);

            // Embed the transparent PNG signature into the PDF
            let signatureImage;
            try {
                signatureImage = await pdfDoc.embedPng(signatureImageBytes);
            } catch (e) {
                // Fallback: try with original bytes as JPG
                try {
                    signatureImage = await pdfDoc.embedJpg(rawImageBytes);
                } catch (e2) {
                    console.error('Failed to embed signature image:', e2);
                    return { success: false, error: 'Invalid signature image format' };
                }
            }

            const pages = pdfDoc.getPages();
            let targetPage;
            let x, y, sigWidth, sigHeight;

            sigWidth = this.sigWidth;
            sigHeight = this.sigHeight;

            if (signaturePosition && (signaturePosition.xPercent != null || signaturePosition.x != null)) {
                // ──────────────────────────────────────────────────────────────
                // PRIORITY 1 — Approver clicked a specific spot on the PDF
                // ──────────────────────────────────────────────────────────────
                targetPage = pages[0];
                const { width: pageW, height: pageH } = targetPage.getSize();

                if (signaturePosition.xPercent != null && signaturePosition.yPercent != null) {
                    // Percentage → PDF pts  (Y flipped: browser top → PDF bottom)
                    x = (signaturePosition.xPercent / 100) * pageW  - (sigWidth / 2);
                    y = pageH - ((signaturePosition.yPercent / 100) * pageH) - (sigHeight / 2);
                } else if (signaturePosition.containerWidth && signaturePosition.containerHeight) {
                    // Raw pixels with container reference
                    const scaleX = pageW / signaturePosition.containerWidth;
                    const scaleY = pageH / signaturePosition.containerHeight;
                    x = signaturePosition.x * scaleX - (sigWidth / 2);
                    y = pageH - (signaturePosition.y * scaleY) - (sigHeight / 2);
                } else {
                    // Legacy raw PDF pts
                    x = signaturePosition.x - (sigWidth / 2);
                    y = signaturePosition.y - (sigHeight / 2);
                }

                // Clamp so the signature stays within page bounds
                x = Math.max(0, Math.min(x, targetPage.getWidth() - sigWidth));
                y = Math.max(0, Math.min(y, targetPage.getHeight() - sigHeight));

                console.log(`✍️ Clicked position for ${approvalStep.roleName}: x=${Math.round(x)}, y=${Math.round(y)}`);
            } else {
                // ──────────────────────────────────────────────────────────────
                // PRIORITY 2 — Auto-detect label text on the PDF
                // ──────────────────────────────────────────────────────────────
                const detected = await this._findSignatureAreaInPdf(pdfPath, approvalStep.roleName);

                if (detected.found) {
                    targetPage = pages[detected.pageIndex];

                    // In PDF coords, Y=0 is the BOTTOM of the page.
                    // detected.labelY is the text baseline (bottom-left of the label).
                    // The signature line is typically right above the label text.
                    // We place the signature so its bottom edge sits just above the
                    // label (a small gap of ~2-4 pts for the line itself).
                    const labelCenterX = detected.labelX + (detected.labelWidth / 2);
                    x = labelCenterX - (sigWidth / 2);

                    // Place signature just above the label text:
                    // labelY = text baseline, fontSize = height of the text glyphs.
                    // Signature bottom edge goes at: labelY + fontSize + small gap
                    const fontSize = detected.fontSize || 12;
                    const gap = 4; // small gap between label top and signature bottom
                    y = detected.labelY + fontSize + gap;

                    // Clamp within page
                    const { width: pw, height: ph } = targetPage.getSize();
                    x = Math.max(5, Math.min(x, pw - sigWidth - 5));
                    y = Math.max(5, Math.min(y, ph - sigHeight - 5));

                    console.log(`✍️ Auto-detected position for ${approvalStep.roleName}: x=${Math.round(x)}, y=${Math.round(y)} (label at y=${Math.round(detected.labelY)}, fontSize=${Math.round(fontSize)})`);
                } else {
                    // PRIORITY 3 — Default layout based on page orientation
                    targetPage = pages[0];
                    const { width, height } = targetPage.getSize();
                    const roleLower = approvalStep.roleName.toLowerCase();
                    const isVC = roleLower.includes('vice') || roleLower.includes('vc');
                    const isRegistrar = roleLower.includes('registrar') || roleLower.includes('controller');
                    const isLandscape = width > height;

                    if (isLandscape) {
                        // Landscape degree: left side = registrar/controller, right side = VC
                        x = isVC ? (width * 0.70) : (width * 0.05);
                        y = height * 0.18; // just above the bottom signature area
                    } else {
                        // Portrait degree: left side = registrar/controller, right side = VC
                        x = isVC ? (width * 0.58) : (width * 0.05);
                        y = height * 0.12;
                    }
                    console.log(`✍️ Using default position for ${approvalStep.roleName}: x=${Math.round(x)}, y=${Math.round(y)} (${isLandscape ? 'landscape' : 'portrait'})`);
                }
            }

            // Draw ONLY the signature image — no name, date, or role text
            targetPage.drawImage(signatureImage, {
                x: x,
                y: y,
                width: sigWidth,
                height: sigHeight
            });

            // Save the modified PDF
            const pdfBytes = await pdfDoc.save();

            // Generate new filename
            const originalFilename = path.basename(pdfPath);
            const newFilename = originalFilename.replace('.pdf', `_signed_${Date.now()}.pdf`);
            const newPdfPath = path.join(this.uploadsDir, 'degrees', newFilename);

            // Ensure degrees directory exists
            const degreesDir = path.join(this.uploadsDir, 'degrees');
            if (!fs.existsSync(degreesDir)) {
                fs.mkdirSync(degreesDir, { recursive: true });
            }

            // Write the new PDF
            fs.writeFileSync(newPdfPath, pdfBytes);

            return {
                success: true,
                newPdfPath: newPdfPath,
                newPdfUrl: `/uploads/degrees/${newFilename}`,
                message: 'Signature added successfully'
            };
        } catch (error) {
            console.error('Error adding signature to PDF:', error);
            throw error;
        }
    }

    /**
     * Add multiple signatures to PDF at once (for final certificate)
     * Auto-detects correct positions from PDF text labels
     */
    async addAllSignaturesToPdf(pdfPath, approvalWorkflow, signaturePositions) {
        try {
            const existingPdfBytes = fs.readFileSync(pdfPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const pages = pdfDoc.getPages();

            // Get approved steps only
            const approvedSteps = approvalWorkflow.filter(step => step.status === 'approved');

            for (const step of approvedSteps) {
                const signature = await this.getSignatureForRole(step.roleId, step.approverEmail);

                if (!signature) {
                    console.warn('No signature found for role:', step.roleName);
                    continue;
                }

                // Remove background and create transparent PNG
                const rawImageBytes = await this.base64ToImageBytes(signature);
                const signatureImageBytes = await this.removeSignatureBackground(rawImageBytes);

                let signatureImage;
                try {
                    signatureImage = await pdfDoc.embedPng(signatureImageBytes);
                } catch (e) {
                    try {
                        signatureImage = await pdfDoc.embedJpg(rawImageBytes);
                    } catch (e2) {
                        console.error('Failed to embed signature:', e2);
                        continue;
                    }
                }

                // Auto-detect position from PDF text
                const detected = await this._findSignatureAreaInPdf(pdfPath, step.roleName);

                let targetPage, x, y, sigWidth, sigHeight;

                sigWidth = this.sigWidth;
                sigHeight = this.sigHeight;

                if (detected.found) {
                    targetPage = pages[detected.pageIndex];
                    const labelCenterX = detected.labelX + (detected.labelWidth / 2);
                    x = labelCenterX - (sigWidth / 2);
                    const fontSize = detected.fontSize || 12;
                    const gap = 4;
                    y = detected.labelY + fontSize + gap;

                    const { width: pw, height: ph } = targetPage.getSize();
                    x = Math.max(5, Math.min(x, pw - sigWidth - 5));
                    y = Math.max(5, Math.min(y, ph - sigHeight - 5));
                } else {
                    targetPage = pages[0];
                    const { width: pageW, height: pageH } = targetPage.getSize();
                    const roleLower = step.roleName.toLowerCase();
                    const isVC = roleLower.includes('vice') || roleLower.includes('vc');
                    const isLandscape = pageW > pageH;

                    if (isLandscape) {
                        x = isVC ? (pageW * 0.70) : (pageW * 0.05);
                        y = pageH * 0.18;
                    } else {
                        x = isVC ? (pageW * 0.58) : (pageW * 0.05);
                        y = pageH * 0.12;
                    }
                }

                // Draw ONLY the signature image — no name, date, or role text
                targetPage.drawImage(signatureImage, {
                    x: x,
                    y: y,
                    width: sigWidth,
                    height: sigHeight
                });
            }

            // Save PDF
            const pdfBytes = await pdfDoc.save();

            const originalFilename = path.basename(pdfPath);
            const newFilename = originalFilename.replace('.pdf', `_fully_signed_${Date.now()}.pdf`);
            const newPdfPath = path.join(this.uploadsDir, 'degrees', newFilename);

            fs.writeFileSync(newPdfPath, pdfBytes);

            return {
                success: true,
                newPdfPath: newPdfPath,
                newPdfUrl: `/uploads/degrees/${newFilename}`,
                message: 'All signatures added successfully'
            };
        } catch (error) {
            console.error('Error adding all signatures:', error);
            throw error;
        }
    }

    /**
     * Get signature for a role from university database
     */
    async getSignatureForRole(roleId, approverEmail) {
        try {
            // Find university with this role
            const universityDb = couch.use('university_users');

            const queryString = {
                selector: {
                    docType: 'university',
                    approvalRoles: {
                        $elemMatch: {
                            roleId: roleId,
                            holderEmail: approverEmail
                        }
                    }
                }
            };

            const result = await universityDb.find(queryString);

            if (result.docs.length === 0) {
                return null;
            }

            const university = result.docs[0];
            const role = university.approvalRoles.find(r => r.roleId === roleId);

            return role ? role.signature : null;
        } catch (error) {
            console.error('Error getting signature:', error);
            return null;
        }
    }

    /**
     * Convert base64 string to image bytes
     */
    async base64ToImageBytes(base64String) {
        try {
            // Remove data:image/png;base64, prefix if present
            const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');

            // Convert to buffer
            const imageBytes = Buffer.from(base64Data, 'base64');

            return imageBytes;
        } catch (error) {
            console.error('Error converting base64 to image:', error);
            throw error;
        }
    }

    /**
     * Remove the background from a signature image, keeping only the ink strokes.
     * Converts any white/light background to transparent so the signature
     * appears naturally on the degree certificate (not as a pasted rectangle).
     *
     * @param {Buffer} imageBytes - raw image bytes (PNG, JPG, etc.)
     * @returns {Buffer} - transparent PNG bytes with only the signature strokes
     */
    async removeSignatureBackground(imageBytes) {
        try {
            // Ensure we work with raw pixel data (RGBA)
            const image = sharp(imageBytes).ensureAlpha();
            const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

            const { width, height, channels } = info; // channels = 4 (RGBA)

            // Threshold: pixels lighter than this are considered "background"
            const BG_THRESHOLD = 230; // 0-255, higher = more aggressive removal

            for (let i = 0; i < data.length; i += channels) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                // alpha is at data[i + 3]

                // If the pixel is very light (white-ish), make it fully transparent
                if (r >= BG_THRESHOLD && g >= BG_THRESHOLD && b >= BG_THRESHOLD) {
                    data[i + 3] = 0; // set alpha to 0 (transparent)
                } else {
                    // For slightly lighter pixels near the threshold, apply
                    // partial transparency for smoother anti-aliased edges
                    const brightness = (r + g + b) / 3;
                    if (brightness >= BG_THRESHOLD - 40) {
                        // Fade out gradually: closer to threshold = more transparent
                        const fade = (brightness - (BG_THRESHOLD - 40)) / 40; // 0..1
                        data[i + 3] = Math.round((1 - fade) * 255);
                    }
                    // else: keep pixel fully opaque (it's dark ink)
                }
            }

            // Reconstruct the image as a transparent PNG
            const transparentPng = await sharp(data, {
                raw: { width, height, channels }
            })
                .png()
                .toBuffer();

            console.log('✅ Signature background removed — transparent PNG created');
            return transparentPng;
        } catch (error) {
            console.error('⚠️ Background removal failed, using original image:', error.message);
            // Fallback: return the original image as-is
            return imageBytes;
        }
    }

    /**
     * Detect signature positions from PDF text labels
     */
    async detectSignaturePositions(pdfPath, keywords = ['registrar', 'vc', 'vice chancellor', 'controller']) {
        try {
            const positions = {};
            for (const keyword of keywords) {
                const detected = await this._findSignatureAreaInPdf(pdfPath, keyword);
                if (detected.found) {
                    const labelCenterX = detected.labelX + (detected.labelWidth / 2);
                    positions[keyword] = {
                        pageIndex: detected.pageIndex,
                        x: labelCenterX - (this.sigWidth / 2),
                        y: detected.labelY + 18,
                        width: this.sigWidth,
                        height: this.sigHeight
                    };
                }
            }

            return {
                success: true,
                positions,
                message: Object.keys(positions).length > 0
                    ? `Found ${Object.keys(positions).length} signature areas`
                    : 'No signature areas detected in PDF'
            };
        } catch (error) {
            console.error('Error detecting signature positions:', error);
            throw error;
        }
    }
}

module.exports = new PdfSignatureService();
