const logger = require('../logger');

/**
 * Retries an asynchronous function with exponential backoff.
 * @param {string} actionName - A human-readable name of the action being retried.
 * @param {Function} fn - The asynchronous function to execute.
 * @param {number} maxRetries - Maximum number of retries before failing.
 * @param {number} initialDelay - Initial delay in milliseconds.
 * @returns {Promise<any>} The result of the async function.
 */
async function retryWithBackoff(actionName, fn, maxRetries = 3, initialDelay = 1000) {
  let attempt = 1;
  let delay = initialDelay;

  while (attempt <= maxRetries) {
    try {
      if (attempt > 1) {
        logger.info({ attempt, actionName }, 'Retrying action...');
      }
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        logger.error(
          { attempt, actionName, error: error.message },
          'Action failed after maximum retry attempts'
        );
        throw error;
      }

      logger.warn(
        { attempt, actionName, nextDelayMs: delay, error: error.message },
        'Action failed, scheduling retry'
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
      delay *= 2; // Exponential delay doubling
    }
  }
}

module.exports = {
  retryWithBackoff,
};
