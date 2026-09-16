import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActionItemDocument = ActionItem & Document;

@Schema({ timestamps: true })
export class ActionItem {
  @Prop({ required: true, enum: ['PRICE', 'TRANSFER', 'WHOLESALE', 'COMPLETE', 'HOLD'] })
  actionType: 'PRICE' | 'TRANSFER' | 'WHOLESALE' | 'COMPLETE' | 'HOLD';

  @Prop({ required: true, index: true })
  vin: string;

  @Prop({ required: true })
  stockNumber: string;

  @Prop({ required: true })
  vehicleTitle: string; // e.g. "2023 Hyundai Tucson Highlander AWD"

  @Prop({ required: true })
  rooftopId: string;

  @Prop({ required: true })
  rooftopName: string;

  @Prop({ default: '' })
  targetRooftopId: string;

  @Prop({ default: '' })
  targetRooftopName: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ default: 'Capital and readiness optimization' })
  impactMetric: string; // e.g. "Saves $480/wk holding cost", "Unlocks $42,500 capital", "Fix missing photos"

  @Prop({ required: true, enum: ['high', 'medium', 'low'] })
  priority: 'high' | 'medium' | 'low';

  @Prop({ default: 'open', enum: ['open', 'in_progress', 'dismissed', 'executed'] })
  status: 'open' | 'in_progress' | 'dismissed' | 'executed';
}

export const ActionItemSchema = SchemaFactory.createForClass(ActionItem);
