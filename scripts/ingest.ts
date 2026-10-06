import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import mongoose from 'mongoose';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env', '.env.example'],
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/booran_live_inventory';

const vehicleSchema = new mongoose.Schema({
  stockNumber: { type: String, required: true, unique: true },
  rooftopId: { type: String, required: true },
  rooftopName: { type: String, required: true },
  branchCode: { type: String, required: true },
  clusterId: { type: String, required: true },
  franchise: { type: String, required: true },
  rego: { type: String, default: '' },
  year: { type: Number, required: true },
  make: { type: String, required: true },
  model: { type: String, required: true },
  variant: { type: String, default: '' },
  body: { type: String, default: '' },
  colour: { type: String, default: '' },
  fuel: { type: String, default: '' },
  transmission: { type: String, default: 'Automatic' },
  odometer: { type: Number, default: 0 },
  category: { type: String, required: true },
  vehicleCost: { type: Number, required: true },
  postedRecon: { type: Number, default: 0 },
  extras: { type: Number, default: 0 },
  totalStockCost: { type: Number, required: true },
  floorplanExposure: { type: Number, default: 0 },
  gstInclusive: { type: Boolean, default: true },
  advertisedPrice: { type: Number, default: null },
  heroPhoto: { type: String, default: '' },
  photos: { type: [String], default: [] },
  isLiveOnWebsite: { type: Boolean, default: false },
  listingUrl: { type: String, default: '' },
  listingDescription: { type: String, default: '' },
  description: { type: String, default: '' },
  status: { type: String, required: true, default: 'IN-STOCK' },
  dateInStock: { type: Date, required: true },
  expectedReadyDate: { type: Date, default: null },
  lastStatusChangeDate: { type: Date, default: null },
  salesperson: { type: String, default: '' },
  hasOpenRoPo: { type: Boolean, default: false },
  dealNumber: { type: String, default: '' },
  destLoc: { type: String, default: '' },
  daysInStock: { type: Number, required: true },
  agingBucket: { type: String, required: true },
  frontlineReady: { type: Boolean, required: true },
  potentialGross: { type: Number, default: 0 },
  holdingCostPerDay: { type: Number, default: 0 },
  accumulatedHoldingCost: { type: Number, default: 0 },
  recommendedAction: { type: String, required: true, default: 'NONE' },
  actionReason: { type: String, default: '' },
  recommendedTransferTarget: { type: String, default: '' },
  sisterUnitsInGroup: { type: Number, default: 0 },
  pentanaSource: { type: String, default: 'eraPower' },
  isPriceReviewRequired: { type: Boolean, default: false },
}, { timestamps: true });

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema) as any;

function determineAgingBucket(days: number) {
  if (days <= 30) return '0-30';
  if (days <= 45) return '31-45';
  if (days <= 60) return '46-60';
  if (days <= 90) return '61-90';
  return '90+';
}

async function ingestCsv(filePath: string) {
  const filename = path.basename(filePath, '.csv');
  const [branchCode, rooftopName, franchise, category] = filename.split('_');

  const results: any[] = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        const listPrice = parseFloat(data['list price'] || '0');
        const age = parseInt(data['age'] || '0', 10);
        const odometer = parseInt(data['odometer'] || '0', 10);
        let year = parseInt(data['year'] || '0', 10);
        if (year < 100) year += 2000;
        
        const dateInStock = new Date();
        dateInStock.setDate(dateInStock.getDate() - age);

        const vehicle = {
          stockNumber: data['stock no'],
          rooftopId: rooftopName.toLowerCase(),
          rooftopName,
          branchCode,
          clusterId: 'cluster-' + franchise.toLowerCase(),
          franchise,
          rego: data['reg no'],
          year,
          make: franchise,
          model: data['carline'],
          colour: data['colour'],
          odometer,
          category,
          vehicleCost: listPrice,
          totalStockCost: listPrice,
          advertisedPrice: listPrice > 0 ? listPrice : null,
          description: data['description'],
          status: data['status'] === 'WHOLESALE' ? 'WHOLESALE' : 'IN-STOCK',
          dateInStock,
          daysInStock: age,
          agingBucket: determineAgingBucket(age),
          frontlineReady: true,
          hasOpenRoPo: data['open ro/po'] === 'Y',
          destLoc: data['dest loc'] || '',
          recommendedAction: 'NONE',
        };
        results.push(vehicle);
      })
      .on('end', async () => {
        console.log(`Parsed ${results.length} records from ${filename}`);
        for (const doc of results) {
          try {
            await Vehicle.findOneAndUpdate(
              { stockNumber: doc.stockNumber },
              { $set: doc },
              { upsert: true, new: true }
            );
          } catch (err) {
            console.error(`Error saving ${doc.stockNumber}: ${err.message}`);
          }
        }
        resolve(true);
      })
      .on('error', reject);
  });
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const csvDir = path.resolve(__dirname, '../../csv_data');
  const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));
  
  for (const file of files) {
    const filePath = path.join(csvDir, file);
    await ingestCsv(filePath);
  }

  console.log('Ingestion complete');
  await mongoose.disconnect();
}

main().catch(console.error);
