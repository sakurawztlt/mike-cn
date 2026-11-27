"use client";

import { createContext, useContext, type ReactNode } from "react";

const UiCopy = createContext<(message: string) => string>((message) => message);

export function UiCopyProvider({ translate, children }: { translate: (message: string) => string; children: ReactNode }) {
    return <UiCopy.Provider value={translate}>{children}</UiCopy.Provider>;
}

export function useUiCopy() {
    return useContext(UiCopy);
}
