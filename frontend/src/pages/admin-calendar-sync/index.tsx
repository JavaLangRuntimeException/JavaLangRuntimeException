import { siteOrigins } from "@/shared/config/site";
import { useT } from "@/shared/lib/i18n";
import { useRequireSession } from "@/entities/session";
import { CalendarSyncAdmin } from "@/features/calendar-sync-admin";
import { AdminLoading, AdminShell } from "@/widgets/admin-shell";

/** gws.taramanji.com/admin（カレンダー同期の管理画面） */
export default function AdminCalendarSyncPage() {
  const { user, isLoading } = useRequireSession();
  const t = useT();
  if (isLoading || !user) return <AdminLoading />;
  return (
    <AdminShell
      title={t({ ja: "カレンダー同期", en: "Calendar Sync" })}
      email={user.email}
      width="default"
      crossLinkPosition="start"
      crossLink={{ href: `${siteOrigins().site}/admin`, label: t({ ja: "サイトの管理画面 →", en: "Site admin →" }) }}
    >
      <CalendarSyncAdmin />
    </AdminShell>
  );
}
