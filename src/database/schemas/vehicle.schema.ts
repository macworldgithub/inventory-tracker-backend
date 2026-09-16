import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VehicleDocument = Vehicle & Document;

@Schema({ timestamps: true })
export class Vehicle {
  // Natural Keys
  @Prop({ required: true, unique: true, index: true })
  vin: string;

  @Prop({ required: true, index: true })
  stockNumber: string;

  @Prop({ required: true, index: true })
  rooftopId: string; // Foreign key to Rooftop

  @Prop({ required: true })
  rooftopName: string;

  @Prop({ required: true })
  branchCode: string;

  @Prop({ required: true, index: true })
  clusterId: string;

  @Prop({ required: true, index: true })
  franchise: string;

  @Prop({ default: '' })
  rego: string;

  // Vehicle Specifications
  @Prop({ required: true })
  year: number;

  @Prop({ required: true })
  make: string;

  @Prop({ required: true })
  model: string;

  @Prop({ default: '' })
  variant: string;

  @Prop({ default: 'SUV' })
  body: string;

  @Prop({ default: '' })
  colour: string;

  @Prop({ default: 'Petrol' })
  fuel: string;

  @Prop({ default: 'Automatic' })
  transmission: string;

  @Prop({ default: 0 })
  odometer: number;

  @Prop({ required: true, enum: ['New', 'Used', 'Demo'], index: true })
  category: 'New' | 'Used' | 'Demo';

  // Pentana Commercial Data (What it owes - System of Record)
  @Prop({ required: true })
  vehicleCost: number; // Purchase/invoice cost ex-GST

  @Prop({ default: 0 })
  postedRecon: number; // Mechanical, detail, paint recon completed

  @Prop({ default: 0 })
  extras: number; // Accessories, tints, warranties

  @Prop({ required: true, index: true })
  totalStockCost: number; // vehicleCost + postedRecon + extras (What it owes)

  @Prop({ default: 0 })
  floorplanExposure: number; // Amount financed on floorplan

  @Prop({ default: true })
  gstInclusive: boolean;

  // Website Merchandising Data (System of Presentation)
  @Prop({ default: null })
  advertisedPrice: number | null; // Null if missing from website

  @Prop({ default: '' })
  heroPhoto: string; // URL of primary photo

  @Prop({ type: [String], default: [] })
  photos: string[]; // Gallery URLs

  @Prop({ default: false, index: true })
  isLiveOnWebsite: boolean;

  @Prop({ default: '' })
  listingUrl: string;

  @Prop({ default: '' })
  listingDescription: string;

  // Status & Dates
  @Prop({ 
    required: true, 
    enum: ['Available', 'Reserved', 'In Recon', 'Wholesale', 'Sold', 'Demo'],
    default: 'Available',
    index: true 
  })
  status: 'Available' | 'Reserved' | 'In Recon' | 'Wholesale' | 'Sold' | 'Demo';

  @Prop({ required: true })
  dateInStock: Date;

  @Prop({ default: null })
  expectedReadyDate: Date | null;

  @Prop({ default: null })
  lastStatusChangeDate: Date | null;

  @Prop({ default: '' })
  salesperson: string;

  // BI Derived Metrics
  @Prop({ required: true, index: true })
  daysInStock: number; // DIS

  @Prop({ 
    required: true, 
    enum: ['0-30', '31-45', '46-60', '61-90', '90+'],
    index: true 
  })
  agingBucket: '0-30' | '31-45' | '46-60' | '61-90' | '90+';

  @Prop({ required: true, index: true })
  frontlineReady: boolean; // Available + photos > 0 + advertisedPrice > 0 + status !== 'In Recon'

  @Prop({ default: 0 })
  potentialGross: number; // advertisedPrice - totalStockCost

  @Prop({ default: 0 })
  holdingCostPerDay: number;

  @Prop({ default: 0 })
  accumulatedHoldingCost: number;

  // Rule-based Intelligence
  @Prop({ 
    required: true, 
    enum: ['PRICE', 'TRANSFER', 'WHOLESALE', 'COMPLETE', 'HOLD', 'NONE'],
    default: 'NONE',
    index: true 
  })
  recommendedAction: 'PRICE' | 'TRANSFER' | 'WHOLESALE' | 'COMPLETE' | 'HOLD' | 'NONE';

  @Prop({ default: '' })
  actionReason: string;

  @Prop({ default: '' })
  recommendedTransferTarget: string; // Target rooftop name if action is TRANSFER

  @Prop({ default: 0 })
  sisterUnitsInGroup: number; // Number of matching model units across other Booran lots

  @Prop({ default: 'eraPower' })
  pentanaSource: string;

  @Prop({ default: false })
  isPriceReviewRequired: boolean;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
VehicleSchema.index({ rooftopId: 1, status: 1, agingBucket: 1 });
VehicleSchema.index({ clusterId: 1, status: 1 });
