import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('status')
  @ApiOperation({ 
    summary: 'Get Feed Status & Timestamps', 
    description: 'Returns the status of the twice-daily Pentana feed (06:00 and 14:00 AEST), last run timestamp, and next scheduled window.' 
  })
  @ApiResponse({ status: 200, description: 'Feed status metrics successfully retrieved.' })
  async getStatus() {
    return this.inventoryService.getFeedStatus();
  }

  @Post('trigger-feed')
  @ApiOperation({ 
    summary: 'Trigger Feed Reconciliation On-Demand', 
    description: 'Manually triggers immediate reconciliation between simulated Pentana DMS records and website inventory feeds, re-evaluating the deterministic rules engine.' 
  })
  @ApiResponse({ status: 201, description: 'Feed reconciliation job completed.' })
  async triggerFeed() {
    return this.inventoryService.triggerFeedReconciliation();
  }

  @Get('rooftops')
  @ApiOperation({ 
    summary: 'List All Dealership Rooftops', 
    description: 'Retrieves all mapped Booran Motor Group rooftops, franchise brands, and dealer principal clusters.' 
  })
  @ApiResponse({ status: 200, description: 'List of Booran rooftops.' })
  async getRooftops() {
    return this.inventoryService.getRooftops();
  }

  @Get('group')
  @ApiOperation({ 
    summary: 'Group Ownership Command Centre Data', 
    description: 'Aggregates group-wide KPIs ($ stock cost, floorplan exposure, aged 60+/90+ risk), rooftop heatmap matrix, brand mix, and group action queue.' 
  })
  @ApiResponse({ status: 200, description: 'Executive group command overview dataset.' })
  async getGroupOverview() {
    return this.inventoryService.getGroupOverview();
  }

  @Get('dp/:clusterId')
  @ApiOperation({ 
    summary: 'Dealer Principal Cluster Dashboard', 
    description: 'Returns side-by-side rooftop comparison, cluster aging waterfall, and Top 15 Capital Risk Watchlist (ranked by DIS × Cost) for a specific cluster.' 
  })
  @ApiParam({ name: 'clusterId', example: 'cluster-hyundai-metro', description: 'ID of the dealer principal cluster' })
  @ApiResponse({ status: 200, description: 'Dealer Principal cluster comparison dataset.' })
  async getDealerPrincipalCluster(@Param('clusterId') clusterId: string) {
    return this.inventoryService.getDealerPrincipalCluster(clusterId);
  }

  @Get('gm/:rooftopId')
  @ApiOperation({ 
    summary: 'General Manager Rooftop Operations', 
    description: 'Single-lot pipeline tracker (Incoming -> Recon -> Frontline -> Reserved -> Sold), today\'s movement delta, and merchandising exception rail.' 
  })
  @ApiParam({ name: 'rooftopId', example: 'booran-hyundai-dandenong', description: 'ID of the rooftop dealership' })
  @ApiResponse({ status: 200, description: 'General Manager lot operations dataset.' })
  async getGeneralManagerRooftop(@Param('rooftopId') rooftopId: string) {
    return this.inventoryService.getGeneralManagerRooftop(rooftopId);
  }

  @Get('workbench')
  @ApiOperation({ 
    summary: 'Used Car Manager Actionable Workbench Grid', 
    description: 'Filterable, sortable unit-level inventory grid with multi-lot toggle, search, aging buckets, price review mode, and CSV export support.' 
  })
  @ApiQuery({ name: 'rooftopId', required: false, example: 'all' })
  @ApiQuery({ name: 'agingBucket', required: false, example: 'all' })
  @ApiQuery({ name: 'category', required: false, example: 'Used' })
  @ApiQuery({ name: 'make', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search VIN, Stock #, Model, Rego' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter rule action: PRICE, TRANSFER, WHOLESALE, COMPLETE, HOLD' })
  @ApiQuery({ name: 'priceReviewOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'sortField', required: false, example: 'daysInStock' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated workbench inventory dataset.' })
  async getUsedCarWorkbench(
    @Query('rooftopId') rooftopId?: string,
    @Query('agingBucket') agingBucket?: string,
    @Query('category') category?: string,
    @Query('make') make?: string,
    @Query('search') search?: string,
    @Query('action') action?: string,
    @Query('priceReviewOnly') priceReviewOnly?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.inventoryService.getUsedCarWorkbench({
      rooftopId,
      agingBucket,
      category,
      make,
      search,
      action,
      priceReviewOnly: priceReviewOnly === 'true',
      sortField,
      sortOrder,
      page,
      limit,
    });
  }

  @Get('unit/:vin')
  @ApiOperation({ 
    summary: 'Unit Intelligence Drawer Details', 
    description: 'Detailed unit breakdown: Commercial Truth (what it owes: acquisition + recon + extras), Frontline Merchandising price & margin, Holding Cost Clock, and Sister Units across Booran Group.' 
  })
  @ApiParam({ name: 'vin', description: 'Vehicle Identification Number (VIN)' })
  @ApiResponse({ status: 200, description: 'Unit intelligence drawer details.' })
  async getUnitDetails(@Param('vin') vin: string) {
    return this.inventoryService.getUnitDetails(vin);
  }
}
