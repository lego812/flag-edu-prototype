import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the Flag Edu foundation screen", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Flag Edu" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
