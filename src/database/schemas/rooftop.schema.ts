import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RooftopDocument = Rooftop & Document;

@Schema({ timestamps: true })
export class Rooftop {
  @Prop({ required: true, unique: true })
  rooftopId: string; // e.g. "booran-hyundai-dandenong"

  @Prop({ required: true })
  name: string; // e.g. "Booran Hyundai Dandenong"

  @Prop({ required: true })
  location: string; // e.g. "Dandenong, VIC"

  @Prop({ required: true })
  franchise: string; // e.g. "Hyundai"

  @Prop({ required: true })
  clusterId: string; // e.g. "cluster-hyundai-metro", "cluster-bayside-kia"

  @Prop({ required: true })
  clusterName: string; // e.g. "Booran Hyundai Metro Cluster"

  @Prop({ required: true, type: [String] })
  pentanaBranchCodes: string[]; // e.g. ["DAN-HYU-01", "DAN-HYU-USED"]

  @Prop({ required: true })
  generalManager: string;

  @Prop({ required: true })
  dealerPrincipal: string;

  @Prop({ default: 0.0003 }) // 0.03% daily holding cost rate proxy
  dailyHoldingCostRate: number;

  @Prop({ default: 'eraPower' })
  pentanaSourceSystem: 'eraPower' | 'EraNet';

  @Prop({ required: true })
  websiteUrl: string;
}

export const RooftopSchema = SchemaFactory.createForClass(Rooftop);
