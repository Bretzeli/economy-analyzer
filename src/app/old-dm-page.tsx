"use client";

import { Button } from "@/components/shadcn/button";
import { updateAllData, deleteAllData, deleteAndReimportAllData } from "@/services/update-all-data";
import { updateAllInflationData, deleteAllInflationData, deleteAndReimportAllInflationData } from "@/services/update-inflation-data";
import { updateAllIncomeData, deleteAllIncomeData, deleteAndReimportAllIncomeData } from "@/services/update-income-data";
import { useState } from "react";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  // All Data handlers
  const handleUpdateAllData = async () => {
    setIsLoading(true);
    setStatus("Updating all data (countries, inflation, income)...");
    try {
      await updateAllData();
      setStatus("Successfully updated all data!");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAllData = async () => {
    if (!confirm("Are you sure you want to delete ALL data (countries, inflation, income)? This action cannot be undone.")) {
      return;
    }
    setIsLoading(true);
    setStatus("Deleting all data...");
    try {
      const result = await deleteAllData();
      setStatus(`Successfully deleted ${result.inflationDeleted} inflation records, ${result.incomeDeleted} income records, and ${result.countriesDeleted} country records.`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAndReimportAllData = async () => {
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

  // Inflation Data handlers
  const handleUpdateInflationData = async () => {
    setIsLoading(true);
    setStatus("Updating inflation data...");
    try {
      await updateAllInflationData();
      setStatus("Successfully updated inflation data!");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteInflationData = async () => {
    if (!confirm("Are you sure you want to delete all inflation data? This action cannot be undone.")) {
      return;
    }
    setIsLoading(true);
    setStatus("Deleting inflation data...");
    try {
      const deleted = await deleteAllInflationData();
      setStatus(`Successfully deleted ${deleted} inflation records.`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAndReimportInflationData = async () => {
    if (!confirm("Are you sure you want to delete all inflation data and re-import? This action cannot be undone and may take a long time.")) {
      return;
    }
    setIsLoading(true);
    setStatus("Deleting inflation data and re-importing... This may take a while...");
    try {
      await deleteAndReimportAllInflationData();
      setStatus("Successfully deleted and re-imported inflation data!");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Income Data handlers
  const handleUpdateIncomeData = async () => {
    setIsLoading(true);
    setStatus("Updating income data...");
    try {
      await updateAllIncomeData();
      setStatus("Successfully updated income data!");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteIncomeData = async () => {
    if (!confirm("Are you sure you want to delete all income data? This action cannot be undone.")) {
      return;
    }
    setIsLoading(true);
    setStatus("Deleting income data...");
    try {
      const deleted = await deleteAllIncomeData();
      setStatus(`Successfully deleted ${deleted} income records.`);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAndReimportIncomeData = async () => {
    if (!confirm("Are you sure you want to delete all income data and re-import? This action cannot be undone and may take a long time.")) {
      return;
    }
    setIsLoading(true);
    setStatus("Deleting income data and re-importing... This may take a while...");
    try {
      await deleteAndReimportAllIncomeData();
      setStatus("Successfully deleted and re-imported income data!");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Economy Analyzer - Data Management</h1>
      
      {/* All Data Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">All Data (Countries, Inflation, Income)</h2>
        <div className="space-y-3">
          <Button 
            onClick={handleUpdateAllData} 
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            Update All Data
          </Button>
          
          <Button 
            onClick={handleDeleteAllData} 
            disabled={isLoading}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            Delete All Data
          </Button>
          
          <Button 
            onClick={handleDeleteAndReimportAllData} 
            disabled={isLoading}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            Delete and Reimport All Data
          </Button>
        </div>
      </div>

      {/* Inflation Data Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Inflation Data</h2>
        <div className="space-y-3">
          <Button 
            onClick={handleUpdateInflationData} 
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            Update Inflation Data
          </Button>
          
          <Button 
            onClick={handleDeleteInflationData} 
            disabled={isLoading}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            Delete Inflation Data
          </Button>
          
          <Button 
            onClick={handleDeleteAndReimportInflationData} 
            disabled={isLoading}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            Delete and Reimport Inflation Data
          </Button>
        </div>
      </div>

      {/* Income Data Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Income Data</h2>
        <div className="space-y-3">
          <Button 
            onClick={handleUpdateIncomeData} 
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            Update Income Data
          </Button>
          
          <Button 
            onClick={handleDeleteIncomeData} 
            disabled={isLoading}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            Delete Income Data
          </Button>
          
          <Button 
            onClick={handleDeleteAndReimportIncomeData} 
            disabled={isLoading}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            Delete and Reimport Income Data
          </Button>
        </div>
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
