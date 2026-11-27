"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { UiCopyProvider } from "@mike/ui";
import { DEFAULT_UI_LANGUAGE, isUiLanguage, translateUi, type UiLanguage, UI_LANGUAGE_STORAGE_KEY } from "./messages";

type UiLanguageState = {
    language: UiLanguage;
    setLanguage: (language: UiLanguage) => void;
    t: (message: string, ...values: unknown[]) => string;
};

const listeners = new Set<() => void>();
let storageFallback: UiLanguage | undefined;

function readLanguage() {
    try {
        const saved = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
        if (isUiLanguage(saved)) return saved;
    } catch {
        // The current tab can still change languages with storage disabled.
    }
    return storageFallback ?? DEFAULT_UI_LANGUAGE;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === UI_LANGUAGE_STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

function setLanguage(language: UiLanguage) {
    try {
        window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
    } catch {
        storageFallback = language;
    }
    for (const notify of listeners) notify();
}

const UiLanguageContext = createContext<UiLanguageState>({
    language: "en",
    setLanguage,
    t: (message, ...values) => translateUi("en", message, ...values),
});

export function UiLanguageProvider({ children }: { children: ReactNode }) {
    const language = useSyncExternalStore(subscribe, readLanguage, () => DEFAULT_UI_LANGUAGE);
    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);
    const state = useMemo<UiLanguageState>(() => ({
        language,
        setLanguage,
        t: (message, ...values) => translateUi(language, message, ...values),
    }), [language]);
    return (
        <UiLanguageContext.Provider value={state}>
            <UiCopyProvider translate={state.t}>{children}</UiCopyProvider>
        </UiLanguageContext.Provider>
    );
}

export function useUiLanguage() {
    return useContext(UiLanguageContext);
}

export function useUiText() {
    return useUiLanguage().t;
}

export function UiText({ message, values = [] }: { message: ReactNode; values?: readonly unknown[] }) {
    const t = useUiText();
    return <>{typeof message === "string" ? t(message, ...values) : message}</>;
}
