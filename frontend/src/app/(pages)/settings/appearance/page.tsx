"use client";

import { UiText, useUiText } from "@/app/i18n/uiLanguage";
import { useState } from "react";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { userFacingApiError } from "@/app/lib/userFacingError";
import {
  SettingsDescription,
  SettingsLabel,
} from "@/app/components/settings/SettingsText";
import { GlassCardUI, ToggleSwitchUI } from "@mike/ui";
import { SettingsHeading } from "@/app/components/settings/SettingsHeading";
import { SettingsRow } from "@/app/components/settings/SettingsRow";
import { InterfaceLanguageSelect } from "@/app/components/settings/InterfaceLanguageSelect";

export default function AppearancePage() {
    const tUi = useUiText();
  const { profile, updateDarkMode } = useUserProfile();
  const [savingDarkMode, setSavingDarkMode] = useState(false);
  const [darkModeError, setDarkModeError] = useState<string | null>(null);

  if (!profile) return null;

  const handleDarkModeToggle = async (enabled: boolean) => {
    if (savingDarkMode) return;
    setSavingDarkMode(true);
    setDarkModeError(null);
    try {
      await updateDarkMode(enabled);
    } catch (toggleError) {
      setDarkModeError(
        userFacingApiError(
          toggleError,
          "Could not update the appearance setting.",
        ),
      );
    } finally {
      setSavingDarkMode(false);
    }
  };

  return (
    <section className="space-y-3">
      <SettingsHeading id="appearance"><UiText message={"Appearance"} /></SettingsHeading>
      <GlassCardUI>
        <SettingsRow>
          <div className="min-w-0 space-y-1">
            <SettingsLabel><span id="interface-language"><UiText message={"Interface language"} /></span></SettingsLabel>
            <SettingsDescription><UiText message={"Choose the language for menus, buttons, and messages in Mike."} /></SettingsDescription>
          </div>
          <InterfaceLanguageSelect />
        </SettingsRow>
        <SettingsRow>
          <div className="min-w-0 space-y-1">
            <SettingsLabel><UiText message={"Dark mode"} /></SettingsLabel>
            <SettingsDescription>
              <UiText message={"Use a darker color palette throughout Mike."} />
            </SettingsDescription>
            {darkModeError && (
              <p role="alert" className="text-xs text-red-600">
                <UiText message={darkModeError} />
              </p>
            )}
          </div>
          <ToggleSwitchUI
            checked={profile.darkMode === true}
            disabled={savingDarkMode}
            aria-busy={savingDarkMode}
            aria-label={tUi("Dark mode")}
            onCheckedChange={(checked) => void handleDarkModeToggle(checked)}
          />
        </SettingsRow>
      </GlassCardUI>
    </section>
  );
}
