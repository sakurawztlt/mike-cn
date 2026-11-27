"use client";

import { UiText } from "@/app/i18n/uiLanguage";
import Link from "next/link";
import { pillButtonUIClassName } from "@mike/ui";
import { CrashScreen } from "@/app/components/shared/CrashScreen";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset?: () => void;
}) {
    return (
        <CrashScreen
            error={error}
            reset={reset}
            component="route-error-boundary"
            secondaryAction={(tone) => (
                <Link
                    href="/"
                    className={pillButtonUIClassName({ tone, size: "normal" })}
                >
                    <UiText message={"Home"} />
                </Link>
            )}
        />
    );
}
