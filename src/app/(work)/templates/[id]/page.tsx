import { notFound, redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { getTemplate } from "@/features/reports/repository";
import { TemplateEditor } from "@/features/templates/editor";
import { isUuid } from "@/features/classes/model";
export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, supabase } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  if (!isUuid(id)) notFound();
  const template = await getTemplate(supabase, id);
  return (
    <>
      <h1 className="text-2xl font-bold">
        {template.name}
        {template.status !== "draft" ? " · 수정" : " · 수정 중"}
      </h1>
      <TemplateEditor template={template} />
    </>
  );
}
