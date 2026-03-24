/**
 * Degree Template Service
 * Manages university degree templates and verifies uploaded degrees against templates.
 * Each university defines a template with expected font sizes, text positions, and layout.
 * During verification the system extracts font/text metadata from the uploaded degree PDF
 * and compares it against the stored template to ensure compliance.
 */

const nano = require('nano');
const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');

let pdfjsLib;
try {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
} catch (e) {
    console.warn('⚠️ pdfjs-dist not available for template service:', e.message);
}

const couchdbUrl = process.env.COUCHDB_URL || 'http://admin:adminpw@localhost:5984';
const couch = nano(couchdbUrl);
const TEMPLATE_DB = 'degree_templates';

class DegreeTemplateService {
    constructor() {
        this.db = null;
    }

    async initialize() {
        try {
            try {
                await couch.db.create(TEMPLATE_DB);
                console.log(`✅ Created database: ${TEMPLATE_DB}`);
            } catch (err) {
                if (err.statusCode !== 412) throw err;
            }
            this.db = couch.use(TEMPLATE_DB);
            await this._createIndexes();
            console.log('✅ Degree template service initialized');
        } catch (error) {
            console.error('Failed to initialize degree template service:', error);
            throw error;
        }
    }

    async _createIndexes() {
        const indexes = [
            { index: { fields: ['universityId'] }, name: 'idx-universityId' },
            { index: { fields: ['universityId', 'isActive'] }, name: 'idx-uni-active' }
        ];
        for (const idx of indexes) {
            try { await this.db.createIndex(idx); } catch (e) { /* may exist */ }
        }
    }

    // ─────────────── PDF metadata extraction ───────────────

