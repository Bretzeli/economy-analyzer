export type SortOrder = 'asc' | 'desc';

export type SortBy = 
    | 'country' 
    | 'time' 
    | 'timestamp'
    | 'income' 
    | 'inflation' 
    | 'ppp_international_dollars'
    | 'current_local_currency'
    | 'annual_growth_rate'
    | 'inflationValue'
    | 'best'
    | 'worst'
    | 'difference';

export type PagingOptions = {
    offset?: number;
    limit?: number;
};

export type Filter = {
    startDate?: string;
    endDate?: string;
    countryCodes?: string[];
    countryNames?: string[];
    timestamp?: string; // For specific timestamp queries (e.g., ranking at a point in time)
    sortBy?: SortBy;
    sortOrder?: SortOrder;
    paging?: PagingOptions;
}