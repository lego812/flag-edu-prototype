import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PhotoPreview } from "./photo-preview";

// jsdom does not implement native dialog methods/focus trapping. Real browser
// QA separately verifies Escape, focus containment and focus restoration.
const prototype = HTMLDialogElement.prototype;
const showModal = Object.getOwnPropertyDescriptor(prototype, "showModal");
const close = Object.getOwnPropertyDescriptor(prototype, "close");
beforeAll(() => {
  Object.defineProperty(prototype, "showModal", { configurable: true, value() { this.open = true; } });
  Object.defineProperty(prototype, "close", { configurable: true, value() { this.open = false; this.dispatchEvent(new Event("close")); } });
});
afterAll(() => {
  if (showModal) Object.defineProperty(prototype, "showModal", showModal);
  else Reflect.deleteProperty(prototype, "showModal");
  if (close) Object.defineProperty(prototype, "close", close);
  else Reflect.deleteProperty(prototype, "close");
});

describe("private photo preview", () => {
  it("shows progress until the image loads and clears it on failure", () => {
    const ui = render(<PhotoPreview url="https://example.com/private.jpg" label="활동 사진" onClose={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("사진을 불러오는 중");
    fireEvent.load(screen.getByRole("img"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    ui.unmount();
    render(<PhotoPreview url="https://example.com/expired.jpg" label="활동 사진" onClose={vi.fn()} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("opens a labelled native modal and closes without navigation or writes", () => {
    const onClose = vi.fn();
    render(<PhotoPreview url="https://example.com/private.jpg" label="활동 사진 1" onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "활동 사진 1" })).toHaveAttribute("open");
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/private.jpg");
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("supports native cancel/close events and dismisses only the backdrop", () => {
    const onClose = vi.fn();
    render(<PhotoPreview url="https://example.com/private.jpg" label="활동 사진 2" onClose={onClose} />);
    fireEvent.click(screen.getByRole("img"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores a queued cleanup close event after the modal has reopened", () => {
    const onClose = vi.fn();
    render(<PhotoPreview url="https://example.com/private.jpg" label="활동 사진 4" onClose={onClose} />);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    // Simulate the previous effect cleanup's native event arriving after
    // Strict Mode has reopened the same node.
    fireEvent(dialog, new Event("close"));
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores page scrolling on unmount and shows a useful image failure message", () => {
    document.body.style.overflow = "auto";
    const ui = render(<PhotoPreview url="https://example.com/expired.jpg" label="활동 사진 3" onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("alert")).toHaveTextContent("사진을 불러오지 못했습니다");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeEnabled();
    ui.unmount();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });
});
