import { notFound } from "next/navigation";
import { renderStudio } from "@/lib/server/render";
export const dynamic = "force-dynamic";
const pages = [
  "image-studio",
  "video-studio",
  "b-roll-studio",
  "prompt-engineer",
  "client-projects",
  "creative-library",
  "generation-history",
  "budget",
  "settings",
];
export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!pages.includes(page)) notFound();
  return renderStudio(page);
}
