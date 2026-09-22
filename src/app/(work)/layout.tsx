import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";
export default async function WorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireCurrentProfile();
  return (
    <>
      <AppHeader name={profile.name} isAdmin={profile.role === "admin"} />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8">
        {children}
      </main>
    </>
  );
}
