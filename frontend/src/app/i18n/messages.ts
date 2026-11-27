import simplifiedChinese from "./zh-CN.json";
import english from "./en.json";

export type UiLanguage = "zh-CN" | "en";
export const DEFAULT_UI_LANGUAGE: UiLanguage = "zh-CN";
export const UI_LANGUAGE_STORAGE_KEY = "mike-ui-language";

const messages: Record<UiLanguage, Record<string, string>> = {
    "zh-CN": simplifiedChinese,
    en: english,
};

// The upload client formats these notices before React renders them. Keep
// the filenames intact and translate only the fixed, application-written copy.
const uploadNoticeSuffixes: readonly [string, string][] = [
    [" could not be uploaded. Please try again.", "{0} 上传失败。请重试。"],
    [" could not be added to this project. Try again.", "{0} 未能添加到此项目。请重试。"],
    [" is not a valid PDF file.", "{0} 不是有效的 PDF 文件。"],
    [" is not a valid DOCX file.", "{0} 不是有效的 DOCX 文件。"],
    [" does not match the selected image format.", "{0} 的内容与所选图片格式不符。"],
];

export function isUiLanguage(value: unknown): value is UiLanguage {
    return value === "zh-CN" || value === "en";
}

/** Only application-authored UI copy enters this catalog. Do not pass user text. */
export function translateUi(
    language: UiLanguage,
    message: string,
    ...values: unknown[]
): string {
    const catalog = messages[language];
    const key = message.trim().replace(/\s+/g, " ");
    const localized = Object.hasOwn(catalog, key) ? catalog[key] : message;
    if (language === "zh-CN" && localized === message && !values.length) {
        const notice = uploadNoticeSuffixes.find(([suffix]) => message.endsWith(suffix));
        if (notice) return notice[1].replace("{0}", () => message.slice(0, -notice[0].length));
    }
    return values.length
        ? localized.replace(/\{(\d+)\}/g, (slot, index: string) => Number(index) < values.length ? String(values[Number(index)]) : slot)
        : localized;
}
