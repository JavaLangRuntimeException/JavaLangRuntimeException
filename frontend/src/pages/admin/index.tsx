import { useState } from "react";
import { siteOrigins } from "@/shared/config/site";
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

  if (isLoading || !user) return <AdminLoading />;

  return (
    <AdminShell title="Admin Dashboard" email={user.email} crossLink={{ href: `${siteOrigins().calendar}/admin`, label: "カレンダー同期 →" }}>
      <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as TabKey)}>
        <TabList aria-label="管理メニュー" className="mb-6">
          <Tab id="ical">iCal予定確認</Tab>
          <Tab id="email">メール送信</Tab>
          <Tab id="location">勤務場所</Tab>
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
