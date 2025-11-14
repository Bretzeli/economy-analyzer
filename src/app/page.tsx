"use client";

import { Button } from "@/components/shadcn/button";
import {updateInflationDataFromOecd} from "@/services/update-oecd-inflation-data";

export default function Home() {
  const handleUpdateInflation = async () => {
    await updateInflationDataFromOecd();
  };

  return (
    <div className="p-8">
      <Button onClick={handleUpdateInflation}>
        Update Inflation Data
      </Button>
    </div>
  );
}
