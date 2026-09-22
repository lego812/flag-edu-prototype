import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";

type AppHeaderProps = {
  name: string;
  isAdmin: boolean;
};

export function AppHeader({ name, isAdmin }: AppHeaderProps) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <nav aria-label="주 메뉴" className="flex flex-wrap items-center gap-4">
          <Link href="/dashboard" className="font-bold text-neutral-950">
            Flag Edu
          </Link>
          <Link href="/classes" className="text-sm font-medium text-neutral-600">수업</Link>
          {isAdmin && (
            <Link href="/members" className="text-sm font-medium text-neutral-600">
              구성원
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-neutral-600 sm:inline">{name}</span>
          <form action={logoutAction}>
            <button className="min-h-11 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
