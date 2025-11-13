import {InflationData} from "@/types/api-types";
import {XMLParser} from "fast-xml-parser";

export const parseInflationXml = (xmlString: string): InflationData[] => {
    console.log("Parsing inflation XML");
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
    });
    const result = parser.parse(xmlString);

    const inflationData: InflationData[] = [];
    const observations = result?.["message:GenericData"]?.["message:DataSet"]?.["generic:Series"]?.["generic:Obs"];

    if (!observations) return inflationData;

    const obsArray = Array.isArray(observations) ? observations : [observations];

    for (const obs of obsArray) {
        const keyValues = obs["generic:ObsKey"]?.["generic:Value"];
        const keyArray = Array.isArray(keyValues) ? keyValues : [keyValues];

        let timePeriod = "";
        let countryCode = "";

        for (const key of keyArray) {
            if (key["@_id"] === "TIME_PERIOD") timePeriod = key["@_value"];
            if (key["@_id"] === "REF_AREA") countryCode = key["@_value"];
        }

        const inflationRate = parseFloat(obs["generic:ObsValue"]?.["@_value"] || "0");

        inflationData.push({
            countryCode,
            countryName: "",
            timestamp: timePeriod,
            inflationRate
        });
    }

    console.log("Parsed " + inflationData.length + " inflation records");
    return inflationData;
}
