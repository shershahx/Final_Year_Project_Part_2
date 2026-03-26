const fs = require('fs');
async function test() {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const pdfPath = '/home/talha/FYP- project/backend/uploads/degrees/batch-1776316714295-895753477_signed_1776316826809_signed_1776316843704.pdf';
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjsLib.getDocument(data).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    console.log("Viewport:", viewport.width, viewport.height);
    for (const item of textContent.items.slice(0, 3)) {
        console.log(item.str, item.transform);
    }
}
test();
