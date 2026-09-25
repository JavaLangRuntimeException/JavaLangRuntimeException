export interface OrcidWork {
    putCode: number;
    title: string;
    type: string;
    venue: string;
    date: string;
    doi: string | null;
    url: string | null;
    authors: string[];
}

export const ORCID_SELF_NAME = "Shuta Tanahashi";

export const ORCID_WORK_TYPE_LABELS: Record<string, string> = {
    "conference-paper": "Conference Paper",
    "conference-abstract": "Conference Abstract",
    "conference-poster": "Poster",
    "journal-article": "Journal Article",
    "preprint": "Preprint",
    "book-chapter": "Book Chapter",
    "dissertation-thesis": "Thesis",
};
