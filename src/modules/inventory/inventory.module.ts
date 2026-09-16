import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rooftop, RooftopSchema } from '../../database/schemas/rooftop.schema';
import { Vehicle, VehicleSchema } from '../../database/schemas/vehicle.schema';
import { ActionItem, ActionItemSchema } from '../../database/schemas/action.schema';
import { FeedLog, FeedLogSchema } from '../../database/schemas/feed-log.schema';
import { RulesService } from '../rules/rules.service';
import { ReconciliationService } from '../ingest/reconciliation.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rooftop.name, schema: RooftopSchema },
      { name: Vehicle.name, schema: VehicleSchema },
      { name: ActionItem.name, schema: ActionItemSchema },
      { name: FeedLog.name, schema: FeedLogSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, ReconciliationService, RulesService],
  exports: [InventoryService, ReconciliationService, RulesService],
})
export class InventoryModule {}
