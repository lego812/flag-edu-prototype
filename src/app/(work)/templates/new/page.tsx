import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { TemplateEditor } from "@/features/templates/editor";
export default async function NewTemplatePage() {
  const { profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return (
    <>
      <h1 className="text-2xl font-bold">새 템플릿</h1>
      <TemplateEditor />
    </>
  );
}
