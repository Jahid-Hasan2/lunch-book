const fs = require('fs');
const { chromium } = require('playwright');

/* =====================================================
   🇧🇩 BANGLADESH HOLIDAY CHECK
   ===================================================== */

const holidayData = JSON.parse(
  fs.readFileSync('holidays.json', 'utf8')
);

const holidays = holidayData.holidays || [];

const dhakaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const todayStr = dhakaDate.format(new Date());

const [year, month, day] = todayStr.split('-').map(Number);
const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));

const tomorrowStr = [
  tomorrow.getUTCFullYear(),
  String(tomorrow.getUTCMonth() + 1).padStart(2, '0'),
  String(tomorrow.getUTCDate()).padStart(2, '0')
].join('-');

const tomorrowHoliday = holidays.find(h => {
  if (h.date === tomorrowStr) return true;

  return Boolean(
    h.start_date &&
    h.end_date &&
    tomorrowStr >= h.start_date &&
    tomorrowStr <= h.end_date
  );
});

/* =====================================================
   🧹 CLEANUP
   ===================================================== */

function cleanupAuthFile() {
  try {
    if (fs.existsSync('ulka-auth.json')) {
      fs.unlinkSync('ulka-auth.json');
    }
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
}

/* =====================================================
   📊 STATUS
   ===================================================== */

function writeStatus(status) {
  fs.writeFileSync('booking-status.txt', status);
}

/* =====================================================
   🚀 MAIN
   ===================================================== */

(async () => {
  let exitCode = 0;

  try {

    /*
     * HOLIDAY EXIT
     */

    if (tomorrowHoliday) {
      console.log(`🎉 Holiday: ${tomorrowHoliday.name}`);

      writeStatus(
        `SKIPPED_HOLIDAY|${tomorrowStr}|${tomorrowHoliday.name}`
      );

      return;
    }

    /*
     * AUTHENTICATION STATE
     */

    if (!process.env.ULKA_AUTH_JSON) {
      throw new Error('ULKA_AUTH_JSON missing');
    }

    fs.writeFileSync(
      'ulka-auth.json',
      Buffer.from(
        process.env.ULKA_AUTH_JSON,
        'base64'
      )
    );

    /*
     * BOOKING
     */

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let browser;
      let bookingResult = null;

      try {
        console.log(`🔁 Attempt ${attempt}`);

        browser = await chromium.launch({
          headless: true,
          args: [
            '--disable-dev-shm-usage',
            '--no-sandbox'
          ]
        });

        console.log(
          'Chromium version:',
          browser.version()
        );

        const context = await browser.newContext({
          storageState: 'ulka-auth.json'
        });

        const page = await context.newPage();

        await page.goto(
          'https://www.ulka.autos/lunch-booking',
          {
            timeout: 60000,
            waitUntil: 'networkidle'
          }
        );

        await page.waitForSelector(
          '[role="switch"]',
          { timeout: 60000 }
        );

        await page.waitForTimeout(5000);

        bookingResult = await page.evaluate(async () => {
          const sw = document.querySelector('[role="switch"]');

          if (!sw) {
            return 'NO_SWITCH_FOUND';
          }

          const aria = sw.getAttribute('aria-checked');

          const disabled =
            sw.classList.contains('ant-switch-disabled') ||
            sw.hasAttribute('disabled');

          if (aria === 'true' || disabled) {
            return 'ALREADY_BOOKED';
          }

          sw.click();

          await new Promise(resolve =>
            setTimeout(resolve, 1500)
          );

          return sw.getAttribute('aria-checked') === 'true'
            ? 'CLICKED_TO_BOOK'
            : 'CLICK_FAILED';
        });

        console.log('Result:', bookingResult);

        await page.waitForTimeout(2000);

        await page.screenshot({
          path: 'final-state.png',
          fullPage: true
        });

        if (bookingResult === 'CLICKED_TO_BOOK') {
          writeStatus('BOOKED');
        } else if (bookingResult === 'ALREADY_BOOKED') {
          writeStatus('ALREADY_BOOKED');
        } else {
          throw new Error(
            `Unexpected booking result: ${bookingResult}`
          );
        }

        await browser.close();
        browser = null;

        cleanupAuthFile();

        return;

      } catch (err) {
        console.error(
          `❌ Attempt ${attempt} failed:`,
          err.message
        );

        if (browser) {
          await browser.close().catch(() => {});
        }

        if (
          bookingResult === 'CLICKED_TO_BOOK' ||
          bookingResult === 'ALREADY_BOOKED'
        ) {
          console.error(
            '⚠️ Booking result already recorded; skipping further attempts.'
          );

          return;
        }

        if (attempt === MAX_RETRIES) {
          writeStatus('FAILED');
          cleanupAuthFile();

          exitCode = 1;
          return;
        }

        console.log(
          `⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`
        );

        await new Promise(resolve =>
          setTimeout(resolve, RETRY_DELAY_MS)
        );
      }
    }

  } catch (err) {
    console.error('Fatal error:', err.message);
    cleanupAuthFile();
    exitCode = 1;
  } finally {
    process.exitCode = exitCode;
  }
})();
