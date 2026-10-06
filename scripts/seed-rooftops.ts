/**
 * Rooftop Seeder + Vehicle rooftopId normalizer
 * 
 * This script:
 * 1. Seeds all 4 real rooftops into the rooftops collection
 * 2. Normalizes all vehicle rooftopId/rooftopName to match the rooftop records
 *    based on branchCode in the CSV filename
 */

import * as mongoose from 'mongoose';
import { ConfigModule } from '@nestjs/config';

ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/booran_live_inventory';

// ── Rooftop definitions matching the real CSV data ──────────────────────
// These are derived from the actual CSV filenames and loc codes in the data
const ROOFTOPS = [
  {
    rooftopId: 'boorancheltenham',
    name: 'Booran Cheltenham',
    location: 'Cheltenham, VIC',
    franchise: 'Multi-Franchise',
    clusterId: 'cluster-cheltenham',
    clusterName: 'Booran Cheltenham Cluster',
    pentanaBranchCodes: ['01', 'CHELT', 'CHELTI', 'SOCH', 'YYARD', 'IYARD'],
    generalManager: 'Brett Harrison',
    dealerPrincipal: 'Paul Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.boorancheltenham.com.au',
  },
  {
    rooftopId: 'cranbournehyundai',
    name: 'Cranbourne Hyundai',
    location: 'Cranbourne, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-south',
    clusterName: 'Booran Hyundai South Cluster',
    pentanaBranchCodes: ['20', 'CRANHOL', 'CRAN'],
    generalManager: 'Sarah Jenkins',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.cranbournehyundai.com.au',
  },
  {
    rooftopId: 'southmoranghyundai',
    name: 'South Morang Hyundai',
    location: 'South Morang, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-north',
    clusterName: 'Booran Hyundai North Cluster',
    pentanaBranchCodes: ['40', 'MILLPK', 'SMORAN'],
    generalManager: 'Nathan Cole',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'EraNet',
    websiteUrl: 'https://www.southmoranghyundai.com.au',
  },
  {
    rooftopId: 'berwickmg',
    name: 'Berwick MG Hyundai',
    location: 'Berwick, VIC',
    franchise: 'MG / Hyundai',
    clusterId: 'cluster-berwick',
    clusterName: 'Booran Berwick Cluster',
    pentanaBranchCodes: ['90', 'BWHY', 'BWMG'],
    generalManager: "Liam O'Connor",
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.berwickmg.com.au',
  },
];

// Map: any known rooftopId variant → canonical rooftopId + name
const ROOFTOP_ID_MAP: Record<string, { rooftopId: string; rooftopName: string }> = {
  // Cheltenham variants
  'boorancheltenham':         { rooftopId: 'boorancheltenham', rooftopName: 'Booran Cheltenham' },
  'BooranCheltenham':         { rooftopId: 'boorancheltenham', rooftopName: 'Booran Cheltenham' },
  'booran-kia-cheltenham':    { rooftopId: 'boorancheltenham', rooftopName: 'Booran Cheltenham' },
  // Cranbourne variants
  'cranbournehyundai':        { rooftopId: 'cranbournehyundai', rooftopName: 'Cranbourne Hyundai' },
  'CranbourneHyundai':        { rooftopId: 'cranbournehyundai', rooftopName: 'Cranbourne Hyundai' },
  'booran-hyundai-cranbourne':{ rooftopId: 'cranbournehyundai', rooftopName: 'Cranbourne Hyundai' },
  // South Morang variants
  'southmoranghyundai':       { rooftopId: 'southmoranghyundai', rooftopName: 'South Morang Hyundai' },
  'SouthMorangHyundai':       { rooftopId: 'southmoranghyundai', rooftopName: 'South Morang Hyundai' },
  'booran-hyundai-south-morang': { rooftopId: 'southmoranghyundai', rooftopName: 'South Morang Hyundai' },
  // Berwick variants
  'berwickmg':                { rooftopId: 'berwickmg', rooftopName: 'Berwick MG Hyundai' },
  'BerwickMG':                { rooftopId: 'berwickmg', rooftopName: 'Berwick MG Hyundai' },
  'BerwickMG_Hyundai':        { rooftopId: 'berwickmg', rooftopName: 'Berwick MG Hyundai' },
  'booran-hyundai-berwick':   { rooftopId: 'berwickmg', rooftopName: 'Berwick MG Hyundai' },
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ── 1. Upsert Rooftops ──────────────────────────────────────────────
  console.log('Seeding rooftops...');
  for (const r of ROOFTOPS) {
    await db.collection('rooftops').updateOne(
      { rooftopId: r.rooftopId },
      { $set: r },
      { upsert: true }
    );
    console.log(`  ✓ ${r.name} (${r.rooftopId})`);
  }

  // ── 2. Normalize vehicle rooftopId/rooftopName ─────────────────────
  console.log('\nNormalizing vehicle rooftopId references...');
  let updated = 0;
  let skipped = 0;

  for (const [from, to] of Object.entries(ROOFTOP_ID_MAP)) {
    const result = await db.collection('vehicles').updateMany(
      { rooftopId: from },
      { $set: { rooftopId: to.rooftopId, rooftopName: to.rooftopName } }
    );
    if (result.modifiedCount > 0) {
      console.log(`  ${from} → ${to.rooftopId}  (${result.modifiedCount} vehicles)`);
      updated += result.modifiedCount;
    } else {
      skipped++;
    }
  }

  console.log(`\n✓ Normalized ${updated} vehicles.`);
  console.log(`  (${skipped} rooftopId variants had no vehicles to update)`);

  // ── 3. Verify ────────────────────────────────────────────────────────
  console.log('\nVerification:');
  const rooftopCount = await db.collection('rooftops').countDocuments();
  const vehicleCount = await db.collection('vehicles').countDocuments();
  const breakdown = await db.collection('vehicles').aggregate([
    { $group: { _id: '$rooftopId', rooftopName: { $first: '$rooftopName' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log(`  Rooftops in DB:  ${rooftopCount}`);
  console.log(`  Vehicles in DB:  ${vehicleCount}`);
  console.log('\n  Vehicles per rooftop:');
  breakdown.forEach(b => console.log(`    ${b.rooftopName.padEnd(30)} (${b._id})  →  ${b.count}`));

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(console.error);
