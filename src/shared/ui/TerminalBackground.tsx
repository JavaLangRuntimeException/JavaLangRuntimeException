"use client";

import React, { useState, useEffect, useRef } from "react";

type CommandEntry = {
    command: string;
    output: string[];
};

const COMMANDS: CommandEntry[] = [
    {
        command: "git clone https://github.com/taramanji/portfolio.git",
        output: [
            "Cloning into 'portfolio'...",
            "remote: Enumerating objects: 1247, done.",
            "remote: Compressing objects: 100% (892/892), done.",
            "Receiving objects: 100% (1247/1247), 4.82 MiB | 12.3 MiB/s, done.",
        ],
    },
    {
        command: "cd portfolio && npm install",
        output: [
            "added 1432 packages in 28s",
            "182 packages are looking for funding",
        ],
    },
    {
        command: "docker compose up -d",
        output: [
            "[+] Running 3/3",
            " ✓ Container postgres    Started  0.8s",
            " ✓ Container redis       Started  0.6s",
            " ✓ Container app         Started  1.2s",
        ],
    },
    {
        command: "go build -o server ./cmd/api",
        output: [
            "compiling packages...",
            "linking...",
            "build complete: ./server",
        ],
    },
    {
        command: "kubectl get pods -n production",
        output: [
            "NAME                        READY   STATUS    RESTARTS   AGE",
            "api-server-7d4f8b6c9-x2k4l  1/1     Running   0          3d",
            "worker-5b8c9d7f4-m9n2p       1/1     Running   0          3d",
            "redis-master-0               1/1     Running   0          7d",
        ],
    },
    {
        command: "npm run build",
        output: [
            "Creating an optimized production build...",
            "Compiled successfully.",
            "Route (app)              Size     First Load JS",
            "┌ ○ /                    24.3 kB        142 kB",
            "└ ○ /api/health          0 B            0 B",
            "✓ Build completed in 12.4s",
        ],
    },
    {
        command: "terraform plan",
        output: [
            "Refreshing Terraform state...",
            "Plan: 3 to add, 1 to change, 0 to destroy.",
        ],
    },
    {
        command: "curl -s https://api.example.com/health | jq .",
        output: [
            '{',
            '  "status": "healthy",',
            '  "uptime": "99.98%",',
            '  "latency_ms": 12',
            '}',
        ],
    },
    {
        command: "git log --oneline -5",
        output: [
            "a1b2c3d feat: add real-time notification system",
            "e4f5g6h fix: resolve race condition in websocket handler",
            "i7j8k9l refactor: migrate auth to middleware pattern",
            "m0n1o2p docs: update API specification",
            "q3r4s5t chore: bump dependencies",
        ],
    },
    {
        command: "python3 train.py --model transformer --epochs 100",
        output: [
            "Loading dataset... 50,000 samples",
            "Epoch [100/100] Loss: 0.0023 Acc: 98.7%",
            "Model saved to ./checkpoints/best_model.pt",
        ],
    },
    {
        command: "aws s3 sync ./dist s3://portfolio-assets --delete",
        output: [
            "upload: dist/index.html to s3://portfolio-assets/index.html",
            "upload: dist/main.js to s3://portfolio-assets/main.js",
            "Completed 24 file(s) with ~0 file(s) remaining",
        ],
    },
    {
        command: "cargo test --release",
        output: [
            "running 47 tests",
            "test result: ok. 47 passed; 0 failed; finished in 2.14s",
        ],
    },
    {
        command: "ssh deploy@production 'systemctl restart api'",
        output: [
            "Connection to production established.",
            "Restarting api.service...",
            "api.service: Started successfully.",
        ],
    },
    {
        command: "redis-cli INFO keyspace",
        output: [
            "# Keyspace",
            "db0:keys=2847,expires=1203,avg_ttl=3600000",
        ],
    },
    {
        command: "psql -c 'SELECT count(*) FROM users;'",
        output: [
            " count ",
            "-------",
            " 12847",
            "(1 row)",
        ],
    },
    {
        command: "helm upgrade --install api ./charts/api -n prod",
        output: [
            "Release \"api\" has been upgraded.",
            "STATUS: deployed",
            "REVISION: 42",
        ],
    },
];

const COLUMN_COUNT = 3;
const TYPING_SPEED = 10;
const OUTPUT_LINE_DELAY = 40;
const PAUSE_AFTER_COMMAND = 200;

type TerminalLine = {
    id: number;
    type: "prompt" | "output";
    text: string;
    isTyping?: boolean;
};


function TerminalColumn({ commandStartIndex, delayMs }: { commandStartIndex: number; delayMs: number }) {
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
            await sleep(delayMs);
            let commandIndex = commandStartIndex;
            while (!cancelled) {
                const entry = COMMANDS[commandIndex % COMMANDS.length];
                await typeCommand(entry.command);
                await sleep(60);

                for (const outputLine of entry.output) {
                    if (cancelled) return;
                    addLine({ type: "output", text: outputLine });
                    await sleep(OUTPUT_LINE_DELAY);
                }

                await sleep(PAUSE_AFTER_COMMAND);
                commandIndex++;
            }
        };

        runLoop();
        return () => { cancelled = true; };
    }, [commandStartIndex, delayMs]);

    return (
        <div className="flex-1 min-w-0 flex flex-col justify-start overflow-hidden px-2 sm:px-3">
            {lines.map((line) => (
                <div key={line.id} className="whitespace-pre overflow-hidden truncate">
                    {line.type === "prompt" ? (
                        <span>
                            <span className="text-green-400">$</span>
                            <span className="text-white"> {line.text}</span>
                            {line.isTyping && (
                                <span className="inline-block w-[5px] h-[12px] bg-green-400/80 align-middle animate-pulse ml-px" />
                            )}
                        </span>
                    ) : (
                        <span className="text-gray-400">{line.text}</span>
                    )}
                </div>
            ))}
        </div>
    );
}

export function TerminalBackground() {
    const columns = Array.from({ length: COLUMN_COUNT }, (_, i) => ({
        commandStartIndex: Math.floor((COMMANDS.length / COLUMN_COUNT) * i),
        delayMs: i * 400,
    }));

    return (
        <div className="absolute inset-0 z-[5] overflow-hidden pointer-events-none select-none">
            <div
                className="absolute inset-0 flex flex-row font-mono text-[9px] sm:text-[10px] md:text-xs leading-relaxed pt-4"
                style={{ opacity: 0.15 }}
            >
                {columns.map((col, i) => (
                    <TerminalColumn
                        key={i}
                        commandStartIndex={col.commandStartIndex}
                        delayMs={col.delayMs}
                    />
                ))}
            </div>
        </div>
    );
}
