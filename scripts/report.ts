import PDFDocument = require('pdfkit');
import * as fs from 'fs';
import mongoose from 'mongoose';
import * as path from 'path';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env', '.env.example'],
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/booran_live_inventory';

async function generateReport() {
  await mongoose.connect(MONGODB_URI);
  
  const Vehicle = mongoose.connection.db.collection('vehicles');
  
  const totalVehicles = await Vehicle.countDocuments();
  
  const byStatus = await Vehicle.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]).toArray();

  const byMake = await Vehicle.aggregate([
    { $group: { _id: "$make", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream('Ingestion_Report.pdf'));

  doc.fontSize(25).text('Database Ingestion Verification Report', { align: 'center' });
  doc.moveDown();
  
  doc.fontSize(16).text(`Total Vehicles Inserted: ${totalVehicles}`);
  doc.moveDown();

  doc.fontSize(20).text('Vehicles by Status:');
  doc.fontSize(14);
  byStatus.forEach(stat => {
    doc.text(`- ${stat._id}: ${stat.count}`);
  });
  doc.moveDown();

  doc.fontSize(20).text('Vehicles by Make:');
  doc.fontSize(14);
  byMake.forEach(m => {
    doc.text(`- ${m._id}: ${m.count}`);
  });
  
  doc.moveDown();
  doc.fontSize(14).text(`Generated on: ${new Date().toLocaleString()}`);

  doc.end();
  
  console.log('Report saved to Ingestion_Report.pdf');
  await mongoose.disconnect();
}

generateReport().catch(console.error);
