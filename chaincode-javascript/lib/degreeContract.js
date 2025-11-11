/*
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

// We use the fabric-contract-api to define our smart contract
const { Contract } = require('fabric-contract-api');

// The main class for our contract
class DegreeContract extends Contract {

    constructor() {
        // This is the name of the contract
        super('DegreeContract');
    }

    /**
     * Initializes the ledger with dummy data, specifically the HEC rules.
     * This is your "rulebook" for the audit.
     */
    async InitLedger(ctx) {
        console.info('============= START : InitLedger ===========');

        // This is the HEC Undergraduate Education Policy V 1.1
        // We are "hard-coding" the rules for a BSCS program onto the ledger.
        const programs = [
            {
                programTitle: 'BSCS',
                minTotalCredits: 120,
                rules: {
                    generalEducation: 30,  // HEC Rule
                    majorDisciplinary: 72, // HEC Rule
                    interdisciplinary: 12, // HEC Rule
                    capstoneProject: 3,    // HEC Rule
                    internship: 3,         // HEC Rule
                }
            }
        ];

        // Loop through our programs and add them to the ledger
        for (const program of programs) {
            // The "key" is how we will find it later
            const key = `PROGRAM-${program.programTitle.replace(/\s/g, '')}`;
            
            // putState writes data to the ledger
            // We must convert the JSON object to a string buffer
            await ctx.stub.putState(key, Buffer.from(JSON.stringify(program)));
            console.info(`Added program template: ${key}`);
        }

        console.info('============= END : InitLedger ===========');
    }

    /**
     * Creates a new student on the ledger.
     */
    async CreateStudent(ctx, studentId, name, programTitle) {
        console.info('============= START : CreateStudent ===========');

        // Check if the program template exists
        const programKey = `PROGRAM-${programTitle.replace(/\s/g, '')}`;
        const programBytes = await ctx.stub.getState(programKey);
        if (!programBytes || programBytes.length === 0) {
            throw new Error(`Program template ${programTitle} does not exist. Run InitLedger first.`);
        }

        // Construct the student object
        const student = {
            docType: 'Student',
            studentId: studentId,
            name: name,
            programTitle: programTitle,
            academicHistory: [], // This array will hold all semester results
            degreeIssued: false, // We flip this to true on graduation
        };

        // The key for the student
        const studentKey = `STUDENT-${studentId}`;

        // Save the student to the ledger
        await ctx.stub.putState(studentKey, Buffer.from(JSON.stringify(student)));
        console.info(`Student ${studentId} created.`);
        console.info('============= END : CreateStudent ===========');
    }

    /**
     * Adds a student's semester results to their academic history.
     */
    async AddSemesterResult(ctx, studentId, semesterCode, coursesJSON) {
        console.info('============= START : AddSemesterResult ===========');

        const studentKey = `STUDENT-${studentId}`;
        
        // 1. Get the student's current record
        const studentBytes = await ctx.stub.getState(studentKey);
        if (!studentBytes || studentBytes.length === 0) {
            throw new Error(`Student ${studentId} does not exist.`);
        }
        const student = JSON.parse(studentBytes.toString());

        // 2. Parse the new courses (this will be a JSON string from the CLI)
        // e.g., ''
        const courses = JSON.parse(coursesJSON);

        // 3. Add the new semester data to their history
        student.academicHistory.push({
            semester: semesterCode,
            courses: courses,
        });

        // 4. Save the *updated* student object back to the ledger
        // This overwrites the old record with the new one.
        await ctx.stub.putState(studentKey, Buffer.from(JSON.stringify(student)));
        console.info(`Added ${semesterCode} results for student ${studentId}.`);
        console.info('============= END : AddSemesterResult ===========');
    }

    /**
     * This is your CROWN JEWEL function.
     * It runs the HEC audit and issues a degree if the student qualifies.
     */
    async IssueDegree(ctx, studentId) {
        console.info('============= START : IssueDegree ===========');

        const studentKey = `STUDENT-${studentId}`;

        // 1. Get the student's full record
        const studentBytes = await ctx.stub.getState(studentKey);
        if (!studentBytes || studentBytes.length === 0) {
            throw new Error(`Student ${studentId} does not exist.`);
        }
        const student = JSON.parse(studentBytes.toString());

        if (student.degreeIssued) {
            throw new Error(`Degree has already been issued to student ${studentId}.`);
        }

        // 2. Get the HEC "Rulebook" for their program
        const programKey = `PROGRAM-${student.programTitle.replace(/\s/g, '')}`;
        const programBytes = await ctx.stub.getState(programKey);
        if (!programBytes || programBytes.length === 0) {
            throw new Error(`Program template ${student.programTitle} does not exist.`);
        }
        const programRules = JSON.parse(programBytes.toString());

        // 3. === THE AUDIT LOGIC ===
        // This is where we tally up all their credits.
        const audit = {
            totalCredits: 0,
            generalEducation: 0,
            majorDisciplinary: 0,
            interdisciplinary: 0,
            capstoneProject: 0,
            internship: 0,
        };

        // Loop through every semester in their history
        for (const semester of (student.academicHistory || [])) {
            // Loop through every course in that semester
            for (const course of semester.courses) {
                // We only count passing grades (e.g., not 'F' or 'W')
                if (course.grade!== 'F' && course.grade!== 'W') {
                    // Add to the total
                    audit.totalCredits += course.credits || 0;

                    // Add to the specific category
                    if (audit.hasOwnProperty(course.category)) {
                        audit[course.category] += course.credits || 0;
                    }
                }
            }
        }
        console.info(`AUDIT RESULTS for ${studentId}:`, JSON.stringify(audit));

        // 4. === THE VERDICT ===
        // Compare the student's audit against the HEC rules
        const rules = (programRules && programRules.rules) ? programRules.rules : {};
        let failed = false;
        let errors = [];

        if (audit.totalCredits < (programRules.minTotalCredits || 0)) {
            failed = true;
            errors.push(`Total Credits (Failed: ${audit.totalCredits}/${programRules.minTotalCredits})`);
        }
        for (const category in rules) {
            if (audit[category] < rules[category]) {
                failed = true;
                errors.push(`${category} (Failed: ${audit[category]}/${rules[category]})`);
            }
        }

        // 5. If the audit fails, stop here and throw an error.
        // This is a *good* thing. It proves your logic works.
        if (failed) {
            const errorMsg = `Audit FAILED for ${studentId}: ${errors.join(', ')}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        // 6. === SUCCESS! ===
        // If we are here, the audit passed.
        // We create a new, permanent, unchangeable Degree asset.
        const degree = {
            docType: 'Degree',
            studentId: student.studentId,
            name: student.name,
            program: student.programTitle,
            issueDate: new Date().toISOString(),
            issuingAuthority: "Org1 (Your University)",
            verifiedAudit: audit, // Store the successful audit as proof
        };

        // Create a unique key for the degree
        const degreeKey = `DEGREE-${studentId}`;
        await ctx.stub.putState(degreeKey, Buffer.from(JSON.stringify(degree)));

        // 7. Finally, update the student's record to show they have graduated
        student.degreeIssued = true;
        await ctx.stub.putState(studentKey, Buffer.from(JSON.stringify(student)));

        console.info(`SUCCESS: Degree issued and saved to ledger as ${degreeKey}`);
        return JSON.stringify(degree); // Return the new degree
    }

    /**
     * A simple "read" function to query the ledger.
     * This is what your API/Frontend would use later.
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
