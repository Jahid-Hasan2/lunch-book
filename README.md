# 🍱 LUNCH_BOOK – Automated Lunch Booking  
**Playwright + GitHub Actions**

Automates lunch booking on  
👉 https://www.ulka.autos/lunch-booking  

Login **once manually**, then let GitHub Actions handle booking automatically on schedule.

---

## 📌 Features

- One-time manual login (OTP supported)
- Secure session storage using GitHub Secrets
- Automatic booking via cron schedule
- Retry logic for reliability
- Full-page screenshot proof committed to repo

---

## 📁 Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── lunch.yml
├── auto-run.js
├── package.json
├── package-lock.json
├── README.md
```

> ⚠️ `ulka-auth.json` is **NOT committed**. It is stored securely in GitHub Secrets.

---

## 1️⃣ Prerequisites

- Windows (no admin access required)
- Node.js ≥ 18
- GitHub account
- Internet access

---

## 2️⃣ Install Node.js (No Admin)

Download ZIP from:
https://nodejs.org/dist/

Choose:
```
node-v20.x.x-win-x64.zip
```

Extract to:
```
C:\Users\<YOUR_USER>\nodejs
```

Add to PATH:
```powershell
setx PATH "$env:PATH;C:\Users\<YOUR_USER>\nodejs"
```

Verify:
```powershell
node -v
npm -v
```

---

## 3️⃣ Create Playwright Project

```bash
mkdir LUNCH_BOOK
cd LUNCH_BOOK
npm init -y
npm i playwright
npx playwright install chromium
```

---

## 4️⃣ One-Time Manual Login

### login-once.js

```js
const { chromium } = require('playwright');
const readline = require('readline');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.ulka.autos/lunch-booking');

  console.log(`
========================================
 LOGIN MANUALLY IN THE BROWSER
 After login is COMPLETE, press ENTER
========================================
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise(resolve => rl.question('', resolve));
  rl.close();

  await context.storageState({ path: 'ulka-auth.json' });
  console.log('✅ Session saved to ulka-auth.json');

  await browser.close();
})();
```

Run:
```powershell
node login-once.js
```

---

## 5️⃣ Convert Session File to Secret

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ulka-auth.json")) | Set-Clipboard
```

GitHub → Repo → Settings → Secrets → Actions

```
Name: ULKA_AUTH_JSON
Value: (paste clipboard)
```

---

## 6️⃣ Auto Booking Script

### auto-run.js

```js
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
```

---

## 7️⃣ GitHub Actions Workflow

### .github/workflows/lunch.yml

```yml
name: Auto Lunch Booking

on:
  schedule:
    - cron: '0 4 * * 0,1,2,3,4'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  book-lunch:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - run: npx playwright install chromium

      - name: Run booking
        env:
          ULKA_AUTH_JSON: ${{ secrets.ULKA_AUTH_JSON }}
        run: node auto-run.js

      - name: Commit screenshot
        run: |
          if [ -f final-state.png ]; then
            git config user.name "github-actions"
            git config user.email "github-actions@github.com"
            git add final-state.png
            git commit -m "📸 Lunch booking proof"
            git push
          fi
```
## Upload following file in repo:

- `package.json`
- `package-lock.json`
  
---

## 🔐 Security Notes

- Repository must be **PRIVATE**
- Never commit `ulka-auth.json`
- Rotate session if login expires

---

## ✅ Done

Lunch booking will now run automatically via GitHub Actions.
