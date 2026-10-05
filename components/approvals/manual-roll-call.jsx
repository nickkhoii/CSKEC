'use client';

import { useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select } from '@/components/ui/form';
import {
  ATTENDANCE_RECORD_STATUSES,
  ATTENDANCE_RECORD_STATUS_LABELS,
} from '@/lib/constants';
import { manualAttendanceAction } from '@/actions/attendance-actions';

/**
 * ---------------------------------------------------------------------------
 * Bulk manual roll call (Secretary module)
 *
 * Unlike the request/approve flow this writes official records immediately, so
 * it is restricted to `attendance:record_manual` and every entry is audited.
 * The server skips (rather than duplicates) members who already have a record,
 * and `@@unique([activityId, memberId])` enforces that a double submit cannot
 * create two rows even under concurrency.
 * ---------------------------------------------------------------------------
 */
export function ManualRollCall({ activities = [], members = [], preSelectedActivityId = '' }) {
  const [open, setOpen] = useState(false);
  const [activityId, setActivityId] = useState(preSelectedActivityId);
  const [recordStatus, setRecordStatus] = useState('PRESENT');

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        Manual roll call
      </Button>
    );
  }

  const selectedActivity = activities.find((a) => a.id === activityId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl bg-white shadow-panel sm:rounded-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Manual roll call</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Writes official attendance records directly. Members who already have a record for
              this activity are disabled.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded p-1 text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form action={manualAttendanceAction} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-ink">
                Activity <span className="text-rose-600">*</span>
              </span>
              <Select
                name="activityId"
                required
                defaultValue={activityId}
                onChange={(e) => setActivityId(e.target.value)}
              >
                <option value="">Select an activity…</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-ink">Record status</span>
              <Select
                name="recordStatus"
                value={recordStatus}
                onChange={(e) => setRecordStatus(e.target.value)}
              >
                {ATTENDANCE_RECORD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ATTENDANCE_RECORD_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className="block text-xs font-medium text-ink">Remarks</span>
            <Input name="remarks" maxLength={500} placeholder="Optional note stored on each record" />
          </label>

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Members{selectedActivity ? ` — ${selectedActivity.title}` : ''}
            </p>
            {!activityId ? (
              <p className="rounded-md bg-slate-50 px-3 py-4 text-center text-xs text-ink-muted">
                Select an activity to load the roll call list.
              </p>
            ) : (
              <RollCallList members={members} activityId={activityId} />
            )}
          </div>

          <div className="mt-5 flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit" disabled={!activityId}>
              Save records
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RollCallList({ members, activityId }) {
  if (members.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-4 text-center text-xs text-ink-muted">
        There are no active members to record.
      </p>
    );
  }

  return (
    <div className="grid max-h-72 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3 sm:grid-cols-2">
      {members.map((member) => (
        <RollCallMember
          key={member.id}
          member={member}
          alreadyRecorded={member.recordedActivityIds?.includes(activityId)}
        />
      ))}
    </div>
  );
}

function RollCallMember({ member, alreadyRecorded }) {
  return (
    <label
      className={[
        'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        alreadyRecorded
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-ink-muted'
          : 'cursor-pointer border-slate-200 hover:border-navy-300 has-[:checked]:border-navy-500 has-[:checked]:bg-navy-50',
      ].join(' ')}
    >
      <input
        type="checkbox"
        name="memberIds"
        value={member.id}
        disabled={alreadyRecorded}
        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
      />
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{member.name}</span>
        <span className="block truncate text-[10px] text-ink-muted">
          {alreadyRecorded ? 'Already recorded' : member.memberNumber}
        </span>
      </span>
    </label>
  );
}
