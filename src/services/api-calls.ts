import {parseInflationXml} from "@/services/xml-to-json";
import {inflationCsvToJson} from "@/services/csv-to-json";
import {InflationData} from "@/types/api-types";
import {wait} from "next/dist/lib/wait";
import AdmZip from "adm-zip";

const RETRY_AFTER: number = 1000;
const MAX_RETRIES: number = 20;
const RETRY_MULTIPLIER: number = 2;

export const getOecdInflationData = async (startDate: string = "1914-01", endDate: string = "5000-00") : Promise<InflationData[]> => {
    const url = `https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/AUS+AUT+BEL+CAN+CHL+COL+CRI+CZE+DNK+EST+FIN+FRA+DEU+GRC+HUN+ISL+IRL+ISR+ITA+JPN+KOR+LVA+LTU+LUX+MEX+NLD+NOR+POL+PRT+SVK+SVN+ESP+SWE+CHE+TUR+GBR+USA+G7+G20+EA20+EU27_2020+OECD+OECDE+ARG+BRA+BGR+CHN+HRV+IND+IDN+RUS+SAU+ZAF.M.N.CPI.PA._T.N.GY?startPeriod=${startDate}&endPeriod=${endDate}&dimensionAtObservation=AllDimensions`;

    let response;
    let retryCount = 0;
    while(true){
        response = await fetch(url);
        if (!response.ok) {
            if(response.status === 429 && response.statusText === "Too Many Requests"){
                const waitTime = RETRY_AFTER * RETRY_MULTIPLIER ** retryCount;
                console.log(`Waiting due to API rate limit: ${waitTime}ms`);
                if(retryCount >= MAX_RETRIES) throw new Error("Too many retries");
                await wait(waitTime);
                retryCount++;
                continue;
            }
            console.error(`Failed to fetch data: ${response.statusText}`);
            console.error(response);
            console.error(response.headers);
            console.error(response.status);
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        } else{
            retryCount = 0;
            break;
        }
    }

    const xmlText = await response.text();
    return parseInflationXml(xmlText);
}

export const getInflationDataFromWorldBank = async (startDate: string = "1900"): Promise<InflationData[]> => {
    const url = "https://api.worldbank.org/v2/en/indicator/FP.CPI.TOTL.ZG?downloadformat=csv";

    let response;
    let retryCount = 0;
    while(true){
        response = await fetch(url);
        if (!response.ok) {
            if(response.status === 429 && response.statusText === "Too Many Requests"){
                const waitTime = RETRY_AFTER * RETRY_MULTIPLIER ** retryCount;
                console.log(`Waiting due to API rate limit: ${waitTime}ms`);
                if(retryCount >= MAX_RETRIES) throw new Error("Too many retries");
                await wait(waitTime);
                retryCount++;
                continue;
            }
            console.error(`Failed to fetch data: ${response.statusText}`);
            console.error(response);
            console.error(response.headers);
            console.error(response.status);
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        } else{
            retryCount = 0;
            break;
        }
    }

    // Get the ZIP file as an ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();
    const zip = new AdmZip(Buffer.from(arrayBuffer));
    
    // Get all entries in the ZIP file
    const zipEntries = zip.getEntries();
    
    // Find the CSV file that starts with "API"
    const apiCsvEntry = zipEntries.find((entry: { entryName: string }) => 
        entry.entryName.startsWith("API") && entry.entryName.endsWith(".csv")
    );
    
    if (!apiCsvEntry) {
        throw new Error("Could not find API CSV file in the downloaded ZIP");
    }
    
    // Extract and read the CSV content
    const csvContent = apiCsvEntry.getData().toString('utf-8');
    
    // Parse CSV to JSON
    const allData = inflationCsvToJson(csvContent);
    
    // Filter data based on startDate
    // startDate is in format "YYYY" (e.g., "1900")
    const startYear = parseInt(startDate.substring(0, 4));
    if (isNaN(startYear)) {
        console.warn(`Invalid startDate format: ${startDate}. Using all data.`);
        return allData;
    }
    
    // Filter out data before startDate
    const filteredData = allData.filter(data => {
        const dataYear = parseInt(data.timestamp.substring(0, 4));
        return !isNaN(dataYear) && dataYear >= startYear;
    });
    
    return filteredData;
}