'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';
import { useToast } from '@/components/ui/toast';
import { MONTH_OPTIONS, OBLIGATION_TYPES, OBLIGATION_TYPE_LABELS, yearOptions } from '@/lib/constants';
import {
  createObligationAction,
  generateCommunityServiceAction,
  generateDuesAction,
  waiveObligationAction,
} from '@/actions/finance-actions';

/**
 * ---------------------------------------------------------------------------
 * Treasurer billing controls.
 * Wires generateDuesAction, generateCommunityServiceAction, createObligationAction
 * and waiveObligationAction.
 *
 * Dues generation is idempotent by design: the service derives a deterministic
 * dedupeKey from member + period, so re-running it for the same month can never
 * double-bill anybody.
 * ---------------------------------------------------------------------------
 */

export function BillingField({ label, required, hint, children }) {
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

function PeriodFields() {
  const now = new Date();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BillingField label="Billing month" required>
        <Select name="periodMonth" defaultValue={now.getMonth() + 1}>
          {MONTH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </BillingField>
      <BillingField label="Billing year" required>
        <Select name="periodYear" defaultValue={now.getFullYear()}>
          {yearOptions({ back: 2, forward: 1 }).map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </Select>
      </BillingField>
    </div>
  );
}
export function GenerateDuesModal({ defaultAmount, defaultDueDay = 10 }) {
  const [state, formAction] = useActionState(generateDuesAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <CalendarRange className="h-4 w-4" aria-hidden="true" />
        Generate monthly dues
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Generate monthly dues"
        description="Creates one obligation per active member for the chosen period. Running it again for the same period creates nothing new."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />

          <PeriodFields />

          <BillingField label="Amount per member" required hint="Usually the club default.">
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={defaultAmount ?? '200.00'}
            />
          </BillingField>

          <BillingField label="Due date" required>
            <Input
              name="dueDate"
              type="date"
              required
              defaultValue={defaultDateForDay(defaultDueDay)}
            />
          </BillingField>

          <BillingField label="Scope" required hint="Bill everyone, or only selected members.">
            <Select name="scope" defaultValue="ALL">
              <option value="ALL">All active members</option>
              <option value="SELECTED">Selected members only</option>
            </Select>
          </BillingField>

          <BillingField label="Note" hint="Stored on each generated obligation.">
            <Input name="note" maxLength={500} placeholder="Regular monthly dues" />
          </BillingField>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Generate dues</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Due date = the configured due day in the currently selected billing month. */
function defaultDateForDay(day) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), Math.min(day, 28));
  const pad = (n) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

export function GenerateCommunityServiceModal({ activities = [] }) {
  const [state, formAction] = useActionState(generateCommunityServiceAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open} variant="secondary">
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        Generate CS obligations
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Generate community-service obligations"
        description="Creates a community-service obligation per active member for the chosen activity."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />

          <BillingField label="Activity" required hint="Only published activities can be billed.">
            <Select name="activityId" required defaultValue="">
              <option value="">Select an activity…</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </BillingField>

          <BillingField label="Fee amount" required>
            <Input name="amount" type="number" step="0.01" min="0" required />
          </BillingField>

          <BillingField label="Due date" required>
            <Input name="dueDate" type="date" required defaultValue={defaultDateForDay(15)} />
          </BillingField>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Generate obligations</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CreateObligationModal({ members = [] }) {
  const [state, formAction] = useActionState(createObligationAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        New obligation
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="New obligation"
        description="Bill a single member for an ad-hoc fee."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />

          <BillingField label="Member" required>
            <Select name="memberId" required defaultValue="">
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.memberNumber}
                </option>
              ))}
            </Select>
          </BillingField>

          <BillingField label="Obligation type" required>
            <Select name="type" defaultValue="OTHER_FEE">
              {OBLIGATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {OBLIGATION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </BillingField>

          <BillingField label="Title" required>
            <Input name="title" required maxLength={200} placeholder="Assembly fee" />
          </BillingField>

          <div className="grid gap-4 sm:grid-cols-2">
            <BillingField label="Amount due" required>
              <Input name="amountDue" type="number" step="0.01" min="0.01" required />
            </BillingField>
            <BillingField label="Due date" required>
              <Input
                name="dueDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </BillingField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <BillingField label="Billing month" hint="Leave blank for a one-off charge.">
              <Select name="periodMonth" defaultValue="">
                <option value="">Not period-based</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </BillingField>
            <BillingField label="Billing year">
              <Select name="periodYear" defaultValue="">
                <option value="">Not period-based</option>
                {yearOptions({ back: 2, forward: 1 }).map((y) => (
                  <option key={y.value} value={y.value}>
                    {y.label}
                  </option>
                ))}
              </Select>
            </BillingField>
          </div>

          <BillingField label="Notes">
            <Input name="notes" maxLength={1000} />
          </BillingField>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Create obligation</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Waives an obligation. The row is retained with status WAIVED and a reason. */
export function WaiveObligationButton({ obligation }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const run = () => {
    const reason = window.prompt(
      `Waive "${obligation.title}" (${obligation.typeLabel}). Reason (required, recorded in the audit log):`,
      '',
    );
    if (reason === null) return;
    if (reason.trim().length < 5) {
      toast.error('Please provide a reason of at least 5 characters.');
      return;
    }

    const formData = new FormData();
    formData.set('obligationId', obligation.id);
    formData.set('reason', reason.trim());

    startTransition(async () => {
      const result = await waiveObligationAction(formData);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={run}>
      Waive
    </Button>
  );
}
