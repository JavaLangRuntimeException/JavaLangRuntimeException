import { Fragment } from "react";
import { ButtonLink } from "@/components/base/buttons/button";
import { AHS_2026, formatAuthor } from "@/entities/publication";
import { withEnvTitle } from "@/shared/config/site";
import { PageContainer, PageHeader } from "@/shared/ui/layout";
import { Still } from "@/shared/ui/motion";

const CITATION_AUTHORS = ["Tanahashi, Shuta", "Hashiguchi, Satoshi", "Nakamura, Fumihiko", "Kataoka, Yuta", "Shibata, Fumihisa", "Mohr-Ziak, Peter", "Stanescu, Ana", "Mori, Shohei", "Kimura, Asako"];

export default function ResearchWalkingInPlacePage() {
  return (
    <Still>
      <title>{withEnvTitle(`${AHS_2026.title} | 棚橋 柊太（Shuta Tanahashi）`)}</title>
      <meta name="description" content={`棚橋 柊太（Shuta Tanahashi）の論文。AHs 2026: ${AHS_2026.title}`} />
      <link rel="canonical" href="https://taramanji.com/research/walking-in-place" />
      <meta name="citation_title" content={AHS_2026.title} />
      {CITATION_AUTHORS.map((author) => (
        <meta key={author} name="citation_author" content={author} />
      ))}
      <meta name="citation_publication_date" content="2026/03/16" />
      <meta name="citation_conference_title" content="Augmented Humans International Conference 2026" />
      <meta name="citation_doi" content={AHS_2026.doi} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ScholarlyArticle",
            "@id": "https://taramanji.com/#paper-ahs-2026",
            headline: AHS_2026.title,
            inLanguage: "en",
            url: "https://taramanji.com/research/walking-in-place",
            sameAs: `https://doi.org/${AHS_2026.doi}`,
            datePublished: AHS_2026.date,
            description: `棚橋 柊太（Shuta Tanahashi）の論文。${AHS_2026.acronym}: ${AHS_2026.title}`,
            author: {
              "@type": "Person",
              "@id": "https://taramanji.com/#shuta-tanahashi",
              name: "Shuta Tanahashi",
              alternateName: ["棚橋 柊太", "棚橋柊太", "taramanji"],
            },
          }),
        }}
      />
      <PageContainer width="narrow">
        <PageHeader
          eyebrow="AHs 2026 · March 16, 2026 · Okinawa, Japan"
          title={AHS_2026.title}
          description={<p>棚橋 柊太（Shuta Tanahashi）による AHs 2026（Augmented Humans International Conference 2026、沖縄）の論文です。</p>}
        />
        <p className="text-body-regular text-text-secondary">
          {AHS_2026.authors.map((author, i) => (
            <Fragment key={author}>
              {i > 0 && ", "}
              <span className={author === "Shuta Tanahashi" ? "font-semibold text-text-primary" : undefined}>{formatAuthor(author)}</span>
            </Fragment>
          ))}
        </p>
        <p className="mt-3 text-body-regular italic text-text-tertiary">{AHS_2026.venue}</p>
        <div className="mt-6">
          <ButtonLink variant="secondary" href={`https://doi.org/${AHS_2026.doi}`} target="_blank" rel="noopener noreferrer">
            論文（ACM DL） / Paper (ACM DL)
          </ButtonLink>
        </div>
      </PageContainer>
    </Still>
  );
}
