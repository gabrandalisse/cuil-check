const logger = require('../logger');
const { retryWithBackoff } = require('../utils/retry');

async function queryAnses(page, config) {
  const { TIPO_DOCUMENTO, NUMERO_DOC, NOMBRE, APELLIDO, SEXO, FECHA_NACIMIENTO } = config;
  const ansesUrl = 'https://servicioswww.anses.gob.ar/C2-ConstaCUIL';
  logger.info({ url: ansesUrl }, '[ANSES] Navigating to url');
  
  await retryWithBackoff('ANSES Navigation', () =>
    page.goto(ansesUrl, { waitUntil: 'load', timeout: 45000 })
  );

  // Verify if the site is offline / service is unavailable
  const offlineRegex = /servicio no est[áa] disponible/i;
  let isOffline = false;

  const mainBodyText = await page.innerText('body').catch(() => '');
  if (offlineRegex.test(mainBodyText)) {
    isOffline = true;
  }

  const iframeLocator = page.locator('#main-iframe');
  if (!isOffline && (await iframeLocator.count()) > 0) {
    const frameText = await page.frameLocator('#main-iframe').locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (offlineRegex.test(frameText)) {
      isOffline = true;
    }
  }

  if (isOffline) {
    logger.warn('[ANSES] Detected offline status: "El servicio no está disponible".');
    return { success: false, offline: true, reason: 'El servicio no está disponible momentáneamente' };
  }

  logger.info('[ANSES] Filling in the form fields...');
  await page.selectOption('#TipoDocumento', TIPO_DOCUMENTO);
  await page.fill('#NumeroDoc', NUMERO_DOC);
  await page.fill('#Nombre', NOMBRE);
  await page.fill('#Apellido', APELLIDO);

  const upperSexo = SEXO.toUpperCase();
  if (['F', 'M', 'X'].includes(upperSexo)) {
    await page.check(`#Sexo${upperSexo}`);
  } else {
    throw new Error(`Invalid Sex value: ${SEXO}. Must be F, M, or X.`);
  }

  await page.fill('#FechaNacimiento', FECHA_NACIMIENTO);

  logger.info('[ANSES] Submitting the form...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }).catch(() => {}),
    page.click('#submit'),
  ]);

  logger.info('[ANSES] Waiting for "DESCARGAR CONSTANCIA" button...');
  const downloadButton = page.locator('text=/descargar constancia/i');
  await downloadButton.waitFor({ state: 'visible', timeout: 30000 });
  
  logger.info('[ANSES] Success: "DESCARGAR CONSTANCIA" button found!');
  return { success: true };
}

async function queryArgentina(page, config) {
  const { TIPO_DOCUMENTO, NUMERO_DOC, NOMBRE, APELLIDO, SEXO, FECHA_NACIMIENTO } = config;
  const fallbackUrl = 'https://www.argentina.gob.ar/descarga-constancia-cuil';
  logger.info({ url: fallbackUrl }, '[FALLBACK] Navigating to url');

  await retryWithBackoff('Fallback Navigation', () =>
    page.goto(fallbackUrl, { waitUntil: 'load', timeout: 60000 })
  );
  
  logger.info('[FALLBACK] Filling form fields on argentina.gob.ar...');
  
  // Map TIPO_DOCUMENTO to argentina.gob.ar options
  let argentinaTipoDoc = '29'; // Default to DNI (29)
  const upperTipoDoc = TIPO_DOCUMENTO.toUpperCase();
  if (upperTipoDoc === 'DNI' || upperTipoDoc === 'DU') {
    argentinaTipoDoc = '29';
  } else if (upperTipoDoc === 'LC') {
    argentinaTipoDoc = '26';
  } else if (upperTipoDoc === 'LE') {
    argentinaTipoDoc = '25';
  } else {
    argentinaTipoDoc = '00'; // Otros
  }
  
  await page.selectOption('#edit-tipo-doc', argentinaTipoDoc);
  await page.fill('#edit-num-doc', NUMERO_DOC);
  await page.fill('#edit-nombre', NOMBRE);
  await page.fill('#edit-apellido', APELLIDO);
  
  const upperSexo = SEXO.toUpperCase();
  if (upperSexo === 'M') {
    await page.check('#edit-sexo-m');
  } else if (upperSexo === 'F') {
    await page.check('#edit-sexo-f');
  } else if (upperSexo === 'X') {
    await page.check('#edit-sexo-x');
  } else {
    throw new Error(`Invalid Sex value for fallback: ${SEXO}. Must be F, M, or X.`);
  }
  
  // Format date from YYYY-MM-DD to DD/MM/YYYY
  let formattedBirthDate = FECHA_NACIMIENTO;
  if (/^\d{4}-\d{2}-\d{2}$/.test(FECHA_NACIMIENTO)) {
    const [year, month, day] = FECHA_NACIMIENTO.split('-');
    formattedBirthDate = `${day}/${month}/${year}`;
  }
  await page.fill('#edit-fecha-nacimiento-datepicker-popup-0', formattedBirthDate);
  
  logger.info('[FALLBACK] Submitting the form...');
  await page.click('#edit-envio');
  
  logger.info('[FALLBACK] Waiting for "Tu constancia fue generada" wording...');
  
  const successTextLocator = page.locator('text=/Tu constancia fue generada/i');
  const failureTextLocator = page.locator('text=/No pudimos generar tu constancia/i');
  
  const result = await Promise.race([
    successTextLocator.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'success'),
    failureTextLocator.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'failure'),
  ]);
  
  if (result === 'success') {
    logger.info('[FALLBACK] Success: "Tu constancia fue generada" text found!');
    return { success: true };
  } else {
    logger.warn('[FALLBACK] Failed: "No pudimos generar tu constancia" was found on the page.');
    return { success: false, reason: 'Argentina.gob.ar returned: "No pudimos generar tu constancia".' };
  }
}

module.exports = {
  queryAnses,
  queryArgentina,
};
