"use server";

import {addInflationData, getNewestDateForInflationData} from "@/services/db-operations";
import {getOecdInflationData} from "@/services/api-calls";

export const updateInflationData = async () => {
    console.log("Updating inflation data...");
    let startDate: string = await getNewestDateForInflationData() ?? "1914-01";
    startDate = incrementDate(startDate);

    let incrementedDate: string;
    for (startDate; startDate <= new Date().toISOString().slice(0, 4); startDate = incrementedDate){
        incrementedDate = incrementDate(startDate, 75);     // 20 downloads pro Stunde ==> ca. 2h mit 75 Zeitpunkten pro Abfrage
        console.log(`Updating inflation data for period: ${startDate} - ${incrementedDate}`);
        const newData = await getOecdInflationData(startDate, incrementedDate);
        console.log(`Received ${newData.length} new records.`);
        newData.forEach(data => addInflationData(data));
    }
}

function incrementDate(date: string, increment: number = 1): string {
    if (date.includes('-')) {
        // Format: yyyy-mm
        const [year, month] = date.split('-');
        const yearNum = parseInt(year, 10);
        const monthNum = parseInt(month, 10);

        // Calculate total months
        const totalMonths = yearNum * 12 + monthNum + increment;

        // Calculate new year and month
        const newYear = Math.floor((totalMonths - 1) / 12);
        const newMonth = ((totalMonths - 1) % 12) + 1;

        console.log(`Incremented date: ${newYear}-${newMonth.toString().padStart(2, '0')}`);
        return `${newYear}-${newMonth.toString().padStart(2, '0')}`;
    } else {
        // Format: yyyy
        const yearNum = parseInt(date, 10);
        console.log(`Incremented date: ${yearNum + increment}`);
        return (yearNum + increment).toString();
    }
}