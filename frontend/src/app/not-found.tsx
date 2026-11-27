import { UiText } from "@/app/i18n/uiLanguage";
import Link from "next/link";
import { pillButtonUIClassName } from "@mike/ui";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-4">
            <div className="text-center max-w-md">
                <h1 className="text-3xl font-eb-garamond font-light text-gray-900 mb-3">
                    <UiText message={"Page not found"} />
                </h1>
                <p className="text-[0.9375rem] text-gray-500 leading-relaxed mb-8">
                    <UiText message={"The page you're looking for doesn't exist or may have been moved."} />
                </p>

                <Link
                    href="/"
                    className={pillButtonUIClassName({
                        tone: "black",
                        size: "normal",
                    })}
                >
                    <UiText message={"Go home"} />
                </Link>
            </div>
        </div>
    );
}
