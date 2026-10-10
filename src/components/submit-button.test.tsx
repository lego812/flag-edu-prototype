import { act, fireEvent, render, screen } from "@testing-library/react";
import { useActionState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SubmitButton } from "./submit-button";

function Example({ action }: { action: (state: { error?: string }, data: FormData) => Promise<{ error?: string }> }) {
  const [state, submit] = useActionState(action, {});
  return <form action={submit}>
    <input aria-label="내용" name="text" defaultValue="유지할 내용" />
    <SubmitButton name="intent" value="save" pendingLabel="저장 중…">저장</SubmitButton>
    <SubmitButton name="intent" value="submit" pendingLabel="제출 중…">제출</SubmitButton>
    {state.error && <p role="alert">{state.error}</p>}
  </form>;
}

describe("submission feedback", () => {
  it("marks only the clicked intent busy, prevents duplicates, and restores controls after an error", async () => {
    let finish!: (state: { error?: string }) => void;
    const action = vi.fn<(state: { error?: string }, data: FormData) => Promise<{ error?: string }>>(() => new Promise<{ error?: string }>(resolve => { finish = resolve; }));
    render(<Example action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const busy = await screen.findByRole("button", { name: "저장 중…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
    const other = screen.getByRole("button", { name: "제출" });
    expect(other).toBeDisabled();
    expect(other).toHaveAttribute("aria-busy", "false");
    fireEvent.click(other);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][1].get("intent")).toBe("save");
    await act(async () => finish({ error: "연결 실패" }));
    expect(screen.getByRole("alert")).toHaveTextContent("연결 실패");
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
    expect(screen.getByLabelText("내용")).toHaveValue("유지할 내용");
  });
});
