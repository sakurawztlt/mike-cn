"use client";

import { isUiLanguage } from "@/app/i18n/messages";
import { useUiLanguage } from "@/app/i18n/uiLanguage";
import { cn } from "@/app/lib/utils";

export function InterfaceLanguageSelect({ className }: { className?: string }) {
    const { language, setLanguage, t } = useUiLanguage();
    return (
        <select
            aria-label={t("Interface language")}
            value={language}
            onChange={(event) => {
                if (isUiLanguage(event.target.value)) setLanguage(event.target.value);
            }}
            className={cn(
                "h-10 w-fit min-w-28 rounded-lg border border-border bg-app-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                className,
            )}
        >
            <option value="zh-CN" lang="zh-CN">简体中文</option>
            <option value="en" lang="en">English</option>
        </select>
    );
}
