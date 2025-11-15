"use client";

import { useState } from "react";
import { Settings, Database, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/shadcn/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Spinner } from "@/components/shadcn/spinner";
import {
  performUpdateAction,
  performDeleteAction,
  performDeleteAndReimportAction,
  type DataType,
  type ActionType,
  type ActionResult,
} from "@/app/data-management/actions";

export function DataManagementSidebar() {
  const [dataTypeDialogOpen, setDataTypeDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordConfirmDialogOpen, setPasswordConfirmDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [selectedDataType, setSelectedDataType] = useState<DataType | null>(null);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [passwordError, setPasswordError] = useState(false);

  const handleActionClick = (action: ActionType) => {
    setSelectedAction(action);
    setPassword("");
    setPasswordError(false);
    setActionResult(null);
    setDataTypeDialogOpen(true);
  };

  const handleDataTypeSelect = (dataType: DataType) => {
    setSelectedDataType(dataType);
    setDataTypeDialogOpen(false);
    setPasswordConfirmDialogOpen(true);
  };

  const handlePasswordConfirm = async () => {
    if (!selectedAction || !selectedDataType || !password) return;

    setIsLoading(true);
    setPasswordError(false);

    let hasWrongPassword = false;

    try {
      let result: ActionResult;
      
      if (selectedAction === "update") {
        result = await performUpdateAction(selectedDataType, password);
      } else if (selectedAction === "delete") {
        result = await performDeleteAction(selectedDataType, password);
      } else if (selectedAction === "delete-reimport") {
        result = await performDeleteAndReimportAction(selectedDataType, password);
      } else {
        result = {
          success: false,
          message: "Invalid action",
        };
      }

      setActionResult(result);
      
      if (!result.success && result.message.includes("Wrong password")) {
        setPasswordError(true);
        hasWrongPassword = true;
        // Keep password dialog open on wrong password - don't clear password yet
        setIsLoading(false);
        return;
      }
      
      // Close password dialog and show result
      setPasswordConfirmDialogOpen(false);
      setPasswordDialogOpen(true);
      setIsLoading(false);
      setPassword("");
    } catch (error) {
      setActionResult({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
      setPasswordConfirmDialogOpen(false);
      setPasswordDialogOpen(true);
      setIsLoading(false);
      setPassword("");
    } finally {
      // Only clear loading state if we haven't handled it already
      if (!hasWrongPassword) {
        setIsLoading(false);
        setPassword("");
      }
    }
  };

  const handleCloseResult = (open: boolean) => {
    setPasswordDialogOpen(open);
    // Only clear state after dialog is fully closed to prevent title flash
    if (!open) {
      setTimeout(() => {
        setActionResult(null);
        setPasswordError(false);
        setSelectedAction(null);
        setSelectedDataType(null);
      }, 150);
    }
  };

  const getActionLabel = (action: ActionType) => {
    switch (action) {
      case "update":
        return "Update";
      case "delete":
        return "Delete";
      case "delete-reimport":
        return "Delete & Reimport";
      default:
        return "";
    }
  };

  const getDataTypeLabel = (dataType: DataType) => {
    switch (dataType) {
      case "all":
        return "All Data";
      case "inflation":
        return "Inflation Data";
      case "income":
        return "Income Data";
      default:
        return "";
    }
  };

  return (
    <>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              <div className="flex items-center gap-2">
                <Settings className="size-4" />
                Data Management
              </div>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleActionClick("update")}
                    tooltip="Update Data"
                  >
                    <Database className="size-4" />
                    <span>Update Data</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleActionClick("delete")}
                    tooltip="Delete Data"
                  >
                    <Trash2 className="size-4" />
                    <span>Delete Data</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleActionClick("delete-reimport")}
                    tooltip="Delete & Reimport Data"
                  >
                    <RotateCcw className="size-4" />
                    <span>Delete & Reimport Data</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      {/* Data Type Selection Dialog */}
      <Dialog open={dataTypeDialogOpen} onOpenChange={setDataTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Data Type</DialogTitle>
            <DialogDescription>
              Choose which data type to {selectedAction ? getActionLabel(selectedAction).toLowerCase() : "perform action on"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button
              onClick={() => handleDataTypeSelect("all")}
              variant="outline"
              className="w-full justify-start"
            >
              <Database className="mr-2 size-4" />
              All Data (Countries, Inflation, Income)
            </Button>
            <Button
              onClick={() => handleDataTypeSelect("inflation")}
              variant="outline"
              className="w-full justify-start"
            >
              <Database className="mr-2 size-4" />
              Inflation Data
            </Button>
            <Button
              onClick={() => handleDataTypeSelect("income")}
              variant="outline"
              className="w-full justify-start"
            >
              <Database className="mr-2 size-4" />
              Income Data
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Confirmation Dialog */}
      <AlertDialog 
        open={passwordConfirmDialogOpen} 
        onOpenChange={(open) => {
          // Prevent closing if we're loading or if there's a password error
          if (isLoading || passwordError) {
            return;
          }
          setPasswordConfirmDialogOpen(open);
          if (!open) {
            setPassword("");
            setPasswordError(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {selectedAction ? getActionLabel(selectedAction).toLowerCase() : "perform this action"} for {selectedDataType ? getDataTypeLabel(selectedDataType) : "this data"}? Please enter the admin password to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="password">Admin Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(false);
                }}
                placeholder="Enter admin password"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password && !isLoading) {
                    handlePasswordConfirm();
                  }
                }}
              />
              {passwordError && (
                <div className="text-sm text-red-600 dark:text-red-400 whitespace-pre-line">
                  Wrong password :(
                  {"\n"}Please try again.
                </div>
              )}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setPassword("");
                setPasswordError(false);
              }}
              disabled={isLoading}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handlePasswordConfirm}
              disabled={!password || isLoading}
              type="button"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2" />
                  Processing...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Result Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={handleCloseResult}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionResult?.success ? "Action Completed" : actionResult ? "Action Failed" : "Processing..."}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {actionResult ? (
              <div
                className={`whitespace-pre-line ${
                  actionResult.success
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {actionResult.message}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Spinner />
                <span>Processing... Please wait.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => handleCloseResult(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

