const logger = require('../logger');

async function sendDiscordNotification(webhookUrl, message) {
  try {
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({ content: message }));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, statusText: response.statusText, responseBody: text }, 'Failed to send Discord notification');
    } else {
      logger.info('Discord notification sent successfully.');
    }
  } catch (error) {
    logger.error(error, 'Error sending Discord notification');
  }
}

module.exports = {
  sendDiscordNotification,
};
