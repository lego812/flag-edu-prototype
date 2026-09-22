import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";

export default async function ClassesLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireCurrentProfile();
  return <div className="min-h-svh">
    <AppHeader name={profile.name} isAdmin={profile.role === "admin"} />
    <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
  </div>;
}
