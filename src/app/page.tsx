"use client";

import { Button } from "@/components/shadcn/button";
import {updateInflationData} from "@/services/update-inflation-data";

export default function Home() {
  const handleUpdateInflation = async () => {
    await updateInflationData();
  };

  return (
    <div className="p-8">
      <Button onClick={handleUpdateInflation}>
        Update Inflation Data
      </Button>
    </div>
  );
}
