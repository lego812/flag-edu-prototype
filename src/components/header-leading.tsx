"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackButton } from "./back-button";

export function HeaderLeading() {
  const pathname = usePathname();
  return (
    <div className="flex min-h-11 shrink-0 items-center">
      {pathname && pathname !== "/dashboard" && pathname !== "/" ? (
        <BackButton />
      ) : (
        <Link
          href="/dashboard"
          className="text-xl font-extrabold tracking-tight"
        >
          flag edu.
        </Link>
      )}
    </div>
  );
}
