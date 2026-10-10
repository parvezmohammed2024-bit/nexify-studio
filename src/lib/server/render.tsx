import "server-only";
import { redirect } from "next/navigation";
import { loadStudio } from "./data";
import { AppError } from "@/lib/domain";
import { StudioPage } from "@/components/studio-page";
export async function renderStudio(page: string) {
  try {
    const initial = await loadStudio();
    return <StudioPage page={page} initial={initial} />;
  } catch (e) {
    if (e instanceof AppError && (e.status === 401 || e.status === 403))
      redirect("/login");
    throw e;
  }
}
