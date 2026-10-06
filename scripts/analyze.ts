/**
 * Deep CSV Analysis Script
 * Analyzes all CSVs in csv_data and compares against the MongoDB database.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import mongoose from 'mongoose';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/booran_live_inventory';
const CSV_DIR = path.resolve(__dirname, '../../csv_data');

interface RowAnalysis {
  stockNumber: string;
  issues: string[];
}

interface FileReport {
  filename: string;
  branchCode: string;
  rooftopName: string;
  franchise: string;
  category: string;
  headers: string[];
  totalRows: number;
  blankRows: number;
  validRows: number;
  rowIssues: RowAnalysis[];
  uniqueStatuses: string[];
}

async function parseCSV(filePath: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    let headers: string[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (h: string[]) => { headers = h; })
      .on('data', (row: Record<string, string>) => rows.push(row))
      .on('end', () => resolve({ headers, rows }))
      .on('error', reject);
  });
}

function analyzeRow(row: Record<string, string>, headers: string[]): string[] {
  const issues: string[] = [];
  const stockNo = row['stock no'] || row['stock#'];
  if (!stockNo) issues.push('MISSING_STOCK_NUMBER');

  const listPrice = parseFloat(row['list price'] || '0');
  if (listPrice === 0) issues.push('ZERO_LIST_PRICE');
  if (listPrice < 0) issues.push('NEGATIVE_PRICE');

  const ageRaw = row['age'];
  const age = parseInt(ageRaw || '0', 10);
  if (!ageRaw || isNaN(age)) issues.push('MISSING_OR_INVALID_AGE');
  if (age > 1500) issues.push(`EXTREME_AGE_${age}_DAYS`);

  const yearRaw = row['year'];
  const year = parseInt(yearRaw || '0', 10);
  if (headers.includes('year') && (!yearRaw || isNaN(year) || year === 0)) issues.push('MISSING_YEAR');

  if (!row['colour']) issues.push('MISSING_COLOUR');
  if (!row['status']) issues.push('MISSING_STATUS');
  if (!row['carline']) issues.push('MISSING_CARLINE');

  return issues;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const allDbDocs = await db.collection('vehicles').find({}).toArray();
  const dbByStock = new Map(allDbDocs.map(d => [d.stockNumber, d]));

  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  
  const reports: FileReport[] = [];
  const allStockNumbers = new Set<string>();
  let globalTotalRows = 0;
  let globalZeroPrice = 0;
  let globalMissingStock = 0;
  let globalExtremeAge = 0;
  const globalStatusSet = new Set<string>();
  const uniqueHeaderVariants = new Set<string>();
  const notInDB: string[] = [];
  const perRooftop: Record<string, number> = {};
  const perFranchise: Record<string, number> = {};
  const perCategory: Record<string, number> = {};

  for (const file of csvFiles) {
    const filePath = path.join(CSV_DIR, file);
    const filename = path.basename(file, '.csv');
    const parts = filename.split('_');
    const branchCode = parts[0];
    const rooftopName = parts.slice(1, -2).join('_');
    const franchise = parts[parts.length - 2];
    const category = parts[parts.length - 1];

    const { headers, rows } = await parseCSV(filePath);
    uniqueHeaderVariants.add(headers.join(','));

    const blankRows = rows.filter(r => Object.values(r).every(v => !v?.trim())).length;
    const validRows = rows.filter(r => {
      const sn = r['stock no'] || r['stock#'];
      return sn && sn.trim() !== '';
    });

    const rowIssues: RowAnalysis[] = [];
    const fileStatuses = new Set<string>();

    for (const row of validRows) {
      const sn = (row['stock no'] || row['stock#']).trim();
      const issues = analyzeRow(row, headers);
      allStockNumbers.add(sn);
      if (issues.length > 0) rowIssues.push({ stockNumber: sn, issues });
      if (issues.some(i => i === 'ZERO_LIST_PRICE')) globalZeroPrice++;
      if (issues.some(i => i === 'MISSING_STOCK_NUMBER')) globalMissingStock++;
      if (issues.some(i => i.startsWith('EXTREME_AGE'))) globalExtremeAge++;
      if (!dbByStock.has(sn)) notInDB.push(`${file} → ${sn}`);
      const st = row['status'];
      if (st) { fileStatuses.add(st); globalStatusSet.add(st); }
    }

    globalTotalRows += validRows.length;
    perRooftop[rooftopName] = (perRooftop[rooftopName] || 0) + validRows.length;
    perFranchise[franchise] = (perFranchise[franchise] || 0) + validRows.length;
    perCategory[category] = (perCategory[category] || 0) + validRows.length;

    reports.push({
      filename: file,
      branchCode,
      rooftopName,
      franchise,
      category,
      headers,
      totalRows: rows.length,
      blankRows,
      validRows: validRows.length,
      rowIssues,
      uniqueStatuses: Array.from(fileStatuses),
    });
  }

  // ============ PRINT REPORT ============

  console.log('='.repeat(70));
  console.log('              DEEP CSV ANALYSIS REPORT');
  console.log('='.repeat(70));
  console.log(`Total CSV Files:             ${csvFiles.length}`);
  console.log(`Total Valid Rows (CSV):      ${globalTotalRows}`);
  console.log(`Total Records in MongoDB:    ${allDbDocs.length}`);
  console.log(`Records with $0 list price:  ${globalZeroPrice}`);
  console.log(`Records with extreme age:    ${globalExtremeAge}`);
  console.log(`Stock #s not found in DB:    ${notInDB.length}`);
  console.log(`Unique Header Variants:      ${uniqueHeaderVariants.size}`);
  console.log();

  console.log('--- UNIQUE CSV HEADER VARIANTS ---');
  Array.from(uniqueHeaderVariants).forEach((h, i) => console.log(`  [${i + 1}] ${h}`));
  console.log();

  console.log('--- RECORDS BY ROOFTOP ---');
  Object.entries(perRooftop).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k.padEnd(30)} ${v}`));
  console.log();

  console.log('--- RECORDS BY FRANCHISE ---');
  Object.entries(perFranchise).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k.padEnd(20)} ${v}`));
  console.log();

  console.log('--- RECORDS BY CATEGORY ---');
  Object.entries(perCategory).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k.padEnd(10)} ${v}`));
  console.log();

  console.log('--- ALL UNIQUE STATUSES FOUND IN CSVs ---');
  Array.from(globalStatusSet).forEach(s => console.log(`  - ${s}`));
  console.log();

  console.log('--- PER-FILE SUMMARY ---');
  for (const r of reports) {
    const hasIssues = r.rowIssues.length > 0;
    const flag = hasIssues ? '⚠' : '✓';
    console.log(`  ${flag} ${r.filename.padEnd(50)} rows=${r.validRows} issues=${r.rowIssues.length}`);
    if (hasIssues) {
      const issueSummary: Record<string, number> = {};
      r.rowIssues.forEach(ri => ri.issues.forEach(i => { issueSummary[i] = (issueSummary[i] || 0) + 1; }));
      Object.entries(issueSummary).forEach(([k, v]) => console.log(`      └─ ${k}: ${v} records`));
    }
  }
  console.log();

  if (notInDB.length > 0) {
    console.log('--- STOCK NUMBERS IN CSV BUT NOT FOUND IN DB ---');
    notInDB.slice(0, 30).forEach(n => console.log(`  - ${n}`));
    if (notInDB.length > 30) console.log(`  ... and ${notInDB.length - 30} more`);
    console.log();
  }

  console.log('='.repeat(70));
  console.log('Analysis complete.');

  await mongoose.disconnect();
}

main().catch(console.error);
