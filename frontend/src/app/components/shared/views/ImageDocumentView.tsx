"use client";

import { UiText } from "@/app/i18n/uiLanguage";
import { useState } from "react";
import { getDocumentFileUrl } from "@/app/lib/mikeApi";

export function ImageDocumentView({
    documentId,
    filename,
    versionId,
    displayUrl,
}: {
    documentId: string;
    filename: string;
    versionId?: string | null;
    displayUrl?: string | null;
}) {
    const url = displayUrl ?? getDocumentFileUrl(documentId, versionId);
    return <ImagePreview key={url} filename={filename} url={url} />;
}

function ImagePreview({ filename, url }: { filename: string; url: string }) {
    const [failed, setFailed] = useState(false);
    return (
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto bg-app-background p-4">
            {failed ? (
                <p role="alert" className="px-2 text-sm text-gray-600"><UiText message={"Could not preview this image. Download the original from the file menu."} /></p>
            ) : (
                // This private, same-origin URL needs the browser's session cookies and serves the original bytes.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={filename} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
            )}
        </div>
    );
}