    /**
     * Extract detailed text items with font info from a PDF.
     * Returns an array of { text, fontSize, fontName, x, y, width, height, pageIndex }
     */
    async extractPdfTextItems(filePath) {
        if (!pdfjsLib) return [];
        const dataBuffer = await fs.readFile(filePath);
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer), useSystemFonts: true });
        const pdfDoc = await loadingTask.promise;

        const items = [];
        for (let p = 1; p <= pdfDoc.numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });

            for (const item of textContent.items) {
                if (!item.str || item.str.trim() === '') continue;
                const tx = item.transform; // [scaleX, skewX, skewY, scaleY, translateX, translateY]
                items.push({
                    text: item.str,
                    fontSize: Math.round(Math.abs(tx[3]) * 10) / 10, // scaleY ≈ font size
                    fontName: item.fontName || 'unknown',
                    x: Math.round(tx[4] * 10) / 10,
                    y: Math.round((viewport.height - tx[5]) * 10) / 10, // flip Y
                    width: Math.round(item.width * 10) / 10,
                    height: Math.round(item.height * 10) / 10,
                    pageIndex: p - 1
                });
            }
        }
        return items;
    }

    /**
     * Known signature role keywords to detect on degree templates.
     * Each entry maps a canonical role name to keyword patterns that may appear on the PDF.
     */
    static SIGNATURE_ROLE_KEYWORDS = [
        {
            roleName: 'Vice Chancellor',
            patterns: [
                'vice chancellor', 'vice-chancellor', 'v.c.', 'vc',
                'vice chancelor', 'vice chancellar'
            ]
        },
        {
            roleName: 'Registrar',
            patterns: [
                'registrar', 'regi strar'
            ]
        },
        {
            roleName: 'Controller',
            patterns: [
                'controller of examinations', 'controller of examination',
                'controller exam', 'controller', 'coe'
            ]
        }
    ];

    /**
     * Detect which signature roles are present on the template PDF.
     * Scans all text items for known role keywords.
     * @param {Array} textItems - extracted text items from the PDF
     * @returns {string[]} - array of canonical role names found (e.g., ['Vice Chancellor', 'Registrar'])
     */
    detectSignatureRoles(textItems) {
        // Concatenate all text into one lowercase string for scanning
        const allText = textItems.map(i => i.text).join(' ').toLowerCase();

        const detectedRoles = [];

        for (const roleEntry of DegreeTemplateService.SIGNATURE_ROLE_KEYWORDS) {
            const found = roleEntry.patterns.some(pattern => allText.includes(pattern));
            if (found) {
                detectedRoles.push(roleEntry.roleName);
            }
        }

        console.log(`🔍 Detected signature roles on template: ${detectedRoles.length > 0 ? detectedRoles.join(', ') : 'none'}`);
        return detectedRoles;
    }

    /**
     * Build a template profile from extracted text items.
     * Groups items by semantic role (title, student name, etc.) using font-size heuristics.
     * Also detects which signature roles are required on the degree template.
     */
    buildTemplateProfile(textItems) {
        if (!textItems.length) return null;

        // Collect font-size distribution
        const fontSizes = {};
        for (const item of textItems) {
            const sz = item.fontSize;
            fontSizes[sz] = (fontSizes[sz] || 0) + 1;
        }

        // Sort unique sizes descending
        const sortedSizes = Object.keys(fontSizes).map(Number).sort((a, b) => b - a);

        // Heuristic classification
        const largestSize = sortedSizes[0] || 12;
        const bodySize = sortedSizes.length > 1 ? sortedSizes[sortedSizes.length - 1] : largestSize;

        // Identify text zones
        const titleItems = textItems.filter(i => i.fontSize >= largestSize * 0.9);
        const headingItems = textItems.filter(i => i.fontSize < largestSize * 0.9 && i.fontSize > bodySize * 1.2);
        const bodyItems = textItems.filter(i => i.fontSize <= bodySize * 1.2);

        // Detect which signature roles are required by this template
        const requiredSignatureRoles = this.detectSignatureRoles(textItems);

        return {
            fontSizeDistribution: fontSizes,
            sortedFontSizes: sortedSizes,
            titleFontSize: largestSize,
            headingFontSize: headingItems.length > 0 ? headingItems[0].fontSize : largestSize,
            bodyFontSize: bodySize,
            titleTexts: titleItems.map(i => i.text),
            headingTexts: headingItems.map(i => i.text),
            totalTextItems: textItems.length,
            pageCount: Math.max(...textItems.map(i => i.pageIndex)) + 1,
            requiredSignatureRoles,
            textItemsSample: textItems.slice(0, 50).map(i => ({
                text: i.text,
                fontSize: i.fontSize,
                fontName: i.fontName,
                x: i.x,
                y: i.y
            }))
        };
    }

    // ─────────────── CRUD ───────────────

    /**
     * Create or update a degree template for a university.
     * @param {string} universityId
     * @param {Object} templateData - { programName, templateName, pdfPath }
     * @returns template document
     */
    async saveTemplate(universityId, templateData) {
        await this._ensureDb();

        const { templateName, pdfPath } = templateData;
        const programName = 'default';

        // Extract template profile from the uploaded template PDF
        const textItems = await this.extractPdfTextItems(pdfPath);
        const profile = this.buildTemplateProfile(textItems);

        if (!profile) {
            throw new Error('Could not extract template profile from the PDF. Make sure it contains text-based content.');
        }

        // Check for existing template for this university
        const existing = await this._findTemplate(universityId);

        const doc = {
            ...(existing || {}),
            docType: 'degree_template',
            universityId,
            programName,
            templateName: templateName || 'Degree Template',
            templatePdfPath: pdfPath,
            profile,
            rawTextItems: textItems, // store full items for precise comparison
            isActive: true,
            updatedAt: new Date().toISOString()
        };

        if (!existing) {
            doc._id = `TMPL_${universityId}_DEFAULT`;
            doc.createdAt = new Date().toISOString();
        }

        const result = await this.db.insert(doc);
        return { ...doc, _rev: result.rev };
    }

    /**
     * Get all templates for a university.
     */
    async getTemplates(universityId) {
        await this._ensureDb();
        const result = await this.db.find({
            selector: { universityId, docType: 'degree_template' },
            limit: 200
        });
        return result.docs;
    }

    /**
     * Get active template for a university + optional program.
     */
    async getActiveTemplate(universityId, _programName) {
        await this._ensureDb();
        const result = await this.db.find({
            selector: {
                universityId,
                docType: 'degree_template',
                isActive: true
            },
            limit: 1
        });
        if (result.docs.length > 0) return result.docs[0];

        const fallback = await this.db.find({
            selector: {
                universityId,
                docType: 'degree_template'
            },
            limit: 1
        });
        if (fallback.docs.length > 0) return fallback.docs[0];

        return null;
    }

    /**
     * Delete a template.
     */
    async deleteTemplate(templateId) {
        await this._ensureDb();
        const doc = await this.db.get(templateId);
        await this.db.destroy(doc._id, doc._rev);
        return true;
    }

    /**
     * Toggle template active status.
     */
    async toggleTemplate(templateId, isActive) {
        await this._ensureDb();
        const doc = await this.db.get(templateId);
        doc.isActive = isActive;
        doc.updatedAt = new Date().toISOString();
        const result = await this.db.insert(doc);
        return { ...doc, _rev: result.rev };
    }

    // ─────────────── Template verification ───────────────

            /**
             * Verify that an uploaded degree PDF matches the university's template.
             * Comparison checks:
             *   1. Font size distribution – do the font sizes used match?
             *   2. Title font size – is the title/heading in the expected size?
             *   3. Body font size – is the body text the expected size?
             *   4. Page count – does the degree have the expected number of pages?
             *   5. Key text presence – university name / degree text present?
             *
             * @param {string} degreePdfPath  - path to uploaded degree
             * @param {Object} template       - stored template document
             * @returns {{ isMatch: boolean, score: number, details: Object }}
             */
            async verifyAgainstTemplate(degreePdfPath, template) {
                const result = {
                    isMatch: false,
                    score: 0,
                    maxScore: 0,
                    details: {},
                    checks: []
                };

                if (!template || !template.profile) {
                    result.details.error = 'No template profile available';
                    return result;
                }

                // Extract text items from uploaded degree
                const degreeItems = await this.extractPdfTextItems(degreePdfPath);
                if (!degreeItems.length) {
                    result.details.error = 'Could not extract text from uploaded degree PDF';
                    return result;
                }

                const degreeProfile = this.buildTemplateProfile(degreeItems);
                const tmplProfile = template.profile;

                // ── Check 1: Title font size (weight 3) ──
                const titleSizeDiff = Math.abs(degreeProfile.titleFontSize - tmplProfile.titleFontSize);
                const titleTolerance = tmplProfile.titleFontSize * 0.15; // 15% tolerance
                const titleMatch = titleSizeDiff <= titleTolerance;
                result.checks.push({
                    name: 'Title Font Size',
                    expected: tmplProfile.titleFontSize,
                    actual: degreeProfile.titleFontSize,
                    tolerance: `±${titleTolerance.toFixed(1)}`,
                    diff: titleSizeDiff.toFixed(1),
                    passed: titleMatch,
                    weight: 3
                });
                result.maxScore += 3;
                if (titleMatch) result.score += 3;

                // ── Check 2: Body font size (weight 3) ──
                const bodySizeDiff = Math.abs(degreeProfile.bodyFontSize - tmplProfile.bodyFontSize);
                const bodyTolerance = tmplProfile.bodyFontSize * 0.15;
                const bodyMatch = bodySizeDiff <= bodyTolerance;
                result.checks.push({
                    name: 'Body Font Size',
                    expected: tmplProfile.bodyFontSize,
                    actual: degreeProfile.bodyFontSize,
                    tolerance: `±${bodyTolerance.toFixed(1)}`,
                    diff: bodySizeDiff.toFixed(1),
                    passed: bodyMatch,
                    weight: 3
                });
                result.maxScore += 3;
                if (bodyMatch) result.score += 3;

                // ── Check 3: Heading font size (weight 2) ──
                const headingSizeDiff = Math.abs(degreeProfile.headingFontSize - tmplProfile.headingFontSize);
                const headingTolerance = tmplProfile.headingFontSize * 0.15;
                const headingMatch = headingSizeDiff <= headingTolerance;
                result.checks.push({
                    name: 'Heading Font Size',
                    expected: tmplProfile.headingFontSize,
                    actual: degreeProfile.headingFontSize,
                    tolerance: `±${headingTolerance.toFixed(1)}`,
                    diff: headingSizeDiff.toFixed(1),
                    passed: headingMatch,
                    weight: 2
                });
                result.maxScore += 2;
                if (headingMatch) result.score += 2;

                // ── Check 4: Font size distribution similarity (weight 3) ──
                const distScore = this._compareFontDistributions(
                    tmplProfile.fontSizeDistribution,
                    degreeProfile.fontSizeDistribution
                );
                const distPassed = distScore >= 0.6; // 60% similarity required
                result.checks.push({
                    name: 'Font Size Distribution',
                    expected: 'Template distribution',
                    actual: `${(distScore * 100).toFixed(0)}% match`,
                    passed: distPassed,
                    weight: 3
                });
                result.maxScore += 3;
                if (distPassed) result.score += 3;

                // ── Check 5: Page count (weight 2) ──
                const pageMatch = degreeProfile.pageCount === tmplProfile.pageCount;
                result.checks.push({
                    name: 'Page Count',
                    expected: tmplProfile.pageCount,
                    actual: degreeProfile.pageCount,
                    passed: pageMatch,
                    weight: 2
                });
                result.maxScore += 2;
                if (pageMatch) result.score += 2;

                // ── Check 6: Title text presence (weight 2) ──
                // Check if at least some title words from template appear in degree
                const templateTitleWords = tmplProfile.titleTexts.join(' ').toLowerCase().split(/\s+/).filter(w => w.length > 3);
                const degreeTitleWords = degreeProfile.titleTexts.join(' ').toLowerCase();
                let titleWordMatches = 0;
                for (const word of templateTitleWords) {
                    if (degreeTitleWords.includes(word)) titleWordMatches++;
                }
                const titleTextMatch = templateTitleWords.length === 0 || 
                    (titleWordMatches / Math.max(templateTitleWords.length, 1)) >= 0.3;
                result.checks.push({
                    name: 'Title Text Presence',
                    expected: tmplProfile.titleTexts.slice(0, 3).join(', '),
                    actual: degreeProfile.titleTexts.slice(0, 3).join(', '),
                    passed: titleTextMatch,
                    weight: 2
                });
                result.maxScore += 2;
                if (titleTextMatch) result.score += 2;

                // Calculate overall
                const percentage = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
                result.details.percentage = Math.round(percentage);
                result.details.templateName = template.templateName;
                result.details.programName = template.programName;
                result.isMatch = percentage >= 60; // 60% overall threshold to pass

                return result;
            }
    /**
     * Compare two font-size distribution objects.
     * Returns a similarity score 0-1.
     */
    _compareFontDistributions(dist1, dist2) {
        const allSizes = new Set([...Object.keys(dist1), ...Object.keys(dist2)]);
        if (allSizes.size === 0) return 1;

        const total1 = Object.values(dist1).reduce((a, b) => a + b, 0);
        const total2 = Object.values(dist2).reduce((a, b) => a + b, 0);

        let similarity = 0;
        for (const size of allSizes) {
            const freq1 = (dist1[size] || 0) / total1;
            const freq2 = (dist2[size] || 0) / total2;
            similarity += Math.min(freq1, freq2); // overlap coefficient
        }

        return Math.min(similarity, 1);
    }

    // ─────── helpers ───────

    async _ensureDb() {
        if (!this.db) await this.initialize();
    }

    async _findTemplate(universityId) {
        const result = await this.db.find({
            selector: {
                universityId,
                docType: 'degree_template'
            },
            limit: 1
        });
        return result.docs.length > 0 ? result.docs[0] : null;
    }
}

module.exports = new DegreeTemplateService();
