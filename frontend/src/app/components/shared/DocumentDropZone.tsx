"use client";

import { type ReactNode, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/app/lib/utils";

export function DocumentDropZone({
    children,
    disabled,
    onFiles,
    selected,
}: {
    children: ReactNode;
    disabled: boolean;
    onFiles: (files: File[]) => void;
    selected: ReadonlyArray<{ key: string | number; name: string; remove: () => void }>;
}) {
    const depth = useRef(0);
    const [dragging, setDragging] = useState(false);

    return (
        <section
            aria-label="拖放上传文件"
            className={cn(
                "flex min-h-0 flex-1 flex-col rounded-lg",
                dragging && !disabled && "ring-2 ring-inset ring-blue-500/40",
            )}
            onDragEnter={(event) => {
                if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                event.preventDefault();
                event.stopPropagation();
                depth.current += 1;
                setDragging(true);
            }}
            onDragOver={(event) => {
                if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = disabled ? "none" : "copy";
            }}
            onDragLeave={(event) => {
                if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                event.stopPropagation();
                depth.current = Math.max(depth.current - 1, 0);
                if (depth.current === 0) setDragging(false);
            }}
            onDrop={(event) => {
                const files = Array.from(event.dataTransfer.files);
                if (!files.length && !Array.from(event.dataTransfer.types).includes("Files")) return;
                event.preventDefault();
                event.stopPropagation();
                depth.current = 0;
                setDragging(false);
                if (!disabled && files.length) onFiles(files);
            }}
        >
            <p className="shrink-0 px-2 py-2 text-xs text-gray-600">
                {dragging && !disabled ? "松开鼠标添加文件" : "拖放文件到这里，也可以点击 Upload 选择文件。"}
            </p>
            {selected.length > 0 && (
                <ul aria-label="待添加文件" className="mb-2 max-h-36 shrink-0 divide-y divide-gray-200 overflow-y-auto rounded-lg border border-gray-200">
                    {selected.map(({ key, name, remove }) => (
                        <li key={key} className="flex min-w-0 items-center justify-between gap-2 px-2">
                            <span className="min-w-0 break-words text-sm text-gray-800">{name}</span>
                            <button
                                type="button"
                                aria-label={`移除 ${name}`}
                                disabled={disabled}
                                onClick={remove}
                                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded px-2 text-xs text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40"
                            >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                移除
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {children}
        </section>
    );
}
