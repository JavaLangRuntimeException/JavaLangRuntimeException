// app/portfolio/page.tsx
import React from "react";
import { HeroBackground } from "../../shared/ui/HeroBackground";

export default function PortfolioPage() {
    const bgImages = ["/image.png", "/image2.png", "/image3.png"];
    return (
        <HeroBackground images={bgImages} intro={{ enabled: false }}>
            <main className="mx-auto max-w-5xl px-4 py-10" />
        </HeroBackground>
    );
}
