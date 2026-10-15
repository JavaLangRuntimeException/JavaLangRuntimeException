import { useState, type ElementType, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { DecodeReveal, DecodeText, Reveal, Rule } from "./motion";

// サイト全体の見た目の基本。暗い面 + アクセント 1 色。区切りは細い線と余白、見出しは文字の大きさで見せる
// （カードで何でも囲まない・飾りのアイコンを付けない）

export function PageContainer({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "narrow" | "wide" }) {
  return (
    <main
      className={cx(
        "mx-auto w-full px-4 pb-20 pt-10 sm:px-6",
        width === "narrow" && "max-w-3xl",
        width === "default" && "max-w-5xl",
        width === "wide" && "max-w-6xl",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  // 見出しが出終わってから、下の線と説明を出す（見出しが文字でないときは画面に入ったら）
  const decoded = typeof title === "string";
  const [titleShown, setTitleShown] = useState(false);
  const after = decoded ? titleShown : undefined;
  return (
    <header className="mb-12 flex flex-col gap-5 pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-3">
        {eyebrow && (
          <Reveal y={6}>
            <p className="meta tracking-[0.08em] text-accent-300">{eyebrow}</p>
          </Reveal>
        )}
        <h1 className="text-[2rem] font-semibold leading-[1.25] tracking-[-0.01em] text-text-primary sm:text-[2.5rem]">
          {decoded ? <DecodeText text={title} delay={80} onShown={() => setTitleShown(true)} /> : title}
        </h1>
        <Rule className="w-16 bg-accent-400" show={after} />
        {description && (
          <DecodeReveal show={after} delay={0.1}>
            <div className="prose-ja max-w-2xl">{description}</div>
          </DecodeReveal>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, actions, children, className, id }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  // スクロールで見出しが出終わってから、説明と中身の文字を順に記号から定めて出す（見出しが文字でないときは画面に入ったら）
  const decoded = typeof title === "string";
  const [titleShown, setTitleShown] = useState(false);
  const after = decoded ? titleShown : undefined;
  return (
    <section id={id} className={cx("group/section relative flex flex-col gap-6 py-12", className)}>
      {/* 区切りの線は、画面に入ると左から伸びる（先頭だけアクセント色。入り口の演出の線と同じ） */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 group-first/section:hidden">
        <Rule className="bg-separator-border" duration={1.1} />
        <Rule className="absolute start-0 top-0 w-12 bg-accent-400" delay={0.1} duration={0.6} />
      </div>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            {title && (
              <h2 className="text-[1.375rem] font-semibold leading-snug tracking-[-0.005em] text-text-primary">
                {decoded ? <DecodeText text={title} delay={150} onShown={() => setTitleShown(true)} /> : title}
              </h2>
            )}
            {description && (
              <DecodeReveal show={after}>
                <p className="prose-ja">{description}</p>
              </DecodeReveal>
            )}
          </div>
          {actions}
        </div>
      )}
      <DecodeReveal show={after} delay={description ? 0.18 : 0.06}>
        <div className="flex flex-col gap-6">{children}</div>
      </DecodeReveal>
    </section>
  );
}

export function Card<T extends ElementType = "div">({ as, children, className, interactive, ...rest }: { as?: T; children: ReactNode; className?: string; interactive?: boolean } & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children" | "className">) {
  const Comp = (as ?? "div") as ElementType;
  return (
    <Comp
      className={cx(
        "rounded-xl border border-separator-border bg-background-primary-default p-5",
        interactive && "lift hover:border-border-button-hover hover:bg-background-primary-hover outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** 読み込み中のプレースホルダー（点滅しない静かな面） */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-xl bg-background-secondary-default motion-reduce:animate-none", className)} />;
}
