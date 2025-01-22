// lib/utils.ts
import { twMerge } from "tailwind-merge";
import clsx from "clsx";

/**
 * 複数のクラス名を受け取り、重複を最適にマージして返すユーティリティ
 *
 * 例: cn("px-4 py-2", "bg-blue-600", props.className)
 */
export function cn(...inputs: (string | undefined)[]) {
    return twMerge(clsx(inputs));
}