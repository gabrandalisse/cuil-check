const config = require('./config');
const logger = require('./logger');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { queryAnses, queryArgentina } = require('./services/scraper');
const { sendDiscordNotification } = require('./services/discord');

chromium.use(stealth);

async function run() {
  logger.info({
    tipoDoc: config.TIPO_DOCUMENTO,
    numeroDoc: config.NUMERO_DOC,
    nombre: config.NOMBRE,
    apellido: config.APELLIDO,
    sexo: config.SEXO,
    fechaNacimiento: config.FECHA_NACIMIENTO,
  }, 'Form inputs configuration loaded successfully');

  let browser;
  let success = false;
  let errorMsg = '';
  let usedFallback = false;
  let fallbackSuccess = false;
  let ansesSuccess = false;

  try {
    logger.info({ headless: config.HEADLESS }, 'Launching Chromium...');
    browser = await chromium.launch({
      headless: config.HEADLESS,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // 1. Try ANSES
    try {
      const ansesResult = await queryAnses(page, config);
      if (ansesResult.success) {
        ansesSuccess = true;
        success = true;
      } else {
        errorMsg = ansesResult.reason || 'ANSES offline';
      }
    } catch (ansesError) {
      logger.error(ansesError, '[ANSES] Failed or timed out');
      errorMsg = ansesError.message;
    }

    // 2. Fallback to Argentina.gob.ar
    if (!ansesSuccess) {
      usedFallback = true;
      logger.info('[FALLBACK] ANSES is offline or failed. Attempting fallback on www.argentina.gob.ar...');
      try {
        const fallbackResult = await queryArgentina(page, config);
        if (fallbackResult.success) {
          fallbackSuccess = true;
          success = true;
        } else {
          errorMsg = fallbackResult.reason || 'Wording not found';
        }
      } catch (fallbackError) {
        logger.error(fallbackError, '[FALLBACK] Failed or timed out');
        errorMsg = fallbackError.message;
      }
    }

  } catch (error) {
    logger.error(error, 'An error occurred during browser execution');
    success = false;
    errorMsg = error.message;
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed.');
    }
  }

  // Construct message for Discord
  const statusDetails = [
    `• **Name**: ${config.NOMBRE} ${config.APELLIDO}`,
    `• **Doc**: ${config.TIPO_DOCUMENTO} ${config.NUMERO_DOC}`,
    `• **ANSES Status**: ${ansesSuccess ? 'Success (found "DESCARGAR CONSTANCIA")' : 'Failed / Offline'}`,
    `• **Fallback (Argentina.gob.ar)**: ${usedFallback ? (fallbackSuccess ? 'Success (found "Tu constancia fue generada")' : `Failed (${errorMsg})`) : 'Not needed'}`,
    `• **Date**: ${new Date().toLocaleString()}`
  ];

  let discordMessage = '';
  if (success) {
    discordMessage = `✅ **Success**: CUIL query succeeded!\n${statusDetails.join('\n')}`;
    logger.info('Script completed successfully.');
  } else {
    discordMessage = `❌ **Failure**: CUIL query failed.\n${statusDetails.join('\n')}`;
    logger.error({ errorMsg }, 'Script failed.');
  }

  logger.info('Sending message to Discord Webhook...');
  await sendDiscordNotification(config.DISCORD_WEBHOOK_URL, discordMessage);

  process.exit(success ? 0 : 1);
}

run();
