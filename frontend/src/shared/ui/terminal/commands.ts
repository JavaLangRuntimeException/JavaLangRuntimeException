// 背景やローディングに流れる CLI コマンド（旧 src/shared/ui/TerminalBackground.tsx・TerminalLoadingModal.tsx と同じ内容）
export type CommandEntry = {
  command: string;
  output: string[];
};

export const BACKGROUND_COMMANDS: CommandEntry[] = [
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

export const RESERVE_COMMANDS: CommandEntry[] = [
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

export const CONTACT_COMMANDS: CommandEntry[] = [
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
