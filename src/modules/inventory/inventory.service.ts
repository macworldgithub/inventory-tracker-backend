import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle, VehicleDocument } from '../../database/schemas/vehicle.schema';
import { Rooftop, RooftopDocument } from '../../database/schemas/rooftop.schema';
import { ActionItem, ActionItemDocument } from '../../database/schemas/action.schema';
import { FeedLog, FeedLogDocument } from '../../database/schemas/feed-log.schema';
import { ReconciliationService } from '../ingest/reconciliation.service';

// DMS statuses that mean a vehicle has left the lot (exclude from active inventory)
const EXITED_STATUSES = ['SOLD', 'DLR TRADE'];

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
      lastFeedType: latestFeed?.feedType || 'CSV_INITIAL_LOAD',
      scheduledWindow: latestFeed?.scheduledWindow || '06:00 - 06:45 AEST',
      nextScheduledFeed: '14:00 - 14:45 AEST',
      status: latestFeed?.status || 'SUCCESS',
      isLive: true,
      unitsProcessed: latestFeed?.reconciledCount || 0,
      durationMs: latestFeed?.durationMs || 1240,
    };
  }

  async triggerFeedReconciliation() {
    const { pentanaRecords, websiteRecords } = this.reconciliationService.parseAllCsvFiles();
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
    const vehicles = await this.vehicleModel.find({ status: { $nin: EXITED_STATUSES } }).lean();
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

    // Category mix (including Loaner)
    const categoryMix = {
      New: vehicles.filter(v => v.category === 'New').length,
      Used: vehicles.filter(v => v.category === 'Used').length,
      Demo: vehicles.filter(v => v.category === 'Demo').length,
      Loaner: vehicles.filter(v => v.category === 'Loaner').length,
    };

    // Brand mix
    const brandMix = vehicles.reduce((acc, v) => {
      acc[v.make] = (acc[v.make] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate real deltas from data
    const soldCount = await this.vehicleModel.countDocuments({ status: 'SOLD' });
    const dealPendCount = vehicles.filter(v => v.status === 'DEAL PEND').length;
    const onOrderCount = vehicles.filter(v => v.status === 'ON-ORDER').length;
    const inTransitCount = vehicles.filter(v => v.status === 'IN-TRANSIT').length;

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
          stockIn: inTransitCount + onOrderCount,
          retailExits: soldCount,
          wholesaleExits: vehicles.filter(v => v.status === 'WHOLESALE').length,
          transfers: 0,
          priceAdjustments: dealPendCount,
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
      status: { $nin: EXITED_STATUSES }
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
        vin: v.vin || v.stockNumber,
        stockNumber: v.stockNumber,
        title: `${v.year} ${v.make} ${v.model}`,
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
      const reconCount = lotVehicles.filter(v => ['IN SERVICE', 'RECO'].includes(v.status)).length;
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
        availableUnits: vehicles.filter(v => v.status === 'IN-STOCK').length,
        reservedUnits: vehicles.filter(v => v.status === 'DEAL PEND').length,
        demoUnits: vehicles.filter(v => ['DEMO', 'LOANER', 'DRIVE CARS'].includes(v.status)).length,
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
  async getGeneralManagerRooftop(rooftopId: string = 'booran-hyundai-berwick') {
    const rooftop = await this.rooftopModel.findOne({ rooftopId }).lean();
    if (!rooftop) {
      throw new NotFoundException(`Rooftop ${rooftopId} not found`);
    }

    const vehicles = await this.vehicleModel.find({ 
      rooftopId,
      status: { $nin: EXITED_STATUSES }
    }).lean();

    // Pipeline breakdown using real DMS statuses
    const pipeline = {
      incoming: vehicles.filter(v => ['IN-TRANSIT', 'ON-ORDER'].includes(v.status)).length,
      inRecon: vehicles.filter(v => ['IN SERVICE', 'RECO'].includes(v.status)).length,
      frontlineReady: vehicles.filter(v => v.frontlineReady).length,
      reserved: vehicles.filter(v => v.status === 'DEAL PEND').length,
      soldThisWeek: await this.vehicleModel.countDocuments({ rooftopId, status: 'SOLD' }),
      demo: vehicles.filter(v => ['DEMO', 'LOANER', 'DRIVE CARS'].includes(v.status)).length,
      wholesale: vehicles.filter(v => v.status === 'WHOLESALE').length,
    };

    // Merchandising Exception Rail
    const missingPhotos = vehicles.filter(v => !v.heroPhoto || v.photos.length === 0);
    const missingAdvertisedPrice = vehicles.filter(v => v.advertisedPrice === null || v.advertisedPrice <= 0);
    const aged90Units = vehicles.filter(v => v.daysInStock >= 90);
    const reconBreaches = vehicles.filter(v => ['IN SERVICE', 'RECO'].includes(v.status) && v.recommendedAction === 'COMPLETE');

    // Movement Ticker - build from real data
    const recentDealPending = vehicles
      .filter(v => v.status === 'DEAL PEND' && v.dealNumber)
      .slice(0, 2)
      .map(v => ({
        type: 'DEAL_PEND',
        title: `${v.year} ${v.make} ${v.model}`,
        stockNumber: v.stockNumber,
        time: 'Today',
        details: `Deal ${v.dealNumber} pending settlement`,
      }));

    const recentInTransit = vehicles
      .filter(v => v.status === 'IN-TRANSIT')
      .slice(0, 2)
      .map(v => ({
        type: 'STOCK_IN',
        title: `${v.year} ${v.make} ${v.model}`,
        stockNumber: v.stockNumber,
        time: 'In Transit',
        details: 'Vehicle in transit to dealership',
      }));

    const movementToday = [...recentDealPending, ...recentInTransit];

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
      inventoryList: vehicles.slice(0, 30),
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
    const filter: any = { status: { $nin: EXITED_STATUSES } };

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
        { stockNumber: { $regex: query.search, $options: 'i' } },
        { model: { $regex: query.search, $options: 'i' } },
        { rego: { $regex: query.search, $options: 'i' } },
        { colour: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
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
    const totalVehicles = await this.vehicleModel.countDocuments({ status: { $nin: EXITED_STATUSES } });
    const priceReviewCount = await this.vehicleModel.countDocuments({ isPriceReviewRequired: true, status: { $nin: EXITED_STATUSES } });
    const missingPhotosCount = await this.vehicleModel.countDocuments({ heroPhoto: '', status: { $nin: EXITED_STATUSES } });
    const wholesaleQueueCount = await this.vehicleModel.countDocuments({ recommendedAction: 'WHOLESALE', status: { $nin: EXITED_STATUSES } });

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

  // Single unit drawer - now uses stockNumber as primary lookup
  async getUnitDetails(identifier: string) {
    // Try stockNumber first, then fallback to vin
    let vehicle = await this.vehicleModel.findOne({ stockNumber: identifier }).lean();
    if (!vehicle) {
      vehicle = await this.vehicleModel.findOne({ vin: identifier }).lean();
    }
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with identifier ${identifier} not found`);
    }

    // Sister units across other Booran rooftops (same model)
    const sisterUnits = await this.vehicleModel.find({
      model: vehicle.model,
      stockNumber: { $ne: vehicle.stockNumber },
      status: { $nin: EXITED_STATUSES }
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
