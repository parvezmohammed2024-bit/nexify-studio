"use client";
import { StudioProvider } from "./studio-context";
import { Shell } from "./shell";
import { Dashboard } from "./dashboard";
import { Generator } from "./generator";
import { BRoll } from "./b-roll";
import { PromptEngineer } from "./prompt-engineer";
import { Projects } from "./projects";
import { Library } from "./library";
import { History } from "./history";
import { BudgetPage } from "./budget";
import { SettingsPage } from "./settings";
import type { StudioData } from "@/lib/types";
import type { Report } from "@/lib/server/data";
export function StudioPage({
  page,
  initial,
}: {
  page: string;
  initial: { data: StudioData; report: Report };
}) {
  return (
    <StudioProvider initial={initial}>
      <Shell>
        {page === "dashboard" ? (
          <Dashboard />
        ) : page === "image-studio" ? (
          <Generator />
        ) : page === "video-studio" ? (
          <Generator kind="video" />
        ) : page === "b-roll-studio" ? (
          <BRoll />
        ) : page === "prompt-engineer" ? (
          <PromptEngineer />
        ) : page === "client-projects" ? (
          <Projects />
        ) : page === "creative-library" ? (
          <Library />
        ) : page === "generation-history" ? (
          <History />
        ) : page === "budget" ? (
          <BudgetPage />
        ) : (
          <SettingsPage />
        )}
      </Shell>
    </StudioProvider>
  );
}
