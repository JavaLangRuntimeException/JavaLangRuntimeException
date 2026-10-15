import { useState } from "react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { useT, type L10n } from "@/shared/lib/i18n";
import { PageContainer, PageHeader, Section } from "@/shared/ui/layout";
import { Still } from "@/shared/ui/motion";

// VRST '26 の論文のプロジェクトページ（英語は Overleaf の原稿と同じ文言。構成は RF4XR の VR25 Tutorial のページにならう）。
// 読ませるページなので、文字が 1 文字ずつ定まる演出などは止める（Still）。論文名・著者名・BibTeX は日本語表示でも英語のまま

const ASSETS = "/research/quadrupedal-avatar";
const DOI = "10.1145/3822517.3848686";
const TITLE = "Embodying a Quadrupedal Avatar Through Posture- and Hand-Gesture-Congruent Locomotion";

const AFFILIATIONS: L10n[] = [
  { ja: "立命館大学（日本）", en: "Ritsumeikan University, Japan" },
  { ja: "グラーツ工科大学（オーストリア）", en: "Graz University of Technology, Austria" },
  { ja: "アデレード大学（オーストラリア）", en: "Adelaide University, Australia" },
  { ja: "シュトゥットガルト大学 VISUS（ドイツ）", en: "VISUS, University of Stuttgart, Germany" },
];

// photo は authors/ 以下の 240px 四方の顔写真
const AUTHORS: { name: string; photo: string; orcid: string; affiliations: number[]; lastAuthor?: boolean }[] = [
  { name: "Shuta Tanahashi", photo: "tanahashi", orcid: "0009-0005-4751-648X", affiliations: [1] },
  { name: "Satoshi Hashiguchi", photo: "hashiguchi", orcid: "0009-0002-0427-030X", affiliations: [1] },
  { name: "Fumihiko Nakamura", photo: "nakamura", orcid: "0000-0001-6285-3963", affiliations: [1] },
  { name: "Yuta Kataoka", photo: "kataoka", orcid: "0000-0001-6144-6477", affiliations: [1] },
  { name: "Fumihisa Shibata", photo: "shibata", orcid: "0000-0002-6534-5742", affiliations: [1] },
  { name: "Peter Mohr", photo: "mohr", orcid: "0000-0002-9592-4104", affiliations: [2] },
  { name: "Ana Stanescu", photo: "stanescu", orcid: "0000-0002-6203-1238", affiliations: [3, 2] },
  { name: "Shohei Mori", photo: "mori", orcid: "0000-0003-0540-7312", affiliations: [4], lastAuthor: true },
  { name: "Asako Kimura", photo: "kimura", orcid: "0000-0002-9859-9079", affiliations: [1], lastAuthor: true },
];

const CONDITIONS: { code: string; name: string; detail: L10n }[] = [
  {
    code: "QR",
    name: "Quad-Rowing",
    detail: { ja: "疑似四足姿勢 × Rowing。視点の高さは亜成獣のクマに合わせる。", en: "Pseudo-quadrupedal posture with Rowing, at a subadult-bear viewpoint height." },
  },
  {
    code: "QS",
    name: "Quad-Swinging",
    detail: { ja: "疑似四足姿勢 × Swinging。視点の高さは亜成獣のクマに合わせる。", en: "Pseudo-quadrupedal posture with Swinging, at a subadult-bear viewpoint height." },
  },
  {
    code: "SR",
    name: "Stand-Rowing",
    detail: { ja: "立位 × Rowing。視点の高さは成獣のクマに合わせる。", en: "Standing posture with Rowing, at an adult-bear viewpoint height." },
  },
  {
    code: "SS",
    name: "Stand-Swinging",
    detail: { ja: "立位 × Swinging。視点の高さは成獣のクマに合わせる。", en: "Standing posture with Swinging, at an adult-bear viewpoint height." },
  },
];

