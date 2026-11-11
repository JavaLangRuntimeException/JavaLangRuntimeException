import { Link, useParams } from "react-router";
import { PageHeader, Panel } from "@/components/Page";
import { ServiceIcon } from "@/components/ServiceIcon";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { articleOf, articles, kindLabel, type Article } from "@/pages/guide/articles";

/** ガイドの一覧（/guide）と、1 つの記事（/guide/:slug） */
export function GuidePage() {
  const { slug } = useParams();
  if (!slug) return <GuideIndex />;
  const article = articleOf(slug);
  if (!article) return <NotFoundPage />;
  return <ArticleView article={article} />;
}

function Badge({ kind }: { kind: Article["kind"] }) {
  return <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-ink-2">{kindLabel[kind]}</span>;
}

function GuideIndex() {
  return (
    <>
      <PageHeader title="ガイド" description="taramanji cloud のしくみと使い方です。はじめての方は「しくみ」から順に読んでください。" />
      <ol className="grid gap-4 md:grid-cols-2">
        {articles.map((a, i) => (
          <li key={a.slug}>
            <Link to={`/guide/${a.slug}`} className="flex h-full gap-4 rounded-xl border border-line bg-surface p-5 hover:border-accent">
              <ServiceIcon id={a.icon} size={36} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{i + 1}</span>
                  <Badge kind={a.kind} />
                  <span className="text-xs text-muted">{a.minutes} 分</span>
                </span>
                <span className="mt-1 block text-base font-bold text-accent">{a.title}</span>
                <span className="mt-1 block text-ink-2">{a.summary}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}

function ArticleView({ article }: { article: Article }) {
  const i = articles.indexOf(article);
  const prev = articles[i - 1];
  const next = articles[i + 1];
  return (
    <>
      <nav aria-label="ガイド" className="mb-2 text-[13px]">
        <Link to="/guide" className="text-accent hover:underline">
          ガイドの一覧
        </Link>
      </nav>
      <PageHeader
        title={article.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge kind={article.kind} />
            <span className="text-muted">{article.minutes} 分</span>
            <span>{article.summary}</span>
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <Panel className="min-w-0">
          <article className="px-6 py-6 md:px-8">{article.body()}</article>
        </Panel>
        <aside className="order-first lg:order-last">
          <nav aria-label="このページの見出し" className="rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4">
            <p className="mb-2 text-xs font-semibold text-muted">このページ</p>
            <ul className="space-y-1.5 text-[13px]">
              {article.toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-ink-2 hover:text-accent hover:underline">
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
      <nav aria-label="前後の記事" className="mt-6 grid gap-4 sm:grid-cols-2">
        {prev ? (
          <Link to={`/guide/${prev.slug}`} className="rounded-xl border border-line bg-surface p-4 hover:border-accent">
            <span className="block text-xs text-muted">前へ</span>
            <span className="font-semibold text-accent">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/guide/${next.slug}`} className="rounded-xl border border-line bg-surface p-4 text-right hover:border-accent">
            <span className="block text-xs text-muted">次へ</span>
            <span className="font-semibold text-accent">{next.title}</span>
          </Link>
        )}
      </nav>
    </>
  );
}
