import { NextResponse } from "next/server";

// NOTE: Use external webhook (e.g., Google Apps Script) to create Google Calendar events
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("reserve payload", body);

    const calendarId = process.env.GCAL_CALENDAR_ID || "primary";
    // Prefer Service Account if configured
    let accessToken: string | null = null;
    let saJson;
    const saJsonB64 = process.env.GCAL_SA_JSON_BASE64;
    if (saJsonB64) {
      try {
        saJson = Buffer.from(saJsonB64, "base64").toString("utf8");
      } catch {}
    }
    if (saJson) {
      try {
        const parsed = JSON.parse(saJson);
        const emailFromJson: string | undefined = parsed.client_email;
        const keyFromJson: string | undefined = parsed.private_key;
        if (emailFromJson && keyFromJson) {
          accessToken = await getServiceAccountAccessToken(emailFromJson, String(keyFromJson));
        }
      } catch {}
    }
    // Note: GCAL_SA_CLIENT_EMAIL / GCAL_SA_PRIVATE_KEY fallback removed by request.
    // Fallback to user OAuth token (cookie / refresh token)
    if (!accessToken) {
      accessToken = await getAccessTokenFromRequest(req);
    }
    if (accessToken) {
        // Enforce 2-hour lead time on server
        try {
          const startDate = new Date(
            body.year,
            body.month - 1,
            body.day,
            body.start?.hour,
            body.start?.minute,
            0,
            0
          );
          const now = Date.now();
          const minStart = now + 2 * 60 * 60 * 1000;
          if (startDate.getTime() < minStart) {
            return NextResponse.json({ ok: false, error: "lead_time_violation", message: "予約は現在から2時間後以降のみ可能です" }, { status: 400 });
          }
        } catch {}
        const formatLocalDateTime = (y: number, m1: number, d: number, h: number, mi: number) => {
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${y}-${pad(m1 + 1)}-${pad(d)}T${pad(h)}:${pad(mi)}:00`;
        };
        const startLocal = formatLocalDateTime(body.year, body.month - 1, body.day, body.start.hour, body.start.minute);
        const endLocal = formatLocalDateTime(body.year, body.month - 1, body.day, body.end.hour, body.end.minute);

        type GEvent = {
          summary: string;
          description?: string;
          location?: string;
          start: { dateTime: string; timeZone: string };
          end: { dateTime: string; timeZone: string };
          attendees?: Array<{ email: string }>;
          reminders?: { useDefault: boolean; overrides: Array<{ method: string; minutes: number }> };
          conferenceData?: unknown;
        };

        const wantMeet = String(body.contactMethod || "").toLowerCase() === "meet";
        const descriptionLines: string[] = [
          `目的: ${body.purpose}`,
        ];
        if (body.meetingNote) descriptionLines.push(`ご相談詳細(任意): ${body.meetingNote}`);
        const contactMethod = String(body.contactMethod || "");
        if (contactMethod) descriptionLines.push(`連絡手段: ${contactMethod}`);
        if (body.discordName) descriptionLines.push(`Discord名: ${body.discordName}`);
        if (body.discordServer) descriptionLines.push(`Discordサーバー: ${body.discordServer}`);
        if (body.slackName) descriptionLines.push(`Slack名: ${body.slackName}`);
        if (body.slackWorkspace) descriptionLines.push(`Slackワークスペース: ${body.slackWorkspace}`);
        if (body.otherNote) descriptionLines.push(`備考: ${body.otherNote}`);

        const summaryTitle = String(body.purpose) === "STECH" ? `STECH面談_${body.name || "ゲスト"}さん` : `TS+面談_${body.name || "ゲスト"}さん`;
        const baseEvent: GEvent = {
          summary: summaryTitle,
          description: descriptionLines.join("\n"),
          location: body.location || "",
          start: { dateTime: startLocal, timeZone: "Asia/Tokyo" },
          end: { dateTime: endLocal, timeZone: "Asia/Tokyo" },
          attendees: body.email ? [{ email: body.email }] : [],
          reminders: {
            useDefault: false,
            overrides: [
              { method: "email", minutes: 24 * 60 },
              { method: "popup", minutes: 10 },
            ],
          },
        };
        const payload: GEvent = wantMeet
          ? {
              ...baseEvent,
              conferenceData: {
                createRequest: {
                  requestId: `req-${Date.now()}`,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            }
          : baseEvent;

        const qp = new URLSearchParams({ sendUpdates: "all" });
        if (wantMeet) qp.set("conferenceDataVersion", "1");
        const createUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qp.toString()}`;

        const gcalRes = await fetch(createUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!gcalRes.ok) {
          const errText = await gcalRes.text().catch(() => "");
          // Fallback: service accounts cannot invite attendees without DWD
          try {
            const errJson = JSON.parse(errText);
            const reason = errJson?.error?.errors?.[0]?.reason as string | undefined;
            if (gcalRes.status === 403 && reason === "forbiddenForServiceAccounts") {
              const { summary, description, location, start, end, reminders, conferenceData } = payload as GEvent & { conferenceData?: unknown };
              const fallbackPayload: Omit<GEvent, 'attendees'> = { summary, description, location, start, end, reminders, ...(conferenceData ? { conferenceData } : {}) };
              const qp2 = new URLSearchParams({ sendUpdates: "none" });
              if (wantMeet) qp2.set("conferenceDataVersion", "1");
              const res2 = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qp2.toString()}`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(fallbackPayload),
              });
              if (res2.ok) {
                const created2 = (await res2.json().catch(() => ({}))) as {
                  id?: string;
                  htmlLink?: string;
                  hangoutLink?: string;
                  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
                };
                const eventId2 = created2?.id || "";
                // PATCH to append EventID to description, and ensure Meet link exists if requested
                try {
                  const patchParams = new URLSearchParams({ sendUpdates: "none" });
                  if (wantMeet) patchParams.set("conferenceDataVersion", "1");
                  const patchBody: { description: string; conferenceData?: { createRequest: { requestId: string; conferenceSolutionKey: { type: string } } } } = { description: `${description || ""}${description ? "\n" : ""}EventID: ${eventId2}` };
                  if (wantMeet && !created2?.hangoutLink) {
                    patchBody.conferenceData = {
                      createRequest: {
                        requestId: `req-${Date.now()}`,
                        conferenceSolutionKey: { type: "hangoutsMeet" },
                      },
                    };
                  }
                  const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId2)}?${patchParams.toString()}`, {
                    method: "PATCH",
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(patchBody),
                  });
                  if (patchRes.ok) {
                    const patched = (await patchRes.json().catch(() => ({}))) as {
                      id?: string;
                      htmlLink?: string;
                      hangoutLink?: string;
                      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
                    };
                    const meetLink2 = patched?.hangoutLink || (Array.isArray(patched?.conferenceData?.entryPoints)
                      ? (patched.conferenceData.entryPoints as Array<{ entryPointType?: string; uri?: string }>).find((e) => e.entryPointType === "video")?.uri
                      : undefined);
                    return NextResponse.json({ ok: true, eventId: eventId2, htmlLink: patched?.htmlLink || created2?.htmlLink, invited: false, meetLink: meetLink2, note: "Service Accountでのゲスト招待は未対応のため、出席者は追加されていません。" });
                  }
                } catch {}
                const meetLink = created2?.hangoutLink || (Array.isArray(created2?.conferenceData?.entryPoints)
                  ? (created2.conferenceData.entryPoints as Array<{ entryPointType?: string; uri?: string }>).find((e) => e.entryPointType === "video")?.uri
                  : undefined);
                return NextResponse.json({ ok: true, eventId: eventId2, htmlLink: created2?.htmlLink, invited: false, meetLink, note: "Service Accountでのゲスト招待は未対応のため、出席者は追加されていません。" });
              }
            }
          } catch {}
          console.error("Google Calendar insert failed", gcalRes.status, errText);
          return NextResponse.json({ ok: false, error: "google_insert_failed", status: gcalRes.status, detail: errText }, { status: 502 });
        }
        const created = (await gcalRes.json().catch(() => ({}))) as {
          id?: string;
          htmlLink?: string;
          hangoutLink?: string;
          conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
        };
        const eventId = created?.id || "";
        // PATCH to append EventID, and ensure Meet link exists if requested but missing
        try {
          const patchParams = new URLSearchParams({ sendUpdates: "none" });
          if (wantMeet) patchParams.set("conferenceDataVersion", "1");
          const patchBody: { description: string; conferenceData?: { createRequest: { requestId: string; conferenceSolutionKey: { type: string } } } } = { description: `${baseEvent.description || ""}${baseEvent.description ? "\n" : ""}EventID: ${eventId}` };
          if (wantMeet && !created?.hangoutLink) {
            patchBody.conferenceData = {
              createRequest: {
                requestId: `req-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            };
          }
          const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${patchParams.toString()}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(patchBody),
          });
          if (patchRes.ok) {
            const patched = (await patchRes.json().catch(() => ({}))) as {
              htmlLink?: string;
              hangoutLink?: string;
              conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
            };
            const meetLink2 = patched?.hangoutLink || (Array.isArray(patched?.conferenceData?.entryPoints)
              ? (patched.conferenceData.entryPoints as Array<{ entryPointType?: string; uri?: string }>).find((e) => e.entryPointType === "video")?.uri
              : undefined);
            return NextResponse.json({ ok: true, eventId, htmlLink: patched?.htmlLink || created?.htmlLink, invited: !!(baseEvent.attendees && baseEvent.attendees.length), meetLink: meetLink2 });
          }
        } catch {}
        const meetLink = created?.hangoutLink || (Array.isArray(created?.conferenceData?.entryPoints)
          ? (created.conferenceData.entryPoints as Array<{ entryPointType?: string; uri?: string }>).find((e) => e.entryPointType === "video")?.uri
          : undefined);
        return NextResponse.json({ ok: true, eventId, htmlLink: created?.htmlLink, invited: !!(baseEvent.attendees && baseEvent.attendees.length), meetLink });
    } else if (process.env.GCAL_WEBHOOK_URL) {
      const webhook = process.env.GCAL_WEBHOOK_URL;
      const pad = (n: number) => String(n).padStart(2, "0");
      const startLocal = `${body.year}-${pad(body.month)}-${pad(body.day)}T${pad(body.start.hour)}:${pad(body.start.minute)}:00`;
      const endLocal = `${body.year}-${pad(body.month)}-${pad(body.day)}T${pad(body.end.hour)}:${pad(body.end.minute)}:00`;

      const purpose = String(body.purpose || "");
      const baseName = body.name || "ゲスト";
      const summaryTitleWebhook =
        purpose === "TechSelect+" ? `TS+面談_${baseName}さんx棚橋(taramanji)` :
        purpose === "開発委託/相談" ? `開発に関するご相談_${baseName}さんx棚橋(taramanji)` :
        purpose === "STECH"      ? `STECHご相談_${baseName}さんx棚橋(taramanji)` :
        purpose === "RM2C"       ? `RM2Cご相談_${baseName}さんx棚橋(taramanji)` :
        purpose === "JINEN"      ? `コミュニティやイベントに関するご相談(JINEN)_${baseName}さんx棚橋(taramanji)` :
        purpose === "NxTEND"     ? `NxTENDご相談_${baseName}さんx棚橋(taramanji)` :
        purpose === "RCC"        ? `RCCご相談_${baseName}さんx棚橋(taramanji)` :
        purpose === "その他"        ? `ご相談_${baseName}さんx棚橋(taramanji)` :
        `ご相談_${baseName}さん`;

      const payload = {
        calendarId,
        ownerEmail: "tanahashishuta@gmail.com",
        summary: summaryTitleWebhook,
        description: [
          `目的: ${body.purpose}`,
          body.meetingNote ? `ご相談詳細(任意): ${body.meetingNote}` : undefined,
          body.contactMethod ? `連絡手段: ${body.contactMethod}` : undefined,
          body.discordName ? `Discord名: ${body.discordName}` : undefined,
          body.slackName ? `Slack名: ${body.slackName}` : undefined,
          body.otherNote ? `備考: ${body.otherNote}` : undefined,
        ].filter(Boolean).join("\n"),
        start: { dateTime: startLocal, timeZone: "Asia/Tokyo" },
        end: { dateTime: endLocal, timeZone: "Asia/Tokyo" },
        attendees: body.email ? [{ email: body.email }] : [],
        // Ask webhook to create Meet as well when contact is meet
        contactMethod: body.contactMethod,
        createMeet: String(body.contactMethod || "").toLowerCase() === "meet",
      };
      try {
        const hookRes = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await hookRes.text().catch(() => "");
        if (!hookRes.ok) {
          return NextResponse.json({ ok: false, error: "webhook_failed", status: hookRes.status, detail: text }, { status: 502 });
        }
        // Try to parse Apps Script response and forward it
        try {
          const json = JSON.parse(text);
          if (json && json.ok === true) {
            return NextResponse.json(json);
          }
          return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
        } catch {
          // If not JSON, still return raw text
          return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: text }, { status: 502 });
        }
      } catch (e) {
        console.warn("GCAL webhook failed", e);
        return NextResponse.json({ ok: false, error: "webhook_error" }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: false, error: "no_token" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const eventId = body.eventId || url.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ ok: false, error: "missing_event_id" }, { status: 400 });
    }

    const calendarId = process.env.GCAL_CALENDAR_ID || "primary";

    // Prefer Service Account / OAuth
    let accessToken: string | null = null;
    let saJson: string | undefined;
    const saJsonB64 = process.env.GCAL_SA_JSON_BASE64;
    if (saJsonB64) {
      try {
        saJson = Buffer.from(saJsonB64, "base64").toString("utf8");
      } catch {}
    }
    if (saJson) {
      try {
        const parsed = JSON.parse(saJson);
        const emailFromJson: string | undefined = parsed.client_email;
        const keyFromJson: string | undefined = parsed.private_key;
        if (emailFromJson && keyFromJson) {
          accessToken = await getServiceAccountAccessToken(emailFromJson, String(keyFromJson));
        }
      } catch {}
    }
    if (!accessToken) {
      accessToken = await getAccessTokenFromRequest(req);
    }

    if (accessToken) {
      const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (delRes.ok || delRes.status === 404) {
        // Treat 404 as idempotent success
        return NextResponse.json({ ok: true, deleted: delRes.status !== 404 });
      }
      const text = await delRes.text().catch(() => "");
      // Try webhook fallback if configured
      if (process.env.GCAL_WEBHOOK_URL) {
        try {
          const hookRes = await fetch(process.env.GCAL_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", calendarId, eventId }),
          });
          const hookText = await hookRes.text().catch(() => "");
          if (!hookRes.ok) return NextResponse.json({ ok: false, error: "webhook_failed", status: hookRes.status, detail: hookText }, { status: 502 });
          try {
            const json = JSON.parse(hookText);
            if (json && json.ok === true) return NextResponse.json(json);
            return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
          } catch {
            return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: hookText }, { status: 502 });
          }
        } catch {
          return NextResponse.json({ ok: false, error: "webhook_error" }, { status: 502 });
        }
      }
      return NextResponse.json({ ok: false, error: "google_delete_failed", status: delRes.status, detail: text }, { status: 502 });
    } else if (process.env.GCAL_WEBHOOK_URL) {
      try {
        const hookRes = await fetch(process.env.GCAL_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", calendarId, eventId }),
        });
        const text = await hookRes.text().catch(() => "");
        if (!hookRes.ok) return NextResponse.json({ ok: false, error: "webhook_failed", status: hookRes.status, detail: text }, { status: 502 });
        try {
          const json = JSON.parse(text);
          if (json && json.ok === true) return NextResponse.json(json);
          return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
        } catch {
          return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: text }, { status: 502 });
        }
      } catch {
        return NextResponse.json({ ok: false, error: "webhook_error" }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: false, error: "no_token" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get("eventId");
    if (!eventId) return NextResponse.json({ ok: false, error: "missing_event_id" }, { status: 400 });

    const calendarId = process.env.GCAL_CALENDAR_ID || "primary";

    // Acquire token
    let accessToken: string | null = null;
    let saJson: string | undefined;
    const saJsonB64 = process.env.GCAL_SA_JSON_BASE64;
    if (saJsonB64) {
      try { saJson = Buffer.from(saJsonB64, "base64").toString("utf8"); } catch {}
    }
    if (saJson) {
      try {
        const parsed = JSON.parse(saJson);
        const emailFromJson: string | undefined = parsed.client_email;
        const keyFromJson: string | undefined = parsed.private_key;
        if (emailFromJson && keyFromJson) accessToken = await getServiceAccountAccessToken(emailFromJson, String(keyFromJson));
      } catch {}
    }
    if (!accessToken) accessToken = await getAccessTokenFromRequest(req);
    if (!accessToken) {
      // Fallback to webhook if available
      if (process.env.GCAL_WEBHOOK_URL) {
        try {
          const hookRes = await fetch(process.env.GCAL_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get", calendarId, eventId }),
          });
          const hookText = await hookRes.text().catch(() => "");
          if (!hookRes.ok) return NextResponse.json({ ok: false, error: "webhook_failed", status: hookRes.status, detail: hookText }, { status: 502 });
          try {
            const json = JSON.parse(hookText) as { ok?: boolean; eventId?: string; htmlLink?: string; meetLink?: string };
            if (json && json.ok === true) return NextResponse.json(json);
            return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
          } catch {
            return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: hookText }, { status: 502 });
          }
        } catch {
          return NextResponse.json({ ok: false, error: "webhook_error" }, { status: 502 });
        }
      }
      return NextResponse.json({ ok: false, error: "no_token" }, { status: 401 });
    }

    const evRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await evRes.text().catch(() => "");
    if (!evRes.ok) return NextResponse.json({ ok: false, error: "google_get_failed", status: evRes.status, detail: text }, { status: 502 });
    try {
      const event = JSON.parse(text) as {
        id?: string;
        htmlLink?: string;
        hangoutLink?: string;
        conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
      };
      const meetLink = event?.hangoutLink || (Array.isArray(event?.conferenceData?.entryPoints)
        ? (event.conferenceData.entryPoints as Array<{ entryPointType?: string; uri?: string }>).find((e) => e.entryPointType === "video")?.uri
        : undefined);
      return NextResponse.json({ ok: true, eventId: event?.id, htmlLink: event?.htmlLink, meetLink });
    } catch {
      return NextResponse.json({ ok: false, error: "parse_failed", detail: text }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

async function getAccessTokenFromRequest(req: Request): Promise<string | null> {
  // try cookie access token first
  const cookiesHeader = req.headers.get("cookie") || "";
  const cookiePairs = cookiesHeader
    .split(/;\s*/)
    .map((c) => c.split("=") as [string, string])
    .filter((a) => a.length === 2)
    .map(([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)] as [string, string]);
  const cookieMap = Object.fromEntries(cookiePairs) as Record<string, string>;

  const accessToken = cookieMap["gcal_access_token"];
  const exp = Number(cookieMap["gcal_token_exp"] || 0);
  if (accessToken && Date.now() < exp - 60_000) return accessToken;

  // refresh via cookie refresh token or env refresh token
  const refreshToken = cookieMap["gcal_refresh_token"] || process.env.GOOGLE_REFRESH_TOKEN || "";
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!refreshToken || !clientId || !clientSecret) return null;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokens: { access_token?: string } = await tokenRes.json();
    return tokens.access_token || null;
  } catch {
    return null;
  }
}

async function getServiceAccountAccessToken(clientEmail: string, privateKey: string, subject?: string): Promise<string | null> {
  try {
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      ...(subject ? { sub: subject } : {}),
    } as Record<string, string | number>;

    const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsigned = `${enc(header)}.${enc(claim)}`;
    const crypto = await import("node:crypto");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(privateKey).toString("base64url");
    const assertion = `${unsigned}.${signature}`;

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!resp.ok) return null;
    const data: { access_token?: string } = await resp.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}


