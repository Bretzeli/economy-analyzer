import {addInflationData, getNewestDateForInflationData} from "@/services/db-operations";
import {getOecdInflationData} from "@/services/api-calls";

export const updateInflationData = async () => {
    let startDate: string = await getNewestDateForInflationData();
    startDate = incrementDate(startDate);

    let incrementedDate: string;
    for (startDate; startDate <= new Date().toISOString().slice(0, 4); startDate = incrementedDate){
        incrementedDate = incrementDate(startDate, 30);
        const newData = await getOecdInflationData(startDate, incrementedDate);
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

        return `${newYear}-${newMonth.toString().padStart(2, '0')}`;
    } else {
        // Format: yyyy
        const yearNum = parseInt(date, 10);
        return (yearNum + increment).toString();
    }
}