export type InflationData = {
    countryCode: string;
    countryName: string;
    timestamp: string;
    inflationRate: number;
};

export type IncomeData = {
    countryCode: string;
    countryName: string;
    timestamp: string;
    ppp_international_dollars?: number;
    current_local_currency?: number;
    annual_growth_rate?: number;
};