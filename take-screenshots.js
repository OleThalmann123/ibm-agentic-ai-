const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots_asklepios');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR);
}

async function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    // defaultViewport: { width: 1440, height: 900 }
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();

  console.log('Capturing V2 (Admin-Ansicht) Flows...');
  // 1: Login V2
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await delay(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_V2_Login_Screen.png') });
  
  // Click Demo Login
  const demoBts = await page.$$('button');
  for (let btn of demoBts) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Demo Zugang')) {
      await btn.click();
      break;
    }
  }
  
  console.log('Waiting for V2 login...');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await delay(2000); // Give toast time to appear
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_V2_Assistants_Overview.png') });

  // Go to Payroll
  console.log('Capturing V2 Payroll...');
  const navLinks = await page.$$('a');
  for (let link of navLinks) {
    const text = await page.evaluate(el => el.textContent, link);
    if (text && text.includes('Lohnabrechnungen')) {
      await link.click();
      break;
    }
  }
  await delay(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_V2_Payroll_View.png') });

  // Go to Settings
  console.log('Capturing V2 Settings...');
  const navLinksSettings = await page.$$('a');
  for (let link of navLinksSettings) {
    const text = await page.evaluate(el => el.textContent, link);
    if (text && text.includes('Einstellungen')) {
      await link.click();
      break;
    }
  }
  await delay(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_V2_Settings.png') });

  // Reset Onboarding
  console.log('Resetting Onboarding via V2 for clean V1 state...');
  page.on('dialog', async dialog => {
    await delay(500);
    await dialog.accept();
  });

  const buttons = await page.$$('button');
  for (let btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Onboarding zurücksetzen')) {
      await btn.click();
      break;
    }
  }
  
  console.log('Waiting for logout...');
  await delay(3000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_V2_Post_Reset_Login.png') });


  // NOW FOR V1
  console.log('Capturing V1 (Assistenz-Ansicht) Flows...');
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle2' });
  await delay(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_V1_Login_Screen.png') });

  // Click Demo Login
  const demoBtsV1 = await page.$$('button');
  for (let btn of demoBtsV1) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Demo Zugang')) {
      await btn.click();
      break;
    }
  }
  
  console.log('Waiting for V1 login...');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await delay(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_V1_Assistants_Overview.png') });

  // Click first assistant to go to timer
  console.log('Capturing V1 Timer...');
  const asstCards = await page.$$('a[href^="/assistants/"]');
  if (asstCards.length > 0) {
    await asstCards[0].click();
    await delay(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_V1_Assistant_Timer.png') });
  }

  // Go to Token Generation
  console.log('Capturing V1 Token Generation...');
  const dButtons = await page.$$('button');
  for (let btn of dButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Geräte verwalten')) {
      await btn.click();
      break;
    }
  }
  await delay(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_V1_Token_Generation.png') });

  await browser.close();
  console.log('Screenshots captured successfully in ' + SCREENSHOT_DIR);
}

run().catch(err => {
  console.error("Error running puppeteer:", err);
  process.exit(1);
});
