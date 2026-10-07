const { chromium } = require('playwright');
const fs = require('node:fs');
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.setDefaultTimeout(60000);
  async function login(email) {
    await context.clearCookies();
    await page.goto(`${base}/login`);
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill('ChangeMe!2024');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/dashboard/, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor();
  }
  try {
    await login('secretary@csec.local');
    await page.goto(`${base}/secretary/posts`);
    await page.getByRole('button', { name: 'New club update', exact: true }).click();
    const post = page.getByRole('dialog');
    await post.locator('[name=title]').fill('Browser verified club update');
    await post.locator('[name=content]').fill('First paragraph of the club update.\nSecond paragraph with meeting details.');
    await post.getByRole('button', { name: 'Save update', exact: true }).click();
    await post.getByRole('status').filter({ hasText: 'Club update saved.' }).waitFor();
    await post.getByRole('button', { name: 'Close', exact: true }).click();
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: 'Browser verified club update' });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    if (!(await page.getByRole('dialog').locator('[name=content]').inputValue()).includes('Second paragraph')) throw new Error('Edit form lost saved content.');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    console.log('Browser: login, multiline post creation, and edit prefill passed.');
    await page.goto(`${base}/secretary/activities`);
    await page.getByRole('button', { name: 'Edit activity', exact: true }).first().click();
    const activity = page.getByRole('dialog');
    if (!(await activity.locator('[name=title]').inputValue())) throw new Error('Activity edit form is empty.');
    await activity.getByRole('button', { name: 'Save activity', exact: true }).click();
    await activity.getByRole('status').filter({ hasText: 'Activity saved.' }).waitFor();
    await activity.getByRole('button', { name: 'Close', exact: true }).click();
    console.log('Browser: activity edit and save passed.');
    if (process.env.SMOKE_ATTENDANCE_MEETING_ID) {
      await page.goto(`${base}/secretary/meetings`);
      const meetingRow = page.getByRole('row').filter({ hasText: 'Browser minutes attendance' });
      await meetingRow.getByRole('button', { name: 'Edit minutes', exact: true }).click();
      const attendance = page.getByRole('dialog').getByRole('region', { name: 'Official members present' });
      await attendance.getByText('Official members present (1)', { exact: true }).waitFor();
      await attendance.getByText(process.env.SMOKE_ATTENDANCE_MEMBER_NUMBER, { exact: false }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Save minutes', exact: true }).click();
      await page.getByRole('dialog').getByRole('status').filter({ hasText: 'Meeting minutes saved.' }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await page.goto(`${base}/meetings/${process.env.SMOKE_ATTENDANCE_MEETING_ID}`);
      await page.getByRole('region', { name: 'Official members present' }).getByText('Official members present (1)', { exact: true }).waitFor();
      await page.emulateMedia({ media: 'print' });
      if (!(await page.getByRole('region', { name: 'Official members present' }).isVisible())) throw new Error('Printed minutes omit attendance.');
      await page.emulateMedia({ media: 'screen' });
      console.log('Browser: minutes editor, save, detail and print attendance passed.');
    }
    await login('member@csec.local');
    if (process.env.SMOKE_ATTENDANCE_MEETING_ID) {
      await page.goto(`${base}/meetings/${process.env.SMOKE_ATTENDANCE_MEETING_ID}`);
      await page.getByRole('region', { name: 'Official members present' }).getByText(process.env.SMOKE_ATTENDANCE_MEMBER_NUMBER, { exact: false }).waitFor();
      console.log('Browser: member minutes display official attendance.');
    }
    await page.goto(`${base}/payments`);
    await page.getByRole('button', { name: 'Submit a payment', exact: true }).click();
    await page.locator('[name=referenceNumber]').fill('BROWSER-VERIFIED-001');
    await page.getByRole('button', { name: 'Submit for verification', exact: true }).click();
    await page.getByText('BROWSER-VERIFIED-001', { exact: true }).waitFor();
    await page.screenshot({ path: '.data/portal-browser.png', fullPage: true });
    if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
    console.log('Browser: member payment control and rendering passed without JavaScript errors.');
  } catch (error) {
    console.error('Browser failure:', error.message);
    try {
      fs.writeFileSync('.data/browser-failure.html', await page.content());
      await page.screenshot({ path: '.data/browser-failure.png', fullPage: true });
    } catch { /* Preserve the original failure if navigation is still active. */ }
    throw error;
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
