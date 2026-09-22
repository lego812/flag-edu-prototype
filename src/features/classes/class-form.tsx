import type { ClassSession } from "./model";
import { ClassWizard } from "./class-wizard";
export function ClassForm({ session }: { session?: ClassSession }) {
  return <ClassWizard session={session} />;
}
