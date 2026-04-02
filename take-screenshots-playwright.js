const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots_asklepios');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR);
}

// Clean up old screenshots
const files = fs.readdirSync(SCREENSHOT_DIR);
for (const file of files) {
  if (file.endsWith('.png')) fs.unlinkSync(path.join(SCREENSHOT_DIR, file));
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findAndClick(page, textMatchers, elementType = 'button') {
  const els = await page.locator(elementType).all();
  for (const el of els) {
    const text = await el.innerText();
    const match = Array.isArray(textMatchers) ? textMatchers.some(m => text.includes(m)) : text.includes(textMatchers);
    if (match) {
      await el.click();
      return true;
    }
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Capturing V2 (Admin-Ansicht) Flows...');
    // 1: Login V2
    await page.goto('http://localhost:5173/login', { waitUntil: 'load' });
    await delay(3000); 
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_V2_Login_Screen.png') });
    
    // Click Demo Login
    console.log('Clicking Demo...');
    let clicked = await findAndClick(page, ['Demo-Mitarbeiter', 'Schnellzugriff', 'Demo Zugang']);
    if (!clicked) console.log('Could not find Demo button V2');
    
    console.log('Waiting for V2 login...');
    await page.waitForURL('**/assistants*', { timeout: 15000 }).catch(()=>console.log('URL wait timed out'));
    await delay(4000); // Wait for animations
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_V2_Assistants_Overview.png') });

    // Go to Payroll
    console.log('Capturing V2 Payroll...');
    await findAndClick(page, ['Lohnabrechnungen', 'Payroll', 'Lohn'], 'a');
    await delay(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_V2_Payroll_View.png') });

    // Go to Settings
    console.log('Capturing V2 Settings...');
    await findAndClick(page, ['Einstellungen', 'Settings'], 'a');
    await delay(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_V2_Settings.png') });

    // Reset Onboarding
    console.log('Resetting Onboarding via V2 for clean V1 state...');
    page.on('dialog', async dialog => {
      await delay(500);
      await dialog.accept();
    });
    
    await findAndClick(page, ['Onboarding zurücksetzen']);
    
    console.log('Waiting for logout...');
    await page.waitForURL('**/login*', { timeout: 15000 }).catch(()=>console.log('URL login reset wait timed out'));
    await delay(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_V2_Post_Reset_Login.png') });

    // NOW FOR V1
    console.log('Capturing V1 (Assistenz-Ansicht) Flows...');
    await page.goto('http://localhost:5174/login', { waitUntil: 'load' });
    await delay(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_V1_Login_Screen.png') });

    // Click Demo Login
    await findAndClick(page, ['Demo-Mitarbeiter', 'Schnellzugriff', 'Demo Zugang']);
    
    console.log('Waiting for V1 login...');
    await page.waitForURL('**/assistants*', { timeout: 15000 }).catch(()=>console.log('URL wait V1 timed out'));
    await delay(5000); // data fetching & animation
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_V1_Assistants_Overview.png') });

    // Click first assistant to go to timer
    console.log('Capturing V1 Timer...');
    const asstLink = await page.locator('a[href^="/assistants/"]').all();
    if (asstLink.length > 0) {
      await asstLink[0].click();
      await delay(3000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_V1_Assistant_Timer.png') });
    }

    // Go to Settings for token generation
    console.log('Capturing V1 Token Generation...');
    await page.goto('http://localhost:5174/settings');
    await delay(3000);
    await findAndClick(page, ['Geräte verwalten', 'Manage']);
    await delay(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_V1_Token_Generation.png') });

    console.log('Screenshots correctly generated');

  } catch (err) {
    console.error('Script failed:', err);
  } finally {
    await browser.close();
    console.log('Screenshots captured successfully in ' + SCREENSHOT_DIR);
  }
})();
