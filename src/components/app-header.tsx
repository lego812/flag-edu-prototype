import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";

type AppHeaderProps = {
  name: string;
  isAdmin: boolean;
};

export function AppHeader({ name, isAdmin }: AppHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="font-bold text-slate-950">
            Flag Edu
          </Link>
          <Link href="/classes" className="text-sm font-medium text-slate-600">수업</Link>
          {isAdmin && (
            <Link href="/members" className="text-sm font-medium text-slate-600">
              구성원
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-600 sm:inline">{name}</span>
          <form action={logoutAction}>
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
