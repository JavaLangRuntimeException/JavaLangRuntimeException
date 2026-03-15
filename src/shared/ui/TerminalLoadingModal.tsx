"use client";

import React, { useState, useEffect, useRef } from "react";
import { CircleCheckLoader } from "./CircleCheckLoader";

type CommandEntry = {
    command: string;
    output: string[];
};

const RESERVE_COMMANDS: CommandEntry[] = [
    { command: "redis-cli SETNX reserve:lock:slot OK", output: ["(integer) 1"] },
    { command: "node validate-reservation.js --input payload.json", output: ["OK: schema valid"] },
    { command: "curl -X POST /api/ical/busy --data weekStart", output: ["{ \"busy\": [...] }"] },
    { command: "node check-availability.js --slot 14:00", output: ["Slot available."] },
    { command: "psql -c \"BEGIN; INSERT INTO reservations ...\"", output: ["INSERT 0 1"] },
    { command: "gcloud calendar events insert --calendar primary", output: ["eventId: ev_a1b2c3d4"] },
    { command: "curl -s /calendar/v3/events/ev_a1b2c3d4", output: ["{ \"status\": \"confirmed\" }"] },
    { command: "node generate-meet-link.js --eventId ev_a1b2c3d4", output: ["meet.google.com/xxx-yyyy-zzz"] },
    { command: "aws ses send-email --to guest --subject Confirmation", output: ["MessageId: 018a-xxxx"] },
    { command: "aws ses send-email --to host --subject NewReservation", output: ["MessageId: 018a-yyyy"] },
    { command: "psql -c \"COMMIT;\"", output: ["COMMIT"] },
    { command: "redis-cli DEL reserve:lock:slot", output: ["(integer) 1"] },
    { command: "node notify.js --slack #reservations", output: ["Posted."] },
];

const CONTACT_COMMANDS: CommandEntry[] = [
    { command: "node validate-contact.js --zod strict", output: ["OK: valid"] },
    { command: "node sanitize-html.js --input message", output: ["Sanitized."] },
    { command: "aws s3 cp attachment.pdf s3://contacts/", output: ["upload: done"] },
    { command: "psql -c \"INSERT INTO contacts ...\"", output: ["INSERT 0 1"] },
    { command: "aws ses send-email --to support --subject Inquiry", output: ["MessageId: 018b-xxxx"] },
    { command: "aws ses send-email --to sender --subject Received", output: ["MessageId: 018b-yyyy"] },
    { command: "redis-cli PUBLISH contact:new '{\"id\":42}'", output: ["(integer) 1"] },
    { command: "node notify.js --slack #contacts", output: ["Posted."] },
    { command: "curl -s /api/contact/42/status", output: ["{ \"status\": \"delivered\" }"] },
];

const TYPING_SPEED = 5;
const OUTPUT_LINE_DELAY = 20;
const PAUSE_AFTER_COMMAND = 100;
const MAX_VISIBLE_LINES = 12;

type TerminalLine = {
    id: number;
    type: "prompt" | "output";
    text: string;
    isTyping?: boolean;
};

function ModalTerminalStream({ commands }: { commands: CommandEntry[] }) {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const idRef = useRef(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const getId = () => ++idRef.current;

        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                if (cancelled) return resolve();
                setTimeout(resolve, ms);
            });

        const addLine = (line: Omit<TerminalLine, "id">) => {
            if (cancelled) return;
            const id = getId();
            setLines((prev) => {
                const next = [...prev, { ...line, id }];
                return next.length > MAX_VISIBLE_LINES
                    ? next.slice(next.length - MAX_VISIBLE_LINES)
                    : next;
            });
        };

        const typeCommand = async (command: string) => {
            if (cancelled) return;
            const lineId = getId();
            setLines((prev) => {
                const next = [
                    ...prev,
                    { id: lineId, type: "prompt" as const, text: "", isTyping: true },
                ];
                return next.length > MAX_VISIBLE_LINES
                    ? next.slice(next.length - MAX_VISIBLE_LINES)
                    : next;
            });

            for (let i = 0; i <= command.length; i++) {
                if (cancelled) return;
                const partial = command.slice(0, i);
                setLines((prev) =>
                    prev.map((l) =>
                        l.id === lineId ? { ...l, text: partial } : l
                    )
                );
                await sleep(TYPING_SPEED);
            }

            setLines((prev) =>
                prev.map((l) =>
                    l.id === lineId ? { ...l, isTyping: false } : l
                )
            );
        };

        const runLoop = async () => {
            let idx = 0;
            while (!cancelled) {
                const entry = commands[idx % commands.length];
                await typeCommand(entry.command);
                await sleep(30);
                for (const out of entry.output) {
                    if (cancelled) return;
                    addLine({ type: "output", text: out });
                    await sleep(OUTPUT_LINE_DELAY);
                }
                await sleep(PAUSE_AFTER_COMMAND);
                idx++;
            }
        };

        runLoop();
        return () => { cancelled = true; };
    }, [commands]);

    // 自動スクロール
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [lines]);

    return (
        <div
            ref={scrollRef}
            className="overflow-hidden font-mono text-[9px] sm:text-[10px] leading-relaxed"
        >
            {lines.map((line) => (
                <div key={line.id} className="whitespace-pre overflow-hidden truncate">
                    {line.type === "prompt" ? (
                        <span>
                            <span className="text-green-500/60">$</span>
                            <span className="text-zinc-400/70"> {line.text}</span>
                            {line.isTyping && (
                                <span className="inline-block w-[4px] h-[10px] bg-green-400/50 align-middle animate-pulse ml-px" />
                            )}
                        </span>
                    ) : (
                        <span className="text-zinc-500/60">{line.text}</span>
                    )}
                </div>
            ))}
        </div>
    );
}

interface TerminalLoadingModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    icon: React.ReactNode;
    variant: "reserve" | "contact";
}

export function TerminalLoadingModal({
    isOpen,
    title,
    message,
    icon,
    variant,
}: TerminalLoadingModalProps) {
    if (!isOpen) return null;

    const commands = variant === "reserve" ? RESERVE_COMMANDS : CONTACT_COMMANDS;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 border-b border-white/20 bg-gradient-to-r from-blue-500/90 to-indigo-500/90 px-5 py-3 backdrop-blur">
                    {icon}
                    <h3 className="text-base font-semibold text-white drop-shadow">{title}</h3>
                </div>
                <div className="relative p-8">
                    {/* CLIコマンドがローダーの背後に流れる */}
                    <div className="absolute inset-0 px-4 py-3 overflow-hidden pointer-events-none select-none opacity-100">
                        <ModalTerminalStream commands={commands} />
                    </div>
                    {/* ローダーとメッセージ */}
                    <div className="relative z-10 text-center">
                        <div className="mx-auto mb-4 flex items-center justify-center">
                            <CircleCheckLoader isComplete={false} size={64} />
                        </div>
                        <div className="text-sm font-medium text-zinc-700">{message}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
