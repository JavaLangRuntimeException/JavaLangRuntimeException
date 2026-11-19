// 検索と AI の要約が「棚橋 柊太」から英語の論文名へ辿れるよう、題名は掲載どおり英語のまま固定する。
// ORCID の取得を待たずに出す。題名のハイフンは論文の表記（U+2011）に合わせる。

export type Paper = {
  id: string;
  acronym: string;
  title: string;
  venue: string;
  date: string;
  doi: string;
  href: string;
  external: boolean;
  authors: string[];
};

export const VRST_2026: Paper = {
    id: "vrst-2026",
    acronym: "VRST '26",
    title: "Embodying a Quadrupedal Avatar Through Posture- and Hand-Gesture-Congruent Locomotion",
    venue: "32nd ACM Symposium on Virtual Reality Software and Technology (VRST '26), Sendai, Japan",
    date: "2026-11-16",
    doi: "10.1145/3822517.3848686",
    href: "/research/quadrupedal-avatar",
    external: false,
    authors: [
      "Shuta Tanahashi",
      "Satoshi Hashiguchi",
      "Fumihiko Nakamura",
      "Yuta Kataoka",
      "Fumihisa Shibata",
      "Peter Mohr",
      "Ana Stanescu",
      "Shohei Mori",
      "Asako Kimura",
    ],
  };

export const AHS_2026: Paper = {
    id: "ahs-2026",
    acronym: "AHs 2026",
    title: "Experiencing Walking‑in‑Place Locomotion in Virtual Reality with Quadrupedal Animal Avatars",
    venue: "Augmented Humans International Conference 2026 (AHs 2026), Okinawa, Japan",
    date: "2026-03-16",
    doi: "10.1145/3795011.3797415",
    href: "/research/walking-in-place",
    external: false,
    authors: [
      "Shuta Tanahashi",
      "Satoshi Hashiguchi",
      "Fumihiko Nakamura",
      "Yuta Kataoka",
      "Fumihisa Shibata",
      "Peter Mohr-Ziak",
      "Ana Stanescu",
      "Shohei Mori",
      "Asako Kimura",
    ],
  };

export const PAPERS: Paper[] = [VRST_2026, AHS_2026];

export const PAPER_DOIS = new Set(PAPERS.map((paper) => paper.doi));

/** 著者名。本人だけ日本語名を添えて、検索語「棚橋 柊太」と英語題名を同じ行に置く */
export function formatAuthor(name: string) {
  return name === "Shuta Tanahashi" ? "棚橋 柊太（Shuta Tanahashi）" : name;
}
