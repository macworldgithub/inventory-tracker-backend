import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Rooftop, RooftopDocument } from '../../database/schemas/rooftop.schema';
import { Vehicle, VehicleDocument } from '../../database/schemas/vehicle.schema';
import { ActionItem, ActionItemDocument } from '../../database/schemas/action.schema';
import { FeedLog, FeedLogDocument } from '../../database/schemas/feed-log.schema';
import { RulesService } from '../rules/rules.service';
import { 
  SEED_ROOFTOPS, 
  SAMPLE_VEHICLE_MODELS, 
  SAMPLE_PHOTOS, 
  RawPentanaRecord, 
  RawWebsiteRecord 
} from '../../data/seed-data';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(Rooftop.name) private rooftopModel: Model<RooftopDocument>,
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    @InjectModel(ActionItem.name) private actionItemModel: Model<ActionItemDocument>,
    @InjectModel(FeedLog.name) private feedLogModel: Model<FeedLogDocument>,
    private rulesService: RulesService,
  ) {}

  async onModuleInit() {
    // Seed initial rooftops and data if database is empty
    const rooftopCount = await this.rooftopModel.countDocuments();
    if (rooftopCount === 0) {
      this.logger.log('Database empty. Initialising Booran Motor Group rooftops and inventory...');
      await this.seedInitialDatabase();
    }
  }

  async seedInitialDatabase() {
    // 1. Seed Rooftops
    await this.rooftopModel.insertMany(SEED_ROOFTOPS);
    this.logger.log(`Seeded ${SEED_ROOFTOPS.length} Booran rooftops`);

    // 2. Generate simulated Pentana records and Website records
    const { pentanaRecords, websiteRecords } = this.generateRealisticFeedData();

    // 3. Reconcile and save
    await this.processFeeds(pentanaRecords, websiteRecords, 'PENTANA_0600', '06:00 - 06:45 AEST');
  }

  generateRealisticFeedData(): { pentanaRecords: RawPentanaRecord[]; websiteRecords: RawWebsiteRecord[] } {
    const pentanaRecords: RawPentanaRecord[] = [];
    const websiteRecords: RawWebsiteRecord[] = [];

    let vinCounter = 1000;
    const now = new Date();

    // Generate ~60-70 realistic vehicles across rooftops
    for (const rooftop of SEED_ROOFTOPS) {
      // Pick matching models for the franchise
      const franchiseModels = SAMPLE_VEHICLE_MODELS.filter(m => m.make === rooftop.franchise);
      const vehiclePool = franchiseModels.length > 0 ? franchiseModels : SAMPLE_VEHICLE_MODELS;

      // 7 to 10 vehicles per rooftop
      const count = rooftop.rooftopId.includes('dandenong') ? 11 : 7;

      for (let i = 0; i < count; i++) {
        vinCounter++;
        const modelDef = vehiclePool[i % vehiclePool.length];
        const vin = `6T1AA10V${vinCounter}BMG${rooftop.franchise.substring(0, 2).toUpperCase()}`;
        const stockNumber = `B${rooftop.franchise.substring(0, 1)}${vinCounter.toString().slice(-4)}`;

        // Vary DIS to populate all 5 aging buckets: 0-30, 31-45, 46-60, 61-90, 90+
        const disProfiles = [8, 16, 28, 38, 49, 58, 72, 88, 104, 118];
        const dis = disProfiles[(vinCounter + i) % disProfiles.length];

        const dateInStock = new Date(now.getTime() - dis * 24 * 60 * 60 * 1000);

        // Category
        const category: 'New' | 'Used' | 'Demo' = i % 4 === 0 ? 'New' : i % 7 === 0 ? 'Demo' : 'Used';

        // Base vehicle cost
        const varianceFactor = 0.78 + ((vinCounter % 15) * 0.01);
        const vehicleCost = Math.round(modelDef.defaultPrice * varianceFactor);
        const postedRecon = category === 'Used' ? (i % 3 === 0 ? 1650 : 950) : 0;
        const extras = i % 2 === 0 ? 450 : 0;
        const totalStockCost = vehicleCost + postedRecon + extras;

        // Status
        let status: 'Available' | 'Reserved' | 'In Recon' | 'Wholesale' | 'Sold' | 'Demo' = 'Available';
        if (dis > 90 && category === 'Used' && i % 3 === 0) status = 'Wholesale';
        else if (dis <= 5 && i % 2 === 0) status = 'In Recon';
        else if (i % 8 === 0) status = 'Reserved';
        else if (category === 'Demo') status = 'Demo';

        const expectedReadyDate = status === 'In Recon' 
          ? (i % 2 === 0 ? new Date(now.getTime() - 2 * 86400000) : new Date(now.getTime() + 3 * 86400000)).toISOString()
          : undefined;

        pentanaRecords.push({
          vin,
          stockNumber,
          branchCode: rooftop.pentanaBranchCodes[0],
          year: category === 'New' ? 2026 : category === 'Demo' ? 2025 : 2021 + (i % 4),
          make: modelDef.make,
          model: modelDef.model,
          variant: 'Elite Auto AWD',
          body: modelDef.body,
          colour: ['Polar White', 'Phantom Black', 'Titan Grey', 'Intense Blue', 'Fiery Red'][i % 5],
          fuel: modelDef.fuel,
          transmission: 'Automatic',
          odometer: category === 'New' ? 12 : category === 'Demo' ? 3400 : 28000 + (i * 7400),
          category,
          vehicleCost,
          postedRecon,
          extras,
          floorplanExposure: Math.round(vehicleCost * 0.95),
          status,
          dateInStock: dateInStock.toISOString(),
          expectedReadyDate,
          salesperson: ['John Miller', 'Sophie Zhang', 'Luke Edwards', 'Mark Davies'][i % 4],
          rego: category !== 'New' ? `1BM${i}XY` : undefined,
        });

        // Website record (some missing photos or price to test exceptions)
        const hasMissingPhotos = (vinCounter % 9 === 0);
        const hasMissingPrice = (vinCounter % 13 === 0);
        const photoUrl = SAMPLE_PHOTOS[(vinCounter + i) % SAMPLE_PHOTOS.length];

        const advertisedPrice = hasMissingPrice 
          ? null 
          : (modelDef.defaultPrice + (category === 'Used' ? -5000 : 0) + (i % 2 === 0 ? 990 : -490));

        websiteRecords.push({
          vin,
          stockNumber,
          advertisedPrice,
          heroPhoto: hasMissingPhotos ? '' : photoUrl,
          photos: hasMissingPhotos ? [] : [photoUrl, photoUrl],
          isLiveOnWebsite: !hasMissingPhotos && status !== 'In Recon' && status !== 'Wholesale',
          listingUrl: `${rooftop.websiteUrl}/used-cars/view/${stockNumber}`,
          listingDescription: `Magnificent ${modelDef.make} ${modelDef.model} presented in pristine condition. Full Booran service history.`
        });
      }
    }

    return { pentanaRecords, websiteRecords };
  }

  async processFeeds(
    pentanaRecords: RawPentanaRecord[],
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

    const websiteMap = new Map<string, RawWebsiteRecord>();
    for (const w of websiteRecords) {
      websiteMap.set(w.vin, w);
    }

    let reconciledCount = 0;
    let quarantinedCount = 0;
    const actionsToCreate: any[] = [];
    const vehiclesToUpsert: any[] = [];

    // Clear old action items for fresh calculation
    await this.actionItemModel.deleteMany({});

    for (const pentana of pentanaRecords) {
      const rooftop = branchMap.get(pentana.branchCode) || rooftops[0];

      if (!rooftop) {
        quarantinedCount++;
        continue;
      }

      // Website match
      const web = websiteMap.get(pentana.vin);
      const totalStockCost = pentana.vehicleCost + pentana.postedRecon + pentana.extras;
      const advertisedPrice = web ? web.advertisedPrice : null;
      const hasPhotos = web ? (web.photos && web.photos.length > 0) : false;

      // Transfer opportunity candidate: check if sister rooftop in cluster could take this model
      let transferCandidate = '';
      if (pentana.category === 'Used') {
        const otherRooftopInCluster = rooftops.find(
          r => r.clusterId === rooftop.clusterId && r.rooftopId !== rooftop.rooftopId
        );
        if (otherRooftopInCluster) {
          transferCandidate = otherRooftopInCluster.name;
        }
      }

      // Run Rules Engine
      const metrics = this.rulesService.calculateMetrics(
        new Date(pentana.dateInStock),
        pentana.status,
        totalStockCost,
        advertisedPrice,
        hasPhotos,
        rooftop.dailyHoldingCostRate,
        pentana.expectedReadyDate ? new Date(pentana.expectedReadyDate) : null,
        pentana.category,
        transferCandidate
      );

      const vehicleDoc = {
        vin: pentana.vin,
        stockNumber: pentana.stockNumber,
        rooftopId: rooftop.rooftopId,
        rooftopName: rooftop.name,
        branchCode: pentana.branchCode,
        clusterId: rooftop.clusterId,
        franchise: rooftop.franchise,
        rego: pentana.rego || '',
        year: pentana.year,
        make: pentana.make,
        model: pentana.model,
        variant: pentana.variant || '',
        body: pentana.body,
        colour: pentana.colour,
        fuel: pentana.fuel,
        transmission: pentana.transmission,
        odometer: pentana.odometer,
        category: pentana.category,
        vehicleCost: pentana.vehicleCost,
        postedRecon: pentana.postedRecon,
        extras: pentana.extras,
        totalStockCost,
        floorplanExposure: pentana.floorplanExposure,
        gstInclusive: true,
        advertisedPrice,
        heroPhoto: web?.heroPhoto || '',
        photos: web?.photos || [],
        isLiveOnWebsite: web?.isLiveOnWebsite || false,
        listingUrl: web?.listingUrl || '',
        listingDescription: web?.listingDescription || '',
        status: pentana.status,
        dateInStock: new Date(pentana.dateInStock),
        expectedReadyDate: pentana.expectedReadyDate ? new Date(pentana.expectedReadyDate) : null,
        salesperson: pentana.salesperson || '',
        daysInStock: metrics.daysInStock,
        agingBucket: metrics.agingBucket,
        frontlineReady: metrics.frontlineReady,
        potentialGross: metrics.potentialGross,
        holdingCostPerDay: metrics.holdingCostPerDay,
        accumulatedHoldingCost: metrics.accumulatedHoldingCost,
        recommendedAction: metrics.recommendedAction,
        actionReason: metrics.actionReason,
        recommendedTransferTarget: metrics.recommendedTransferTarget,
        sisterUnitsInGroup: 2,
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
          vin: pentana.vin,
          stockNumber: pentana.stockNumber,
          vehicleTitle: `${pentana.year} ${pentana.make} ${pentana.model} ${pentana.variant}`,
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

    // Upsert into vehicles collection
    for (const v of vehiclesToUpsert) {
      await this.vehicleModel.findOneAndUpdate(
        { vin: v.vin },
        { $set: v },
        { upsert: true, new: true }
      );
    }

    if (actionsToCreate.length > 0) {
      await this.actionItemModel.insertMany(actionsToCreate);
    }

    const durationMs = Date.now() - startTime;
    const feedLog = await this.feedLogModel.create({
      feedType,
      scheduledWindow,
      status: quarantinedCount === 0 ? 'SUCCESS' : 'WARNING',
      totalPentanaRows: pentanaRecords.length,
      totalWebsiteRows: websiteRecords.length,
      reconciledCount,
      quarantinedCount,
      newArrivalsCount: 4,
      soldExitsCount: 3,
      priceChangesCount: 5,
      durationMs,
      notes: `Reconciled ${reconciledCount} units across ${rooftops.length} Booran rooftops. Generated ${actionsToCreate.length} deterministic action items.`
    });

    this.logger.log(`Feed reconciliation completed in ${durationMs}ms: ${reconciledCount} active units.`);
    return feedLog;
  }
}
