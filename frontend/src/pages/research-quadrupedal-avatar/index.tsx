import { Fragment, useState } from "react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { PageContainer, PageHeader, Section } from "@/shared/ui/layout";

// VRST '26 の論文のプロジェクトページ（Overleaf の原稿と同じ文言。構成は RF4XR の VR25 Tutorial のページにならう）

const ASSETS = "/research/quadrupedal-avatar";
const DOI = "10.1145/3822517.3848686";

const AFFILIATIONS = [
  "Ritsumeikan University, Japan",
  "Graz University of Technology, Austria",
  "Adelaide University, Australia",
  "VISUS, University of Stuttgart, Germany",
];

const AUTHORS: { name: string; orcid: string; affiliations: number[]; lastAuthor?: boolean }[] = [
  { name: "Shuta Tanahashi", orcid: "0009-0005-4751-648X", affiliations: [1] },
  { name: "Satoshi Hashiguchi", orcid: "0009-0002-0427-030X", affiliations: [1] },
  { name: "Fumihiko Nakamura", orcid: "0000-0001-6285-3963", affiliations: [1] },
  { name: "Yuta Kataoka", orcid: "0000-0001-6144-6477", affiliations: [1] },
  { name: "Fumihisa Shibata", orcid: "0000-0002-6534-5742", affiliations: [1] },
  { name: "Peter Mohr", orcid: "0000-0002-9592-4104", affiliations: [2] },
  { name: "Ana Stanescu", orcid: "0000-0002-6203-1238", affiliations: [3, 2] },
  { name: "Shohei Mori", orcid: "0000-0003-0540-7312", affiliations: [4], lastAuthor: true },
  { name: "Asako Kimura", orcid: "0000-0002-9859-9079", affiliations: [1], lastAuthor: true },
];

const CONDITIONS = [
  { code: "QR", name: "Quad-Rowing", detail: "Pseudo-quadrupedal posture with Rowing, at a subadult-bear viewpoint height." },
  { code: "QS", name: "Quad-Swinging", detail: "Pseudo-quadrupedal posture with Swinging, at a subadult-bear viewpoint height." },
  { code: "SR", name: "Stand-Rowing", detail: "Standing posture with Rowing, at an adult-bear viewpoint height." },
  { code: "SS", name: "Stand-Swinging", detail: "Standing posture with Swinging, at an adult-bear viewpoint height." },
];

// 原稿の Table（Pairwise comparisons）から、有意な主効果のあった行だけ
const RESULTS: { measure: string; quad: string; stand: string; posture: string; row: string; swing: string; gesture: string }[] = [
  { measure: "Body Ownership", quad: "4.97", stand: "3.82", posture: "<.001***", row: "4.82", swing: "3.97", gesture: "<.001***" },
  { measure: "Agency", quad: "4.99", stand: "4.03", posture: "<.001***", row: "4.77", swing: "4.25", gesture: ".011*" },
  { measure: "Enjoyment", quad: "5.90", stand: "5.44", posture: ".032*", row: "5.85", swing: "5.48", gesture: ".026*" },
  { measure: "Physical Demand", quad: "12.1", stand: "12.1", posture: "—", row: "13.9", swing: "10.3", gesture: ".003**" },
  { measure: "Effort", quad: "11.0", stand: "10.5", posture: "—", row: "12.9", swing: "8.52", gesture: "<.001***" },
  { measure: "Overall Workload", quad: "9.49", stand: "9.06", posture: "—", row: "10.2", swing: "8.36", gesture: "<.001***" },
  { measure: "Perceived Speed", quad: "3.88", stand: "2.94", posture: ".012*", row: "3.50", swing: "3.31", gesture: "—" },
  { measure: "Perceived Weight", quad: "4.56", stand: "4.54", posture: "—", row: "4.92", swing: "4.19", gesture: ".028*" },
  { measure: "Perceived Strength", quad: "4.94", stand: "4.15", posture: ".014*", row: "4.69", swing: "4.40", gesture: "—" },
];

