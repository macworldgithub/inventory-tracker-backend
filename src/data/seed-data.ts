export interface SeedRooftop {
  rooftopId: string;
  name: string;
  location: string;
  franchise: string;
  clusterId: string;
  clusterName: string;
  pentanaBranchCodes: string[]; // Pentana 'loc' codes from the CSV
  generalManager: string;
  dealerPrincipal: string;
  dailyHoldingCostRate: number;
  pentanaSourceSystem: 'eraPower' | 'EraNet';
  websiteUrl: string;
}

export const SEED_ROOFTOPS: SeedRooftop[] = [
  {
    rooftopId: 'booran-hyundai-berwick',
    name: 'Booran Hyundai Berwick',
    location: 'Berwick, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-metro',
    clusterName: 'Booran Hyundai Metro Cluster',
    pentanaBranchCodes: ['BWHY'],
    generalManager: 'Liam O\'Connor',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.booranhyundaiberwick.com.au'
  },
  {
    rooftopId: 'booran-hyundai-cranbourne',
    name: 'Booran Hyundai Cranbourne',
    location: 'Cranbourne, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-metro',
    clusterName: 'Booran Hyundai Metro Cluster',
    pentanaBranchCodes: ['CRAN', 'CRANHOL', 'CYCRANHOL'],
    generalManager: 'Sarah Jenkins',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.booranhyundaicranbourne.com.au'
  },
  {
    rooftopId: 'booran-hyundai-south-morang',
    name: 'Booran Hyundai South Morang',
    location: 'South Morang, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-metro',
    clusterName: 'Booran Hyundai Metro Cluster',
    pentanaBranchCodes: ['MILLPK'],
    generalManager: 'Nathan Cole',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'EraNet',
    websiteUrl: 'https://www.booranhyundaisouthmorang.com.au'
  },
  {
    rooftopId: 'booran-kia-cheltenham',
    name: 'Booran Kia Cheltenham',
    location: 'Cheltenham, VIC',
    franchise: 'Kia',
    clusterId: 'cluster-bayside-kia',
    clusterName: 'Booran Bayside Kia Cluster',
    pentanaBranchCodes: ['CHELT', 'CHELTH', 'KYARD', 'YYARD'],
    generalManager: 'Brett Harrison',
    dealerPrincipal: 'Paul Booran',
    dailyHoldingCostRate: 0.00032,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.boorankiacheltenham.com.au'
  },
];

// Location codes that indicate the vehicle is in transit / on order (not physically at the dealership)
export const IN_TRANSIT_LOC_CODES = ['HYDB', 'HYDC', 'DUE', 'TRANSIT'];

// ============ CSV Record Interfaces ============

/**
 * Raw record parsed from a NEW vehicle Pentana CSV.
 * Header: stock#, carline, description, fa, colour, loc, dest loc, list price, age, age, deal, status, open ro/po
 */
export interface RawNewVehicleCsvRecord {
  stockNumber: string;       // stock#
  carline: string;           // e.g. "TUCSON HEV"
  description: string;       // Full model description e.g. "NX4.V4 TUCSON ELITE 1.6T HEV AWD"
  fa: string;                // Fleet/Auction flag (usually empty)
  colour: string;            // e.g. "ECOTRONIC GREY"
  loc: string;               // Location code e.g. "BWHY", "CRAN", "CHELT", "MILLPK"
  destLoc: string;           // Destination location (usually empty)
  listPrice: number;         // Cost ex-GST
  ageField1: string;         // First age column (usually empty)
  ageField2: number;         // Second age column = Days in Stock
  deal: string;              // Deal number if sold / deal pending
  status: string;            // IN-STOCK, DEMO, DEAL PEND, DLR TRADE, IN-TRANSIT, ON-ORDER, LOANER, SOLD
  openRoPo: string;          // Y/N - Open Repair Order / Purchase Order
}

/**
 * Raw record parsed from a USED vehicle Pentana CSV.
 * Header: stock no, age, year, carline, description, reg no, odometer, colour, list price, loc, dest loc, status, open ro/po
 */
export interface RawUsedVehicleCsvRecord {
  stockNumber: string;       // stock no
  age: number;               // Days in Stock
  year: number;              // Model year (2-digit or 4-digit)
  carline: string;           // e.g. "TUCSON"
  description: string;       // Full model description
  rego: string;              // Registration number
  odometer: number;          // Odometer reading
  colour: string;            // e.g. "WHITE/BLACK"
  listPrice: number;         // Advertised / list price
  loc: string;               // Location code
  destLoc: string;           // Destination location
  status: string;            // IN-STOCK, DEAL PEND, LOANER, WHOLESALE, IN SERVICE, RECO, DRIVE CARS
  openRoPo: string;          // Y/N
}

/**
 * Unified normalized record that both New and Used CSV parsers produce.
 * This is what the reconciliation service consumes.
 */
export interface NormalizedPentanaRecord {
  stockNumber: string;
  carline: string;
  description: string;
  colour: string;
  loc: string;
  destLoc: string;
  listPrice: number;
  daysInStock: number;
  deal: string;
  status: string;
  openRoPo: boolean;
  // Used-car specific fields
  year?: number;
  rego?: string;
  odometer?: number;
  // Derived
  category: 'New' | 'Used' | 'Demo' | 'Loaner';
  make: string; // Inferred from the rooftop franchise
}

export interface RawWebsiteRecord {
  stockNumber: string;
  advertisedPrice: number | null;
  heroPhoto: string;
  photos: string[];
  isLiveOnWebsite: boolean;
  listingUrl: string;
  listingDescription: string;
}

// export const SAMPLE_PHOTOS = [
//   'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
//   'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
//   'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80',
//   'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&auto=format&fit=crop&q=80',
//   'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80',
//   'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800&auto=format&fit=crop&q=80',
//   'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&auto=format&fit=crop&q=80',
//   'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800&auto=format&fit=crop&q=80'
// ];
