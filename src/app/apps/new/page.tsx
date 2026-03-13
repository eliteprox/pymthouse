"use client";

import DashboardLayout from "@/components/DashboardLayout";
import AppWizard from "@/components/apps/AppWizard";

export default function NewAppPage() {
  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Create New App</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Register a new developer application with PymtHouse
        </p>
      </div>
      <AppWizard />
    </DashboardLayout>
  );
}
