import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassViewSwitcher } from "./view-switcher";

describe("class view preference", () => {
  it("remembers calendar/list selection in a long-lived cookie", () => {
    render(
      <ClassViewSwitcher
        view="list"
        listHref="/classes?view=list"
        calendarHref="/classes?view=calendar"
      />,
    );
    expect(screen.getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(["캘린더", "목록"]);
    fireEvent.click(screen.getByRole("link", { name: "캘린더" }));
    expect(document.cookie).toContain("flag-edu-class-view=calendar");
    fireEvent.click(screen.getByRole("link", { name: "목록" }));
    expect(document.cookie).toContain("flag-edu-class-view=list");
  });
});
