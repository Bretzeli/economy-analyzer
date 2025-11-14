import { InflationData } from "@/types/api-types";
import { getCountryName } from "@/lib/country-codes";

export const inflationCsvToJson = (csv: string): InflationData[] => {
    const lines = csv.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 5) {
        console.warn("CSV file appears to be too short or empty");
        return [];
    }

    // World Bank CSV files typically have metadata in the first few rows
    // We need to find the header row which contains year columns
    let headerRowIndex = -1;
    let countryCodeIndex = -1;
    let countryNameIndex = -1;
    
    // Look for the header row (usually around row 4-5, contains "Country Name", "Country Code", and year columns)
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i];
        // Check if this line contains "Country Code" or "Country Name"
        if (line.includes('Country Code') || line.includes('Country Name')) {
            headerRowIndex = i;
            const headers = line.split(',').map(h => h.trim().replace(/"/g, ''));
            
            // Find indices for country code and country name
            countryCodeIndex = headers.findIndex(h => h === 'Country Code' || h === 'country_code');
            countryNameIndex = headers.findIndex(h => h === 'Country Name' || h === 'country_name');
            
            if (countryCodeIndex !== -1) {
                break;
            }
        }
    }

    if (headerRowIndex === -1 || countryCodeIndex === -1) {
        console.warn("Could not find header row with Country Code in CSV");
        return [];
    }

    const headers = lines[headerRowIndex].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Find year columns (columns that are numeric years, typically starting from index 4 or 5)
    const yearColumns: { index: number; year: string }[] = [];
    for (let i = Math.max(countryCodeIndex, countryNameIndex) + 1; i < headers.length; i++) {
        const header = headers[i];
        // Check if header is a 4-digit year
        if (/^\d{4}$/.test(header)) {
            yearColumns.push({ index: i, year: header });
        }
    }

    if (yearColumns.length === 0) {
        console.warn("Could not find any year columns in CSV");
        return [];
    }

    const inflationData: InflationData[] = [];

    // Process data rows (starting after header row)
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        // Skip empty lines or lines that look like metadata
        if (!line || line.startsWith('Data Source') || line.startsWith('Last Updated')) {
            continue;
        }

        // Parse CSV line (handling quoted values)
        const values: string[] = [];
        let currentValue = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim()); // Add last value

        if (values.length <= Math.max(countryCodeIndex, countryNameIndex)) {
            continue;
        }

        const countryCode = values[countryCodeIndex]?.replace(/"/g, '').trim();
        const countryName = countryNameIndex !== -1 
            ? values[countryNameIndex]?.replace(/"/g, '').trim() 
            : getCountryName(countryCode || '');

        if (!countryCode) {
            continue;
        }

        // Extract inflation values for each year
        for (const { index, year } of yearColumns) {
            if (index < values.length) {
                const valueStr = values[index]?.replace(/"/g, '').trim();
                if (valueStr && valueStr !== '' && !isNaN(parseFloat(valueStr))) {
                    const inflationRate = parseFloat(valueStr);
                    if (!isNaN(inflationRate)) {
                        inflationData.push({
                            countryCode,
                            countryName: countryName || getCountryName(countryCode),
                            timestamp: year,
                            inflationRate
                        });
                    }
                }
            }
        }
    }

    return inflationData;
}