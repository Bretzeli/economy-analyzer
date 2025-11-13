import {parseInflationXml} from "@/services/xml-to-json";
import {InflationData} from "@/types/api-types";

export const getOecdInflationData = async (startDate: string = "1800-00", endDate: string = "5000-00") : Promise<InflationData[]> => {
    const url = `https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/AUS+AUT+BEL+CAN+CHL+COL+CRI+CZE+DNK+EST+FIN+FRA+DEU+GRC+HUN+ISL+IRL+ISR+ITA+JPN+KOR+LVA+LTU+LUX+MEX+NLD+NOR+POL+PRT+SVK+SVN+ESP+SWE+CHE+TUR+GBR+USA+G7+G20+EA20+EU27_2020+OECD+OECDE+ARG+BRA+BGR+CHN+HRV+IND+IDN+RUS+SAU+ZAF.M.N.CPI.PA._T.N.GY?startPeriod=${startDate}&endPeriod=${endDate}&dimensionAtObservation=AllDimensions`;

    const response = await fetch(url);
    const xmlText = await response.text();

    return parseInflationXml(xmlText);
}