/**
 * Booran Motor Group - Inventory Ingestion Verification Report
 * Clean professional PDF with proper layout, no blank pages.
 */

import PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';
import * as csvParser from 'csv-parser';
import mongoose from 'mongoose';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/booran_live_inventory';
const CSV_DIR = path.resolve(__dirname, '../../csv_data');
const OUTPUT_PATH = path.resolve(__dirname, '../Ingestion_Report.pdf');

// Palette
const DARK    = '#1A1A2E';
const BLUE    = '#1565C0';
const GREEN   = '#2E7D32';
const AMBER   = '#E65100';
const RED     = '#B71C1C';
const WHITE   = '#FFFFFF';
const LIGHT   = '#EEF4FB';
const GREY    = '#546E7A';
const STRIPE  = '#F4F6F8';
const HDR_BG  = '#263238';

// Page geometry
const PAGE_W   = 595;
const MARGIN   = 45;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAGE_H   = 841;
const FOOTER_H = 28;
const BODY_MAX = PAGE_H - MARGIN - FOOTER_H - 10;

async function parseCsvRows(filePath: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (r: Record<string, string>) => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

class Report {
  doc: PDFKit.PDFDocument;
  pageNum = 1;

  constructor() {
    this.doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: false,
      bufferPages: false,
    });
  }

  addPage() {
    this.doc.addPage({ size: 'A4', margin: 0 });
    this.drawFooter();
    this.doc.y = MARGIN;
    this.pageNum++;
  }

  drawFooter() {
    const y = PAGE_H - FOOTER_H;
    this.doc.rect(0, y, PAGE_W, FOOTER_H).fill(DARK);
    this.doc
      .fillColor('#90CAF9')
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        `Booran Motor Group  |  Good Showroom Inventory Report  |  Confidential  |  Page ${this.pageNum}`,
        MARGIN, y + 9,
        { width: CONTENT_W, align: 'center' }
      );
  }

  /** Full-width coloured section heading bar */
  sectionHeading(title: string) {
    this.ensureSpace(40);
    const y = this.doc.y;
    this.doc.rect(MARGIN, y, CONTENT_W, 20).fill(BLUE);
    this.doc
      .fillColor(WHITE)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title.toUpperCase(), MARGIN + 8, y + 6, { width: CONTENT_W - 10 });
    this.doc.y = y + 26;
    this.doc.fillColor(DARK);
  }

  /** Ensure there's at least `needed` px before the footer, else new page */
  ensureSpace(needed: number) {
    if (this.doc.y + needed > BODY_MAX) {
      this.addPage();
    }
  }

  /** Draw table header row */
  tableHeader(cols: { label: string; w: number }[]) {
    this.ensureSpace(36);
    const y = this.doc.y;
    this.doc.rect(MARGIN, y, CONTENT_W, 18).fill(HDR_BG);
    let x = MARGIN + 5;
    this.doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5);
    for (const col of cols) {
      this.doc.text(col.label, x, y + 5, { width: col.w - 4, lineBreak: false });
      x += col.w;
    }
    this.doc.y = y + 20;
    this.doc.fillColor(DARK).font('Helvetica').fontSize(8);
  }

  /** Draw a single table row, with auto page-break if needed */
  tableRow(cells: string[], cols: { label: string; w: number }[], rowIdx: number,
           issueCell?: { idx: number; color: string }) {
    this.ensureSpace(18);
    const y = this.doc.y;
    const rowH = 16;
    if (rowIdx % 2 === 0) this.doc.rect(MARGIN, y, CONTENT_W, rowH).fill(STRIPE);
    let x = MARGIN + 5;
    this.doc.fillColor(DARK).font('Helvetica').fontSize(7.5);
    for (let i = 0; i < cols.length; i++) {
      const isIssue = issueCell && issueCell.idx === i;
      if (isIssue) {
        this.doc.fillColor(issueCell!.color).font('Helvetica-Bold');
      } else {
        this.doc.fillColor(DARK).font('Helvetica');
      }
      this.doc.text(cells[i] ?? '', x, y + 4, { width: cols[i].w - 6, lineBreak: false });
      x += cols[i].w;
    }
    this.doc.y = y + rowH;
  }

  kpiRow(items: { label: string; value: string; color: string }[]) {
    const y = this.doc.y;
    const boxW = Math.floor(CONTENT_W / items.length) - 6;
    const boxH = 52;
    for (let i = 0; i < items.length; i++) {
      const bx = MARGIN + i * (boxW + 8);
      const { label, value, color } = items[i];
      this.doc.rect(bx, y, boxW, boxH).fill(LIGHT);
      this.doc.rect(bx, y, 4, boxH).fill(color);
      this.doc
        .fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text(value, bx + 8, y + 7, { width: boxW - 10, align: 'center', lineBreak: false });
      this.doc
        .fillColor(GREY)
        .font('Helvetica')
        .fontSize(7)
        .text(label, bx + 8, y + 34, { width: boxW - 10, align: 'center', lineBreak: false });
    }
    this.doc.y = y + boxH + 10;
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB...');

  const db = mongoose.connection.db;
  const allDocs = await db.collection('vehicles').find({}).toArray();
  const dbByStock = new Map(allDocs.map(d => [d.stockNumber, d]));
  const totalDB = allDocs.length;

  const byStatus: Record<string, number> = {};
  const byRooftop: Record<string, number> = {};
  const byFranchise: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byAgingBucket: Record<string, number> = {};

  for (const d of allDocs) {
    byStatus[d.status]             = (byStatus[d.status] || 0) + 1;
    byRooftop[d.rooftopName]       = (byRooftop[d.rooftopName] || 0) + 1;
    byFranchise[d.franchise]       = (byFranchise[d.franchise] || 0) + 1;
    byCategory[d.category]         = (byCategory[d.category] || 0) + 1;
    byAgingBucket[d.agingBucket]   = (byAgingBucket[d.agingBucket] || 0) + 1;
  }

  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv')).sort();
  let totalCsvRows = 0, zeroPrice = 0, notInDB = 0, extremeAge = 0;

  const perFileStats: { file: string; rows: number; issues: number; flags: string }[] = [];

  for (const file of csvFiles) {
    const rows = await parseCsvRows(path.join(CSV_DIR, file));
    const valid = rows.filter(r => (r['stock no'] || r['stock#'])?.trim());
    totalCsvRows += valid.length;
    let fileIssues = 0;
    const flagSet = new Set<string>();
    for (const r of valid) {
      const sn = (r['stock no'] || r['stock#']).trim();
      const price = parseFloat(r['list price'] || '0');
      const age = parseInt(r['age'] || '0', 10);
      if (price === 0)       { zeroPrice++;   fileIssues++; flagSet.add('$0 price'); }
      if (!dbByStock.has(sn)){ notInDB++;     fileIssues++; flagSet.add('Not in DB'); }
      if (age > 1000)        { extremeAge++;                flagSet.add('Extreme age'); }
    }
    perFileStats.push({
      file: file.replace('.csv', ''),
      rows: valid.length,
      issues: fileIssues,
      flags: Array.from(flagSet).join(', ') || 'None',
    });
  }

  // ═══════════════════ BUILD PDF ═══════════════════════════════════
  const report = new Report();
  const doc = report.doc;
  const stream = fs.createWriteStream(OUTPUT_PATH);
  doc.pipe(stream);

  // ── PAGE 1: Cover ─────────────────────────────────────────────────
  doc.addPage({ size: 'A4', margin: 0 });
  report.drawFooter();

  // Header banner
  doc.rect(0, 0, PAGE_W, 180).fill(DARK);
  doc.fillColor(WHITE)
    .font('Helvetica-Bold').fontSize(24)
    .text('BOORAN MOTOR GROUP', 0, 52, { align: 'center', width: PAGE_W });
  doc.fillColor('#90CAF9')
    .font('Helvetica').fontSize(12)
    .text('Good Showroom — Inventory Ingestion Verification Report', 0, 88, { align: 'center', width: PAGE_W });
  doc.fillColor('#B0BEC5')
    .font('Helvetica').fontSize(9)
    .text(`Generated: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} AEST`,
      0, 115, { align: 'center', width: PAGE_W });

  doc.y = 200;

  // KPI row 1
  report.kpiRow([
    { label: 'CSV Files Processed',  value: `${csvFiles.length}`, color: BLUE  },
    { label: 'Total CSV Rows',        value: `${totalCsvRows}`,    color: BLUE  },
    { label: 'Records in MongoDB',    value: `${totalDB}`,         color: GREEN },
    { label: 'Missing from DB',       value: `${notInDB}`,         color: notInDB === 0 ? GREEN : RED },
  ]);

  // KPI row 2
  report.kpiRow([
    { label: '$0 List Price Records', value: `${zeroPrice}`,                    color: AMBER },
    { label: 'Extreme Age (>1000d)',  value: `${extremeAge}`,                   color: AMBER },
    { label: 'New Vehicles',          value: `${byCategory['New'] || 0}`,       color: BLUE  },
    { label: 'Used Vehicles',         value: `${byCategory['Used'] || 0}`,      color: BLUE  },
  ]);

  doc.moveDown(0.5);
  doc.fillColor(GREY).font('Helvetica').fontSize(8)
    .text(
      'This report verifies that all CSV data files have been parsed and inserted into the MongoDB inventory database.',
      MARGIN, doc.y, { width: CONTENT_W, align: 'center' }
    );

  // ── SECTION 1: By Rooftop ─────────────────────────────────────────
  doc.moveDown(1);
  report.sectionHeading('1.  Records by Rooftop');
  const rooftopCols = [
    { label: 'Rooftop',       w: 310 },
    { label: 'Records in DB', w: 100 },
    { label: '% of Total',    w: 95  },
  ];
  report.tableHeader(rooftopCols);
  Object.entries(byRooftop).sort((a, b) => b[1] - a[1]).forEach(([k, v], i) => {
    report.tableRow([k, v.toLocaleString(), ((v / totalDB) * 100).toFixed(1) + '%'], rooftopCols, i);
  });

  // ── SECTION 2: By Status ──────────────────────────────────────────
  doc.moveDown(0.5);
  report.sectionHeading('2.  Records by Vehicle Status');
  const statusCols = [
    { label: 'Status',     w: 220 },
    { label: 'Count',      w: 120 },
    { label: '% of Total', w: 165 },
  ];
  report.tableHeader(statusCols);
  Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([k, v], i) => {
    report.tableRow([k, v.toLocaleString(), ((v / totalDB) * 100).toFixed(1) + '%'], statusCols, i);
  });

  // ── SECTION 3: Aging Buckets ──────────────────────────────────────
  doc.moveDown(0.5);
  report.sectionHeading('3.  Records by Aging Bucket (Days in Stock)');
  const agingCols = [
    { label: 'Bucket',     w: 160 },
    { label: 'Count',      w: 130 },
    { label: '% of Total', w: 215 },
  ];
  report.tableHeader(agingCols);
  ['0-30', '31-45', '46-60', '61-90', '90+'].forEach((b, i) => {
    const v = byAgingBucket[b] || 0;
    report.tableRow([b, v.toLocaleString(), ((v / totalDB) * 100).toFixed(1) + '%'], agingCols, i);
  });

  // ── SECTION 4: By Franchise ───────────────────────────────────────
  doc.moveDown(0.5);
  report.sectionHeading('4.  Records by Franchise / Make');
  const franchiseCols = [
    { label: 'Franchise',  w: 220 },
    { label: 'Count',      w: 120 },
    { label: '% of Total', w: 165 },
  ];
  report.tableHeader(franchiseCols);
  Object.entries(byFranchise).sort((a, b) => b[1] - a[1]).forEach(([k, v], i) => {
    report.tableRow([k, v.toLocaleString(), ((v / totalDB) * 100).toFixed(1) + '%'], franchiseCols, i);
  });

  // ── SECTION 5: Per-file summary ───────────────────────────────────
  report.addPage();
  report.sectionHeading('5.  Per-File Ingestion Summary (All 87 CSV Files)');

  const fileCols = [
    { label: 'CSV File',       w: 265 },
    { label: 'Rows Parsed',    w: 70  },
    { label: 'Issues',         w: 60  },
    { label: 'Flags',          w: 110 },
  ];
  report.tableHeader(fileCols);

  perFileStats.forEach(({ file, rows, issues, flags }, i) => {
    report.tableRow(
      [file, rows.toString(), issues.toString(), flags],
      fileCols,
      i,
      { idx: 2, color: issues === 0 ? GREEN : AMBER }
    );
  });

  doc.end();

  stream.on('finish', async () => {
    console.log(`\n✅ Report saved: ${OUTPUT_PATH}`);
    await mongoose.disconnect();
  });
}

main().catch(console.error);
