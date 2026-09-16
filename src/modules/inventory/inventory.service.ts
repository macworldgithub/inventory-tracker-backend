import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from '../../database/schemas/vehicle.schema';
import { Rooftop, RooftopDocument } from '../../database/schemas/rooftop.schema';
import { ActionItem, ActionItemDocument } from '../../database/schemas/action.schema';
import { FeedLog, FeedLogDocument } from '../../database/schemas/feed-log.schema';
import { ReconciliationService } from '../ingest/reconciliation.service';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Vehicle.name) private vehicleModel: Model<VehicleDocument>,
    @InjectModel(Rooftop.name) private rooftopModel: Model<RooftopDocument>,
    @InjectModel(ActionItem.name) private actionItemModel: Model<ActionItemDocument>,
    @InjectModel(FeedLog.name) private feedLogModel: Model<FeedLogDocument>,
    private reconciliationService: ReconciliationService,
  ) {}

  async getRooftops(): Promise<any[]> {
    return this.rooftopModel.find().lean();
  }

  async getFeedStatus() {
    const latestFeed = await this.feedLogModel.findOne().sort({ createdAt: -1 }).lean() as any;
    return {
      lastFeedTimestamp: latestFeed?.createdAt || new Date(),
      lastFeedType: latestFeed?.feedType || 'PENTANA_0600',
      scheduledWindow: latestFeed?.scheduledWindow || '06:00 - 06:45 AEST',
      nextScheduledFeed: '14:00 - 14:45 AEST',
      status: latestFeed?.status || 'SUCCESS',
      isLive: true,
      unitsProcessed: latestFeed?.reconciledCount || 0,
      durationMs: latestFeed?.durationMs || 1240,
    };
  }

  async triggerFeedReconciliation() {
    const { pentanaRecords, websiteRecords } = this.reconciliationService.generateRealisticFeedData();
    const result = await this.reconciliationService.processFeeds(
      pentanaRecords, 
      websiteRecords, 
      'MANUAL_TRIGGER', 
      'Manual On-Demand Sync'
    );
    return result;
  }

  // ==========================================
  // 1. GROUP OWNERSHIP VIEW
  // ==========================================
  async getGroupOverview() {
    const vehicles = await this.vehicleModel.find({ status: { $ne: 'Sold' } }).lean();
    const rooftops = await this.rooftopModel.find().lean();
    const actions = await this.actionItemModel.find({ status: 'open' }).limit(10).lean();

    const totalUnits = vehicles.length;
    const totalStockCost = vehicles.reduce((sum, v) => sum + (v.totalStockCost || 0), 0);
    const floorplanExposure = vehicles.reduce((sum, v) => sum + (v.floorplanExposure || 0), 0);
    const frontlineReadyUnits = vehicles.filter(v => v.frontlineReady).length;
    const potentialGrossTotal = vehicles.reduce((sum, v) => sum + (v.potentialGross || 0), 0);

    const aged60Units = vehicles.filter(v => v.daysInStock >= 60);
    const aged60Cost = aged60Units.reduce((sum, v) => sum + (v.totalStockCost || 0), 0);

    const aged90Units = vehicles.filter(v => v.daysInStock >= 90);
    const aged90Cost = aged90Units.reduce((sum, v) => sum + (v.totalStockCost || 0), 0);

    // Rooftop Heatmap
    const rooftopStats = rooftops.map(r => {
      const lotVehicles = vehicles.filter(v => v.rooftopId === r.rooftopId);
      const lotCost = lotVehicles.reduce((sum, v) => sum + (v.totalStockCost || 0), 0);
      const lotAged60 = lotVehicles.filter(v => v.daysInStock >= 60).length;
      const avgDis = lotVehicles.length > 0 
        ? Math.round(lotVehicles.reduce((sum, v) => sum + v.daysInStock, 0) / lotVehicles.length) 
        : 0;

      // Aging breakdown
      const bucket0_30 = lotVehicles.filter(v => v.agingBucket === '0-30').length;
      const bucket31_45 = lotVehicles.filter(v => v.agingBucket === '31-45').length;
      const bucket46_60 = lotVehicles.filter(v => v.agingBucket === '46-60').length;
      const bucket61_90 = lotVehicles.filter(v => v.agingBucket === '61-90').length;
      const bucket90Plus = lotVehicles.filter(v => v.agingBucket === '90+').length;

      return {
        rooftopId: r.rooftopId,
        name: r.name,
        franchise: r.franchise,
        clusterId: r.clusterId,
        clusterName: r.clusterName,
        totalUnits: lotVehicles.length,
        totalCost: lotCost,
        avgDis,
        aged60Count: lotAged60,
        aged60Percent: lotVehicles.length > 0 ? Math.round((lotAged60 / lotVehicles.length) * 100) : 0,
        frontlineReadyPercent: lotVehicles.length > 0 
          ? Math.round((lotVehicles.filter(v => v.frontlineReady).length / lotVehicles.length) * 100) 
          : 0,
        turnRate: 3.2,
        buckets: {
          '0-30': bucket0_30,
          '31-45': bucket31_45,
          '46-60': bucket46_60,
          '61-90': bucket61_90,
          '90+': bucket90Plus,
        }
      };
    });

    // Category mix
    const categoryMix = {
      New: vehicles.filter(v => v.category === 'New').length,
      Used: vehicles.filter(v => v.category === 'Used').length,
      Demo: vehicles.filter(v => v.category === 'Demo').length,
    };

    // Brand mix
    const brandMix = vehicles.reduce((acc, v) => {
      acc[v.make] = (acc[v.make] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      kpiStrip: {
        totalUnits,
        totalStockCost,
        floorplanExposure,
        frontlineReadyUnits,
        frontlinePercent: totalUnits > 0 ? Math.round((frontlineReadyUnits / totalUnits) * 100) : 0,
        potentialGrossTotal,
        aged60Units: aged60Units.length,
        aged60Cost,
        aged90Units: aged90Units.length,
        aged90Cost,
        holdingCostToday: Math.round(totalStockCost * 0.0003),
        deltas: {
          stockIn: 4,
          retailExits: 3,
          wholesaleExits: 1,
          transfers: 2,
          priceAdjustments: 5,
        }
      },
      rooftopStats,
      categoryMix,
      brandMix,
      groupActionQueue: actions,
    };
  }

  // ==========================================
  // 2. DEALER PRINCIPAL VIEW (Cluster Scoped)
  // ==========================================
  async getDealerPrincipalCluster(clusterId: string = 'cluster-hyundai-metro') {
    const rooftops = await this.rooftopModel.find({ clusterId }).lean();
    const rooftopIds = rooftops.map(r => r.rooftopId);

    const vehicles = await this.vehicleModel.find({ 
      rooftopId: { $in: rooftopIds },
      status: { $ne: 'Sold' }
    }).lean();

    const clusterActions = await this.actionItemModel.find({
      rooftopId: { $in: rooftopIds },
      status: 'open'
    }).limit(8).lean();

    // Top 15 Watchlist ranked by DIS * totalStockCost (Highest capital risk)
    const watchlist = [...vehicles]
      .sort((a, b) => (b.daysInStock * b.totalStockCost) - (a.daysInStock * a.totalStockCost))
      .slice(0, 15)
      .map(v => ({
        vin: v.vin,
        stockNumber: v.stockNumber,
        title: `${v.year} ${v.make} ${v.model} ${v.variant}`,
        rooftopName: v.rooftopName,
        category: v.category,
        totalStockCost: v.totalStockCost,
        advertisedPrice: v.advertisedPrice,
        potentialGross: v.potentialGross,
        daysInStock: v.daysInStock,
        agingBucket: v.agingBucket,
        accumulatedHoldingCost: v.accumulatedHoldingCost,
        recommendedAction: v.recommendedAction,
        actionReason: v.actionReason,
        heroPhoto: v.heroPhoto,
      }));

    // Rooftop Comparison Table
    const comparisonTable = rooftops.map(r => {
      const lotVehicles = vehicles.filter(v => v.rooftopId === r.rooftopId);
      const lotCost = lotVehicles.reduce((sum, v) => sum + (v.totalStockCost || 0), 0);
      const aged45Count = lotVehicles.filter(v => v.daysInStock >= 45).length;
      const reconCount = lotVehicles.filter(v => v.status === 'In Recon').length;
      const avgDis = lotVehicles.length > 0 
        ? Math.round(lotVehicles.reduce((sum, v) => sum + v.daysInStock, 0) / lotVehicles.length) 
        : 0;

      return {
        rooftopId: r.rooftopId,
        rooftopName: r.name,
        gmName: r.generalManager,
        totalUnits: lotVehicles.length,
        totalCost: lotCost,
        avgDis,
        turnRate: 3.4,
        aged45Percent: lotVehicles.length > 0 ? Math.round((aged45Count / lotVehicles.length) * 100) : 0,
        reconPending: reconCount,
        potentialGross: lotVehicles.reduce((sum, v) => sum + (v.potentialGross || 0), 0),
        frontlineCount: lotVehicles.filter(v => v.frontlineReady).length,
      };
    });

    // Aging waterfall
    const agingWaterfall = [
      { bucket: '0-30 days', count: vehicles.filter(v => v.agingBucket === '0-30').length, cost: vehicles.filter(v => v.agingBucket === '0-30').reduce((s, v) => s + v.totalStockCost, 0) },
      { bucket: '31-45 days', count: vehicles.filter(v => v.agingBucket === '31-45').length, cost: vehicles.filter(v => v.agingBucket === '31-45').reduce((s, v) => s + v.totalStockCost, 0) },
      { bucket: '46-60 days', count: vehicles.filter(v => v.agingBucket === '46-60').length, cost: vehicles.filter(v => v.agingBucket === '46-60').reduce((s, v) => s + v.totalStockCost, 0) },
      { bucket: '61-90 days', count: vehicles.filter(v => v.agingBucket === '61-90').length, cost: vehicles.filter(v => v.agingBucket === '61-90').reduce((s, v) => s + v.totalStockCost, 0) },
      { bucket: '90+ days', count: vehicles.filter(v => v.agingBucket === '90+').length, cost: vehicles.filter(v => v.agingBucket === '90+').reduce((s, v) => s + v.totalStockCost, 0) },
    ];

    return {
      clusterId,
      clusterName: rooftops[0]?.clusterName || 'Dealer Principal Cluster',
      dpName: rooftops[0]?.dealerPrincipal || 'David Booran',
      kpiStrip: {
        totalUnits: vehicles.length,
        totalCost: vehicles.reduce((s, v) => s + v.totalStockCost, 0),
        availableUnits: vehicles.filter(v => v.status === 'Available').length,
        reservedUnits: vehicles.filter(v => v.status === 'Reserved').length,
        demoUnits: vehicles.filter(v => v.status === 'Demo').length,
        avgDis: vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + v.daysInStock, 0) / vehicles.length) : 0,
        potentialGross: vehicles.reduce((s, v) => s + v.potentialGross, 0),
        aged45Count: vehicles.filter(v => v.daysInStock >= 45).length,
      },
      comparisonTable,
      agingWaterfall,
      watchlist,
      actions: clusterActions,
    };
  }

  // ==========================================
  // 3. GENERAL MANAGER VIEW (Single Rooftop)
  // ==========================================
  async getGeneralManagerRooftop(rooftopId: string = 'booran-hyundai-dandenong') {
    const rooftop = await this.rooftopModel.findOne({ rooftopId }).lean();
    if (!rooftop) {
      throw new NotFoundException(`Rooftop ${rooftopId} not found`);
    }

    const vehicles = await this.vehicleModel.find({ 
      rooftopId,
      status: { $ne: 'Sold' }
    }).lean();

    // Pipeline breakdown
    const pipeline = {
      incoming: 4, // Simulated in transit / delivery
      inRecon: vehicles.filter(v => v.status === 'In Recon').length,
      frontlineReady: vehicles.filter(v => v.frontlineReady).length,
      reserved: vehicles.filter(v => v.status === 'Reserved').length,
      soldThisWeek: 7,
      demo: vehicles.filter(v => v.status === 'Demo').length,
      wholesale: vehicles.filter(v => v.status === 'Wholesale').length,
    };

    // Merchandising Exception Rail
    const missingPhotos = vehicles.filter(v => !v.heroPhoto || v.photos.length === 0);
    const missingAdvertisedPrice = vehicles.filter(v => v.advertisedPrice === null || v.advertisedPrice <= 0);
    const aged90Units = vehicles.filter(v => v.daysInStock >= 90);
    const reconBreaches = vehicles.filter(v => v.status === 'In Recon' && v.recommendedAction === 'COMPLETE');

    // Movement Ticker (Today's feed delta)
    const movementToday = [
      { type: 'STOCK_IN', title: '2026 Hyundai Tucson Highlander', stockNumber: 'BH1042', time: '06:14 AEST', details: 'Added to inventory - awaiting recon' },
      { type: 'SOLD', title: '2024 Hyundai Santa Fe Hybrid', stockNumber: 'BH0988', time: '09:30 AEST', details: 'Exit to retail delivery' },
      { type: 'TRANSFER_OUT', title: '2023 Hyundai i30 N-Line', stockNumber: 'BH0912', time: '11:15 AEST', details: 'Transferred to Booran Cranbourne' },
      { type: 'PRICE_REDUCTION', title: '2022 Hyundai Kona Electric', stockNumber: 'BH0865', time: '13:00 AEST', details: 'Reduced from $42,990 to $39,990' },
    ];

    return {
      rooftop,
      kpis: {
        onLotCount: vehicles.length,
        totalCost: vehicles.reduce((s, v) => s + v.totalStockCost, 0),
        frontlineReady: pipeline.frontlineReady,
        inRecon: pipeline.inRecon,
        avgDis: vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + v.daysInStock, 0) / vehicles.length) : 0,
        holdingCostToday: Math.round(vehicles.reduce((s, v) => s + v.totalStockCost, 0) * (rooftop.dailyHoldingCostRate || 0.0003)),
      },
      pipeline,
      movementToday,
      exceptions: {
        missingPhotosCount: missingPhotos.length,
        missingPhotos: missingPhotos.slice(0, 5),
        missingPriceCount: missingAdvertisedPrice.length,
        missingPrice: missingAdvertisedPrice.slice(0, 5),
        aged90Count: aged90Units.length,
        aged90: aged90Units.slice(0, 5),
        reconBreachesCount: reconBreaches.length,
      },
      inventoryList: vehicles.slice(0, 20),
    };
  }

  // ==========================================
  // 4. USED CAR MANAGER WORKBENCH
  // ==========================================
  async getUsedCarWorkbench(query: {
    rooftopId?: string;
    agingBucket?: string;
    category?: string;
    make?: string;
    search?: string;
    action?: string;
    priceReviewOnly?: boolean;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) {
    const filter: any = { status: { $ne: 'Sold' } };

    if (query.rooftopId && query.rooftopId !== 'all') {
      filter.rooftopId = query.rooftopId;
    }
    if (query.agingBucket && query.agingBucket !== 'all') {
      filter.agingBucket = query.agingBucket;
    }
    if (query.category && query.category !== 'all') {
      filter.category = query.category;
    }
    if (query.make && query.make !== 'all') {
      filter.make = query.make;
    }
    if (query.action && query.action !== 'all') {
      filter.recommendedAction = query.action;
    }
    if (query.priceReviewOnly) {
      filter.isPriceReviewRequired = true;
    }
    if (query.search) {
      filter.$or = [
        { vin: { $regex: query.search, $options: 'i' } },
        { stockNumber: { $regex: query.search, $options: 'i' } },
        { model: { $regex: query.search, $options: 'i' } },
        { rego: { $regex: query.search, $options: 'i' } },
      ];
    }

    const sortField = query.sortField || 'daysInStock';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 30;
    const skip = (page - 1) * limit;

    const total = await this.vehicleModel.countDocuments(filter);
    const vehicles = await this.vehicleModel
      .find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    // Summary counters
    const totalVehicles = await this.vehicleModel.countDocuments({ status: { $ne: 'Sold' } });
    const priceReviewCount = await this.vehicleModel.countDocuments({ isPriceReviewRequired: true, status: { $ne: 'Sold' } });
    const missingPhotosCount = await this.vehicleModel.countDocuments({ heroPhoto: '', status: { $ne: 'Sold' } });
    const wholesaleQueueCount = await this.vehicleModel.countDocuments({ recommendedAction: 'WHOLESALE', status: { $ne: 'Sold' } });

    return {
      vehicles,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      counters: {
        totalVehicles,
        priceReviewCount,
        missingPhotosCount,
        wholesaleQueueCount,
      }
    };
  }

  // Single unit drawer
  async getUnitDetails(vin: string) {
    const vehicle = await this.vehicleModel.findOne({ vin }).lean();
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with VIN ${vin} not found`);
    }

    // Sister units across other Booran rooftops
    const sisterUnits = await this.vehicleModel.find({
      make: vehicle.make,
      model: vehicle.model,
      vin: { $ne: vehicle.vin },
      status: { $ne: 'Sold' }
    }).limit(4).lean();

    return {
      vehicle,
      costBuildUp: {
        vehicleCost: vehicle.vehicleCost,
        postedRecon: vehicle.postedRecon,
        extras: vehicle.extras,
        totalStockCost: vehicle.totalStockCost,
        gstInclusive: vehicle.gstInclusive,
        floorplanExposure: vehicle.floorplanExposure,
      },
      holdingClock: {
        dateInStock: vehicle.dateInStock,
        daysInStock: vehicle.daysInStock,
        dailyRate: vehicle.holdingCostPerDay,
        accumulated: vehicle.accumulatedHoldingCost,
      },
      sisterUnits,
    };
  }
}
