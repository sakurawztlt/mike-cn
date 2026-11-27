"use client";

import { useUiText } from "@/app/i18n/uiLanguage";
import { useState } from "react";
import { WarningPopup } from "@/app/components/popups/WarningPopup";

/**
 * Autosave failure warning. Dismissing it hides this failure only: a retry
 * clears the error while it saves, so a later failure shows the popup again.
 */
export function DocxSaveErrorPopup({ error }: { error: string | null }) {
    const tUi = useUiText();
    const [dismissed, setDismissed] = useState(false);
    const [previous, setPrevious] = useState(error);
    if (error !== previous) {
        setPrevious(error);
        setDismissed(false);
    }
    return (
        <WarningPopup
            open={!!error && !dismissed}
            title={tUi("Changes not saved")}
            message={error}
            onClose={() => setDismissed(true)}
        />
    );
}
