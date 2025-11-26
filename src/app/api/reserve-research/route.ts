import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("reserve-research payload", body);

    const calendarId = process.env.GCAL_CALENDAR_ID || "primary";
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
    if (!accessToken) {
      accessToken = await getAccessTokenFromRequest(req);
    }
    if (accessToken) {
      const formatLocalDateTime = (y: number, m1: number, d: number, h: number, mi: number) => {
        const pad = (n: number) => String(n).padStart(2, "0");
        const date = new Date(y, m1, d, h, mi, 0, 0);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const minute = date.getMinutes();
        return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
      };

      const startLocal = formatLocalDateTime(body.year, body.month - 1, body.day, body.startHour, 0);
      const endLocal = formatLocalDateTime(body.year, body.month - 1, body.day, body.startHour + 1, 0);

      const descriptionLines: string[] = [
        `実験場所: SPLAB 5`,
      ];

      const summaryTitle = `【実験協力】${body.name || "xx"}さん x 棚橋 実験協力`;

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

      const baseEvent: GEvent = {
        summary: summaryTitle,
        description: descriptionLines.join("\n"),
        location: "立命館大学大阪いばらきキャンパス",
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

      const qp = new URLSearchParams({ sendUpdates: "all" });
      const createUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qp.toString()}`;

      const gcalRes = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(baseEvent),
      });

      if (!gcalRes.ok) {
        const errText = await gcalRes.text().catch(() => "");
        try {
          const errJson = JSON.parse(errText);
          const reason = errJson?.error?.errors?.[0]?.reason as string | undefined;
          if (gcalRes.status === 403 && reason === "forbiddenForServiceAccounts") {
            const { summary, description, location, start, end, reminders } = baseEvent;
            const fallbackPayload = { summary, description, location, start, end, reminders };
            const qp2 = new URLSearchParams({ sendUpdates: "none" });
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
              const meetLink = created2?.hangoutLink || (Array.isArray(created2?.conferenceData?.entryPoints)
                ? (created2.conferenceData.entryPoints as Array<{ entryPointType?: string; uri?: string }>).find((e) => e.entryPointType === "video")?.uri
                : undefined);
              return NextResponse.json({ ok: true, eventId: eventId2, htmlLink: created2?.htmlLink, invited: false, meetLink });
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

      try {
        const patchParams = new URLSearchParams({ sendUpdates: "none" });
        const patchBody = {
          description: `${baseEvent.description || ""}${baseEvent.description ? "\n" : ""}EventID: ${eventId}`
        };
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
          return NextResponse.json({ ok: true, eventId, htmlLink: patched?.htmlLink || created?.htmlLink, meetLink: meetLink2 });
        }
      } catch {}

      const meetLink = created?.hangoutLink || (Array.isArray(created?.conferenceData?.entryPoints)
        ? (created.conferenceData.entryPoints as Array<{ entryPointType?: string; uri?: string }>).find((e) => e.entryPointType === "video")?.uri
        : undefined);
      return NextResponse.json({ ok: true, eventId, htmlLink: created?.htmlLink, meetLink });
    } else if (process.env.GCAL_WEBHOOK_URL) {
      // Fallback to webhook
      const webhook = process.env.GCAL_WEBHOOK_URL;
      const pad = (n: number) => String(n).padStart(2, "0");
      const startDate = new Date(body.year, body.month - 1, body.day, body.startHour, 0, 0, 0);
      const endDate = new Date(body.year, body.month - 1, body.day, body.startHour + 1, 0, 0, 0);
      const startLocal = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}T${pad(startDate.getHours())}:${pad(startDate.getMinutes())}:00`;
      const endLocal = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;

      const payload = {
        calendarId,
        ownerEmail: process.env.OWNER_EMAIL || "",
        summary: `【実験協力】${body.name || "xx"}さん x 棚橋 実験協力`,
        description: [
          `実験場所: SPLAB 5`,
        ].join("\n"),
        location: "立命館大学大阪いばらきキャンパス",
        start: { dateTime: startLocal, timeZone: "Asia/Tokyo" },
        end: { dateTime: endLocal, timeZone: "Asia/Tokyo" },
        attendees: body.email ? [{ email: body.email }] : [],
        createMeet: false,
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
        try {
          const json = JSON.parse(text);
          if (json && json.ok === true) {
            return NextResponse.json(json);
          }
          return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
        } catch {
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

async function getAccessTokenFromRequest(req: Request): Promise<string | null> {
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
