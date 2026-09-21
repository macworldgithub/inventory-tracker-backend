import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Rooftop, RooftopDocument } from '../../database/schemas/rooftop.schema';
import { Vehicle, VehicleDocument } from '../../database/schemas/vehicle.schema';
import { ActionItem, ActionItemDocument } from '../../database/schemas/action.schema';
import { FeedLog, FeedLogDocument } from '../../database/schemas/feed-log.schema';
import { RulesService } from '../rules/rules.service';
import * as fs from 'fs';
import * as path from 'path';
import {
  SEED_ROOFTOPS,
  NormalizedPentanaRecord,
  RawWebsiteRecord,
  IN_TRANSIT_LOC_CODES,
} from '../../data/seed-data';

// CSV file manifest: maps each file to its rooftop, type, and franchise
interface CsvFileMapping {
  filename: string;
  rooftopId: string;
  type: 'new' | 'used';
  franchise: string;
}

const CSV_FILE_MANIFEST: CsvFileMapping[] = [
  // Berwick Hyundai
  { filename: 'booran_berwick_new_hyundai.csv', rooftopId: 'booran-hyundai-berwick', type: 'new', franchise: 'Hyundai' },
  { filename: 'booran_berwick_used_hyundai.csv', rooftopId: 'booran-hyundai-berwick', type: 'used', franchise: 'Hyundai' },
  // Cranbourne Hyundai
  { filename: 'booran_caranbourne_hyundai_new.csv', rooftopId: 'booran-hyundai-cranbourne', type: 'new', franchise: 'Hyundai' },
  { filename: 'booran_carabourne_hyundai_used.csv', rooftopId: 'booran-hyundai-cranbourne', type: 'used', franchise: 'Hyundai' },
  // South Morang Hyundai
  { filename: 'booran_southmoran_new_hyundai.csv', rooftopId: 'booran-hyundai-south-morang', type: 'new', franchise: 'Hyundai' },
  { filename: 'booran_southmoran_used_hyundai.csv', rooftopId: 'booran-hyundai-south-morang', type: 'used', franchise: 'Hyundai' },
  // Cheltenham Kia
  { filename: 'booran_chatelnham_new_kia.csv', rooftopId: 'booran-kia-cheltenham', type: 'new', franchise: 'Kia' },
  { filename: 'booran_chatlnham_used_kia.csv', rooftopId: 'booran-kia-cheltenham', type: 'used', franchise: 'Kia' },
];

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(Rooftop.name) private rooftopModel: Model<RooftopDocument>,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    @InjectModel(ActionItem.name) private actionItemModel: Model<ActionItemDocument>,
    @InjectModel(FeedLog.name) private feedLogModel: Model<FeedLogDocument>,
    private rulesService: RulesService,
  ) { }

  async onModuleInit() {
    // Seed initial rooftops and data if database is empty
    const rooftopCount = await this.rooftopModel.countDocuments();
    if (rooftopCount === 0) {
      this.logger.log('Database empty. Initialising Booran Motor Group rooftops and ingesting CSV data...');
      await this.seedInitialDatabase();
    }
  }

  async seedInitialDatabase() {
    // 1. Seed Rooftops
    await this.rooftopModel.insertMany(SEED_ROOFTOPS);
    this.logger.log(`Seeded ${SEED_ROOFTOPS.length} Booran rooftops`);

    // 2. Parse CSV files into normalized records
    const { pentanaRecords, websiteRecords } = this.parseAllCsvFiles();
    this.logger.log(`Parsed ${pentanaRecords.length} Pentana records from ${CSV_FILE_MANIFEST.length} CSV files`);

    // 3. Reconcile and save
    await this.processFeeds(pentanaRecords, websiteRecords, 'CSV_INITIAL_LOAD', 'Initial CSV Import');
  }

  // ============ CSV PARSING ============

  /**
   * Parse a single CSV line, handling quoted fields with commas inside.
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Determine the category based on DMS status and CSV type.
   */
  private inferCategory(status: string, csvType: 'new' | 'used'): 'New' | 'Used' | 'Demo' | 'Loaner' {
    const upperStatus = status.toUpperCase();
    if (upperStatus === 'DEMO') return 'Demo';
    if (upperStatus === 'LOANER' || upperStatus === 'IN SERVICE' || upperStatus === 'DRIVE CARS') return 'Loaner';
    if (csvType === 'new') return 'New';
    return 'Used';
  }

  /**
   * Parse all 8 CSV files and produce a unified array of NormalizedPentanaRecord.
   */
  parseAllCsvFiles(): { pentanaRecords: NormalizedPentanaRecord[]; websiteRecords: RawWebsiteRecord[] } {
    const pentanaRecords: NormalizedPentanaRecord[] = [];
    const websiteRecords: RawWebsiteRecord[] = [];

    // Find CSV directory (try project root, process cwd, or relative paths)
    const possibleDirs = [
      path.resolve(__dirname, '..', '..', '..', '..'),
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(__dirname, '..', '..', '..'),
    ];

    let csvDir = possibleDirs[0];
    for (const d of possibleDirs) {
      if (fs.existsSync(path.join(d, CSV_FILE_MANIFEST[0].filename))) {
        csvDir = d;
        break;
      }
    }

    for (const mapping of CSV_FILE_MANIFEST) {
      const filePath = path.join(csvDir, mapping.filename);

      if (!fs.existsSync(filePath)) {
        this.logger.warn(`CSV file not found: ${filePath}. Skipping.`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);

      if (lines.length < 2) {
        this.logger.warn(`CSV file empty: ${mapping.filename}`);
        continue;
      }

      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const fields = this.parseCsvLine(lines[i]);

        try {
          let record: NormalizedPentanaRecord;

          if (mapping.type === 'new') {
            // New CSV: stock#,carline,description,fa,colour,loc,dest loc,list price,age,age,deal,status,open ro/po
            const stockNumber = (fields[0] || '').replace(/\*O$/, '').trim(); // Remove *O suffix from on-order
            const carline = fields[1] || '';
            const description = fields[2] || '';
            const colour = fields[4] || '';
            const loc = fields[5] || '';
            const destLoc = fields[6] || '';
            const listPrice = parseFloat(fields[7]) || 0;
            const daysInStock = parseInt(fields[9]) || 0;
            const deal = fields[10] || '';
            const status = fields[11] || 'IN-STOCK';
            const openRoPo = fields[12] || 'N';

            record = {
              stockNumber,
              carline,
              description,
              colour,
              loc: loc || mapping.rooftopId, // Fallback to rooftop
              destLoc,
              listPrice,
              daysInStock: Math.max(0, daysInStock),
              deal,
              status,
              openRoPo: openRoPo === 'Y',
              category: this.inferCategory(status, 'new'),
              make: mapping.franchise,
            };
          } else {
            // Used CSV: stock no,age,year,carline,description,reg no,odometer,colour,list price,loc,dest loc,status,open ro/po
            const stockNumber = (fields[0] || '').trim();
            const age = parseInt(fields[1]) || 0;
            const year = parseInt(fields[2]) || 0;
            const carline = fields[3] || '';
            const description = fields[4] || '';
            const rego = fields[5] || '';
            const odometer = parseInt(fields[6]) || 0;
            const colour = fields[7] || '';
            const listPrice = parseFloat(fields[8]) || 0;
            const loc = fields[9] || '';
            const destLoc = fields[10] || '';
            const status = fields[11] || 'IN-STOCK';
            const openRoPo = fields[12] || 'N';

            record = {
              stockNumber,
              carline,
              description,
              colour,
              loc: loc || mapping.rooftopId,
              destLoc,
              listPrice,
              daysInStock: Math.max(0, age),
              deal: '',
              status,
              openRoPo: openRoPo === 'Y',
              year: year > 100 ? year : 2000 + year, // Convert 2-digit year
              rego,
              odometer,
              category: this.inferCategory(status, 'used'),
              make: mapping.franchise,
            };
          }

          if (!record.stockNumber) continue;

          pentanaRecords.push(record);

          // Generate website record for units that should be online
          const shouldBeOnline = !['ON-ORDER', 'IN-TRANSIT', 'SOLD', 'DLR TRADE', 'WHOLESALE', 'RECO', 'CHANGING'].includes(record.status);

          websiteRecords.push({
            stockNumber: record.stockNumber,
            advertisedPrice: record.listPrice > 0 ? record.listPrice * 1.1 : null, // Mark-up for retail
            heroPhoto: '',
            photos: [],
            isLiveOnWebsite: shouldBeOnline && record.listPrice > 0,
            listingUrl: `https://www.booran.com.au/vehicles/${record.stockNumber}`,
            listingDescription: `${record.carline} - ${record.description}. Booran Motor Group.`,
          });
        } catch (err) {
          this.logger.warn(`Error parsing CSV row ${i} in ${mapping.filename}: ${err}`);
        }
      }

      this.logger.log(`Parsed ${mapping.filename}: ${lines.length - 1} records (${mapping.type}, ${mapping.franchise})`);
    }

    return { pentanaRecords, websiteRecords };
  }

  // ============ FEED RECONCILIATION ============

  async processFeeds(
    pentanaRecords: NormalizedPentanaRecord[],
    websiteRecords: RawWebsiteRecord[],
    feedType: string = 'MANUAL_TRIGGER',
    scheduledWindow: string = 'Immediate Ingest'
  ): Promise<FeedLog> {
    const startTime = Date.now();
    this.logger.log(`Starting feed reconciliation: ${pentanaRecords.length} DMS records, ${websiteRecords.length} Website records`);

    const rooftops = await this.rooftopModel.find().lean();
    const rooftopMap = new Map<string, Rooftop>();
    const branchMap = new Map<string, Rooftop>();

    for (const r of rooftops) {
      rooftopMap.set(r.rooftopId, r);
      for (const branch of r.pentanaBranchCodes) {
        branchMap.set(branch, r);
      }
    }

    // Website data joined on stockNumber
    const websiteMap = new Map<string, RawWebsiteRecord>();
    for (const w of websiteRecords) {
      websiteMap.set(w.stockNumber, w);
    }

    let reconciledCount = 0;
    let quarantinedCount = 0;
    const actionsToCreate: any[] = [];
    const vehiclesToUpsert: any[] = [];

    // Clear old action items for fresh calculation
    await this.actionItemModel.deleteMany({});

    // Count model occurrences for sister-unit calculation
    const modelCounts = new Map<string, number>();
    for (const p of pentanaRecords) {
      const key = p.carline;
      modelCounts.set(key, (modelCounts.get(key) || 0) + 1);
    }

    for (const pentana of pentanaRecords) {
      // Resolve rooftop from loc code
      let rooftop = branchMap.get(pentana.loc);

      // If loc is an in-transit code, try to find which rooftop this file belongs to
      if (!rooftop && IN_TRANSIT_LOC_CODES.includes(pentana.loc)) {
        // Find from the CSV manifest by matching the stockNumber pattern
        // Fall back to first rooftop that matches the make
        rooftop = rooftops.find(r => r.franchise === pentana.make);
      }

      if (!rooftop) {
        // Last resort: try to find any rooftop matching the franchise
        rooftop = rooftops.find(r => r.franchise === pentana.make);
        if (!rooftop) {
          quarantinedCount++;
          this.logger.debug(`Quarantined: ${pentana.stockNumber} - unknown loc '${pentana.loc}'`);
          continue;
        }
      }

      // Website match on stockNumber
      const web = websiteMap.get(pentana.stockNumber);
      const vehicleCost = pentana.listPrice;
      const totalStockCost = vehicleCost; // No separate recon/extras in CSV
      const advertisedPrice = web?.advertisedPrice ?? null;
      const hasPhotos = web ? (web.photos && web.photos.length > 0) : false;

      // Infer year for new vehicles from description if not present
      let year = pentana.year || 2026;
      if (!pentana.year) {
        // Try to extract year from description (e.g., "MY24", "MY25", "MY26")
        const myMatch = pentana.description.match(/MY(\d{2})/);
        if (myMatch) {
          year = 2000 + parseInt(myMatch[1]);
        }
      }

      // Map DMS status to a normalized dateInStock
      const now = new Date();
      const dateInStock = new Date(now.getTime() - pentana.daysInStock * 24 * 60 * 60 * 1000);

      // Transfer opportunity: check if sister rooftop in cluster could take this model
      let transferCandidate = '';
      if (pentana.category === 'Used' || pentana.category === 'Loaner') {
        const otherRooftopInCluster = rooftops.find(
          r => r.clusterId === rooftop!.clusterId && r.rooftopId !== rooftop!.rooftopId
        );
        if (otherRooftopInCluster) {
          transferCandidate = otherRooftopInCluster.name;
        }
      }

      // Map CSV status to rules-engine compatible status
      const rulesStatus = this.mapStatusForRules(pentana.status);

      // Run Rules Engine
      const metrics = this.rulesService.calculateMetrics(
        dateInStock,
        rulesStatus,
        totalStockCost,
        advertisedPrice,
        hasPhotos,
        rooftop.dailyHoldingCostRate,
        null, // expectedReadyDate
        pentana.category === 'Loaner' ? 'Used' : pentana.category, // Rules engine uses New/Used/Demo
        transferCandidate
      );

      const vehicleDoc = {
        stockNumber: pentana.stockNumber,
        rooftopId: rooftop.rooftopId,
        rooftopName: rooftop.name,
        branchCode: pentana.loc,
        clusterId: rooftop.clusterId,
        franchise: rooftop.franchise,
        rego: pentana.rego || '',
        year,
        make: pentana.make,
        model: pentana.carline,
        variant: '',
        description: pentana.description,
        body: '',
        colour: pentana.colour,
        fuel: '',
        transmission: 'Automatic',
        odometer: pentana.odometer || 0,
        category: pentana.category,
        vehicleCost,
        postedRecon: 0,
        extras: 0,
        totalStockCost,
        floorplanExposure: Math.round(vehicleCost * 0.95),
        gstInclusive: true,
        advertisedPrice,
        heroPhoto: web?.heroPhoto || '',
        photos: web?.photos || [],
        isLiveOnWebsite: web?.isLiveOnWebsite || false,
        listingUrl: web?.listingUrl || '',
        listingDescription: web?.listingDescription || '',
        status: pentana.status,
        dateInStock,
        expectedReadyDate: null,
        salesperson: '',
        hasOpenRoPo: pentana.openRoPo,
        dealNumber: pentana.deal || '',
        destLoc: pentana.destLoc || '',
        daysInStock: metrics.daysInStock,
        agingBucket: metrics.agingBucket,
        frontlineReady: metrics.frontlineReady,
        potentialGross: metrics.potentialGross,
        holdingCostPerDay: metrics.holdingCostPerDay,
        accumulatedHoldingCost: metrics.accumulatedHoldingCost,
        recommendedAction: metrics.recommendedAction,
        actionReason: metrics.actionReason,
        recommendedTransferTarget: metrics.recommendedTransferTarget,
        sisterUnitsInGroup: (modelCounts.get(pentana.carline) || 1) - 1,
        pentanaSource: rooftop.pentanaSourceSystem,
        isPriceReviewRequired: metrics.isPriceReviewRequired,
      };

      vehiclesToUpsert.push(vehicleDoc);
      reconciledCount++;

      // Create action item if rule flagged
      if (metrics.recommendedAction !== 'NONE') {
        let priority: 'high' | 'medium' | 'low' = 'medium';
        let impact = 'Capital and readiness optimization';

        if (metrics.recommendedAction === 'WHOLESALE') {
          priority = 'high';
          impact = `Free up $${totalStockCost.toLocaleString()} capital`;
        } else if (metrics.recommendedAction === 'PRICE') {
          priority = 'high';
          impact = `Restore $${Math.abs(metrics.potentialGross).toLocaleString()} gross or trigger turn`;
        } else if (metrics.recommendedAction === 'COMPLETE') {
          priority = 'medium';
          impact = 'Unlock online enquiries & frontline readiness';
        } else if (metrics.recommendedAction === 'TRANSFER') {
          priority = 'low';
          impact = `Rebalance to ${metrics.recommendedTransferTarget || 'sister rooftop'}`;
        } else if (metrics.recommendedAction === 'HOLD') {
          priority = 'low';
          impact = 'Protect full retail gross on fresh inventory';
        }

        actionsToCreate.push({
          actionType: metrics.recommendedAction,
          vin: pentana.stockNumber, // Use stockNumber as identifier
          stockNumber: pentana.stockNumber,
          vehicleTitle: `${year} ${pentana.make} ${pentana.carline}`,
          rooftopId: rooftop.rooftopId,
          rooftopName: rooftop.name,
          targetRooftopName: metrics.recommendedTransferTarget,
          reason: metrics.actionReason,
          impactMetric: impact,
          priority,
          status: 'open',
        });
      }
    }

    // Upsert into vehicles collection using stockNumber as unique key
    for (const v of vehiclesToUpsert) {
      await this.vehicleModel.findOneAndUpdate(
        { stockNumber: v.stockNumber },
        { $set: v },
        { upsert: true, new: true }
      );
    }

    if (actionsToCreate.length > 0) {
      await this.actionItemModel.insertMany(actionsToCreate);
    }

    const durationMs = Date.now() - startTime;

    // Calculate deltas for the feed log
    const soldCount = pentanaRecords.filter(r => r.status === 'SOLD').length;
    const dealPendCount = pentanaRecords.filter(r => r.status === 'DEAL PEND').length;
    const onOrderCount = pentanaRecords.filter(r => r.status === 'ON-ORDER').length;

    const feedLog = await this.feedLogModel.create({
      feedType,
      scheduledWindow,
      status: quarantinedCount === 0 ? 'SUCCESS' : 'WARNING',
      totalPentanaRows: pentanaRecords.length,
      totalWebsiteRows: websiteRecords.length,
      reconciledCount,
      quarantinedCount,
      newArrivalsCount: onOrderCount,
      soldExitsCount: soldCount,
      priceChangesCount: dealPendCount,
      durationMs,
      notes: `Reconciled ${reconciledCount} units across ${SEED_ROOFTOPS.length} Booran rooftops. Generated ${actionsToCreate.length} deterministic action items. Quarantined: ${quarantinedCount}.`
    });

    this.logger.log(`Feed reconciliation completed in ${durationMs}ms: ${reconciledCount} active units, ${actionsToCreate.length} actions, ${quarantinedCount} quarantined.`);
    return feedLog;
  }

  /**
   * Map real Pentana DMS statuses to rules-engine compatible statuses.
   */
  private mapStatusForRules(status: string): string {
    switch (status) {
      case 'IN-STOCK': return 'Available';
      case 'DEAL PEND': return 'Reserved';
      case 'IN SERVICE':
      case 'RECO': return 'In Recon';
      case 'WHOLESALE': return 'Wholesale';
      case 'SOLD': return 'Sold';
      case 'DEMO':
      case 'LOANER':
      case 'DRIVE CARS': return 'Demo';
      case 'DLR TRADE': return 'Wholesale';
      case 'IN-TRANSIT':
      case 'ON-ORDER': return 'Available';
      case 'CHANGING':
      case 'RENTAL': return 'Demo';
      default: return 'Available';
    }
  }
}
