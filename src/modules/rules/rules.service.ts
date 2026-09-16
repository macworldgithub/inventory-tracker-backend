import { Injectable } from '@nestjs/common';

export interface CalculatedMetrics {
  daysInStock: number;
  agingBucket: '0-30' | '31-45' | '46-60' | '61-90' | '90+';
  frontlineReady: boolean;
  potentialGross: number;
  holdingCostPerDay: number;
  accumulatedHoldingCost: number;
  recommendedAction: 'PRICE' | 'TRANSFER' | 'WHOLESALE' | 'COMPLETE' | 'HOLD' | 'NONE';
  actionReason: string;
  recommendedTransferTarget: string;
  isPriceReviewRequired: boolean;
}

@Injectable()
export class RulesService {
  calculateMetrics(
    dateInStock: Date,
    status: string,
    totalStockCost: number,
    advertisedPrice: number | null,
    hasPhotos: boolean,
    dailyHoldingRate: number = 0.0003,
    expectedReadyDate?: Date | null,
    category: string = 'Used',
    transferCandidateTarget?: string
  ): CalculatedMetrics {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - new Date(dateInStock).getTime());
    const daysInStock = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    // Aging buckets
    let agingBucket: '0-30' | '31-45' | '46-60' | '61-90' | '90+' = '0-30';
    if (daysInStock > 90) agingBucket = '90+';
    else if (daysInStock > 60) agingBucket = '61-90';
    else if (daysInStock > 45) agingBucket = '46-60';
    else if (daysInStock > 30) agingBucket = '31-45';

    // Frontline readiness: (Available or Demo) + has photos + has advertised price
    const frontlineReady = 
      (status === 'Available' || status === 'Demo') && 
      hasPhotos && 
      advertisedPrice !== null && 
      advertisedPrice > 0;

    // Holding cost calculations
    const holdingCostPerDay = Math.round(totalStockCost * dailyHoldingRate);
    const accumulatedHoldingCost = holdingCostPerDay * daysInStock;

    // Potential gross
    const potentialGross = advertisedPrice !== null ? Math.round(advertisedPrice - totalStockCost) : 0;

    // Deterministic Rules Engine
    let recommendedAction: 'PRICE' | 'TRANSFER' | 'WHOLESALE' | 'COMPLETE' | 'HOLD' | 'NONE' = 'NONE';
    let actionReason = '';
    let recommendedTransferTarget = '';
    let isPriceReviewRequired = false;

    // 1. COMPLETE Check: Merchandising exceptions
    if (!hasPhotos) {
      recommendedAction = 'COMPLETE';
      actionReason = 'Photos missing: vehicle invisible to online buyers';
    } else if (advertisedPrice === null || advertisedPrice <= 0) {
      recommendedAction = 'COMPLETE';
      actionReason = 'Advertised price unlisted: public enquiry blocked';
    } else if (status === 'In Recon' && expectedReadyDate && new Date(expectedReadyDate) < now) {
      recommendedAction = 'COMPLETE';
      actionReason = `Recon SLA breach: overdue by ${Math.floor((now.getTime() - new Date(expectedReadyDate).getTime()) / (1000*3600*24))} days`;
    } 
    // 2. WHOLESALE Check: 90+ days aged used stock
    else if (category === 'Used' && daysInStock >= 90) {
      recommendedAction = 'WHOLESALE';
      actionReason = `Capital trap: ${daysInStock} DIS exceeds 90-day wholesale threshold. $${accumulatedHoldingCost.toLocaleString()} holding cost consumed`;
    }
    // 3. TRANSFER Check: Supply imbalance
    else if (transferCandidateTarget && daysInStock > 45) {
      recommendedAction = 'TRANSFER';
      actionReason = `Rebalance: aged ${daysInStock} days here, high buyer velocity at ${transferCandidateTarget}`;
      recommendedTransferTarget = transferCandidateTarget;
    }
    // 4. PRICE Check: Margin compression or aging trigger
    else if (advertisedPrice !== null && potentialGross < 800) {
      recommendedAction = 'PRICE';
      actionReason = `Margin compression: potential gross ($${potentialGross.toLocaleString()}) below $800 safety threshold`;
      isPriceReviewRequired = true;
    } else if (daysInStock > 45 && potentialGross > 2500) {
      recommendedAction = 'PRICE';
      actionReason = `Aged ${daysInStock} DIS with $${potentialGross.toLocaleString()} buffer: price drop recommended to accelerate turn`;
      isPriceReviewRequired = true;
    }
    // 5. HOLD Check: Fast-turn fresh models
    else if (daysInStock <= 14 && status === 'Available') {
      recommendedAction = 'HOLD';
      actionReason = 'Fresh arrival (under 14 days DIS): maintain full margin';
    }

    return {
      daysInStock,
      agingBucket,
      frontlineReady,
      potentialGross,
      holdingCostPerDay,
      accumulatedHoldingCost,
      recommendedAction,
      actionReason,
      recommendedTransferTarget,
      isPriceReviewRequired,
    };
  }
}
