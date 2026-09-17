import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FeedLogDocument = FeedLog & Document;

@Schema({ timestamps: true })
export class FeedLog {
  @Prop({ required: true, enum: ['PENTANA_0600', 'PENTANA_1400', 'WEBSITE_SYNC', 'MANUAL_TRIGGER', 'CSV_INITIAL_LOAD'] })
  feedType: string;

  @Prop({ required: true })
  scheduledWindow: string; // e.g. "06:00 - 06:45 AEST"

  @Prop({ required: true, enum: ['SUCCESS', 'WARNING', 'FAILED'] })
  status: 'SUCCESS' | 'WARNING' | 'FAILED';

  @Prop({ required: true })
  totalPentanaRows: number;

  @Prop({ required: true })
  totalWebsiteRows: number;

  @Prop({ required: true })
  reconciledCount: number;

  @Prop({ default: 0 })
  quarantinedCount: number;

  @Prop({ default: 0 })
  newArrivalsCount: number;

  @Prop({ default: 0 })
  soldExitsCount: number;

  @Prop({ default: 0 })
  priceChangesCount: number;

  @Prop({ default: 0 })
  durationMs: number;

  @Prop({ default: '' })
  notes: string;
}

export const FeedLogSchema = SchemaFactory.createForClass(FeedLog);
