const fs = require('fs');

async function test() {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const pdfPath = '/home/talha/FYP- project/backend/uploads/degrees/batch-1776316714295-895753477_signed_1776316826809_signed_1776316843704.pdf';
    
    let textItems = [];
    const data = await fs.promises.readFile(pdfPath);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    textItems = textContent.items;

    const width = 842.25;
    const height = 595.5;
    const margin = 20;
    const qrSize = 80;

    const candidates = [
        { name: 'Bottom-Right', x: width - qrSize - margin, y: margin },
        { name: 'Bottom-Left', x: margin, y: margin },
        { name: 'Top-Left', x: margin, y: height - qrSize - margin },
        { name: 'Top-Right', x: width - qrSize - margin, y: height - qrSize - margin },
        { name: 'Bottom-Center', x: (width - qrSize) / 2, y: margin },
        { name: 'Top-Center', x: (width - qrSize) / 2, y: height - qrSize - margin }
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

        let padX = 20;
        let padYBottom = 10;
        let padYTop = 20;

        const lowerStr = str.toLowerCase();
        if (lowerStr.includes('vice chancellor') || lowerStr.includes('registrar') || lowerStr.includes('controller') || lowerStr.includes('dean')) {
            padYTop = 130;
            padX = 100;
        }

        obstacles.push({
            str,
            x1: itemX - padX,
            y1: itemY - padYBottom,
            x2: itemX + itemWidth + padX,
            y2: itemY + itemHeight + padYTop
        });
    }

    const validCands = [];
    for (const cand of candidates) {
        const cx1 = cand.x;
        const cy1 = cand.y;
        const cx2 = cand.x + qrSize;
        const cy2 = cand.y + qrSize;

        let overlap = false;
        for (const obs of obstacles) {
            if (cx1 < obs.x2 && cx2 > obs.x1 && cy1 < obs.y2 && cy2 > obs.y1) {
                console.log(`Candidate ${cand.name} overlaps with "${obs.str}"`);
                overlap = true;
                break;
            }
        }
        if (!overlap) {
            validCands.push(cand);
        }
    }
    console.log("Valid Candidates:", validCands);
}
test();
