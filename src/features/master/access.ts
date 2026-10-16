import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireAccount } from "@/features/auth/current-user";

// Render-scoped only. Never trust user_metadata or a client-supplied email/role.
export const masterAccount = cache(async () => {
  const account = await requireAccount();
  const { data, error } = await account.supabase.rpc("is_service_master");
  if (error)
    throw new Error("서비스 권한을 확인하지 못했습니다. 다시 시도해 주세요.");
  return { ...account, isMaster: data === true };
});
export async function requireMaster() {
  const account = await masterAccount();
  if (!account.isMaster) notFound();
  return account;
}
