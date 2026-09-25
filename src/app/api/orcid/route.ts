import {NextResponse} from 'next/server';
import type {OrcidWork} from '../../../feature/orcid/model';

const ORCID_ID = '0009-0005-4751-648X';
const ORCID_API = `https://pub.orcid.org/v3.0/${ORCID_ID}`;

interface OrcidValue<T = string> {
    value: T;
}

interface OrcidExternalId {
    'external-id-type': string;
    'external-id-value': string;
    'external-id-url': OrcidValue | null;
}

interface OrcidWorkSummary {
    'put-code': number;
    title: { title: OrcidValue | null } | null;
    'external-ids': { 'external-id': OrcidExternalId[] } | null;
    url: OrcidValue | null;
    type: string;
    'publication-date': {
        year: OrcidValue | null;
        month: OrcidValue | null;
        day: OrcidValue | null;
    } | null;
    'journal-title': OrcidValue | null;
}

interface OrcidContributor {
    'contributor-orcid': { path: string } | null;
    'credit-name': OrcidValue | null;
}

interface OrcidWorkDetail {
    'put-code': number;
    contributors: { contributor: OrcidContributor[] } | null;
}

const orcidFetch = async <T, >(path: string): Promise<T> => {
    const response = await fetch(`${ORCID_API}${path}`, {
        headers: {Accept: 'application/json'},
        next: {revalidate: 3600},
    });
    if (!response.ok) {
        throw new Error(`ORCID API error: ${response.status}`);
    }
    return response.json();
};

export async function GET() {
    try {
        const works = await orcidFetch<{ group: Array<{ 'work-summary': OrcidWorkSummary[] }> }>('/works');

        // 同じ論文が複数ソースから登録されている場合は1件にまとめる（先頭が優先表示のもの）
        const groups = works.group.map(g => g['work-summary']).filter(s => s.length > 0);

        // 著者情報はサマリーに含まれないため、詳細をまとめて取得
        const putCodes = groups.flat().map(s => s['put-code']);
        const details = new Map<number, OrcidWorkDetail>();
        for (let i = 0; i < putCodes.length; i += 100) {
            const bulk = await orcidFetch<{ bulk: Array<{ work?: OrcidWorkDetail }> }>(
                `/works/${putCodes.slice(i, i + 100).join(',')}`
            );
            bulk.bulk.forEach(b => b.work && details.set(b.work['put-code'], b.work));
        }

        const result: OrcidWork[] = groups.map(summaries => {
            const primary = summaries[0];
            const pick = <T, >(get: (s: OrcidWorkSummary) => T | null | undefined) =>
                summaries.map(get).find(v => v) ?? null;

            const date = primary['publication-date'];
            const doi = pick(s => s['external-ids']?.['external-id']
                .find(id => id['external-id-type'] === 'doi')?.['external-id-value']);

            const authors = summaries
                .map(s => details.get(s['put-code'])?.contributors?.contributor ?? [])
                .reduce((a, b) => (b.length > a.length ? b : a), [] as OrcidContributor[])
                .map(c => c['credit-name']?.value)
                .filter((name): name is string => !!name);

            return {
                putCode: primary['put-code'],
                title: pick(s => s.title?.title?.value) ?? '',
                type: primary.type,
                venue: pick(s => s['journal-title']?.value) ?? '',
                date: [date?.year?.value, date?.month?.value, date?.day?.value].filter(Boolean).join('-'),
                doi,
                url: doi ? `https://doi.org/${doi}` : pick(s => s.url?.value),
                authors,
            };
        }).filter(w => w.title);

        // 新しい順
        result.sort((a, b) => b.date.localeCompare(a.date));

        return NextResponse.json({orcidId: ORCID_ID, works: result});
    } catch (error) {
        console.error('Error fetching ORCID works:', error);
        return NextResponse.json({orcidId: ORCID_ID, works: []}, {status: 500});
    }
}
