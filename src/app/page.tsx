"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

/**
 * マウスホバーでカードが回転し、背景にパララックス効果をかけるサンプル。
 * Next.jsやルーティングが不要なシンプルな単一Reactコンポーネントです。
 * TailwindCSSでの実装を想定しています。
 *
 * カードが初期から裏面で表示される問題を解消するために、
 * 「カードのコンテナ(.card-inner)をホバー時に回転させる」実装に変更しています。
 */

export default function PortfolioLinks() {
  const [scrollY, setScrollY] = useState(0);

  // スクロールでパララックス用の値を更新
  useEffect(() => {
    function handleScroll() {
      setScrollY(window.scrollY || window.pageYOffset);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 背景とカードデータ（画像URLをpicsum.photosに変更）
  const backgroundImageUrl = "https://picsum.photos/id/21/1920/1080";
  const CARD_DATA = [
    {
      href: "/portfolio",
      imgSrc: "https://picsum.photos/id/10/400/180",
      title: "ポートフォリオ",
      description: "今は開発中なので同じページが開きます(ごめんね)",
      backText:
          "よくぞエラーの名のユーザーのページを見つけました！JavaLangRuntimeExceptionの対処法を調べたユーザーはいますか？",
    },
    {
      href: "https://twitter.com/javalangruntime",
      imgSrc: "https://picsum.photos/id/1015/400/180",
      title: "X (Twitter)",
      description: "@JavaLangRuntime",
      backText: "なぜJavaの実行時のエラーにしたか？",
    },
    {
      href: "https://mixi.social/@JavaLangRuntime",
      imgSrc: "https://picsum.photos/id/29/400/180",
      title: "MiXi2",
      description: "@JavaLangRuntime",
      backText:
          "それは私が一番みたエラーだからです(本音はJavaLangRuntimeExceptionを調べたエンジニアがこのサイトに来る誘導...?)",
    },
    {
      href: "https://github.com/javalangruntimeexception",
      imgSrc: "https://picsum.photos/id/1025/400/180",
      title: "GitHub",
      description: "@JavaLangRuntimeException",
      backText: "実はJavaLangRuntimeExceptionは結構な種類があるよ！",
    },
    {
      href: "https://atcoder.jp/users/javalangruntimee",
      imgSrc: "https://picsum.photos/id/1032/400/180",
      title: "AtCoder",
      description: "@javalangruntimee",
      backText: "有名なものだとjava.lang.ArithmeticExceptionとか!",
    },
    {
      href: "/blogs",
      imgSrc: "https://picsum.photos/id/505/400/180",
      title: "Qiita",
      description: "@JavaLangRuntimeException",
      backText: "java.lang.ArithmeticExceptionは0除算の時にスローされるクラスです",
    },
    {
      href: "https://speakerdeck.com/javalangruntimeexception",
      imgSrc: "https://picsum.photos/id/12/400/180",
      title: "Speaker Deck",
      description: "@JavaLangRuntimeException",
      backText:
          "本来であればもっと有名なjava.lang.NullPointerExceptionにしたかったです...",
    },
    {
      href: "https://teratail.com/users/JavaLangRuntime",
      imgSrc: "https://picsum.photos/id/1056/400/180",
      title: "Teratail",
      description: "@JavaLangRuntime",
      backText:
          "もう使われていたユーザであったことや長すぎて入らなかったので没にしました",
    },
    {
      href: "https://stackoverflow.com/users/26359061/javalangruntimeexception",
      imgSrc: "https://picsum.photos/id/1018/400/180",
      title: "Stack Overflow",
      description: "@JavaLangRuntimeException",
      backText: "某T〇〇TT〇〇の文字数制限許すまじ",
    },
    {
      href: "mailto:tarakokko3233@gmail.com",
      imgSrc: "https://picsum.photos/id/1037/400/180",
      title: "Email",
      description: "tarakokko3233@gmail.com",
      backText:
          "ここまで読んでくれてありがとう！エラーはお友達ということです！これであなたもお友達です!!!(スパムはやめてね)",
    },
  ];

  return (
      <div
          className="relative min-h-screen overflow-hidden text-white"
          style={{
            // 背景画像をstyleで適用
            backgroundImage: `url(${backgroundImageUrl})`,
            backgroundAttachment: "fixed",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
      >
        {/* パララックス用レイヤー（ずらして表示） */}
        <div
            className="absolute inset-0"
            style={{
              transform: `translateY(${scrollY * 0.5}px)`,
            }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
          <h1
              className="
            text-center text-3xl sm:text-4xl md:text-5xl font-bold mb-6
            animate-fadeUp
          "
              style={{ animationDelay: "0.2s" }}
          >
            taramanji (JavaLangRuntimeException)
          </h1>
          <h2
              className="
            text-center text-xl sm:text-2xl md:text-3xl mb-12
            animate-fadeUp
          "
              style={{ animationDelay: "0.4s" }}
          >
            ポートフォリオリンク集
          </h2>

          {/* カード一覧 */}
          <div
              className="
            grid gap-6
            sm:grid-cols-2
            lg:grid-cols-3
          "
          >
            {CARD_DATA.map((item, idx) => (
                <a
                    key={idx}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="
                block
                h-80
                [perspective:1000px]
                animate-fadeUp
                no-underline
              "
                    style={{ animationDelay: idx % 2 === 0 ? "0.6s" : "0.8s" }}
                >
                  {/* カード全体をまとめるラッパ */}
                  <div
                      className="
                  relative
                  w-full
                  h-full
                  transition-transform
                  duration-700
                  [transform-style:preserve-3d]
                  group
                  hover:[transform:rotateY(180deg)]
                "
                  >
                    {/* 表面 */}
                    <div
                        className="
                    absolute
                    inset-0
                    bg-white/90
                    text-black
                    rounded-md
                    overflow-hidden
                    [backface-visibility:hidden]
                  "
                        style={{ transform: "rotateY(0deg)" }}
                    >
                      <Image
                          src={item.imgSrc}
                          alt={item.title}
                          width={400}  // 幅を指定
                          height={180} // 高さを指定
                          className="
                      w-full
                      h-44
                      object-cover
                      transition-transform
                      duration-300
                      group-hover:scale-110
                    "
                      />
                      <div className="p-4">
                        <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                        <p className="text-sm">{item.description}</p>
                      </div>
                    </div>

                    {/* 裏面 */}
                    <div
                        className="
                    absolute
                    inset-0
                    bg-zinc-800/90
                    text-white
                    rounded-md
                    flex
                    items-center
                    justify-center
                    p-6
                    text-center
                    [transform:rotateY(180deg)]
                    [backface-visibility:hidden]
                  "
                    >
                      <p className="text-sm whitespace-pre-line">{item.backText}</p>
                    </div>
                  </div>
                </a>
            ))}
          </div>
        </div>
      </div>
  );
}