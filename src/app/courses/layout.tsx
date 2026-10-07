import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";

export default async function CoursesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, workspace, workspaces } = await requireCurrentProfile();

  return (
    <div className="min-h-svh">
      <AppHeader
        userId={profile.id}
        name={profile.name}
        isAdmin={profile.role === "admin"}
        workspace={workspace}
        workspaces={workspaces}
      />
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
