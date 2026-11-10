const fs = require('fs');
const { chromium } = require('playwright');

/* =====================================================
   🇧🇩 HOLIDAY CHECK (NEXT DAY)
   ===================================================== */

const holidayData = JSON.parse(fs.readFileSync('holidays.json', 'utf8'));
const holidays = holidayData.holidays;

// Current Bangladesh time
const now = new Date(
  new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })
);

// Tomorrow (BD time)
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);

// YYYY-MM-DD
const tomorrowStr = tomorrow.toLocaleDateString('en-CA', {
  timeZone: 'Asia/Dhaka'
});

// Holiday check
const tomorrowHoliday = holidays.find(h => h.date === tomorrowStr);

if (tomorrowHoliday) {
  console.log(`🎉 Tomorrow is a holiday: ${tomorrowHoliday.name}`);
  console.log('🚫 Skipping today’s lunch booking');
  process.exit(0); // success, no email because no screenshot
}

console.log(`✅ Tomorrow ${tomorrowStr} is a working day`);
console.log('🍱 Initiating today’s lunch booking...');

/* =====================================================
   🔐 AUTH STATE
   ===================================================== */

if (!process.env.ULKA_AUTH_JSON) {
  throw new Error('ULKA_AUTH_JSON secret is missing');
}

fs.writeFileSync(
  'ulka-auth.json',
  Buffer.from(process.env.ULKA_AUTH_JSON, 'base64')
);

/* =====================================================
   🍱 BOOKING LOGIC
   ===================================================== */

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

      await page.goto('https://www.ulka.autos/lunch-booking', {
        timeout: 60000
      });

      await page.waitForSelector('[role="switch"]', { timeout: 60000 });
      await page.waitForTimeout(5000);

      const result = await page.evaluate(() => {
        const sw = document.querySelector('[role="switch"]');
        if (!sw) return 'NO_SWITCH_FOUND';

        const aria = sw.getAttribute('aria-checked');
        const disabled =
          sw.classList.contains('ant-switch-disabled') ||
          sw.hasAttribute('disabled');

        if (aria === 'true' || disabled) {
          return 'ALREADY_BOOKED';
        }

        sw.click();
        return 'CLICKED_TO_BOOK';
      });

      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'final-state.png', fullPage: true });

      console.log('🍱 Lunch booking result:', result);

      await browser.close();
      process.exit(0);

    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed`);
      console.error(err);

      if (browser) await browser.close().catch(() => {});

      if (attempt === MAX_RETRIES) {
        console.error('❌ All retries exhausted');
        process.exit(1);
      }

      console.log(`⏳ Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
})();
