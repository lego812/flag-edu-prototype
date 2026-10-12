"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { InvitationList, type WorkspaceInvitation } from "./invitation-list";
export function PopupInvitations() {
  const [result, setResult] = useState<{
    invitations: WorkspaceInvitation[];
    error: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await createClient().rpc(
          "list_my_workspace_invitations",
        );
        if (active) setResult({ invitations: data ?? [], error: !!error });
      } catch {
        if (active) setResult({ invitations: [], error: true });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <section className="mt-5 border-t border-neutral-200 pt-4">
      <h2 className="mb-3 font-bold">받은 초대</h2>
      {!result ? (
        <div
          role="status"
          aria-label="초대를 불러오고 있어요"
          className="h-24 animate-pulse rounded-lg bg-neutral-100"
        />
      ) : (
        <InvitationList
          invitations={result.invitations}
          error={result.error}
          onDeclined={(id) =>
            setResult((current) =>
              current
                ? {
                    ...current,
                    invitations: current.invitations.filter((i) => i.id !== id),
                  }
                : current,
            )
          }
        />
      )}{" "}
      {result?.error && (
        <button
          type="button"
          className="mt-3 min-h-11 text-sm underline"
          onClick={() => {
            setResult(undefined);
            setAttempt((a) => a + 1);
          }}
        >
          초대 다시 불러오기
        </button>
      )}
    </section>
  );
}
