import { useState } from "react";
import { siteOrigins } from "@/shared/config/site";
import { useT } from "@/shared/lib/i18n";
import { Tab, TabList, TabPanel, Tabs } from "@/components/base/tabs/tabs";
import { useRequireSession } from "@/entities/session";
import { AdminEmailForm } from "@/features/admin-email";
import { IcalSourcesPanel } from "@/features/ical-sources";
import { WorkLocationAdmin } from "@/features/work-location-admin";
import { AdminLoading, AdminShell } from "@/widgets/admin-shell";

type TabKey = "ical" | "email" | "location";

/** taramanji.com/admin（今までの管理機能: iCal 予定確認・メール送信・勤務場所） */
export default function AdminPage() {
  const { user, isLoading } = useRequireSession();
  const [activeTab, setActiveTab] = useState<TabKey>("ical");
  const t = useT();

  if (isLoading || !user) return <AdminLoading />;

  return (
    <AdminShell title="Admin Dashboard" email={user.email} crossLink={{ href: `${siteOrigins().calendar}/admin`, label: t({ ja: "カレンダー同期 →", en: "Calendar Sync →" }) }}>
      <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as TabKey)}>
        <TabList aria-label={t({ ja: "管理メニュー", en: "Admin menu" })} className="mb-6">
          <Tab id="ical">{t({ ja: "iCal予定確認", en: "iCal events" })}</Tab>
          <Tab id="email">{t({ ja: "メール送信", en: "Send email" })}</Tab>
          <Tab id="location">{t({ ja: "勤務場所", en: "Work location" })}</Tab>
        </TabList>
        <TabPanel id="ical">
          <IcalSourcesPanel />
        </TabPanel>
        <TabPanel id="email">
          <AdminEmailForm />
        </TabPanel>
        <TabPanel id="location">
          <WorkLocationAdmin />
        </TabPanel>
      </Tabs>
    </AdminShell>
  );
}
