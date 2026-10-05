'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { updateSettingAction } from '@/actions/finance-actions';

/**
 * Inline editor for one system setting.
 *
 * The control is chosen from the setting's `valueType`, and the server re-validates
 * against the same metadata (lib/settings.js), so a malformed value can never be
 * persisted just because the UI allowed it.
 */
export function SettingRow({ setting }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const save = (value) => {
    const formData = new FormData();
    formData.set('key', setting.key);
    formData.set('value', value);

    startTransition(async () => {
      const result = await updateSettingAction(formData);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  if (setting.valueType === 'BOOLEAN') {
    const isOn = setting.value === 'true';
    return (
      <div className="flex items-start justify-between gap-4 px-5 py-3">
        <SettingLabel setting={setting} />
        <label className="flex shrink-0 cursor-pointer items-center gap-2 pt-0.5">
          <input
            type="checkbox"
            checked={isOn}
            disabled={pending}
            onChange={(event) => save(event.target.checked ? 'true' : 'false')}
            className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
          />
          <span className="text-xs font-medium text-ink">{isOn ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>
    );
  }

  return (
    <form
      className="flex flex-wrap items-start justify-between gap-4 px-5 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        save(new FormData(event.currentTarget).get('value'));
      }}
    >
      <SettingLabel setting={setting} />
      <div className="flex shrink-0 items-center gap-2">
        <Input
          name="value"
          defaultValue={setting.value}
          type={setting.valueType === 'NUMBER' ? 'number' : 'text'}
          step="any"
          maxLength={500}
          className="h-9 w-44 text-xs"
          disabled={pending}
        />
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          Save
        </Button>
      </div>
    </form>
  );
}

function SettingLabel({ setting }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-ink">{setting.label}</p>
      <p className="mt-0.5 text-[11px] text-ink-muted">{setting.description}</p>
      <code className="mt-1 block font-mono text-[10px] text-ink-muted">{setting.key}</code>
    </div>
  );
}