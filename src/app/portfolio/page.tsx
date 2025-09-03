// app/portfolio/page.tsx
import React from "react";


import { ProfileHeader } from "../../feature/profile/ui/profile-header";
import { AffiliationBadges } from "../../feature/affiliations/ui/badges";

export default function PortfolioPage() {
    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <ProfileHeader />

            <AffiliationBadges />

            <section className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                    <h3 className="text-base font-semibold">About</h3>
                    <p className="mt-2 text-sm text-zinc-200/90">バックエンド開発とコミュニティ運営に注力しています。Go / TypeScript / Cloud を主軸に、パフォーマンスと開発体験を両立したプロダクトづくりを目指しています。</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                    <h3 className="text-base font-semibold">Interest</h3>
                    <p className="mt-2 text-sm text-zinc-200/90">分散システム、API 設計、DevRel、OSS、コミュニティづくり。</p>
                </div>
            </section>
        </main>
    );
}
