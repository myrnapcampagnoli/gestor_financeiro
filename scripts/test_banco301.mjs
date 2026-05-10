import { readFileSync } from "fs";
import { config } from "dotenv";
config();

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const filePath = "/home/ubuntu/upload/31113764_01JAN2026_27MAR2026(2).pdf";
const data = new Uint8Array(readFileSync(filePath));
const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;

const items = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  for (const item of content.items) {
    if (item.str && item.str.trim()) {
      items.push({ str: item.str.trim(), x: Math.round(item.transform[4]), y: Math.round(item.transform[5]), page: p });
    }
  }
}

const byY = new Map();
for (const item of items) {
  const key = item.page + "_" + item.y;
  if (!byY.has(key)) byY.set(key, []);
  byY.get(key).push(item);
}

const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;
let count = 0;

for (const [key, row] of byY) {
  const dateItem = row.find(i => i.x >= 38 && i.x <= 80 && dateRe.test(i.str));
  if (!dateItem) continue;

  const allInRow = row.sort((a, b) => a.x - b.x);
  const entradaItems = row.filter(i => i.x >= 390 && i.x <= 445);
  const saidaItems = row.filter(i => i.x >= 445 && i.x <= 510);
  const descItems = row.filter(i => i.x >= 100 && i.x < 420);

  if (count < 10) {
    console.log(`\nRow ${key}: Date=${dateItem.str}`);
    console.log(`  Desc: ${descItems.map(i => i.str).join(" | ")}`);
    console.log(`  Entrada items (x 390-445): ${JSON.stringify(entradaItems.map(i => ({str: i.str, x: i.x})))}`);
    console.log(`  Saída items (x 445-510): ${JSON.stringify(saidaItems.map(i => ({str: i.str, x: i.x})))}`);
  }
  count++;
}
console.log(`\nTotal rows with date: ${count}`);
