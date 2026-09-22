import { describe, expect, it } from "vitest";
import { validateEmail, validateName, validatePassword } from "./validation";

describe("auth validation", () => {
  it("normalizes valid email addresses", () => {
    expect(validateEmail(" Coach@Example.com ")).toBe("coach@example.com");
  });

  it("rejects malformed email addresses", () => {
    expect(validateEmail("coach")).toBeNull();
  });

  it("requires passwords with at least eight characters", () => {
    expect(validatePassword("1234567")).toBeNull();
    expect(validatePassword("12345678")).toBe("12345678");
  });

  it("accepts names up to fifty characters", () => {
    expect(validateName(" 김코치 ")).toBe("김코치");
    expect(validateName("가".repeat(51))).toBeNull();
  });
});
