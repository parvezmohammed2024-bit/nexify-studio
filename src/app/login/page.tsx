import { LoginForm } from "@/components/login-form";
import { supabaseConfigured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default function Login() {
  return <LoginForm configured={supabaseConfigured()} />;
}
