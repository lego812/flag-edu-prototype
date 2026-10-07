"use client";

import { createContext, useContext, useRef, useState } from "react";

type MutationState = {
  version: string;
  busy: boolean;
  start: () => boolean;
  finish: (version?: string) => void;
};
const MutationContext = createContext<MutationState | null>(null);

export function ReportMutationProvider({
  version: initialVersion,
  children,
}: {
  version: string;
  children: React.ReactNode;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  return (
    <MutationContext.Provider value={{
      version,
      busy,
      start: () => {
        if (locked.current) return false;
        locked.current = true;
        setBusy(true);
        return true;
      },
      finish: (nextVersion) => {
        if (nextVersion) setVersion(nextVersion);
        locked.current = false;
        setBusy(false);
      },
    }}>
      {children}
    </MutationContext.Provider>
  );
}

export const useReportMutation = () => useContext(MutationContext);