const BIBTEX = `@inproceedings{tanahashi2026quadrupedal,
  author    = {Tanahashi, Shuta and Hashiguchi, Satoshi and Nakamura, Fumihiko and Kataoka, Yuta and Shibata, Fumihisa and Mohr, Peter and Stanescu, Ana and Mori, Shohei and Kimura, Asako},
  title     = {Embodying a Quadrupedal Avatar Through Posture- and Hand-Gesture-Congruent Locomotion},
  booktitle = {32nd ACM Symposium on Virtual Reality Software and Technology (VRST '26)},
  year      = {2026},
  month     = nov,
  location  = {Sendai, Japan},
  publisher = {Association for Computing Machinery},
  address   = {New York, NY, USA},
  isbn      = {979-8-4007-2811-2},
  doi       = {${DOI}},
}`;

export default function ResearchQuadrupedalAvatarPage() {
  return (
    <PageContainer>
      <div lang="en">
      <PageHeader
        eyebrow="VRST '26 · November 16–18, 2026 · Sendai, Japan"
        title="Embodying a Quadrupedal Avatar Through Posture- and Hand-Gesture-Congruent Locomotion"
        description={<Authors />}
      />
      <div className="-mt-6 mb-10 flex flex-wrap gap-2">
        <ButtonLink variant="secondary" href={`https://doi.org/${DOI}`} target="_blank" rel="noopener noreferrer">
          Paper (ACM DL)
        </ButtonLink>
        <ButtonLink variant="secondary" href="#bibtex">
          BibTeX
        </ButtonLink>
      </div>

      <div className="mb-8">
        <Figure
          src={`${ASSETS}/teaser.jpg`}
          width={2116}
          height={600}
          alt="Four photographs of a participant wearing a head-mounted display and holding two controllers, labeled Quad-Rowing, Quad-Swinging, Stand-Rowing, and Stand-Swinging. In the two Quad panels the participant kneels in a lowered posture; in the two Stand panels the participant stands upright. Red arrows trace the motion of each hand."
          caption={
            <>
              We examine four locomotion conditions for a quadrupedal bear avatar, crossing two postures with two hand-gesture conditions. The arrows illustrate the arm motions: a forward reach and backward pull for <i>Rowing</i>, and an
              alternating forward-backward arm swing for <i>Swinging</i>.
            </>
          }
        />
      </div>

      <Section title="Abstract">
        <p className="prose-ja">
          Virtual reality (VR) lets users embody non-humanoid avatars, but quadrupedal locomotion is challenging because its gait differs fundamentally from human bipedal movement. Prior work shows that gesture congruence and physical posture
          each enhance embodiment, yet their influence on users' self-perception during quadrupedal locomotion remains underexplored. We drive a quadruped avatar's plantigrade gait from hand movements alone, avoiding whole-body fatigue.
          Because the forelimbs map onto human arms, the technique splits into two axes, body posture and hand-gesture mapping. In a within-subjects study (N=24) crossing two postures (pseudo-quadrupedal, standing) with two gesture
          mappings (Rowing, Swinging), both manipulations enhance body ownership and agency, with no detectable interaction. Avatar-consistent self-perception further differs across the four configurations, reflecting posture, viewpoint,
          and scale rather than locomotion alone. Finally, perceived skill is higher for Rowing in the pseudo-quadrupedal posture than in standing, which also raises physical workload. These results unify the two frameworks into a single
          design space for plantigrade quadrupedal avatar locomotion that trades off embodiment quality against workload.
        </p>
      </Section>

      <Section title="Hand-Gesture Quadrupedal Locomotion">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-start">
          <div className="flex flex-col gap-4">
            <p className="prose-ja">
              We drive a bear avatar's plantigrade gait through forelimb operation alone, a deliberate simplification that avoids whole-body fatigue while preserving the forelimb motion users see and control. Bear forelimbs and human
              upper limbs share the broad shoulder–elbow–wrist joint layout, so users propel the avatar by reaching forward palm-down and pulling back. Each detected stroke advances the avatar 1.5 m at 1.5 m/s.
            </p>
            <dl className="flex flex-col divide-y divide-separator-border border-y border-separator-border">
              <div className="flex flex-col gap-1 py-3">
                <dt className="text-body-semibold text-text-primary">Rowing</dt>
                <dd className="prose-ja">
                  Users alternately extend one hand as far forward as possible and pull it backward as if pawing the ground. A stroke is detected when a controller moves backward faster than 0.5 m/s below a participant-specific chest
                  height.
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-3">
                <dt className="text-body-semibold text-text-primary">Swinging</dt>
                <dd className="prose-ja">
                  Adapted from arm-swing techniques. Users alternately swing their arms forward and backward with elbows bent at about 90 degrees. A stroke is detected when a controller's vertical velocity exceeds 0.5 m/s.
                </dd>
              </div>
            </dl>
          </div>
          <Figure
            src={`${ASSETS}/bear.png`}
            width={522}
            height={268}
            alt="A participant in a lowered, pseudo-quadrupedal posture, overlaid with the bear avatar they control. The participant's arms align with the bear's forelimbs."
            caption="Hand and arm movements with palms facing downward are mapped onto the avatar's forelimbs, driving its plantigrade gait."
          />
        </div>
        <p className="prose-ja">
          Built in Unity 6 with the Meta XR SDK. Each controller pose drives the corresponding forepaw through Unity's humanoid IK, with a 90-degree roll offset aligning the grip with the palm-down paw.
        </p>
      </Section>

      <Section title="User Study" description="A within-subjects experiment with 24 participants crossing two postures with two gestures.">
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {CONDITIONS.map((c) => (
            <div key={c.code} className="flex gap-4 border-t border-separator-border py-3">
              <dt className="meta w-8 shrink-0 pt-0.5 text-accent-300">{c.code}</dt>
              <dd className="flex flex-col gap-0.5">
                <span className="text-body-semibold text-text-primary">{c.name}</span>
                <span className="prose-ja">{c.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="prose-ja">
          The bear's shoulder height was 80 cm in the subadult configuration and 160 cm in the adult configuration, matching human eye height in the pseudo-quadrupedal and standing postures. In the pseudo-quadrupedal posture, participants
          knelt with their back horizontal and hands off the floor. Participants travelled across a virtual grassland from the start point to a target object.
        </p>
        <Figure
          src={`${ASSETS}/viewpoint.jpg`}
          width={2000}
          height={581}
          alt="Two first-person views of a savanna. A, from the standing posture, looks over the grass; B, from the pseudo-quadrupedal posture, looks through tall grass."
          caption="The user's viewpoint: (A) standing posture (adult bear), and (B) pseudo-quadrupedal posture (subadult bear)."
        />
        <Figure
          src={`${ASSETS}/course.png`}
          width={628}
          height={194}
          alt="Side view of the virtual grassland course with a start point and a target object."
          caption="Side view of the virtual grassland course."
        />
      </Section>

      <Section title="Results">
        <ul className="flex flex-col gap-2 ps-5 marker:text-text-tertiary [list-style:disc]">
          <li className="prose-ja">Both the pseudo-quadrupedal posture and Rowing enhance body ownership and agency, with no detectable interaction.</li>
          <li className="prose-ja">Quad-Rowing shifted self-perception of speed, weight, and strength toward the bear, and was most often described as “feeling like a bear.”</li>
          <li className="prose-ja">Perceived skill shows a posture–gesture interaction: Rowing is rated more skillful in the pseudo-quadrupedal posture than in standing (QR &gt; SR, p=.005).</li>
          <li className="prose-ja">Rowing also raises physical demand, effort, and overall workload, a trade-off designers must weigh.</li>
        </ul>
        <Figure
          src={`${ASSETS}/results.jpg`}
          width={2760}
          height={816}
          alt="Box plots across the four conditions. Left: ownership, agency, enjoyment, skilled, and four perceived self-perception items on a 1 to 7 scale. Right: adapted raw TLX dimensions and overall score."
          caption="Questionnaire results across the four conditions. Left: embodiment and subjective experience. Right: adapted raw TLX, rescaled by five for display."
        />
        <ResultsTable />
      </Section>

      <Section title="Design Implications">
        <ul className="flex flex-col gap-2 ps-5 marker:text-text-tertiary [list-style:disc]">
          <li className="prose-ja">Align the user's posture with the avatar's to raise body ownership, agency, and enjoyment, but plan for its physical load in extended use.</li>
          <li className="prose-ja">Because the two factors contribute independently, use Rowing alone when the pseudo-quadrupedal posture is impractical, or the posture alone when Rowing is too demanding.</li>
          <li className="prose-ja">For games and training, where mastery matters, avoid pairing Rowing with a standing posture.</li>
          <li className="prose-ja">For educational experiences such as wildlife embodiment, combine the pseudo-quadrupedal posture with Rowing.</li>
        </ul>
      </Section>

      <Section id="bibtex" title="BibTeX">
        <BibTeX />
      </Section>

      <Section title="Acknowledgement">
        <p className="prose-ja">
          This work was supported by JSPS KAKENHI Grant Number 24K20823 and the Alexander von Humboldt Foundation funded by the German Federal Ministry of Research, Technology and Space.
        </p>
      </Section>
      </div>
    </PageContainer>
  );
}

function Authors() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-regular leading-[1.9] text-text-primary">
        {AUTHORS.map((a, i) => (
          <Fragment key={a.name}>
            {i > 0 && ", "}
            <a href={`https://orcid.org/${a.orcid}`} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap underline-offset-2 hover:underline">
              {a.name}
            </a>
            <sup className="ms-0.5 text-text-tertiary">
              {a.affiliations.join(",")}
              {a.lastAuthor && "*"}
            </sup>
          </Fragment>
        ))}
      </p>
      <ol className="flex flex-col gap-0.5 text-body-2-regular text-text-secondary">
        {AFFILIATIONS.map((name, i) => (
          <li key={name}>
            <sup className="me-1 text-text-tertiary">{i + 1}</sup>
            {name}
          </li>
        ))}
        <li>
          <sup className="me-1 text-text-tertiary">*</sup>
          Both authors share the last authorship.
        </li>
      </ol>
    </div>
  );
}

function Figure({ src, width, height, alt, caption }: { src: string; width: number; height: number; alt: string; caption: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-3">
      {/* 論文の図は白地。暗い面の上でも図として読めるよう、白地のまま角を丸めて置く */}
      <img src={src} width={width} height={height} alt={alt} loading="lazy" decoding="async" className="h-auto w-full rounded-xl" />
      <figcaption className="text-body-2-regular leading-relaxed text-text-tertiary">{caption}</figcaption>
    </figure>
  );
}

function ResultsTable() {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-body-2-regular">
          <caption className="mb-3 text-start text-body-2-regular text-text-tertiary">Marginal means and Wilcoxon signed-rank p-values for measures with a significant main effect.</caption>
          <thead>
            <tr className="border-b border-separator-border text-text-secondary">
              <th scope="col" className="py-2 pe-4 text-start font-semibold">Measure</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">Quad.</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">Stand.</th>
              <th scope="col" className="px-2 py-2 pe-6 text-end font-semibold">p</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">Row.</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">Swing.</th>
              <th scope="col" className="ps-2 py-2 text-end font-semibold">p</th>
            </tr>
          </thead>
          <tbody className="meta">
            {RESULTS.map((r) => (
              <tr key={r.measure} className="border-b border-separator-border">
                <th scope="row" className="py-2 pe-4 text-start font-sans font-normal text-text-primary">{r.measure}</th>
                <td className="px-2 py-2 text-end text-text-secondary">{r.quad}</td>
                <td className="px-2 py-2 text-end text-text-secondary">{r.stand}</td>
                <td className={r.posture === "—" ? "px-2 py-2 pe-6 text-end text-text-tertiary" : "px-2 py-2 pe-6 text-end text-accent-300"}>{r.posture}</td>
                <td className="px-2 py-2 text-end text-text-secondary">{r.row}</td>
                <td className="px-2 py-2 text-end text-text-secondary">{r.swing}</td>
                <td className={r.gesture === "—" ? "ps-2 py-2 text-end text-text-tertiary" : "ps-2 py-2 text-end text-accent-300"}>{r.gesture}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-body-2-regular text-text-tertiary">Quad.: pseudo-quadrupedal, Stand.: standing, Row.: Rowing, Swing.: Swinging. *: p&lt;.05, **: p&lt;.01, ***: p&lt;.001.</p>
    </div>
  );
}

function BibTeX() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <pre className="overflow-x-auto rounded-xl border border-separator-border bg-background-secondary-default p-4 font-mono text-[13px] leading-relaxed text-text-secondary">
        <code>{BIBTEX}</code>
      </pre>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(BIBTEX);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          Copy BibTeX
        </Button>
        <span role="status" className="text-body-2-regular text-text-tertiary">
          {copied ? "Copied to clipboard." : ""}
        </span>
      </div>
    </div>
  );
}
