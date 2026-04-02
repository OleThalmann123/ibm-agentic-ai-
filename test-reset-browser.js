const { chromium } = require('playwright');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('err')) {
      console.log(`[BROWSER ERROR] ${msg.text()}`);
    } else {
      console.log(`[BROWSER LOG] ${msg.text()}`);
    }
  });

  try {
    console.log('Navigating to login...');
    await page.goto('http://localhost:5173/login');
    
    // Check if we are already logged in (redirected)
    await page.waitForLoadState('networkidle');
    if (page.url().includes('login')) {
      console.log('Clicking Demo Login...');
      await page.click('button[aria-label="Demo Zugang"]');
      await page.waitForURL('**/assistants**', { timeout: 10000 });
      console.log('Logged in successfully.');
    }

    console.log('Navigating to settings...');
    await page.goto('http://localhost:5173/settings');
    await page.waitForLoadState('networkidle');

    console.log('Clicking Reset Onboarding...');
    page.on('dialog', async dialog => {
      console.log('Dialog appeared: ' + dialog.message());
      await delay(500);
      await dialog.accept();
    });

    const resetBtn = page.locator('button:has-text("Onboarding zurücksetzen")');
    await resetBtn.click();
    
    // Wait for either success or timeout
    try {
      await page.waitForURL('**/login', { timeout: 10000 });
      console.log('Successfully redirected to login after reset!');
    } catch (e) {
      console.log('Timed out waiting for login redirect. Check browser errors.');
    }

  } catch (e) {
    console.error('Script Error:', e);
  } finally {
    await browser.close();
  }
}

run();
