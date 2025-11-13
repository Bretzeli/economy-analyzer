import {parseInflationXml} from "@/services/xml-to-json";
import {InflationData} from "@/types/api-types";
import {wait} from "next/dist/lib/wait";

const RETRY_AFTER: number = 1000;
const MAX_RETRIES: number = 6;
const RETRY_MULTIPLIER: number = 2;

export const getOecdInflationData = async (startDate: string = "1914-01", endDate: string = "5000-00") : Promise<InflationData[]> => {
    const url = `https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/AUS+AUT+BEL+CAN+CHL+COL+CRI+CZE+DNK+EST+FIN+FRA+DEU+GRC+HUN+ISL+IRL+ISR+ITA+JPN+KOR+LVA+LTU+LUX+MEX+NLD+NOR+POL+PRT+SVK+SVN+ESP+SWE+CHE+TUR+GBR+USA+G7+G20+EA20+EU27_2020+OECD+OECDE+ARG+BRA+BGR+CHN+HRV+IND+IDN+RUS+SAU+ZAF.M.N.CPI.PA._T.N.GY?startPeriod=${startDate}&endPeriod=${endDate}&dimensionAtObservation=AllDimensions`;

    console.log("calling " + url);
    let response;
    let retryCount = 0;
    while(true){
        response = await fetch(url);
        if (!response.ok) {
            if(response.status === 429 && response.statusText === "Too Many Requests"){
                console.log("Too many requests, retrying in " + RETRY_AFTER * RETRY_MULTIPLIER ** retryCount + "ms");
                if(retryCount >= MAX_RETRIES) throw new Error("Too many retries");
                await wait(RETRY_AFTER * RETRY_MULTIPLIER * retryCount++);
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

    console.log("xmlText length: " + xmlText.length);
    return parseInflationXml(xmlText);
}