import { renderStudio } from "@/lib/server/render";
export const dynamic = "force-dynamic";
export default async function Page() {
  return renderStudio("dashboard");
}
