"use client";

import { Button } from "@/components/shadcn/button";
import { updateAllInflationData, deleteAndReimportAllData, deleteAllData } from "@/services/update-inflation-data";
import { useState } from "react";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleImportNewest = async () => {
    setIsLoading(true);
    setStatus("Importing newest data from both sources...");
    try {
      await updateAllInflationData();
      setStatus("Successfully imported newest data!");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete ALL data? This action cannot be undone.")) {
      return;
    }
    setIsLoading(true);
    setStatus("Deleting all data...");
    try {
      const result = await deleteAllData();
      setStatus(`Successfully deleted ${result.inflationDeleted} inflation records and ${result.countriesDeleted} country records.`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAndReimport = async () => {
    if (!confirm("Are you sure you want to delete ALL data and re-import? This action cannot be undone and may take a long time.")) {
      return;
    }
    setIsLoading(true);
    setStatus("Deleting all data and re-importing... This may take a while...");
    try {
      await deleteAndReimportAllData();
      setStatus("Successfully deleted and re-imported all data!");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Economy Analyzer - Data Management</h1>
      
      <div className="space-y-4 mb-6">
        <Button 
          onClick={handleImportNewest} 
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          Import Newest Data from BOTH Sources
        </Button>
        
        <Button 
          onClick={handleDeleteAll} 
          disabled={isLoading}
          variant="destructive"
          className="w-full"
          size="lg"
        >
          Delete All Data
        </Button>
        
        <Button 
          onClick={handleDeleteAndReimport} 
          disabled={isLoading}
          variant="destructive"
          className="w-full"
          size="lg"
        >
          Delete and Re-import All Data
        </Button>
      </div>

      {status && (
        <div className={`p-4 rounded-md ${status.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
          <p className="font-medium">{status}</p>
        </div>
      )}

      {isLoading && (
        <div className="mt-4 text-center text-gray-600">
          <p>Processing... Please wait.</p>
        </div>
      )}
    </div>
  );
}
