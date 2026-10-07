export function MeetingAttendance({ attendance }) {
  return (
    <section aria-label="Official members present">
      <h3 className="text-sm font-semibold">Official members present ({attendance.members.length})</h3>
      <p className="mt-1 text-xs text-ink-muted">
        {attendance.linked
          ? 'Members officially marked PRESENT in the linked activity. Attendance is updated automatically.'
          : 'No attendance activity is linked. Link the correct activity using Edit meeting to display official attendance.'}
      </p>
      {attendance.members.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {attendance.members.map((member) => (
            <li key={member.id}>{member.name} <span className="text-xs text-ink-muted">({member.memberNumber})</span></li>
          ))}
        </ul>
      ) : attendance.linked ? <p className="mt-3 text-sm">No members have been officially marked present.</p> : null}
    </section>
  );
}