// 原稿の Table（Pairwise comparisons）から、有意な主効果のあった行だけ
const RESULTS: { measure: L10n; quad: string; stand: string; posture: string; row: string; swing: string; gesture: string }[] = [
  { measure: { ja: "身体所有感", en: "Body Ownership" }, quad: "4.97", stand: "3.82", posture: "<.001***", row: "4.82", swing: "3.97", gesture: "<.001***" },
  { measure: { ja: "行為主体感", en: "Agency" }, quad: "4.99", stand: "4.03", posture: "<.001***", row: "4.77", swing: "4.25", gesture: ".011*" },
  { measure: { ja: "楽しさ", en: "Enjoyment" }, quad: "5.90", stand: "5.44", posture: ".032*", row: "5.85", swing: "5.48", gesture: ".026*" },
  { measure: { ja: "身体的負担", en: "Physical Demand" }, quad: "12.1", stand: "12.1", posture: "—", row: "13.9", swing: "10.3", gesture: ".003**" },
  { measure: { ja: "努力", en: "Effort" }, quad: "11.0", stand: "10.5", posture: "—", row: "12.9", swing: "8.52", gesture: "<.001***" },
  { measure: { ja: "総合的な作業負荷", en: "Overall Workload" }, quad: "9.49", stand: "9.06", posture: "—", row: "10.2", swing: "8.36", gesture: "<.001***" },
  { measure: { ja: "自分の速さの知覚", en: "Perceived Speed" }, quad: "3.88", stand: "2.94", posture: ".012*", row: "3.50", swing: "3.31", gesture: "—" },
  { measure: { ja: "自分の重さの知覚", en: "Perceived Weight" }, quad: "4.56", stand: "4.54", posture: "—", row: "4.92", swing: "4.19", gesture: ".028*" },
  { measure: { ja: "自分の力強さの知覚", en: "Perceived Strength" }, quad: "4.94", stand: "4.15", posture: ".014*", row: "4.69", swing: "4.40", gesture: "—" },
];

const BIBTEX = `@inproceedings{tanahashi2026quadrupedal,
  author    = {Tanahashi, Shuta and Hashiguchi, Satoshi and Nakamura, Fumihiko and Kataoka, Yuta and Shibata, Fumihisa and Mohr, Peter and Stanescu, Ana and Mori, Shohei and Kimura, Asako},
  title     = {${TITLE}},
  booktitle = {32nd ACM Symposium on Virtual Reality Software and Technology (VRST '26)},
  year      = {2026},
  month     = nov,
  location  = {Sendai, Japan},
  publisher = {Association for Computing Machinery},
  address   = {New York, NY, USA},
  isbn      = {979-8-4007-2811-2},
  doi       = {${DOI}},
}`;

const LIST = "flex flex-col gap-2 ps-5 marker:text-text-tertiary [list-style:disc]";

