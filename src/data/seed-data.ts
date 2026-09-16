export interface SeedRooftop {
  rooftopId: string;
  name: string;
  location: string;
  franchise: string;
  clusterId: string;
  clusterName: string;
  pentanaBranchCodes: string[];
  generalManager: string;
  dealerPrincipal: string;
  dailyHoldingCostRate: number;
  pentanaSourceSystem: 'eraPower' | 'EraNet';
  websiteUrl: string;
}

export const SEED_ROOFTOPS: SeedRooftop[] = [
  {
    rooftopId: 'booran-hyundai-dandenong',
    name: 'Booran Hyundai Dandenong',
    location: 'Dandenong, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-metro',
    clusterName: 'Booran Hyundai Metro Cluster',
    pentanaBranchCodes: ['DAN-HYU-01', 'DAN-HYU-USED'],
    generalManager: 'Marcus Vance',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.booranhyundaidandenong.com.au'
  },
  {
    rooftopId: 'booran-hyundai-cranbourne',
    name: 'Booran Hyundai Cranbourne',
    location: 'Cranbourne, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-metro',
    clusterName: 'Booran Hyundai Metro Cluster',
    pentanaBranchCodes: ['CRN-HYU-01', 'CRN-HYU-USED'],
    generalManager: 'Sarah Jenkins',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.booranhyundaicranbourne.com.au'
  },
  {
    rooftopId: 'booran-hyundai-berwick',
    name: 'Booran Hyundai Berwick',
    location: 'Berwick, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-metro',
    clusterName: 'Booran Hyundai Metro Cluster',
    pentanaBranchCodes: ['BER-HYU-01', 'BER-HYU-USED'],
    generalManager: 'Liam O’Connor',
    dealerPrincipal: 'David Booran',
    dailyHoldingCostRate: 0.0003,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.booranhyundaiberwick.com.au'
  },
  {
    rooftopId: 'booran-hyundai-south-morang',
    name: 'Booran Hyundai South Morang',
    location: 'South Morang, VIC',
    franchise: 'Hyundai',
    clusterId: 'cluster-hyundai-metro',
    clusterName: 'Booran Hyundai Metro Cluster',
    pentanaBranchCodes: ['SMR-HYU-01'],
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
    pentanaBranchCodes: ['CHL-KIA-01', 'CHL-KIA-USED'],
    generalManager: 'Brett Harrison',
    dealerPrincipal: 'Paul Booran',
    dailyHoldingCostRate: 0.00032,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.boorankiacheltenham.com.au'
  },
  {
    rooftopId: 'booran-kia-cranbourne',
    name: 'Booran Kia Cranbourne',
    location: 'Cranbourne, VIC',
    franchise: 'Kia',
    clusterId: 'cluster-bayside-kia',
    clusterName: 'Booran Bayside Kia Cluster',
    pentanaBranchCodes: ['CRN-KIA-01'],
    generalManager: 'Gemma Watson',
    dealerPrincipal: 'Paul Booran',
    dailyHoldingCostRate: 0.00032,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.boorankiacranbourne.com.au'
  },
  {
    rooftopId: 'booran-mg-dandenong',
    name: 'Booran MG Dandenong',
    location: 'Dandenong, VIC',
    franchise: 'MG',
    clusterId: 'cluster-growth-brands',
    clusterName: 'Booran Emerging Franchises Cluster',
    pentanaBranchCodes: ['DAN-MG-01'],
    generalManager: 'Jason Chen',
    dealerPrincipal: 'Mark Stevens',
    dailyHoldingCostRate: 0.00028,
    pentanaSourceSystem: 'eraPower',
    websiteUrl: 'https://www.booranmgdandenong.com.au'
  },
  {
    rooftopId: 'booran-chery-dandenong',
    name: 'Booran Chery Dandenong',
    location: 'Dandenong, VIC',
    franchise: 'Chery',
    clusterId: 'cluster-growth-brands',
    clusterName: 'Booran Emerging Franchises Cluster',
    pentanaBranchCodes: ['DAN-CHY-01'],
    generalManager: 'Chloe Taylor',
    dealerPrincipal: 'Mark Stevens',
    dailyHoldingCostRate: 0.00028,
    pentanaSourceSystem: 'EraNet',
    websiteUrl: 'https://www.boorancherydandenong.com.au'
  }
];

export interface RawPentanaRecord {
  vin: string;
  stockNumber: string;
  branchCode: string;
  year: number;
  make: string;
  model: string;
  variant: string;
  body: string;
  colour: string;
  fuel: string;
  transmission: string;
  odometer: number;
  category: 'New' | 'Used' | 'Demo';
  vehicleCost: number;
  postedRecon: number;
  extras: number;
  floorplanExposure: number;
  status: 'Available' | 'Reserved' | 'In Recon' | 'Wholesale' | 'Sold' | 'Demo';
  dateInStock: string;
  expectedReadyDate?: string;
  salesperson?: string;
  rego?: string;
}

export interface RawWebsiteRecord {
  vin: string;
  stockNumber: string;
  advertisedPrice: number | null;
  heroPhoto: string;
  photos: string[];
  isLiveOnWebsite: boolean;
  listingUrl: string;
  listingDescription: string;
}

export const SAMPLE_VEHICLE_MODELS = [
  { make: 'Hyundai', model: 'Tucson', body: 'SUV', fuel: 'Petrol', defaultPrice: 44990 },
  { make: 'Hyundai', model: 'Santa Fe', body: 'SUV', fuel: 'Hybrid', defaultPrice: 62990 },
  { make: 'Hyundai', model: 'i30', body: 'Hatchback', fuel: 'Petrol', defaultPrice: 31990 },
  { make: 'Hyundai', model: 'Kona', body: 'SUV', fuel: 'Electric', defaultPrice: 53990 },
  { make: 'Hyundai', model: 'Ioniq 5', body: 'SUV', fuel: 'Electric', defaultPrice: 71990 },
  { make: 'Kia', model: 'Sportage', body: 'SUV', fuel: 'Diesel', defaultPrice: 47990 },
  { make: 'Kia', model: 'Seltos', body: 'SUV', fuel: 'Petrol', defaultPrice: 34990 },
  { make: 'Kia', model: 'Carnival', body: 'People Mover', fuel: 'Diesel', defaultPrice: 68990 },
  { make: 'Kia', model: 'EV6', body: 'SUV', fuel: 'Electric', defaultPrice: 76990 },
  { make: 'MG', model: 'MG4', body: 'Hatchback', fuel: 'Electric', defaultPrice: 39990 },
  { make: 'MG', model: 'ZS EV', body: 'SUV', fuel: 'Electric', defaultPrice: 38990 },
  { make: 'Chery', model: 'Omoda 5', body: 'SUV', fuel: 'Petrol', defaultPrice: 32990 },
  { make: 'Chery', model: 'Tiggo 7 Pro', body: 'SUV', fuel: 'Petrol', defaultPrice: 39990 }
];

export const SAMPLE_PHOTOS = [
  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800&auto=format&fit=crop&q=80'
];
