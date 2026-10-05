import { Settings } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { SETTING_DEFAULTS } from '@/lib/settings';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui';
import { SettingRow } from '@/components/admin/setting-row';

export const metadata = { title: 'System Settings' };
export const dynamic = 'force-dynamic';

/**
 * ---------------------------------------------------------------------------
 * /admin/settings — club configuration.
 *
 * Rows live in the SystemSetting table so configuration changes never require a
 * redeploy. Missing rows are shown with their built-in default so the page is
 * never partially empty after a fresh `db:seed`.
 * ---------------------------------------------------------------------------
 */
export default async function AdminSettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);

  const rows = await prisma.systemSetting.findMany({
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
    include: { updatedBy: { select: { fullName: true } } },
  });

  // Merge stored rows over the defaults so every known setting is editable.
  const byCategory = new Map();
  for (const [key, meta] of Object.entries(SETTING_DEFAULTS)) {
    const category = meta.category ?? 'general';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push({
      id: key,
      key,
      value: meta.value,
      valueType: meta.valueType,
      label: meta.label,
      description: meta.description,
      updatedAt: null,
      updatedBy: null,
      isDefault: true,
    });
  }
  for (const row of rows) {
    const category = row.category ?? 'general';
    if (!byCategory.has(category)) byCategory.set(category, []);
    const list = byCategory.get(category);
    const index = list.findIndex((item) => item.key === row.key);
    const merged = { ...row, isDefault: false };
    if (index >= 0) list[index] = merged;
    else list.push(merged);
  }

  const CATEGORY_TITLES = {
    club: 'Club Identity',
    members: 'Member Records',
    finance: 'Finance',
    attendance: 'Attendance',
    security: 'Security',
    general: 'General',
  };

  const customised = rows.filter((row) => row.updatedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        description="Club configuration stored in the database. Changes take effect immediately and are recorded in the audit log."
      />

      <Alert tone="info" title="Deployment note">
        {customised} of {Object.keys(SETTING_DEFAULTS).length} known settings have been customised
        from their defaults. Values shown without a last-change stamp are using the built-in
        default, which is also the fallback whenever the database is unreachable.
      </Alert>

      {Array.from(byCategory.entries()).map(([category, settings]) => (
        <Card key={category}>
          <CardHeader
            title={CATEGORY_TITLES[category] ?? category}
            description={`${settings.length} setting(s)`}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {settings.map((setting) => (
              <SettingRow key={setting.key} setting={setting} />
            ))}
          </CardBody>
        </Card>
      ))}

      <p className="flex items-start gap-1.5 text-[11px] text-ink-muted">
        <Settings className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Only <code className="font-mono">settings:manage</code> (System Administrator) can reach this
        page; the server rejects the request for every other role.
        {rows[0]?.updatedAt
          ? ` Most recent change: ${formatDateTime(
              rows.reduce((latest, row) =>
                row.updatedAt && (!latest || row.updatedAt > latest) ? row.updatedAt : latest,
              ),
            )}.`
          : ''}
      </p>
    </div>
  );
}