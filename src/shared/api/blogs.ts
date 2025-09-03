export async function apiFetchQiita(page: number, isInitial: boolean) {
  const params = new URLSearchParams({ page: String(page) });
  if (isInitial) params.set("initial", "1");
  const res = await fetch(`/api/qiita?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Qiita API failed");
  const json = await res.json();
  return json.urls as string[];
}

export async function apiFetchMultipleOgp(urls: string[]) {
  const res = await fetch(`/api/ogp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error("OGP API failed");
  const json = await res.json();
  return json.data as Array<{ title?: string; description?: string; url?: string; images?: string[] }>;
}


