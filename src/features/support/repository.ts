import "server-only";
import { notFound } from "next/navigation";
import { masterAccount } from "@/features/master/access";
import { isUuid } from "@/features/classes/model";
import type { Inquiry } from "./model";
export async function getInquiry(id: string) {
  const account = await masterAccount();
  if (!isUuid(id)) notFound();
  const { data, error } = await account.supabase.rpc("get_support_inquiry", {
    p_id: id,
  });
  if (error)
    throw new Error("문의글을 불러오지 못했습니다. 다시 시도해 주세요.");
  if (!data) notFound();
  return { ...account, inquiry: data as Inquiry };
}
