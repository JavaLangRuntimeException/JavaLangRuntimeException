import { Fragment } from "react";
import { Link } from "react-router";
import { Chip } from "@/components/base/badges/chip";
import { ORCID_SELF_NAME, ORCID_WORK_TYPE_LABELS, useOrcidWorks, type OrcidWork } from "@/entities/publication";
import { Section, Skeleton } from "@/shared/ui/layout";

/** ORCID に登録した論文 */
export function OrcidWorks() {
  const { data, isPending } = useOrcidWorks();
  const works = data?.works ?? [];

  return (
    <Section
      id="publications"
      title="Publications"
    >
      <ProjectPageCard />
      {isPending && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <p className="text-body-2-regular text-text-tertiary">論文を取得中...</p>
          <Skeleton className="h-32" />
        </div>
      )}
      {!isPending && works.length === 0 && <p className="text-body-2-regular text-text-tertiary">論文がまだありません</p>}
      {!isPending && works.length > 0 && (
        <ul className="flex flex-col gap-3">
          {works.map((work) => (
            <li key={work.putCode}>
              <WorkCard work={work} />
            </li>
          ))}
        </ul>
      )}
      {!isPending && data?.orcidId && (
        <p className="text-end text-caption-1-regular text-text-tertiary">
          Source:{" "}
          <a href={`https://orcid.org/${data.orcidId}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text-primary">
            ORCID {data.orcidId}
          </a>
        </p>
      )}
    </Section>
  );
}

/** プロジェクトページのある論文（ORCID の一覧より上に置く） */
function ProjectPageCard() {
  return (
    <Link
      to="/research/quadrupedal-avatar"
      className="lift group grid gap-4 rounded-xl border border-border-button-default bg-background-primary-default p-5 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center"
    >
      <img src="/research/quadrupedal-avatar/teaser-v4.jpg" width={2116} height={600} alt="" loading="lazy" decoding="async" className="h-auto w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip color="lime" variant="caption">
            Project Page
          </Chip>
          <span className="text-caption-1-regular text-text-tertiary">VRST '26</span>
        </div>
        <h3 className="text-headline-semibold text-text-primary">Embodying a Quadrupedal Avatar Through Posture- and Hand-Gesture-Congruent Locomotion</h3>
        <p className="text-body-2-regular text-text-secondary">
          <span className="font-semibold text-text-primary underline underline-offset-2">Shuta Tanahashi</span>, Satoshi Hashiguchi, Fumihiko Nakamura, Yuta Kataoka, Fumihisa Shibata, Peter Mohr, Ana Stanescu, Shohei Mori,
          Asako Kimura
        </p>
        <p className="text-body-2-regular italic text-text-tertiary">32nd ACM Symposium on Virtual Reality Software and Technology (VRST '26), Sendai, Japan</p>
      </div>
    </Link>
  );
}

function WorkCard({ work }: { work: OrcidWork }) {
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Chip color="lime" variant="caption">
          {ORCID_WORK_TYPE_LABELS[work.type] ?? work.type}
        </Chip>
        {work.date && <span className="text-caption-1-regular text-text-tertiary">{work.date}</span>}
      </div>
      <h3 className="text-headline-semibold text-text-primary">{work.title}</h3>
      {work.authors.length > 0 && (
        <p className="text-body-2-regular text-text-secondary">
          {work.authors.map((author, i) => (
            <Fragment key={i}>
              {i > 0 && ", "}
              <span className={author === ORCID_SELF_NAME ? "font-semibold text-text-primary underline underline-offset-2" : undefined}>{author}</span>
            </Fragment>
          ))}
        </p>
      )}
      {work.venue && <p className="text-body-2-regular italic text-text-tertiary">{work.venue}</p>}
      {work.doi && (
        <span className="inline-flex items-center gap-1 text-body-2-semibold text-accent-300">
          DOI: {work.doi}
          </span>
      )}
    </>
  );
  const className =
    "group flex flex-col gap-2 rounded-xl border border-border-button-default bg-background-primary-default p-5 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring";
  return work.url ? (
    <a href={work.url} target="_blank" rel="noopener noreferrer" className={`${className} lift`}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
