import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractText(filePath) {
  const buf = readFileSync(filePath);
  const uint8 = new Uint8Array(buf);
  const doc = await pdfjsLib.getDocument({ data: uint8, useSystemFonts: true }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ');
    fullText += pageText + '\n';
  }
  return fullText;
}

// Test with Ultragaz PDF
console.log('=== ULTRAGAZ ===');
const t1 = await extractText('/home/ubuntu/upload/ULTRAGAZ_05_2026_58a88f0b-c369-4e8b-92e6-92710ece6e43.pdf');
t1.split('\n').slice(0, 15).forEach((l, i) => l.trim() && console.log(`  ${i}: ${l.trim()}`));
console.log('Linha digitável:', t1.match(/(\d{11,12}\s+\d{11,12}\s+\d{11,12}\s+\d{11,12})/)?.[1] || 'não encontrada');
console.log('Vencimento:', t1.match(/Vencimento[\s\S]{0,100}?([\d]{2}\/[\d]{2}\/[\d]{4})/i)?.[1] || 'não encontrado');

// Test with bank statement PDFs
console.log('\n=== EXTRATO 1 (Jan-Mar) ===');
const t2 = await extractText('/home/ubuntu/upload/31113764_01JAN2026_27MAR2026.pdf');
t2.split('\n').slice(0, 20).forEach((l, i) => l.trim() && console.log(`  ${i}: ${l.trim()}`));

console.log('\n=== EXTRATO 2 (Mar-Mai) ===');
const t3 = await extractText('/home/ubuntu/upload/31113764_27MAR2026_08MAI2026.pdf');
t3.split('\n').slice(0, 20).forEach((l, i) => l.trim() && console.log(`  ${i}: ${l.trim()}`));
