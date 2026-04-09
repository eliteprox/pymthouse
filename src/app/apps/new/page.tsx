"use client";

import DashboardLayout from "@/components/DashboardLayout";
import AppWizard from "@/components/apps/AppWizard";

export default function NewAppPage() {
  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Create New App</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Register a developer application. It is created as you go—save redirect URIs on the last step
          (or when you add them) so you can run authorization tests right away.
        </p>
      </div>
      <AppWizard />
    </DashboardLayout>
  );
}