export default function ResearchQuadrupedalAvatarPage() {
  const t = useT();
  return (
    <Still>
      <PageContainer>
        <PageHeader
          eyebrow={t({ ja: "VRST '26 · 2026 年 11 月 16〜18 日 · 仙台", en: "VRST '26 · November 16–18, 2026 · Sendai, Japan" })}
          title={TITLE}
          description={t({ ja: "姿勢と手のジェスチャーを一致させた移動による、四足歩行アバターの身体化", en: undefined })}
        />
        <Authors />
        <div className="mt-6 mb-10 flex flex-wrap gap-2">
          <ButtonLink variant="secondary" href={`https://doi.org/${DOI}`} target="_blank" rel="noopener noreferrer">
            {t({ ja: "論文（ACM DL）", en: "Paper (ACM DL)" })}
          </ButtonLink>
          <ButtonLink variant="secondary" href="#bibtex">
            BibTeX
          </ButtonLink>
        </div>

        <div className="mb-8">
          <Figure
            src={`${ASSETS}/teaser-v4.jpg`}
            width={2116}
            height={600}
            alt={t({
              ja: "ヘッドマウントディスプレイを着け、両手にコントローラーを持った参加者の写真 4 枚。Quad-Rowing・Quad-Swinging・Stand-Rowing・Stand-Swinging のラベル付き。Quad の 2 枚では参加者は膝をついて低い姿勢をとり、Stand の 2 枚では直立している。赤い矢印がそれぞれの手の動きを示す。",
              en: "Four photographs of a participant wearing a head-mounted display and holding two controllers, labeled Quad-Rowing, Quad-Swinging, Stand-Rowing, and Stand-Swinging. In the two Quad panels the participant kneels in a lowered posture; in the two Stand panels the participant stands upright. Red arrows trace the motion of each hand.",
            })}
            caption={t({
              ja: (
                <>
                  2 つの姿勢と 2 つの手のジェスチャーを掛け合わせた、四足歩行のクマのアバターの 4 つの移動条件。矢印は腕の動きを示す。<i>Rowing</i> は前へ伸ばして後ろへ引く動き、<i>Swinging</i> は腕を交互に前後へ振る動き。
                </>
              ),
              en: (
                <>
                  We examine four locomotion conditions for a quadrupedal bear avatar, crossing two postures with two hand-gesture conditions. The arrows illustrate the arm motions: a forward reach and backward pull for <i>Rowing</i>, and an
                  alternating forward-backward arm swing for <i>Swinging</i>.
                </>
              ),
            })}
          />
        </div>

        <Section title={t({ ja: "概要", en: "Abstract" })}>
          <p className="prose-ja">
            {t({
              ja: "バーチャルリアリティ（VR）では人型でないアバターを身体化できるが、四足歩行は人間の二足歩行と歩き方が根本的に異なるため難しい。先行研究では、ジェスチャーの一致と身体の姿勢がそれぞれ身体化を高めることが示されているが、四足歩行中の自己知覚への影響は十分に調べられていない。本研究では、全身の疲労を避けるため、手の動きだけで四足アバターの蹠行性（しょこうせい）の歩行を操作する。前肢は人間の腕に対応するので、この手法は「身体の姿勢」と「手のジェスチャーの対応づけ」の 2 つの軸に分けられる。2 つの姿勢（疑似四足・立位）と 2 つのジェスチャー（Rowing・Swinging）を掛け合わせた参加者内実験（N=24）では、どちらの操作も身体所有感と行為主体感を高め、交互作用は見られなかった。さらに、アバターに沿った自己知覚は 4 つの条件で異なり、移動の手法だけでなく、姿勢・視点・体の大きさを反映していた。最後に、Rowing の上手さの感覚は立位より疑似四足姿勢で高かった。ただし Rowing は身体的な負荷も高めた。これらの結果は 2 つの枠組みを、身体化の質と負荷を天秤にかける、蹠行性の四足アバターの移動のための 1 つのデザイン空間にまとめる。",
              en: "Virtual reality (VR) lets users embody non-humanoid avatars, but quadrupedal locomotion is challenging because its gait differs fundamentally from human bipedal movement. Prior work shows that gesture congruence and physical posture each enhance embodiment, yet their influence on users' self-perception during quadrupedal locomotion remains underexplored. We drive a quadruped avatar's plantigrade gait from hand movements alone, avoiding whole-body fatigue. Because the forelimbs map onto human arms, the technique splits into two axes, body posture and hand-gesture mapping. In a within-subjects study (N=24) crossing two postures (pseudo-quadrupedal, standing) with two gesture mappings (Rowing, Swinging), both manipulations enhance body ownership and agency, with no detectable interaction. Avatar-consistent self-perception further differs across the four configurations, reflecting posture, viewpoint, and scale rather than locomotion alone. Finally, perceived skill is higher for Rowing in the pseudo-quadrupedal posture than in standing, which also raises physical workload. These results unify the two frameworks into a single design space for plantigrade quadrupedal avatar locomotion that trades off embodiment quality against workload.",
            })}
          </p>
        </Section>

        <Section title={t({ ja: "手のジェスチャーによる四足歩行", en: "Hand-Gesture Quadrupedal Locomotion" })}>
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-start">
            <div className="flex flex-col gap-4">
              <p className="prose-ja">
                {t({
                  ja: "クマのアバターの蹠行性の歩行を、前肢の操作だけで動かす。全身の疲労を避けつつ、ユーザーが見て操作する前肢の動きは残すための意図的な簡略化である。クマの前肢と人間の上肢は肩・肘・手首という関節の並びがおおむね共通しているため、ユーザーは手のひらを下に向けて前へ伸ばし、後ろへ引くことでアバターを進める。1 回のストロークを検出するごとに、アバターは 1.5 m/s で 1.5 m 進む。",
                  en: "We drive a bear avatar's plantigrade gait through forelimb operation alone, a deliberate simplification that avoids whole-body fatigue while preserving the forelimb motion users see and control. Bear forelimbs and human upper limbs share the broad shoulder–elbow–wrist joint layout, so users propel the avatar by reaching forward palm-down and pulling back. Each detected stroke advances the avatar 1.5 m at 1.5 m/s.",
                })}
              </p>
              <dl className="flex flex-col divide-y divide-separator-border border-y border-separator-border">
                <div className="flex flex-col gap-1 py-3">
                  <dt className="text-body-semibold text-text-primary">Rowing</dt>
                  <dd className="prose-ja">
                    {t({
                      ja: "片手ずつ交互に、できるだけ前へ伸ばし、地面をかくように後ろへ引く。参加者ごとに決めた胸の高さより下で、コントローラーが 0.5 m/s より速く後ろへ動いたときにストロークとして検出する。",
                      en: "Users alternately extend one hand as far forward as possible and pull it backward as if pawing the ground. A stroke is detected when a controller moves backward faster than 0.5 m/s below a participant-specific chest height.",
                    })}
                  </dd>
                </div>
                <div className="flex flex-col gap-1 py-3">
                  <dt className="text-body-semibold text-text-primary">Swinging</dt>
                  <dd className="prose-ja">
                    {t({
                      ja: "腕振りによる移動手法をもとにしたもの。肘をおよそ 90 度に曲げたまま、腕を交互に前後へ振る。コントローラーの上下方向の速さが 0.5 m/s を超えたときにストロークとして検出する。",
                      en: "Adapted from arm-swing techniques. Users alternately swing their arms forward and backward with elbows bent at about 90 degrees. A stroke is detected when a controller's vertical velocity exceeds 0.5 m/s.",
                    })}
                  </dd>
                </div>
              </dl>
            </div>
            <Figure
              src={`${ASSETS}/bear.png`}
              width={522}
              height={268}
              alt={t({
                ja: "低い疑似四足姿勢をとった参加者に、操作しているクマのアバターを重ねた図。参加者の腕がクマの前肢に重なっている。",
                en: "A participant in a lowered, pseudo-quadrupedal posture, overlaid with the bear avatar they control. The participant's arms align with the bear's forelimbs.",
              })}
              caption={t({
                ja: "手のひらを下に向けた手と腕の動きをアバターの前肢に対応づけ、蹠行性の歩行を動かす。",
                en: "Hand and arm movements with palms facing downward are mapped onto the avatar's forelimbs, driving its plantigrade gait.",
              })}
            />
          </div>
          <p className="prose-ja">
            {t({
              ja: "Unity 6 と Meta XR SDK で実装した。各コントローラーの姿勢が Unity のヒューマノイド IK を通して対応する前足を動かし、90 度のロールのずれを加えて、握りの向きを手のひらを下に向けた前足にそろえている。",
              en: "Built in Unity 6 with the Meta XR SDK. Each controller pose drives the corresponding forepaw through Unity's humanoid IK, with a 90-degree roll offset aligning the grip with the palm-down paw.",
            })}
          </p>
        </Section>

        <Section
          title={t({ ja: "ユーザー実験", en: "User Study" })}
          description={t({ ja: "24 名の参加者による参加者内実験。2 つの姿勢と 2 つのジェスチャーを掛け合わせた。", en: "A within-subjects experiment with 24 participants crossing two postures with two gestures." })}
        >
          <dl className="grid gap-x-8 sm:grid-cols-2">
            {CONDITIONS.map((c) => (
              <div key={c.code} className="flex gap-4 border-t border-separator-border py-3">
                <dt className="meta w-8 shrink-0 pt-0.5 text-accent-300">{c.code}</dt>
                <dd className="flex flex-col gap-0.5">
                  <span className="text-body-semibold text-text-primary">{c.name}</span>
                  <span className="prose-ja">{t(c.detail)}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="prose-ja">
            {t({
              ja: "クマの肩の高さは、亜成獣の設定で 80 cm、成獣の設定で 160 cm とし、疑似四足姿勢と立位での人間の目の高さに合わせた。疑似四足姿勢では、参加者は背中を水平にして膝をつき、手は床につけない。参加者はバーチャルな草原を、スタート地点から目標の物体まで移動した。",
              en: "The bear's shoulder height was 80 cm in the subadult configuration and 160 cm in the adult configuration, matching human eye height in the pseudo-quadrupedal and standing postures. In the pseudo-quadrupedal posture, participants knelt with their back horizontal and hands off the floor. Participants travelled across a virtual grassland from the start point to a target object.",
            })}
          </p>
          <Figure
            src={`${ASSETS}/viewpoint.jpg`}
            width={2000}
            height={581}
            alt={t({
              ja: "サバンナの一人称視点 2 枚。A は立位からで草の上を見渡し、B は疑似四足姿勢からで背の高い草越しに見ている。",
              en: "Two first-person views of a savanna. A, from the standing posture, looks over the grass; B, from the pseudo-quadrupedal posture, looks through tall grass.",
            })}
            caption={t({
              ja: "ユーザーの視点。（A）立位（成獣のクマ）、（B）疑似四足姿勢（亜成獣のクマ）。",
              en: "The user's viewpoint: (A) standing posture (adult bear), and (B) pseudo-quadrupedal posture (subadult bear).",
            })}
          />
          <Figure
            src={`${ASSETS}/course.png`}
            width={628}
            height={194}
            alt={t({ ja: "スタート地点と目標の物体があるバーチャルな草原のコースを横から見た図。", en: "Side view of the virtual grassland course with a start point and a target object." })}
            caption={t({ ja: "バーチャルな草原のコース（横から見た図）。", en: "Side view of the virtual grassland course." })}
          />
        </Section>

        <Section title={t({ ja: "結果", en: "Results" })}>
          <ul className={LIST}>
            <li className="prose-ja">
              {t({
                ja: "疑似四足姿勢と Rowing はどちらも身体所有感と行為主体感を高め、交互作用は見られなかった。",
                en: "Both the pseudo-quadrupedal posture and Rowing enhance body ownership and agency, with no detectable interaction.",
              })}
            </li>
            <li className="prose-ja">
              {t({
                ja: "Quad-Rowing では、自分の速さ・重さ・力強さの感覚がクマ寄りに変わり、「クマになったように感じた」という回答も最も多かった。",
                en: "Quad-Rowing shifted self-perception of speed, weight, and strength toward the bear, and was most often described as “feeling like a bear.”",
              })}
            </li>
            <li className="prose-ja">
              {t({
                ja: "上手さの感覚には姿勢とジェスチャーの交互作用があった。Rowing は立位より疑似四足姿勢で上手に操作できたと評価された（QR > SR、p=.005）。",
                en: "Perceived skill shows a posture–gesture interaction: Rowing is rated more skillful in the pseudo-quadrupedal posture than in standing (QR > SR, p=.005).",
              })}
            </li>
            <li className="prose-ja">
              {t({
                ja: "一方で Rowing は身体的負担・努力・総合的な作業負荷も高める。設計する側が天秤にかけるべきトレードオフである。",
                en: "Rowing also raises physical demand, effort, and overall workload, a trade-off designers must weigh.",
              })}
            </li>
          </ul>
          <Figure
            src={`${ASSETS}/results.jpg`}
            width={2760}
            height={816}
            alt={t({
              ja: "4 条件の箱ひげ図。左は身体所有感・行為主体感・楽しさ・上手さと、自己知覚の 4 項目（1〜7 の尺度）。右は改変した Raw TLX の各次元と総合スコア。",
              en: "Box plots across the four conditions. Left: ownership, agency, enjoyment, skilled, and four perceived self-perception items on a 1 to 7 scale. Right: adapted raw TLX dimensions and overall score.",
            })}
            caption={t({
              ja: "4 条件の質問紙の結果。左は身体化と主観的な体験、右は改変した Raw TLX（表示のため 5 倍に換算）。",
              en: "Questionnaire results across the four conditions. Left: embodiment and subjective experience. Right: adapted raw TLX, rescaled by five for display.",
            })}
          />
          <ResultsTable />
        </Section>

        <Section title={t({ ja: "設計への示唆", en: "Design Implications" })}>
          <ul className={LIST}>
            <li className="prose-ja">
              {t({
                ja: "ユーザーの姿勢をアバターに合わせると、身体所有感・行為主体感・楽しさが高まる。ただし長時間使うなら身体的な負荷を見込んでおく。",
                en: "Align the user's posture with the avatar's to raise body ownership, agency, and enjoyment, but plan for its physical load in extended use.",
              })}
            </li>
            <li className="prose-ja">
              {t({
                ja: "2 つの要因はそれぞれ独立に効くので、疑似四足姿勢がとれない場面では Rowing だけを、Rowing の負担が大きすぎる場面では姿勢だけを使う。",
                en: "Because the two factors contribute independently, use Rowing alone when the pseudo-quadrupedal posture is impractical, or the posture alone when Rowing is too demanding.",
              })}
            </li>
            <li className="prose-ja">
              {t({
                ja: "上達が大事なゲームやトレーニングでは、Rowing と立位の組み合わせは避ける。",
                en: "For games and training, where mastery matters, avoid pairing Rowing with a standing posture.",
              })}
            </li>
            <li className="prose-ja">
              {t({
                ja: "野生動物になりきるような教育的な体験では、疑似四足姿勢と Rowing を組み合わせる。",
                en: "For educational experiences such as wildlife embodiment, combine the pseudo-quadrupedal posture with Rowing.",
              })}
            </li>
          </ul>
        </Section>

        <Section id="bibtex" title="BibTeX">
          <BibTeX />
        </Section>

        <Section title={t({ ja: "謝辞", en: "Acknowledgement" })}>
          <p className="prose-ja">
            {t({
              ja: "本研究は JSPS 科研費 24K20823、およびドイツ連邦研究・技術・宇宙省の資金によるアレクサンダー・フォン・フンボルト財団の助成を受けた。",
              en: "This work was supported by JSPS KAKENHI Grant Number 24K20823 and the Alexander von Humboldt Foundation funded by the German Federal Ministry of Research, Technology and Space.",
            })}
          </p>
        </Section>
      </PageContainer>
    </Still>
  );
}

function Authors() {
  const t = useT();
  return (
    <div className="-mt-6 flex flex-col gap-6">
      <ul className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-5 lg:grid-cols-9">
        {AUTHORS.map((a) => (
          <li key={a.name}>
            <a
              href={`https://orcid.org/${a.orcid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-2 text-center"
            >
              <img
                src={`${ASSETS}/authors/${a.photo}.jpg`}
                width={240}
                height={240}
                alt=""
                decoding="async"
                className="aspect-square w-full max-w-24 rounded-full border border-separator-border object-cover"
              />
              <span lang="en" className="text-body-2-regular text-text-primary underline-offset-2 group-hover:underline">
                {a.name}
                <sup className="ms-0.5 text-text-tertiary">
                  {a.affiliations.join(",")}
                  {a.lastAuthor && "*"}
                </sup>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <ol className="flex flex-col gap-0.5 text-body-2-regular text-text-secondary">
        {AFFILIATIONS.map((name, i) => (
          <li key={name.en}>
            <sup className="me-1 text-text-tertiary">{i + 1}</sup>
            {t(name)}
          </li>
        ))}
        <li>
          <sup className="me-1 text-text-tertiary">*</sup>
          {t({ ja: "この 2 名が共同でラストオーサーを務める。", en: "Both authors share the last authorship." })}
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
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-body-2-regular">
          <caption className="mb-3 text-start text-body-2-regular text-text-tertiary">
            {t({
              ja: "主効果が有意だった指標の周辺平均と、Wilcoxon の符号付き順位検定の p 値。",
              en: "Marginal means and Wilcoxon signed-rank p-values for measures with a significant main effect.",
            })}
          </caption>
          <thead>
            <tr className="border-b border-separator-border text-text-secondary">
              <th scope="col" className="py-2 pe-4 text-start font-semibold">{t({ ja: "指標", en: "Measure" })}</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">{t({ ja: "四足", en: "Quad." })}</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">{t({ ja: "立位", en: "Stand." })}</th>
              <th scope="col" className="px-2 py-2 pe-6 text-end font-semibold">p</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">Row.</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">Swing.</th>
              <th scope="col" className="ps-2 py-2 text-end font-semibold">p</th>
            </tr>
          </thead>
          <tbody className="meta">
            {RESULTS.map((r) => (
              <tr key={r.measure.en} className="border-b border-separator-border">
                <th scope="row" className="py-2 pe-4 text-start font-sans font-normal text-text-primary">{t(r.measure)}</th>
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
      <p className="text-body-2-regular text-text-tertiary">
        {t({
          ja: "四足: 疑似四足姿勢、立位: 立った姿勢、Row.: Rowing、Swing.: Swinging。*: p<.05、**: p<.01、***: p<.001。",
          en: "Quad.: pseudo-quadrupedal, Stand.: standing, Row.: Rowing, Swing.: Swinging. *: p<.05, **: p<.01, ***: p<.001.",
        })}
      </p>
    </div>
  );
}

function BibTeX() {
  const t = useT();
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
          {t({ ja: "BibTeX をコピー", en: "Copy BibTeX" })}
        </Button>
        <span role="status" className="text-body-2-regular text-text-tertiary">
          {copied ? t({ ja: "クリップボードにコピーしました。", en: "Copied to clipboard." }) : ""}
        </span>
      </div>
    </div>
  );
}
