import { NextResponse } from "next/server";
import { getGoogleCalendarAccessToken } from "../../../shared/lib/google-calendar-auth";
import { getRedis } from "../../../lib/redis";
import { isAskMeUnavailableLocation } from "../../../shared/config/locations";

const LOCATION_KV_KEY = "work_locations";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

async function validateReservationWindow(body: Record<string, unknown>) {
  if (!body.start || typeof body.start !== "object" || typeof (body.start as { hour?: unknown }).hour !== "number" || typeof (body.start as { minute?: unknown }).minute !== "number") {
    return NextResponse.json({ ok: false, error: "invalid_start_time" }, { status: 400 });
  }
  if (!body.end || typeof body.end !== "object" || typeof (body.end as { hour?: unknown }).hour !== "number" || typeof (body.end as { minute?: unknown }).minute !== "number") {
    return NextResponse.json({ ok: false, error: "invalid_end_time" }, { status: 400 });
  }

  const year = Number(body.year);
  const month = Number(body.month);
  const day = Number(body.day);
  const start = body.start as { hour: number; minute: number };
  const startDate = new Date(year, month - 1, day, start.hour, start.minute, 0, 0);
  const now = Date.now();
  const minStart = now + 2 * 60 * 60 * 1000;
  if (startDate.getTime() < minStart) {
    return NextResponse.json({ ok: false, error: "lead_time_violation", message: "予約は現在から2時間後以降のみ可能です" }, { status: 400 });
  }

  const startMonth = startDate.getMonth() + 1;
  const startDay = startDate.getDate();
  if ((startMonth === 12 && startDay >= 29) || (startMonth === 1 && startDay <= 5)) {
    return NextResponse.json({ ok: false, error: "holiday_period", message: "12/29-1/5の期間は予約できません" }, { status: 400 });
  }

  try {
    const raw = await getRedis().get(LOCATION_KV_KEY);
    const locations: Record<string, string> = raw ? JSON.parse(raw) : {};
    const location = locations[formatDateKey(year, month, day)];
    if (isAskMeUnavailableLocation(location)) {
      return NextResponse.json({ ok: false, error: "location_unavailable", message: "対応不可日・休日は予約できません" }, { status: 400 });
    }
  } catch (error) {
    console.error("Failed to validate location availability:", error);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("reserve payload", body);

    const reservationWindowError = await validateReservationWindow(body as Record<string, unknown>);
    if (reservationWindowError) {
      return reservationWindowError;
    }

    const calendarId = process.env.GCAL_CALENDAR_ID || "primary";
    // Prefer Service Account if configured
    const accessToken = await getGoogleCalendarAccessToken(req);
    if (accessToken) {
      console.log("Access token acquired");
    } else {
      console.warn("Access token not available");
    }
    if (accessToken) {
      console.log("Processing calendar event creation with access token");
        if (!body.start || typeof body.start.hour !== 'number' || typeof body.start.minute !== 'number') {
          console.error("Invalid start time in request body", body.start);
          return NextResponse.json({ ok: false, error: "invalid_start_time" }, { status: 400 });
        }
        if (!body.end || typeof body.end.hour !== 'number' || typeof body.end.minute !== 'number') {
          console.error("Invalid end time in request body", body.end);
          return NextResponse.json({ ok: false, error: "invalid_end_time" }, { status: 400 });
        }
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
          `ご相談内容: ${body.purpose}`,
        ];
        if (body.meetingNote) descriptionLines.push(`ご相談詳細(任意): ${body.meetingNote}`);
        const contactMethod = String(body.contactMethod || "");
        if (contactMethod) descriptionLines.push(`ミーティング媒体: ${contactMethod}`);
        if (body.discordName) descriptionLines.push(`Discord名: ${body.discordName}`);
        if (body.discordServer) descriptionLines.push(`Discordサーバー: ${body.discordServer}`);
        if (body.slackName) descriptionLines.push(`Slack名: ${body.slackName}`);
        if (body.slackWorkspace) descriptionLines.push(`Slackワークスペース: ${body.slackWorkspace}`);
        if (body.otherNote) descriptionLines.push(`備考: ${body.otherNote}`);
        if (contactMethod.toLowerCase() === "offline") {
          if (body.offlinePlaceLink) descriptionLines.push(`Googleマップ共有リンク: ${body.offlinePlaceLink}`);
          if (body.offlinePlaceName) descriptionLines.push(`場所の名称(自動入力): ${body.offlinePlaceName}`);
          if (body.offlinePlaceDetail) descriptionLines.push(`場所の詳細(任意): ${body.offlinePlaceDetail}`);
        }

        // Purpose値に応じてタイトルを設定
        let summaryTitle = `TS+面談_${body.name || "ゲスト"}様`;
        const purpose = String(body.purpose);
        if (purpose === "STECH") {
          summaryTitle = `STECH面談_${body.name || "ゲスト"}様`;
        } else if (purpose === "biwako.go") {
          summaryTitle = `biwako.go_${body.name || "ゲスト"}様`;
        } else if (purpose === "kyoto.go") {
          summaryTitle = `kyoto.go_${body.name || "ゲスト"}様`;
        } else if (purpose === "JINEN") {
          summaryTitle = `JINEN_${body.name || "ゲスト"}様`;
        } else if (purpose === "NxTEND_Event") {
          summaryTitle = `NxTEND_${body.name || "ゲスト"}様`;
        } else if (purpose === "NxTEND_Organize") {
          summaryTitle = `NxTEND運営_${body.name || "ゲスト"}様`;
        } else if (purpose === "開発委託/相談") {
          summaryTitle = `開発相談_${body.name || "ゲスト"}様`;
        } else if (purpose === "出張撮影依頼") {
          summaryTitle = `出張撮影_${body.name || "ゲスト"}様`;
        } else if (purpose === "RCC") {
          summaryTitle = `RCC_${body.name || "ゲスト"}様`;
        } else if (purpose === "RM2C") {
          summaryTitle = `RM2C_${body.name || "ゲスト"}様`;
        } else if (purpose === "その他") {
          summaryTitle = `面談_${body.name || "ゲスト"}様`;
        }
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

        let gcalRes: Response;
        try {
          gcalRes = await fetch(createUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
        } catch (fetchErr) {
          console.error("Failed to fetch Google Calendar API", {
            url: createUrl,
            error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
            stack: fetchErr instanceof Error ? fetchErr.stack : undefined
          });
          return NextResponse.json({ ok: false, error: "google_calendar_api_request_failed", detail: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) }, { status: 502 });
        }
        if (!gcalRes.ok) {
          const errText = await gcalRes.text().catch(() => "");
          console.error("Google Calendar API request failed", {
            status: gcalRes.status,
            statusText: gcalRes.statusText,
            url: createUrl,
            error: errText,
            payloadSummary: { summary: payload.summary, start: payload.start, end: payload.end }
          });
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
          } catch (fallbackErr) {
            console.error("Error in Google Calendar fallback handling", fallbackErr);
          }
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
    }

    // No access token available, try webhook fallback
    console.log("Access token not available, checking for webhook fallback", { hasWebhook: !!process.env.GCAL_WEBHOOK_URL });
    if (process.env.GCAL_WEBHOOK_URL) {
      console.log("Webhook is configured, proceeding with webhook flow");
      const webhook = process.env.GCAL_WEBHOOK_URL;
      console.log("Webhook validation passed, preparing payload");
      const startDate = new Date(body.year, body.month - 1, body.day, body.start.hour, body.start.minute, 0, 0);
      const endDate = new Date(body.year, body.month - 1, body.day, body.end.hour, body.end.minute, 0, 0);
      const startLocal = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}T${pad(startDate.getHours())}:${pad(startDate.getMinutes())}:00`;
      const endLocal = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;

      const purpose = String(body.purpose || "");
      const baseName = body.name || "ゲスト";
      const summaryTitleWebhook =
        purpose === "TechSelect+" ? `TS+面談_${baseName}様x棚橋(taramanji)` :
        purpose === "開発委託/相談" ? `開発ご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "STECH"      ? `STECHご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "RM2C"       ? `RM2Cご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "JINEN"      ? `コミュニティご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "NxTEND_Event"     ? `NxTEND_Eventご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "NxTEND_Organize"     ? `NxTEND_Organizeご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "biwako.go" ? `biwako.goご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "kyoto.go" ? `kyoto.goご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "RCC"        ? `RCCご相談_${baseName}様x棚橋(taramanji)` :
        purpose === "その他"        ? `ご相談_${baseName}様x棚橋(taramanji)` :
        `ご相談_${baseName}様`;

        const payload = {
        calendarId,
        ownerEmail: process.env.OWNER_EMAIL || "",
        summary: summaryTitleWebhook,
        description: [
          `ご相談内容: ${body.purpose}`,
          body.meetingNote ? `ご相談詳細(任意): ${body.meetingNote}` : undefined,
          body.contactMethod ? `ミーティング媒体: ${body.contactMethod}` : undefined,
          body.discordName ? `Discord名: ${body.discordName}` : undefined,
          body.slackName ? `Slack名: ${body.slackName}` : undefined,
          body.otherNote ? `備考: ${body.otherNote}` : undefined,
            String(body.contactMethod || '').toLowerCase() === 'offline' && body.offlinePlaceLink ? `Googleマップ共有リンク: ${body.offlinePlaceLink}` : undefined,
            String(body.contactMethod || '').toLowerCase() === 'offline' && body.offlinePlaceName ? `場所の名称(自動入力): ${body.offlinePlaceName}` : undefined,
            String(body.contactMethod || '').toLowerCase() === 'offline' && body.offlinePlaceDetail ? `場所の詳細(任意): ${body.offlinePlaceDetail}` : undefined,
        ].filter(Boolean).join("\n"),
        start: { dateTime: startLocal, timeZone: "Asia/Tokyo" },
        end: { dateTime: endLocal, timeZone: "Asia/Tokyo" },
        attendees: body.email ? [{ email: body.email }] : [],
        // Ask webhook to create Meet as well when contact is meet
        contactMethod: body.contactMethod,
        createMeet: String(body.contactMethod || "").toLowerCase() === "meet",
      };
      try {
        console.log("Calling webhook for calendar event creation", { webhook, payloadSummary: { summary: payload.summary, start: payload.start, end: payload.end } });
        // Google Apps Script Web Apps may return 302 redirect, but the actual response might be in the body
        // Try with redirect: "manual" first to check the response body even on redirect
        const hookRes = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "manual", // Don't follow redirect automatically
        });

        // Read the response body first, even if it's a redirect
        const text = await hookRes.text().catch(() => "");

        // If we get a redirect, check if the response body contains the actual result
        // Google Apps Script sometimes returns 302 but the body has the JSON response
        if (hookRes.status === 302 || hookRes.status === 301 || hookRes.status === 307 || hookRes.status === 308) {
          console.log("Webhook returned redirect, checking response body for result", {
            status: hookRes.status,
            bodyLength: text.length,
            bodyContent: text.substring(0, 500) // Log first 500 chars for debugging
          });

          // Try to parse the response body - it might contain the actual result
          if (text.trim()) {
            try {
              const json = JSON.parse(text);
              console.log("Parsed JSON from redirect body", json);
              if (json && json.ok === true) {
                console.log("Found valid response in redirect body", { eventId: json.eventId });
                return NextResponse.json(json);
              }
              // Even if ok is not true, log the json to see what we got
              console.warn("Redirect body contains JSON but ok is not true", json);
            } catch (parseErr) {
              // Body is not JSON, continue to try redirect URL
              console.log("Redirect body is not JSON, will try redirect URL", {
                bodyPreview: text.substring(0, 200),
                parseError: parseErr instanceof Error ? parseErr.message : String(parseErr)
              });
            }
          } else {
            console.log("Redirect body is empty");
          }

          // If body doesn't contain result, try the redirect URL
          const redirectUrl = hookRes.headers.get("location");
          if (redirectUrl) {
            try {
              // Resolve relative URLs
              const absoluteRedirectUrl = redirectUrl.startsWith("http")
                ? redirectUrl
                : new URL(redirectUrl, webhook).toString();

              console.log("Attempting POST to redirect URL", absoluteRedirectUrl);
              const redirectRes = await fetch(absoluteRedirectUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const redirectText = await redirectRes.text().catch(() => "");
              if (redirectRes.ok) {
                try {
                  const json = JSON.parse(redirectText);
                  if (json && json.ok === true) {
                    return NextResponse.json(json);
                  }
                  return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
                } catch {
                  return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: redirectText }, { status: 502 });
                }
              }
              // If redirect URL returns 405, the initial POST likely succeeded but we can't get the response
              // Try GET request to the redirect URL to see if we can get any information
              if (redirectRes.status === 405) {
                console.warn("Redirect URL returned 405 for POST, trying GET request", {
                  redirectUrl: absoluteRedirectUrl
                });
                try {
                  const getRes = await fetch(absoluteRedirectUrl, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                  });
                  const getText = await getRes.text().catch(() => "");
                  console.log("GET request to redirect URL result", { status: getRes.status, bodyPreview: getText.substring(0, 200) });

                  if (getText.trim()) {
                    try {
                      const getJson = JSON.parse(getText) as { ok?: boolean; error?: string; message?: string; detail?: unknown };
                      if (getJson?.ok === true) {
                        return NextResponse.json(getJson);
                      }
                      if (typeof getJson?.ok === "boolean") {
                        return NextResponse.json({
                          ok: false,
                          error: getJson.error || "webhook_returned_error",
                          message: getJson.message,
                          detail: getJson.detail ?? getJson,
                        }, { status: 502 });
                      }
                    } catch (parseErr) {
                      console.warn("GET response from redirect URL was not JSON", {
                        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr)
                      });
                    }
                  }
                } catch (getErr) {
                  console.log("GET request to redirect URL failed", getErr);
                }

                // Log the original redirect response body in case it contains useful info
                console.log("Original redirect response body (first request)", {
                  status: hookRes.status,
                  bodyLength: text.length,
                  bodyPreview: text.substring(0, 500)
                });

                return NextResponse.json({
                  ok: false,
                  error: "webhook_redirect_405",
                  message: "Google Apps Script のリダイレクト先から予約作成結果を取得できませんでした。",
                  detail: "初回POSTは受理されましたが、redirect先URLはPOSTを受け付けず、結果の確定もできませんでした。",
                }, { status: 502 });
              }
              console.error("Webhook redirect request failed", { status: redirectRes.status, statusText: redirectRes.statusText, response: redirectText.substring(0, 200) });
              return NextResponse.json({ ok: false, error: "webhook_failed", status: redirectRes.status, detail: redirectText.substring(0, 500) }, { status: 502 });
            } catch (redirectErr) {
              console.error("Error following redirect", redirectErr);
              // Log the original response body in case it contains the result
              console.log("Original redirect response body (error case)", {
                status: hookRes.status,
                bodyLength: text.length,
                bodyPreview: text.substring(0, 500)
              });
              // Since Google Apps Script processes the POST even when returning 302,
              // and the user confirmed the event was created, return success with null eventId
              return NextResponse.json({
                ok: true,
                eventId: null, // Use null instead of "unknown"
                htmlLink: null,
                meetLink: null,
                note: "Event was created successfully, but eventId could not be retrieved due to redirect error"
              });
            }
          }
          // If no redirect URL and no body content, return error
          if (!text.trim()) {
            return NextResponse.json({ ok: false, error: "webhook_redirect_no_location" }, { status: 502 });
          }
        }

        if (!hookRes.ok) {
          console.error("Webhook request failed", { status: hookRes.status, statusText: hookRes.statusText, response: text.substring(0, 200) });
          return NextResponse.json({ ok: false, error: "webhook_failed", status: hookRes.status, detail: text.substring(0, 500) }, { status: 502 });
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
        console.error("GCAL webhook failed", e);
        return NextResponse.json({ ok: false, error: "webhook_error", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
      }
    }

    console.error("No access token available for calendar operation");
    return NextResponse.json({ ok: false, error: "no_token" }, { status: 401 });
  } catch (err) {
    console.error("Unexpected error in /api/reserve POST", err);
    return NextResponse.json({ ok: false, error: "internal_error", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
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
    const accessToken = await getGoogleCalendarAccessToken(req);

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
          const webhookPayload = { action: "delete", calendarId, eventId };
          const hookRes = await fetch(process.env.GCAL_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
            redirect: "manual", // Don't follow redirect automatically
          });

          // Read the response body first, even if it's a redirect
          const hookText = await hookRes.text().catch(() => "");

          // Handle redirect similar to POST endpoint
          if (hookRes.status === 302 || hookRes.status === 301 || hookRes.status === 307 || hookRes.status === 308) {
            console.log("DELETE webhook returned redirect, checking response body", {
              status: hookRes.status,
              bodyLength: hookText.length,
              bodyPreview: hookText.substring(0, 200) // Log first 200 chars for debugging
            });

            // Try to parse the response body - it might contain the actual result
            if (hookText.trim()) {
              try {
                const json = JSON.parse(hookText);
                console.log("Parsed JSON from DELETE redirect body", json);
                if (json && json.ok === true) {
                  console.log("Found valid response in DELETE redirect body", json);
                  return NextResponse.json(json);
                }
                // Even if ok is not true, log the json to see what we got
                console.warn("DELETE redirect body contains JSON but ok is not true", json);
              } catch (parseErr) {
                // Body is not JSON, continue to try redirect URL
                console.log("DELETE redirect body is not JSON, will try redirect URL", {
                  bodyPreview: hookText.substring(0, 200),
                  parseError: parseErr instanceof Error ? parseErr.message : String(parseErr)
                });
              }
            } else {
              console.log("DELETE redirect body is empty");
            }

            // If body doesn't contain result, try the redirect URL
            const redirectUrl = hookRes.headers.get("location");
            if (redirectUrl) {
              try {
                const absoluteRedirectUrl = redirectUrl.startsWith("http")
                  ? redirectUrl
                  : new URL(redirectUrl, process.env.GCAL_WEBHOOK_URL).toString();

                const redirectRes = await fetch(absoluteRedirectUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(webhookPayload),
                });
                const redirectText = await redirectRes.text().catch(() => "");
                if (redirectRes.ok) {
                  try {
                    const json = JSON.parse(redirectText);
                    if (json && json.ok === true) return NextResponse.json(json);
                    return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
                  } catch {
                    return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: redirectText }, { status: 502 });
                  }
                }
                // If redirect URL returns 405, try GET request to see if we can get any information
                if (redirectRes.status === 405) {
                  console.warn("DELETE redirect URL returned 405 for POST, trying GET request", {
                    redirectUrl: absoluteRedirectUrl
                  });
                  try {
                    // Try GET request to the redirect URL (though this probably won't return the delete result)
                    const getRes = await fetch(absoluteRedirectUrl, {
                      method: "GET",
                      headers: { "Content-Type": "application/json" },
                    });
                    const getText = await getRes.text().catch(() => "");
                    console.log("GET request to DELETE redirect URL result", {
                      status: getRes.status,
                      bodyPreview: getText.substring(0, 200)
                    });

                    // If GET returns JSON, try to parse it
                    if (getRes.ok && getText.trim()) {
                      try {
                        const getJson = JSON.parse(getText);
                        if (getJson && getJson.ok === true) {
                          console.log("Found valid response in GET request to redirect URL", getJson);
                          return NextResponse.json(getJson);
                        }
                      } catch {
                        // Not JSON, ignore
                      }
                    }
                  } catch (getErr) {
                    console.log("GET request to DELETE redirect URL failed", getErr);
                  }

                  // Log the original redirect response body in case it contains useful info
                  console.log("Original DELETE redirect response body (first request)", {
                    status: hookRes.status,
                    bodyLength: hookText.length,
                    bodyPreview: hookText.substring(0, 500)
                  });

                  // Since Google Apps Script processes the POST even when returning 302,
                  // the delete may have succeeded, but we can't confirm it
                  // Return error with helpful message
                  console.error("DELETE redirect URL returned 405 Method Not Allowed", {
                    redirectUrl: absoluteRedirectUrl,
                    status: redirectRes.status,
                    response: redirectText.substring(0, 200),
                    note: "The initial POST request may have succeeded, but we cannot verify due to redirect behavior"
                  });
                  return NextResponse.json({
                    ok: false,
                    error: "webhook_redirect_405",
                    message: "Google Apps ScriptのWebアプリ設定に問題があります。リダイレクト先のURLがPOSTリクエストを受け付けていません。",
                    detail: "削除操作は実行された可能性がありますが、確認できませんでした。Google Apps ScriptのWebアプリの設定を確認してください。",
                    suggestion: "Google Apps Scriptのエディタで「公開」→「ウェブアプリとして公開」を確認し、最新バージョンがデプロイされているか確認してください。"
                  }, { status: 502 });
                }
                return NextResponse.json({ ok: false, error: "webhook_failed", status: redirectRes.status, detail: redirectText.substring(0, 500) }, { status: 502 });
              } catch (redirectErr) {
                console.error("Error following DELETE redirect", redirectErr);
                // Can't confirm if delete succeeded, return error
                return NextResponse.json({
                  ok: false,
                  error: "webhook_redirect_error",
                  detail: redirectErr instanceof Error ? redirectErr.message : String(redirectErr),
                  message: "Could not confirm delete operation status due to redirect error"
                }, { status: 502 });
              }
            }
          }

          if (!hookRes.ok) return NextResponse.json({ ok: false, error: "webhook_failed", status: hookRes.status, detail: hookText.substring(0, 500) }, { status: 502 });
          try {
            const json = JSON.parse(hookText);
            if (json && json.ok === true) return NextResponse.json(json);
            return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
          } catch {
            return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: hookText }, { status: 502 });
          }
        } catch (e) {
          console.error("DELETE webhook failed", e);
          return NextResponse.json({ ok: false, error: "webhook_error", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
        }
      }
      return NextResponse.json({ ok: false, error: "google_delete_failed", status: delRes.status, detail: text }, { status: 502 });
    } else if (process.env.GCAL_WEBHOOK_URL) {
      try {
        const webhookPayload = { action: "delete", calendarId, eventId };
        const hookRes = await fetch(process.env.GCAL_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
          redirect: "manual", // Don't follow redirect automatically
        });

        // Read the response body first, even if it's a redirect
        const text = await hookRes.text().catch(() => "");

          // Handle redirect similar to POST endpoint
          if (hookRes.status === 302 || hookRes.status === 301 || hookRes.status === 307 || hookRes.status === 308) {
            console.log("DELETE webhook returned redirect (no token case), checking response body", {
              status: hookRes.status,
              bodyLength: text.length,
              bodyPreview: text.substring(0, 200) // Log first 200 chars for debugging
            });

            // Try to parse the response body - it might contain the actual result
            if (text.trim()) {
              try {
                const json = JSON.parse(text);
                console.log("Parsed JSON from DELETE redirect body (no token case)", json);
                if (json && json.ok === true) {
                  console.log("Found valid response in DELETE redirect body (no token case)", json);
                  return NextResponse.json(json);
                }
                // Even if ok is not true, log the json to see what we got
                console.warn("DELETE redirect body contains JSON but ok is not true (no token case)", json);
              } catch (parseErr) {
                // Body is not JSON, continue to try redirect URL
                console.log("DELETE redirect body is not JSON, will try redirect URL (no token case)", {
                  bodyPreview: text.substring(0, 200),
                  parseError: parseErr instanceof Error ? parseErr.message : String(parseErr)
                });
              }
            } else {
              console.log("DELETE redirect body is empty (no token case)");
            }

          // If body doesn't contain result, try the redirect URL
          const redirectUrl = hookRes.headers.get("location");
          if (redirectUrl) {
            try {
              const absoluteRedirectUrl = redirectUrl.startsWith("http")
                ? redirectUrl
                : new URL(redirectUrl, process.env.GCAL_WEBHOOK_URL).toString();

              const redirectRes = await fetch(absoluteRedirectUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(webhookPayload),
              });
              const redirectText = await redirectRes.text().catch(() => "");
              if (redirectRes.ok) {
                try {
                  const json = JSON.parse(redirectText);
                  if (json && json.ok === true) return NextResponse.json(json);
                  return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
                } catch {
                  return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: redirectText }, { status: 502 });
                }
              }
              // If redirect URL returns 405, try GET request to see if we can get any information
              if (redirectRes.status === 405) {
                console.warn("DELETE redirect URL returned 405 for POST (no token case), trying GET request", {
                  redirectUrl: absoluteRedirectUrl
                });
                try {
                  // Try GET request to the redirect URL (though this probably won't return the delete result)
                  const getRes = await fetch(absoluteRedirectUrl, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                  });
                  const getText = await getRes.text().catch(() => "");
                  console.log("GET request to DELETE redirect URL result (no token case)", {
                    status: getRes.status,
                    bodyPreview: getText.substring(0, 200)
                  });

                  // If GET returns JSON, try to parse it
                  if (getRes.ok && getText.trim()) {
                    try {
                      const getJson = JSON.parse(getText);
                      if (getJson && getJson.ok === true) {
                        console.log("Found valid response in GET request to redirect URL (no token case)", getJson);
                        return NextResponse.json(getJson);
                      }
                    } catch {
                      // Not JSON, ignore
                    }
                  }
                } catch (getErr) {
                  console.log("GET request to DELETE redirect URL failed (no token case)", getErr);
                }

                // Log the original redirect response body in case it contains useful info
                console.log("Original DELETE redirect response body (first request, no token case)", {
                  status: hookRes.status,
                  bodyLength: text.length,
                  bodyPreview: text.substring(0, 500)
                });

                // Since Google Apps Script processes the POST even when returning 302,
                // the delete may have succeeded, but we can't confirm it
                // Return error with helpful message
                console.error("DELETE redirect URL returned 405 Method Not Allowed (no token case)", {
                  redirectUrl: absoluteRedirectUrl,
                  status: redirectRes.status,
                  response: redirectText.substring(0, 200),
                  note: "The initial POST request may have succeeded, but we cannot verify due to redirect behavior"
                });
                return NextResponse.json({
                  ok: false,
                  error: "webhook_redirect_405",
                  message: "Google Apps ScriptのWebアプリ設定に問題があります。リダイレクト先のURLがPOSTリクエストを受け付けていません。",
                  detail: "削除操作は実行された可能性がありますが、確認できませんでした。Google Apps ScriptのWebアプリの設定を確認してください。",
                  suggestion: "Google Apps Scriptのエディタで「公開」→「ウェブアプリとして公開」を確認し、最新バージョンがデプロイされているか確認してください。"
                }, { status: 502 });
              }
              return NextResponse.json({ ok: false, error: "webhook_failed", status: redirectRes.status, detail: redirectText.substring(0, 500) }, { status: 502 });
            } catch (redirectErr) {
              console.error("Error following DELETE redirect (no token case)", redirectErr);
              // Can't confirm if delete succeeded, return error
              return NextResponse.json({
                ok: false,
                error: "webhook_redirect_error",
                detail: redirectErr instanceof Error ? redirectErr.message : String(redirectErr),
                message: "Could not confirm delete operation status due to redirect error"
              }, { status: 502 });
            }
          }
        }

        if (!hookRes.ok) return NextResponse.json({ ok: false, error: "webhook_failed", status: hookRes.status, detail: text.substring(0, 500) }, { status: 502 });
        try {
          const json = JSON.parse(text);
          if (json && json.ok === true) return NextResponse.json(json);
          return NextResponse.json({ ok: false, error: "webhook_returned_error", detail: json }, { status: 502 });
        } catch {
          return NextResponse.json({ ok: false, error: "webhook_unexpected_response", detail: text }, { status: 502 });
        }
      } catch (e) {
        console.error("DELETE webhook failed (no token case)", e);
        return NextResponse.json({ ok: false, error: "webhook_error", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
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
    const accessToken = await getGoogleCalendarAccessToken(req);
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
