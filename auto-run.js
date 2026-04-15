const fs = require('fs');
const { chromium } = require('playwright');

if (!process.env.ULKA_AUTH_JSON) {
  throw new Error('ULKA_AUTH_JSON secret missing');
}

fs.writeFileSync(
  'ulka-auth.json',
  Buffer.from(process.env.ULKA_AUTH_JSON, 'base64')
);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

(async () => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let browser;

    try {
      console.log(`🔁 Attempt ${attempt}/${MAX_RETRIES}`);

      browser = await chromium.launch({ headless: true });

      const context = await browser.newContext({
        storageState: 'ulka-auth.json'
      });

      const page = await context.newPage();
      await page.goto('https://www.ulka.autos/lunch-booking', { timeout: 60000 });

      await page.waitForSelector('[role="switch"]', { timeout: 60000 });
      await page.waitForTimeout(5000);

      const result = await page.evaluate(() => {
        const sw = document.querySelector('[role="switch"]');
        if (!sw) return 'NO_SWITCH_FOUND';

        const aria = sw.getAttribute('aria-checked');
        const disabled =
          sw.classList.contains('ant-switch-disabled') ||
          sw.hasAttribute('disabled');

        if (aria === 'true' || disabled) return 'ALREADY_BOOKED';

        sw.click();
        return 'CLICKED_TO_BOOK';
      });

      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'final-state.png', fullPage: true });

      console.log('🍱 Result:', result);

      await browser.close();
      process.exit(0);

    } catch (err) {
      console.error(err);
      if (browser) await browser.close();
      if (attempt === MAX_RETRIES) process.exit(1);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
})();
