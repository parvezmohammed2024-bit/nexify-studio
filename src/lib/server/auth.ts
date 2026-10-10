import "server-only";
import { userDb } from "@/lib/supabase/server";
import { AppError, assertRole } from "@/lib/domain";
import type { Profile, Role } from "@/lib/types";
export async function requireStaff(role?: Role) {
  const db = await userDb();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new AppError(
      "Please sign in to your staff account.",
      401,
      "UNAUTHENTICATED",
    );
  const result = await db
    .from("profiles")
    .select("id,full_name,role,active")
    .eq("id", user.id)
    .single();
  const profile = result.data as Profile | null;
  if (!profile?.active)
    throw new AppError(
      "Your account has not been provisioned as active staff.",
      403,
      "FORBIDDEN",
    );
  if (role) assertRole(profile.role, role);
  return { db, user, profile };
}
export async function requireProject(projectId: string) {
  const context = await requireStaff();
  const { data, error } = await context.db
    .from("projects")
    .select("id,client_id,name,archived")
    .eq("id", projectId)
    .single();
  if (error || !data || data.archived)
    throw new AppError(
      "Project access denied or project archived.",
      403,
      "FORBIDDEN",
    );
  return { ...context, project: data };
}
