/** 記事の OGP（旧 src/feature/articles/types.ts と同じ形） */
export interface ArticleOgp {
  title: string;
  description: string;
  url: string;
  images?: string[];
  tags?: string[];
}
