import {InflationData} from "@/types/api-types";

export const parseInflationXml = (xmlString: string): InflationData[] => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    const observations = xmlDoc.getElementsByTagNameNS("*", "Obs");
    const inflationData: InflationData[] = [];

    for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];

        // Extract key values
        const keys = obs.getElementsByTagNameNS("*", "ObsKey")[0];
        const keyValues = keys.getElementsByTagNameNS("*", "Value");

        let timePeriod = "";
        let countryCode = "";

        for (let j = 0; j < keyValues.length; j++) {
            const key = keyValues[j];
            const id = key.getAttribute("id");
            const value = key.getAttribute("value");

            if (id === "TIME_PERIOD") timePeriod = value || "";
            if (id === "REF_AREA") countryCode = value || "";
        }

        // Extract observation value
        const obsValue = obs.getElementsByTagNameNS("*", "ObsValue")[0];
        const inflationRate = parseFloat(obsValue.getAttribute("value") || "0");

        inflationData.push({
            countryCode,
            countryName: "", // Country name will need to be resolved separately
            timestamp: timePeriod,
            inflationRate
        });
    }

    return inflationData;
}
