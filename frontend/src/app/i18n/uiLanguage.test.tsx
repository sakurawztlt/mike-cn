import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InterfaceLanguageSelect } from "@/app/components/settings/InterfaceLanguageSelect";
import { UI_LANGUAGE_STORAGE_KEY } from "./messages";
import { UiLanguageProvider, UiText } from "./uiLanguage";

function Example() {
    return (
        <UiLanguageProvider>
            <InterfaceLanguageSelect />
            <button type="button"><UiText message="Appearance" /></button>
            <span>Appearance</span>
        </UiLanguageProvider>
    );
}

describe("interface language", () => {
    afterEach(() => window.localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY));

    it("defaults to Simplified Chinese and persists the independent English choice", () => {
        const first = render(<Example />);
        expect(screen.getByRole("button", { name: "外观" })).toBeInTheDocument();
        expect(document.documentElement.lang).toBe("zh-CN");
        expect(screen.getByText("Appearance", { selector: "span" })).toBeInTheDocument();
        fireEvent.change(screen.getByRole("combobox", { name: "界面语言" }), { target: { value: "en" } });
        expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
        expect(document.documentElement.lang).toBe("en");
        expect(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe("en");
        first.unmount();
        render(<Example />);
        expect(screen.getByRole("combobox", { name: "Interface language" })).toHaveValue("en");
    });
});
