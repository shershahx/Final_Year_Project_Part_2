/*
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

// Import the necessary Fabric libraries
const { Contract } = require('fabric-contract-api');
const shim = require('fabric-shim');

/**
 * The main smart contract class for managing degree attestation.
 * This contract is run by the University's peers (Peer1, Peer2).[1]
 */
class DegreeContract extends Contract {

    constructor() {
        // This is the name of our contract
        super('DegreeContract');
    }

    /**
     * Initializes the ledger with the HEC academic "rulebook".
     * This function should be called once upon deployment.
     * It populates the ledger with all the degree program templates.
     */
    async InitLedger(ctx) {
        console.info('============= START : InitLedger ===========');

        const programTemplates = [
            {
                programTitle: "BS Computer Science",
                minTotalCredits: 124,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Software Engineering",
                minTotalCredits: 124,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Information Technology",
                minTotalCredits: 124,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Artificial Intelligence",
                minTotalCredits: 124,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Data Science",
                minTotalCredits: 124,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            // --- Natural Science Degrees (124 Credit Hour Model) ---
            {
                programTitle: "BS Physics",
                minTotalCredits: 124,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Chemistry",
                minTotalCredits: 124,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            // --- Engineering Degrees (Example 130 Credit Hour Model) ---
            {
                programTitle: "BS Mechanical Engineering",
                minTotalCredits: 130,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 78,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Electrical Engineering",
                minTotalCredits: 130,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 78,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Electronic Engineering",
                minTotalCredits: 130,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 78,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Aeronautical Engineering",
                minTotalCredits: 130,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 78,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            {
                programTitle: "BS Bio-Medical Engineering",
                minTotalCredits: 130,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 78,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            // --- Humanities & Literature (Example 136 Credit Hour Model) ---
            {
                programTitle: "BS English",
                minTotalCredits: 136,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72, // HEC minimum
                    internship: 3,         // Mandatory
                    capstoneProject: 3,      // Mandatory
                }
            },
            {
                programTitle: "BS Urdu",
                minTotalCredits: 136,
                rules: {
                    generalEducation: 30,
                    majorDisciplinary: 72,
                    internship: 3,
                    capstoneProject: 3,
                }
            },
            //... You can add hundreds more programs here...
        ];

        for (const program of programTemplates) {
            // This creates a unique key for each program's rulebook
            // e.g., "PROGRAM-BSComputerScience", "PROGRAM-BSEnglish"
            const key = `PROGRAM-${program.programTitle.replace(/\s/g, '')}`;
            await ctx.stub.putState(key, Buffer.from(JSON.stringify(program)));
            console.info(`Added program template: ${key}`);
        }
        console.info('============= END : InitLedger ===========');
    }

    /**
     * Creates a new student record on the ledger (Enrollment).
     * This matches Phase 1, Step 1 of your system flow.
     */
    async CreateStudent(ctx, studentId, name, programTitle) {
        console.info('============= START : CreateStudent ===========');

        // This is the first check: Does this program exist in our rulebook?
        const programKey = `PROGRAM-${programTitle.replace(/\s/g, '')}`;
        const programBytes = await ctx.stub.getState(programKey);
        if (!programBytes || programBytes.length === 0) {
            throw new Error(`Program template ${programTitle} does not exist. Run InitLedger first.`);
        }

        const student = {
            docType: 'Student',
            studentId: studentId,
            name: name,
            programTitle: programTitle, // e.g., "BS Computer Science"
            academicHistory: null,      // Will be added later in a single transaction
            degreeIssued: false,
        };

        const studentKey = `STUDENT-${studentId}`;
        await ctx.stub.putState(studentKey, Buffer.from(JSON.stringify(student)));
        console.info(`Student ${studentId} created.`);
        console.info('============= END : CreateStudent ===========');
    }

    /**
     * Adds a student's COMPLETE academic history in a single transaction.
     * This matches Phase 1, Step 2 of your updated system flow.
     * The `coursesJSON` is a string containing a JSON array of all courses.
     */
    async AddAcademicHistory(ctx, studentId, coursesJSON) {
        console.info('============= START : AddAcademicHistory ===========');

        const studentKey = `STUDENT-${studentId}`;
        
        const studentBytes = await ctx.stub.getState(studentKey);
        if (!studentBytes || studentBytes.length === 0) {
            throw new Error(`Student ${studentId} does not exist.`);
        }
        const student = JSON.parse(studentBytes.toString());

        if (student.academicHistory) {
            throw new Error(`Academic history for ${studentId} has already been added.`);
        }

        const academicHistory = JSON.parse(coursesJSON);
        student.academicHistory = academicHistory;

        await ctx.stub.putState(studentKey, Buffer.from(JSON.stringify(student)));
        console.info(`Added academic history for student ${studentId}.`);
        console.info('============= END : AddAcademicHistory ===========');
    }

    /**
     * This is the main audit function.
     * It runs the HEC audit and issues a degree if the student qualifies.
     * This is Phase 1, Step 3 of your flow.
     */
    async IssueDegree(ctx, studentId) {
        console.info('============= START : IssueDegree ===========');

        const studentKey = `STUDENT-${studentId}`;

        // 1. Get the student's full record from the ledger
        const studentBytes = await ctx.stub.getState(studentKey);
        if (!studentBytes || studentBytes.length === 0) {
            throw new Error(`Student ${studentId} does not exist.`);
        }
        const student = JSON.parse(studentBytes.toString());

        if (student.degreeIssued) {
            throw new Error(`Degree has already been issued to student ${studentId}.`);
        }
        if (!student.academicHistory) {
            throw new Error(`Academic history for ${studentId} has not been added. Run AddAcademicHistory first.`);
        }

        // 2. DYNAMICALLY get the HEC "Rulebook" for *this student's specific program*
        const programKey = `PROGRAM-${student.programTitle.replace(/\s/g, '')}`;
        const programBytes = await ctx.stub.getState(programKey);
        if (!programBytes || programBytes.length === 0) {
            throw new Error(`CRITICAL ERROR: Program template ${student.programTitle} does not exist. Cannot perform audit.`);
        }
        const programRules = JSON.parse(programBytes.toString());
        const rules = programRules.rules;

        // 3. === THE AUDIT LOGIC ===
        // Initialize a "tally" of all the student's credits by category
        const audit = {
            totalCredits: 0,
            generalEducation: 0,
            majorDisciplinary: 0,
            interdisciplinary: 0,
            capstoneProject: 0,
            internship: 0,
            // Add other HEC categories as needed...
        };

        // Loop through every course in their history
        for (const course of student.academicHistory) {
            if (course.grade!== 'F' && course.grade!== 'W') { // Only count passing grades
                
                const credits = course.credits || 0;
                audit.totalCredits += credits;
                
                // Add credits to the specific category's tally
                const category = course.category;
                if (audit.hasOwnProperty(category)) {
                    audit[category] += credits;
                }
            }
        }
        console.info(`AUDIT RESULTS for ${studentId}:`, JSON.stringify(audit));

        // 4. === THE VERDICT ===
        // Compare the student's audit tally against the dynamically-fetched HEC rules
        let failed = false;
        let errors = [];

        // Check 1: Total Credits
        if (audit.totalCredits < programRules.minTotalCredits) {
            failed = true;
            errors.push(`Total Credits (Failed: ${audit.totalCredits}/${programRules.minTotalCredits})`);
        }
        
        // Check 2: All specific HEC categories (GenEd, Major, etc.)
        for (const category in rules) {
            if (audit[category] < rules[category]) {
                failed = true;
                errors.push(`${category} (Failed: ${audit[category]}/${rules[category]})`);
            }
        }

        // 5. If the audit fails, stop here and throw the error.
        if (failed) {
            const errorMsg = `Audit FAILED for ${studentId}: ${errors.join(', ')}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        // 6. === SUCCESS! ===
        // If we are here, all checks passed. Create the final, verifiable Degree asset.
        const degree = {
            docType: 'Degree', // This is important for "rich queries"
            studentId: student.studentId,
            name: student.name,
            program: student.programTitle,
            issueDate: new Date().toISOString(),
            issuingAuthority: "University (Org1)", // As per your diagram [1]
            verifiedAudit: audit, // Store the successful audit as permanent proof
        };

        const degreeKey = `DEGREE-${studentId}`;
        await ctx.stub.putState(degreeKey, Buffer.from(JSON.stringify(degree)));

        // 7. Finally, update the student's record to show they have graduated
        student.degreeIssued = true;
        await ctx.stub.putState(studentKey, Buffer.from(JSON.stringify(student)));

        console.info(`SUCCESS: Degree issued and saved to ledger as ${degreeKey}`);
        return JSON.stringify(degree); // Return the new degree
    }

    /**
     * A generic "read" function to query any asset from the ledger.
     * This is used for the Phase 2 Verification Flow.
     */
    async QueryLedger(ctx, key) {
        const dataBytes = await ctx.stub.getState(key);
        if (!dataBytes || dataBytes.length === 0) {
            throw new Error(`Key ${key} does not exist.`);
        }
        console.info(dataBytes.toString());
        return dataBytes.toString();
    }
}

// Export the contract
module.exports = DegreeContract;