import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test pdftotext directly
const buf = readFileSync('/home/ubuntu/upload/ULTRAGAZ_05_2026_58a88f0b-c369-4e8b-92e6-92710ece6e43.pdf');
const dir = mkdtempSync(join(tmpdir(), 'pdf-'));
const inFile = join(dir, 'input.pdf');
writeFileSync(inFile, buf);
const text = execSync(`pdftotext "${inFile}" -`, { maxBuffer: 10 * 1024 * 1024 }).toString('utf-8');
unlinkSync(inFile);

console.log('Texto extraído (primeiras 20 linhas):');
text.split('\n').slice(0, 20).forEach((l, i) => l.trim() && console.log(`  ${i}: ${l}`));

// Check for boleto patterns - NEW patterns
const linhaMatch1 = text.match(/(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14,15})/);
const linhaMatch2 = text.match(/(\d{11,12}\s+\d{11,12}\s+\d{11,12}\s+\d{11,12})/);
const cb44 = text.match(/(?<![\d])(\d{44})(?![\d])/);
const cb47 = text.match(/(?<![\d])(\d{47,48})(?![\d])/);
const vencMatch1 = text.match(/vencimento[:\s]+([\d]{2}[\/\-][\d]{2}[\/\-][\d]{2,4})/i);
const vencMatch2 = text.match(/Vencimento\s*\n\s*([\d]{2}[\/\-][\d]{2}[\/\-][\d]{2,4})/i);

console.log('\nLinha digitável (padrão banco):', linhaMatch1?.[1] || 'não encontrada');
console.log('Linha digitável (concessionária 4 grupos):', linhaMatch2?.[1] || 'não encontrada');
console.log('Código barras 44 dígitos:', cb44?.[1] || 'não encontrado');
console.log('Código barras 47-48 dígitos:', cb47?.[1] || 'não encontrado');
console.log('Vencimento (inline):', vencMatch1?.[1] || 'não encontrado');
console.log('Vencimento (próxima linha):', vencMatch2?.[1] || 'não encontrado');

// Look for all number sequences >= 40 digits
const allLong = text.match(/\d{40,}/g);
console.log('\nSequências de 40+ dígitos:', allLong || 'nenhuma');

// Show last 10 lines
console.log('\nÚltimas 10 linhas:');
const lines = text.split('\n').filter(l => l.trim());
lines.slice(-10).forEach((l, i) => console.log(`  ${i}: ${l}`));
