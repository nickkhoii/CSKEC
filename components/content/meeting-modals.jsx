'use client';

import { useActionState } from 'react';
import { CalendarPlus, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';
import {
  MEETING_STATUSES,
  MEETING_TYPES,
  MEETING_TYPE_LABELS,
  MINUTE_STATUSES,
} from '@/lib/constants';
import { createMeetingAction, updateMeetingAction, saveMinuteAction } from '@/actions/content-actions';

/**
 * ---------------------------------------------------------------------------
 * Meeting scheduling + minutes editing (Secretary module)
 * Minutes are a separate one-per-meeting record so an unapproved draft can be
 * hidden from members (see app/(portal)/meetings/[id]/page.jsx).
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

export function CreateMeetingModal({ officers = [], activities = [], meeting = null }) {
  const [state, formAction] = useActionState(meeting ? updateMeetingAction : createMeetingAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        {meeting ? 'Edit meeting' : 'Schedule meeting'}
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title={meeting ? 'Edit meeting' : 'Schedule a meeting'}
        description="Members see the date immediately; minutes are added afterwards."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />
          {meeting ? <input type="hidden" name="id" value={meeting.id} /> : null}

          <Field label="Title" required>
            <Input name="title" defaultValue={meeting?.title ?? ''} required maxLength={200} placeholder="General Membership Meeting" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meeting type" required>
              <Select name="meetingType" defaultValue={meeting?.meetingType ?? 'GENERAL_MEMBERSHIP_MEETING'}>
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MEETING_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" required>
              <Select name="status" defaultValue={meeting?.status ?? 'SCHEDULED'}>
                {MEETING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Meeting date" required>
              <Input
                name="meetingDate"
                type="date"
                required
                defaultValue={meeting?.meetingDate ? new Date(meeting.meetingDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Venue">
              <Input name="venue" defaultValue={meeting?.venue ?? ''} maxLength={200} />
            </Field>
            <Field label="Start time">
              <Input name="startTime" defaultValue={meeting?.startTime ?? ''} required maxLength={20} placeholder="07:00 PM" />
            </Field>
            <Field label="End time">
              <Input name="endTime" defaultValue={meeting?.endTime ?? ''} maxLength={20} placeholder="09:00 PM" />
            </Field>
          </div>

          {officers.length > 0 ? (
            <Field label="Presiding officer">
              <Select name="presidingOfficerId" defaultValue={meeting?.presidingOfficerId ?? ''}>
                <option value="">Not specified</option>
                {officers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {activities.length > 0 ? (
            <Field label="Linked activity" hint="Links the meeting to an attendance-tracked event.">
              <Select name="activityId" defaultValue={meeting?.activityId ?? ''}>
                <option value="">Not linked</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Description / agenda preview">
            <Textarea name="description" defaultValue={meeting?.description ?? ''} rows={3} maxLength={2000} />
          </Field>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Schedule meeting</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function MinuteEditorModal({ meeting }) {
  const [state, formAction] = useActionState(saveMinuteAction, null);
  const { isOpen, open, close } = useDisclosure();
  const minutes = meeting.minutes;

  return (
    <>
      <Button size="sm" variant={minutes ? 'secondary' : 'primary'} onClick={open}>
        <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
        {minutes ? 'Edit minutes' : 'Write minutes'}
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title={minutes ? 'Edit minutes' : 'Write minutes'}
        description={meeting.title}
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />
          <input type="hidden" name="meetingId" value={meeting.id} />

          <Field label="Minutes title" required>
            <Input
              name="title"
              required
              maxLength={200}
              defaultValue={minutes?.title ?? meeting.title}
            />
          </Field>

          <Field label="Summary">
            <Textarea name="summary" rows={3} defaultValue={minutes?.summary ?? ''} maxLength={5000} />
          </Field>
          <Field label="Agenda">
            <Textarea name="agenda" rows={3} defaultValue={minutes?.agenda ?? ''} maxLength={5000} />
          </Field>
          <Field label="Discussion">
            <Textarea
              name="discussion"
              rows={4}
              defaultValue={minutes?.discussion ?? ''}
              maxLength={20000}
            />
          </Field>
          <Field label="Resolutions">
            <Textarea
              name="resolutions"
              rows={3}
              defaultValue={minutes?.resolutions ?? ''}
              maxLength={10000}
            />
          </Field>
          <Field label="Action items">
            <Textarea
              name="actionItems"
              rows={3}
              defaultValue={minutes?.actionItems ?? ''}
              maxLength={10000}
            />
          </Field>

          <Field
            label="Status"
            required
            hint="Draft minutes are visible only to officers. Approved minutes are published to members."
          >
            <Select name="status" defaultValue={minutes?.status ?? 'DRAFT'}>
              {MINUTE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Save minutes</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
