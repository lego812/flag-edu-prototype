import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";
import { AppNavigation } from "./app-navigation";
export function AppHeader({
  name,
  isAdmin,
}: {
  name: string;
  isAdmin: boolean;
}) {
  return (
    <header className="app-header">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/dashboard"
          className="text-xl font-extrabold tracking-tight"
        >
          flag edu.
        </Link>
        <AppNavigation isAdmin={isAdmin} />
        <div className="flex items-center gap-3">
          <span className="hidden max-w-32 truncate text-sm text-neutral-600 lg:inline">
            {name}
          </span>
          <form action={logoutAction}>
            <button className="min-h-11 rounded-full border border-neutral-300 px-4 text-xs font-medium">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
