import { siteOrigins } from "@/shared/config/site";
import { useRequireSession } from "@/entities/session";
import { CalendarSyncAdmin } from "@/features/calendar-sync-admin";
import { AdminLoading, AdminShell } from "@/widgets/admin-shell";

/** gws.taramanji.com/admin（カレンダー同期の管理画面） */
export default function AdminCalendarSyncPage() {
  const { user, isLoading } = useRequireSession();
  if (isLoading || !user) return <AdminLoading />;
  return (
    <AdminShell
      title="カレンダー同期"
      email={user.email}
      width="default"
      crossLinkPosition="start"
      crossLink={{ href: `${siteOrigins().site}/admin`, label: "サイトの管理画面 →" }}
    >
      <CalendarSyncAdmin />
    </AdminShell>
  );
}
