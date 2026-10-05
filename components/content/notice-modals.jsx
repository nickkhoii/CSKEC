'use client';

import { useActionState } from 'react';
import { Bell, Pencil } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionButton } from '@/components/ui/action-button';
import { ActionFeedback } from '@/components/page';
import {
  NOTICE_AUDIENCES,
  NOTICE_AUDIENCE_LABELS,
  NOTICE_PRIORITIES,
  NOTICE_PRIORITY_LABELS,
} from '@/lib/constants';
import { toDateInputValue } from '@/lib/utils';
import {
  createNoticeAction,
  setNoticeStatusAction,
  updateNoticeAction,
} from '@/actions/content-actions';

/**
 * ---------------------------------------------------------------------------
 * Notice modals (Secretary module)
 * A Notice is addressed to an audience, so publishing it notifies only the roles
 * that audience covers (see lib/notifications.js).
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

function NoticeFields({ notice }) {
  return (
    <>
      {notice?.id ? <input type="hidden" name="id" value={notice.id} /> : null}

      <Field label="Title" required>
        <Input name="title" defaultValue={notice?.title ?? ''} required maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority" required>
          <Select name="priority" defaultValue={notice?.priority ?? 'NORMAL'}>
            {NOTICE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {NOTICE_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Audience" required hint="Controls who can read this notice.">
          <Select name="audience" defaultValue={notice?.audience ?? 'ALL_MEMBERS'}>
            {NOTICE_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {NOTICE_AUDIENCE_LABELS[a]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notice date" required>
          <Input
            name="noticeDate"
            type="date"
            required
            defaultValue={toDateInputValue(notice?.noticeDate) || new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Expiry date" hint="Optional.">
          <Input name="expiryDate" type="date" defaultValue={toDateInputValue(notice?.expiryDate)} />
        </Field>
      </div>

      <Field label="Content" required>
        <Textarea name="content" defaultValue={notice?.content ?? ''} rows={8} required maxLength={20000} />
      </Field>

      <Field label="Publication status" required>
        <Select name="status" defaultValue={notice?.status ?? 'DRAFT'}>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>
    </>
  );
}

export function CreateNoticeModal() {
  const [state, formAction] = useActionState(createNoticeAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <Bell className="h-4 w-4" aria-hidden="true" />
        New notice
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="New notice"
        description="Notices are addressed to a specific audience."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />
          <NoticeFields />
          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Save notice</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function EditNoticeModal({ notice }) {
  const [state, formAction] = useActionState(updateNoticeAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button size="sm" variant="secondary" onClick={open}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </Button>
      <Modal open={isOpen} onClose={close} title="Edit notice" description={notice.title} size="lg">
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />
          <NoticeFields notice={notice} />
          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function NoticeRowControls({ notice }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <EditNoticeModal notice={notice} />
      {notice.status !== 'PUBLISHED' ? (
        <ActionButton
          action={setNoticeStatusAction}
          args={[notice.id, 'PUBLISHED']}
          label="Publish"
          variant="success"
        />
      ) : (
        <ActionButton
          action={setNoticeStatusAction}
          args={[notice.id, 'ARCHIVED']}
          label="Archive"
          variant="secondary"
        />
      )}
      {notice.status !== 'DRAFT' ? (
        <ActionButton
          action={setNoticeStatusAction}
          args={[notice.id, 'DRAFT']}
          label="Unpublish"
          variant="ghost"
        />
      ) : null}
    </div>
  );
}