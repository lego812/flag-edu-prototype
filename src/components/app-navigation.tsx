"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const paths = {
  home: "M3 10 12 3l9 7v10H15v-7H9v7H3Z",
  calendar: "M3 5h18v16H3ZM7 3v4m10-4v4M3 10h18",
  book: "M12 5C8 3 5 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-6-1-10 1Zm0 0v16",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
};
export function AppNavigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "";
  const items = [
    { href: "/dashboard", label: "홈", icon: "home" },
    { href: "/classes", label: "수업", icon: "calendar" },
    { href: "/reports", label: "내 보고서", icon: "book" },
    ...(isAdmin ? [{ href: "/manage", label: "관리", icon: "settings" }] : []),
  ];
  return (
    <nav aria-label="주 메뉴" className="app-navigation">
      {items.map((item) => {
        const active =
          item.href === "/manage"
            ? [
                "/manage",
                "/members",
                "/templates",
                "/admin-reports",
                "/exports",
              ].some((p) => pathname.startsWith(p))
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={"nav-item " + (active ? "nav-active" : "")}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={paths[item.icon as keyof typeof paths]} />
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
