import { describe, expect, it, vi } from 'vitest';
import { storeUpload } from '@/lib/storage';
import { validateSetting, SETTING_KEYS } from '@/lib/settings';
import { runAction } from '@/actions/helpers';
import { evaluateRequestEligibility } from '@/lib/attendance';

describe('security regressions', () => {
  it('rejects executable content disguised as a PNG', async () => {
    const file = new File(['<script>alert(1)</script>'], 'proof.png', { type: 'image/png' });
    await expect(storeUpload(file)).rejects.toMatchObject({ code: 'BAD_TYPE' });
  });
  it('does not disclose unexpected exception messages', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runAction(() => { throw new Error('secret database credentials'); });
    expect(result.message).not.toContain('secret');
    spy.mockRestore();
  });
  it('rejects malformed security settings', () => {
    expect(() => validateSetting(SETTING_KEYS.SESSION_HOURS, 'NaN')).toThrow();
    expect(() => validateSetting(SETTING_KEYS.LOGIN_MAX_ATTEMPTS, '-1')).toThrow();
    expect(() => validateSetting(SETTING_KEYS.DUES_DUE_DAY, '31')).toThrow();
    expect(() => validateSetting('unknown.setting', 'true')).toThrow();
  });
  it('does not allow attendance before an event begins', () => {
    expect(evaluateRequestEligibility({ activity: { status: 'PUBLISHED', requiresAttendance: true,
      startsAt: new Date(Date.now() + 86400000) } }).allowed).toBe(false);
  });
});
