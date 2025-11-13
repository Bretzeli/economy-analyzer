import {InflationData} from "@/types/api-types";
import {XMLParser} from "fast-xml-parser";
import {getCountryName} from "@/lib/country-codes";

// Helper function to process observations
const processObservations = (observations: unknown[]): InflationData[] => {
    const inflationData: InflationData[] = [];
    
    for (const obs of observations) {
        const obsRecord = obs as Record<string, unknown>;
        const obsKey = obsRecord["generic:ObsKey"] as Record<string, unknown> | undefined;
        if (!obsKey) continue;

        const keyValues = obsKey["generic:Value"];
        if (!keyValues) continue;

        const keyArray = Array.isArray(keyValues) ? keyValues : [keyValues];

        let timePeriod = "";
        let countryCode = "";

        for (const key of keyArray) {
            const keyRecord = key as Record<string, string> | undefined;
            if (keyRecord?.["@_id"] === "TIME_PERIOD") timePeriod = keyRecord["@_value"] || "";
            if (keyRecord?.["@_id"] === "REF_AREA") countryCode = keyRecord["@_value"] || "";
        }

        const obsValue = obsRecord["generic:ObsValue"] as Record<string, string> | undefined;
        const inflationRate = parseFloat(obsValue?.["@_value"] || "0");

        if (timePeriod && countryCode) {
            inflationData.push({
                countryCode,
                countryName: getCountryName(countryCode),
                timestamp: timePeriod,
                inflationRate
            });
        }
    }
    
    return inflationData;
};

export const parseInflationXml = (xmlString: string): InflationData[] => {
    console.log("Parsing inflation XML");
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
    });
    const result = parser.parse(xmlString);

    const inflationData: InflationData[] = [];
    
    // Debug: Log top-level keys to understand structure
    console.log("Top-level keys:", Object.keys(result || {}));
    
    // Try different possible paths to access the data
    let dataSet = result?.["message:GenericData"]?.["message:DataSet"];
    if (!dataSet) {
        // Try alternative paths
        dataSet = result?.["GenericData"]?.["DataSet"];
        if (!dataSet) {
            dataSet = result?.["message:GenericData"]?.["DataSet"];
            if (!dataSet) {
                dataSet = result?.["GenericData"]?.["message:DataSet"];
                if (!dataSet) {
                    // Try direct access
                    const topLevelKeys = Object.keys(result || {});
                    for (const key of topLevelKeys) {
                        const value = result[key];
                        if (value && typeof value === 'object') {
                            const innerKeys = Object.keys(value);
                            if (innerKeys.some(k => k.includes('DataSet') || k.includes('Series') || k.includes('Obs'))) {
                                dataSet = value;
                                console.log(`Found dataSet at: ${key}`);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    
    if (!dataSet) {
        console.log("No message:DataSet found in XML. Available keys:", Object.keys(result || {}));
        // Try to find observations directly
        const allObservations: unknown[] = [];
        const findObservations = (obj: unknown, path: string = ""): void => {
            if (!obj || typeof obj !== 'object') return;
            const record = obj as Record<string, unknown>;
            for (const [key, value] of Object.entries(record)) {
                if (key.includes('Obs') && Array.isArray(value)) {
                    allObservations.push(...value);
                } else if (key.includes('Obs') && value) {
                    allObservations.push(value);
                } else if (value && typeof value === 'object') {
                    findObservations(value, `${path}.${key}`);
                }
            }
        };
        findObservations(result);
        if (allObservations.length > 0) {
            console.log(`Found ${allObservations.length} observations via recursive search`);
            const processed = processObservations(allObservations);
            
            // Debug: Count unique countries
            const uniqueCountries = new Set(processed.map(p => p.countryCode));
            console.log(`Parsed ${processed.length} inflation records from ${uniqueCountries.size} unique countries:`, Array.from(uniqueCountries).join(", "));
            
            return processed;
        }
        return inflationData;
    }

    // Log dataSet keys to understand structure
    console.log("DataSet keys:", Object.keys(dataSet as Record<string, unknown> || {}));

    // generic:Series can be a single object or an array
    let series = (dataSet as Record<string, unknown>)?.["generic:Series"];
    if (!series) {
        // Try alternative names
        series = (dataSet as Record<string, unknown>)?.["Series"];
        if (!series) {
            // Try to find series by searching for keys containing "Series"
            const dataSetKeys = Object.keys(dataSet as Record<string, unknown> || {});
            for (const key of dataSetKeys) {
                if (key.includes('Series')) {
                    series = (dataSet as Record<string, unknown>)?.[key];
                    console.log(`Found series at key: ${key}`);
                    break;
                }
            }
        }
    }
    
    if (!series) {
        console.log("No generic:Series found in XML. DataSet keys:", Object.keys(dataSet as Record<string, unknown> || {}));
        // Try to find observations directly in dataSet
        const dataSetRecord = dataSet as Record<string, unknown>;
        const obsInDataSet = dataSetRecord["generic:Obs"] || dataSetRecord["Obs"];
        if (obsInDataSet) {
            const obsArray = Array.isArray(obsInDataSet) ? obsInDataSet : [obsInDataSet];
            console.log(`Found ${obsArray.length} observations directly in DataSet`);
            const processed = processObservations(obsArray);
            
            // Debug: Count unique countries
            const uniqueCountries = new Set(processed.map(p => p.countryCode));
            console.log(`Parsed ${processed.length} inflation records from ${uniqueCountries.size} unique countries:`, Array.from(uniqueCountries).join(", "));
            
            return processed;
        } else {
            return inflationData;
        }
    }

    // Handle both single series and array of series
    const seriesArray = Array.isArray(series) ? series : [series];
    console.log(`Found ${seriesArray.length} series to process`);
    
    // Collect all observations from all series
    const allObservations: unknown[] = [];
    for (let i = 0; i < seriesArray.length; i++) {
        const singleSeries = seriesArray[i] as Record<string, unknown>;
        const seriesKeys = Object.keys(singleSeries);
        console.log(`Series ${i + 1} keys:`, seriesKeys);
        
        const observations = singleSeries["generic:Obs"];
        if (observations) {
            const obsArray = Array.isArray(observations) ? observations : [observations];
            console.log(`Series ${i + 1} has ${obsArray.length} observations`);
            allObservations.push(...obsArray);
        } else {
            console.log(`Series ${i + 1} has no generic:Obs`);
        }
    }

    if (allObservations.length === 0) {
        console.log("No generic:Obs found in XML");
        return inflationData;
    }

    console.log(`Found ${allObservations.length} observations to process`);
    const processed = processObservations(allObservations);
    
    // Debug: Count unique countries
    const uniqueCountries = new Set(processed.map(p => p.countryCode));
    console.log(`Parsed ${processed.length} inflation records from ${uniqueCountries.size} unique countries:`, Array.from(uniqueCountries).join(", "));
    
    return processed;
}
