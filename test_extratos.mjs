import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);

// Test pdfjs extraction on Nubank PDF
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

async function extractText(filePath) {
  const buffer = readFileSync(filePath);
  const uint8 = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data: uint8, useSystemFonts: true }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => ('str' in item ? item.str : '')).join('\n');
    fullText += pageText + '\n';
  }
  return fullText;
}

const nubank = await extractText('/home/ubuntu/upload/NU_91720574_01JAN2026_31JAN2026(1).pdf');
console.log('=== NUBANK JANEIRO (primeiras 100 linhas) ===');
console.log(nubank.split('\n').slice(0, 100).join('\n'));
