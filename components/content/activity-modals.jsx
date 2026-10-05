'use client';

import { useActionState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { SubmitButton } from '@/components/content/post-form-fields';
import { ActionFeedback } from '@/components/page';
import { ActionButton } from '@/components/ui/action-button';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  POST_CATEGORIES,
  POST_CATEGORY_LABELS,
} from '@/lib/constants';
import { createActivityAction, setActivityStatusAction } from '@/actions/content-actions';

/**
 * ---------------------------------------------------------------------------
 * Activity modals (Secretary module)
 * An Activity is the attendance-tracked event behind a club update; it is what
 * makes the PRESENT -> approve -> official record workflow possible.
 * ---------------------------------------------------------------------------
 */

function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </span>
      {children}
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** `datetime-local` needs `YYYY-MM-DDTHH:mm`; Prisma returns a Date. */
export function toLocalInput(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function ActivityFields({ activity }) {
  return (
    <>
      <Field label="Title" required>
        <Input name="title" defaultValue={activity?.title ?? ''} required maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Activity type" required>
          <Select name="type" defaultValue={activity?.type ?? 'GMM'}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Update category" required>
          <Select name="category" defaultValue={activity?.category ?? 'ACTIVITIES'}>
            {POST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {POST_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          name="description"
          defaultValue={activity?.description ?? ''}
          rows={3}
          maxLength={5000}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts at" required>
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(activity?.startsAt)}
            required
          />
        </Field>
        <Field label="Ends at" hint="Must be after the start.">
          <Input name="endsAt" type="datetime-local" defaultValue={toLocalInput(activity?.endsAt)} />
        </Field>
        <Field label="Venue">
          <Input name="venue" defaultValue={activity?.venue ?? ''} maxLength={200} />
        </Field>
        <Field label="Address">
          <Input name="address" defaultValue={activity?.address ?? ''} maxLength={300} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Credits (hours)" hint="Credited on approval.">
          <Input
            name="creditsHours"
            type="number"
            step="0.25"
            min="0"
            defaultValue={activity?.creditsHours ? Number(activity.creditsHours) : ''}
          />
        </Field>
        <Field label="Fee amount" hint="Used to bill members.">
          <Input
            name="feeAmount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={activity?.feeAmount ? Number(activity.feeAmount) : ''}
          />
        </Field>
        <Field label="Capacity">
          <Input name="capacity" type="number" min="1" defaultValue={activity?.capacity ?? ''} />
        </Field>
      </div>

      <Field
        label="Publication status"
        required
        hint="Only published activities accept attendance requests."
      >
        <Select name="status" defaultValue={activity?.status ?? 'DRAFT'}>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>

      <label className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          name="requiresAttendance"
          defaultChecked={activity?.requiresAttendance ?? true}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
        />
        <span>
          <span className="font-medium text-ink">Attendance is tracked</span>
          <span className="block text-[11px] text-ink-muted">
            Members may submit a PRESENT request that you verify on the attendance review page.
          </span>
        </span>
      </label>
    </>
  );
}

export function CreateActivityModal() {
  const [state, formAction] = useActionState(createActivityAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        New activity
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="New activity"
        description="Schedule an attendance-tracked club event."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />
          <ActivityFields />
          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <SubmitButton label="Save activity" />
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Publish / archive controls for a single activity row. */
export function ActivityStatusControls({ activity }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {activity.status !== 'PUBLISHED' ? (
        <ActionButton
          action={setActivityStatusAction}
          args={[activity.id, 'PUBLISHED']}
          label="Publish"
          variant="success"
        />
      ) : null}
      {activity.status === 'PUBLISHED' ? (
        <ActionButton
          action={setActivityStatusAction}
          args={[activity.id, 'ARCHIVED']}
          label="Archive"
          variant="secondary"
        />
      ) : null}
      {activity.status === 'ARCHIVED' ? (
        <ActionButton
          action={setActivityStatusAction}
          args={[activity.id, 'DRAFT']}
          label="Reopen draft"
          variant="ghost"
        />
      ) : null}
    </div>
  );
}