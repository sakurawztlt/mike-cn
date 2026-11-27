"use client";

import { Suspense } from "react";
import { AuthProvider } from "@/app/contexts/AuthContext";
import { UserProfileProvider } from "@/app/contexts/UserProfileContext";
import { MfaLoginGate } from "@/app/components/shared/MfaLoginGate";
import { FullScreenLoader } from "@/app/components/shared/FullScreenLoader";
import { OnboardingGate } from "@/app/components/auth/OnboardingGate";
import { useInputModality } from "@/app/hooks/useInputModality";
import { AppToasts } from "@/app/components/ui/toast";
import { UiLanguageProvider } from "@/app/i18n/uiLanguage";

export function Providers({ children }: { children: React.ReactNode }) {
    useInputModality();
    return (
        <UiLanguageProvider>
            <AuthProvider>
                <UserProfileProvider>
                    <Suspense fallback={<FullScreenLoader />}>
                        <MfaLoginGate>
                            <OnboardingGate>{children}</OnboardingGate>
                        </MfaLoginGate>
                    </Suspense>
                    <AppToasts />
                </UserProfileProvider>
            </AuthProvider>
        </UiLanguageProvider>
    );
}
