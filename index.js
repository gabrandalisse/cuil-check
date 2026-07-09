require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const TIPO_DOCUMENTO = process.env.TIPO_DOCUMENTO || 'DU';
const NUMERO_DOC = process.env.NUMERO_DOC;
const NOMBRE = process.env.NOMBRE;
const APELLIDO = process.env.APELLIDO;
const SEXO = process.env.SEXO; // F, M, or X
const FECHA_NACIMIENTO = process.env.FECHA_NACIMIENTO; // Format: YYYY-MM-DD
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const HEADLESS = process.env.HEADLESS !== 'false';
const SCREENSHOT_PATH = path.join(__dirname, 'screenshot.png');

async function sendDiscordNotification(webhookUrl, message, screenshotPath = null) {
  try {
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({ content: message }));

    if (screenshotPath && fs.existsSync(screenshotPath)) {
      const fileBuffer = fs.readFileSync(screenshotPath);
      const blob = new Blob([fileBuffer], { type: 'image/png' });
      formData.append('file', blob, 'screenshot.png');
      console.log(`Attached screenshot: ${screenshotPath}`);
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      console.error(`Failed to send Discord notification: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
    } else {
      console.log('Discord notification sent successfully.');
    }
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

async function run() {
  // Validate required inputs
  const missing = [];
  if (!NUMERO_DOC) missing.push('NUMERO_DOC');
  if (!NOMBRE) missing.push('NOMBRE');
  if (!APELLIDO) missing.push('APELLIDO');
  if (!SEXO) missing.push('SEXO');
  if (!FECHA_NACIMIENTO) missing.push('FECHA_NACIMIENTO');
  if (!DISCORD_WEBHOOK_URL) missing.push('DISCORD_WEBHOOK_URL');

  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('Form inputs configuration loaded successfully:');
  console.log(`- Tipo de Documento: ${TIPO_DOCUMENTO}`);
  console.log(`- Número de Documento: ${NUMERO_DOC}`);
  console.log(`- Nombre: ${NOMBRE}`);
  console.log(`- Apellido: ${APELLIDO}`);
  console.log(`- Sexo: ${SEXO}`);
  console.log(`- Fecha de Nacimiento: ${FECHA_NACIMIENTO}`);
  console.log(`- Webhook Discord: Configured`);

  let browser;
  let success = false;
  let errorMsg = '';

  try {
    // Launch Playwright browser
    console.log(`Launching Chromium (headless=${HEADLESS})...`);
    browser = await chromium.launch({
      headless: HEADLESS,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    const url = 'https://servicioswww.anses.gob.ar/C2-ConstaCUIL';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    // Verify if the site is offline / service is unavailable (either in the main body or inside main-iframe)
    const offlineRegex = /servicio no est[áa] disponible/i;
    let isOffline = false;

    // Check main page body
    const mainBodyText = await page.innerText('body').catch(() => '');
    if (offlineRegex.test(mainBodyText)) {
      isOffline = true;
    }

    // Check inside main-iframe if present (e.g. Incapsula block/error page)
    const iframeLocator = page.locator('#main-iframe');
    if (!isOffline && (await iframeLocator.count()) > 0) {
      const frameText = await page.frameLocator('#main-iframe').locator('body').innerText({ timeout: 5000 }).catch(() => '');
      if (offlineRegex.test(frameText)) {
        isOffline = true;
      }
    }

    if (isOffline) {
      console.log('Detected offline status: "El servicio no está disponible". The site is currently down.');
      
      const offlineMsg = `⚠️ **Site Offline**: The ANSES website is currently down.
• **Status**: Detected message "El servicio no está disponible momentáneamente"
• **Date**: ${new Date().toLocaleString()}`;
      
      console.log('Sending offline notification to Discord...');
      await sendDiscordNotification(DISCORD_WEBHOOK_URL, offlineMsg);
      if (browser) await browser.close();
      console.log('Script execution ended due to site offline status.');
      process.exit(0);
    }

    console.log('Filling in the form fields...');
    // Select TipoDocumento
    await page.selectOption('#TipoDocumento', TIPO_DOCUMENTO);

    // Fill NumeroDoc
    await page.fill('#NumeroDoc', NUMERO_DOC);

    // Fill Nombre
    await page.fill('#Nombre', NOMBRE);

    // Fill Apellido
    await page.fill('#Apellido', APELLIDO);

    // Select Sexo radio button
    const upperSexo = SEXO.toUpperCase();
    if (['F', 'M', 'X'].includes(upperSexo)) {
      await page.check(`#Sexo${upperSexo}`);
    } else {
      throw new Error(`Invalid Sex value: ${SEXO}. Must be F, M, or X.`);
    }

    // Fill FechaNacimiento (expects YYYY-MM-DD)
    await page.fill('#FechaNacimiento', FECHA_NACIMIENTO);

    // Take screenshot of the filled form for debugging
    console.log('Submitting the form...');
    
    // Click button "Consultar"
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).catch(() => {}),
      page.click('#submit'),
    ]);

    console.log('Waiting for "DESCARGAR CONSTANCIA" button...');
    
    // Wait for the button "DESCARGAR CONSTANCIA" (case-insensitive check)
    // We try to locate it by text
    const downloadButton = page.locator('text=/descargar constancia/i');
    try {
      await downloadButton.waitFor({ state: 'visible', timeout: 30000 });
      success = true;
      console.log('Success: "DESCARGAR CONSTANCIA" button found!');
    } catch (e) {
      console.log('Button "DESCARGAR CONSTANCIA" not found within the timeout.');
      errorMsg = 'Timeout waiting for DESCARGAR CONSTANCIA button. The site might be showing an error, a security challenge, or the data entered is invalid.';
    }

    // Take screenshot of the final page
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(`Saved screenshot to ${SCREENSHOT_PATH}`);

  } catch (error) {
    console.error('An error occurred during execution:', error);
    success = false;
    errorMsg = error.message;

    // Try to take screenshot if page and browser are open
    if (browser) {
      try {
        const pages = browser.contexts()[0]?.pages();
        if (pages && pages.length > 0) {
          await pages[0].screenshot({ path: SCREENSHOT_PATH, fullPage: true });
          console.log(`Saved error screenshot to ${SCREENSHOT_PATH}`);
        }
      } catch (screenshotError) {
        console.error('Could not take error screenshot:', screenshotError.message);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }

  // Construct message for Discord
  let discordMessage = '';
  if (success) {
    discordMessage = `✅ **Success**: The CUIL query succeeded! The "DESCARGAR CONSTANCIA" button was found.
• **Name**: ${NOMBRE} ${APELLIDO}
• **Doc**: ${TIPO_DOCUMENTO} ${NUMERO_DOC}
• **Date**: ${new Date().toLocaleString()}`;
  } else {
    discordMessage = `❌ **Failure**: The CUIL query failed. The "DESCARGAR CONSTANCIA" button was not found.
• **Name**: ${NOMBRE} ${APELLIDO}
• **Doc**: ${TIPO_DOCUMENTO} ${NUMERO_DOC}
• **Reason**: ${errorMsg || 'Unknown error'}
• **Date**: ${new Date().toLocaleString()}`;
  }

  console.log('Sending message to Discord Webhook...');
  await sendDiscordNotification(DISCORD_WEBHOOK_URL, discordMessage, SCREENSHOT_PATH);
  
  // Exit with correct status code
  process.exit(success ? 0 : 1);
}

run();
