"use client";

import React, { useState, useEffect, useRef } from "react";
import { CircleCheckLoader } from "./CircleCheckLoader";

type CommandEntry = {
    command: string;
    output: string[];
};

const RESERVE_COMMANDS: CommandEntry[] = [
    { command: "gcloud auth application-default login", output: ["Credentials saved to file."] },
    { command: "curl -X POST /api/reserve -H 'Content-Type: application/json'", output: ["Sending reservation request..."] },
    { command: "node validate-schema.js --strict", output: ["Schema validation passed."] },
    { command: "psql -c \"INSERT INTO reservations ...\"", output: ["INSERT 0 1"] },
    { command: "aws ses send-email --to user@example.com", output: ["MessageId: 0102018a-xxxx-xxxx-xxxx"] },
    { command: "gcloud calendar events insert --calendar primary", output: ["Event created.", "eventId: abc123def456"] },
    { command: "redis-cli SET reservation:lock:slot OK EX 30", output: ["OK"] },
    { command: "kubectl logs deploy/api-server --tail=5", output: ["[INFO] Reservation created successfully", "[INFO] Confirmation email sent"] },
    { command: "curl -s https://www.googleapis.com/calendar/v3/events", output: ["{ \"status\": \"confirmed\" }"] },
    { command: "node notify.js --channel=slack --event=reservation", output: ["Notification sent to #reservations"] },
];

const CONTACT_COMMANDS: CommandEntry[] = [
    { command: "node validate-contact.js --schema=zod", output: ["Validation passed."] },
    { command: "curl -X POST /api/contact -F 'data=@form.json'", output: ["Sending contact request..."] },
    { command: "aws ses send-email --from noreply@taramanji.com", output: ["MessageId: 0102018b-xxxx-xxxx-xxxx"] },
    { command: "psql -c \"INSERT INTO contacts ...\"", output: ["INSERT 0 1"] },
    { command: "node upload-attachments.js --bucket=contacts", output: ["Uploaded 0 file(s) to S3."] },
    { command: "redis-cli PUBLISH contact:new '{\"id\":1}'", output: ["(integer) 1"] },
    { command: "kubectl exec deploy/mailer -- mailq", output: ["Mail queue is empty"] },
    { command: "curl -s https://api.sendgrid.com/v3/mail/send", output: ["202 Accepted"] },
    { command: "node notify.js --channel=slack --event=contact", output: ["Notification sent to #contacts"] },
    { command: "tail -f /var/log/mailer.log", output: ["[OK] Email delivered successfully"] },
];

const TYPING_SPEED = 15;
const OUTPUT_LINE_DELAY = 60;
const PAUSE_AFTER_COMMAND = 300;

type TerminalLine = {
    id: number;
    type: "prompt" | "output";
    text: string;
    isTyping?: boolean;
};

function ModalTerminalStream({ commands }: { commands: CommandEntry[] }) {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const idRef = useRef(0);

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
            setLines((prev) => [...prev, { ...line, id }]);
        };

        const typeCommand = async (command: string) => {
            if (cancelled) return;
            const lineId = getId();
            setLines((prev) => [
                ...prev,
                { id: lineId, type: "prompt" as const, text: "", isTyping: true },
            ]);

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
                await sleep(80);
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

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none font-mono text-[10px] sm:text-xs leading-relaxed p-4">
            <div className="flex flex-col">
                {lines.map((line) => (
                    <div key={line.id} className="whitespace-pre overflow-hidden truncate">
                        {line.type === "prompt" ? (
                            <span>
                                <span className="text-green-400">$</span>
                                <span className="text-green-100"> {line.text}</span>
                                {line.isTyping && (
                                    <span className="inline-block w-[5px] h-[12px] bg-green-400/80 align-middle animate-pulse ml-px" />
                                )}
                            </span>
                        ) : (
                            <span className="text-green-300/70">{line.text}</span>
                        )}
                    </div>
                ))}
            </div>
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
        <div className="fixed inset-0 z-50 grid place-items-center p-3">
            {/* CLI背景 */}
            <div className="absolute inset-0 bg-zinc-950">
                <ModalTerminalStream commands={commands} />
            </div>

            {/* モーダルカード */}
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-zinc-900/90 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-blue-600/80 to-indigo-600/80 px-5 py-3">
                    {icon}
                    <h3 className="text-base font-semibold text-white drop-shadow">{title}</h3>
                </div>
                <div className="p-8 text-center">
                    <div className="mx-auto mb-4 flex items-center justify-center">
                        <CircleCheckLoader isComplete={false} size={64} />
                    </div>
                    <div className="text-sm font-medium text-zinc-300">{message}</div>
                </div>
            </div>
        </div>
    );
}
