'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { ActionFeedback } from '@/components/page';
import { POST_CATEGORIES, POST_CATEGORY_LABELS } from '@/lib/constants';

/**
 * ---------------------------------------------------------------------------
 * Shared post form body
 * Used by both the "new update" and "edit update" modals so the two can never
 * drift apart. The hidden `id` field selects which action runs server-side.
 * ---------------------------------------------------------------------------
 */

function Field({ label, required, hint, children, className }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <span className="block text-xs font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </span>
      {children}
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ label = 'Save update' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <Save className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Saving…' : label}
    </Button>
  );
}

/** Refreshes the server component tree once, after a successful save. */
function useRefreshOnSuccess(state) {
  const router = useRouter();
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
}

export function PostFormFields({ post, activities = [] }) {
  return (
    <>
      {post?.id ? <input type="hidden" name="id" value={post.id} /> : null}

      <Field label="Title" required>
        <Input name="title" defaultValue={post?.title ?? ''} required maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" required>
          <Select name="category" defaultValue={post?.category ?? 'ANNOUNCEMENT'}>
            {POST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {POST_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Publication status" required hint="Publishing notifies every member.">
          <Select name="status" defaultValue={post?.status ?? 'DRAFT'}>
            <option value="DRAFT">Draft (not visible)</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
      </div>

      <Field label="Excerpt" hint="Shown in list views. Leave blank to use the opening of the content.">
        <Textarea name="excerpt" defaultValue={post?.excerpt ?? ''} rows={2} maxLength={500} />
      </Field>

      <Field label="Content" required>
        <Textarea name="content" defaultValue={post?.content ?? ''} rows={8} required maxLength={50000} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event date" hint="Optional.">
          <Input
            name="eventDate"
            type="date"
            defaultValue={post?.eventDate ? post.eventDate.toISOString().slice(0, 10) : ''}
          />
        </Field>
        <Field label="Venue" hint="Optional.">
          <Input name="venue" defaultValue={post?.venue ?? ''} maxLength={200} />
        </Field>
        <Field label="Start time">
          <Input name="startTime" defaultValue={post?.startTime ?? ''} maxLength={20} placeholder="07:00 PM" />
        </Field>
        <Field label="End time">
          <Input name="endTime" defaultValue={post?.endTime ?? ''} maxLength={20} placeholder="09:00 PM" />
        </Field>
      </div>

      {activities.length > 0 ? (
        <Field label="Linked activity" hint="Links this update to an attendance-tracked event.">
          <Select name="activityId" defaultValue={post?.activityId ?? ''}>
            <option value="">Not linked</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <label className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          name="isPinned"
          defaultChecked={post?.isPinned ?? false}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
        />
        <span>
          <span className="font-medium text-ink">Pin to the top</span>
          <span className="block text-[11px] text-ink-muted">
            Pinned updates appear first on the club updates page.
          </span>
        </span>
      </label>
    </>
  );
}

export function PostFormShell({ state, submitLabel }) {
  useRefreshOnSuccess(state);
  return (
    <div className="space-y-5">
      <ActionFeedback state={state} />
      <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
        <SubmitButton label={submitLabel} />
      </div>
    </div>
  );
}
