# ANSES CUIL Form Automator

This Playwright script automates filling out the ANSES CUIL query form (at https://servicioswww.anses.gob.ar/C2-ConstaCUIL), navigates to the result page, checks if the query succeeded by searching for the "DESCARGAR CONSTANCIA" button, and notifies a Discord channel via a webhook with the outcome.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher is recommended)

## Installation

Install dependencies and download the Chromium browser binary:

```bash
npm install
npx playwright install chromium
```

## Configuration

Copy the `.env.example` file to `.env` and fill in the values:

```bash
cp .env.example .env
```

Define the following environment variables in `.env`:

| Variable | Description | Example |
|---|---|---|
| `TIPO_DOCUMENTO` | Type of document (DU, LE, LC, O) | `DU` |
| `NUMERO_DOC` | Document Number | `12345678` |
| `NOMBRE` | First name(s) | `Juan` |
| `APELLIDO` | Last name(s) | `Perez` |
| `SEXO` | Sex option (F, M, or X) | `M` |
| `FECHA_NACIMIENTO` | Date of birth (format: `YYYY-MM-DD`) | `1990-05-15` |
| `DISCORD_WEBHOOK_URL`| The webhook URL of your Discord channel | `https://discord.com/api/webhooks/...` |
| `HEADLESS` | Run browser in headless mode (`true` or `false`) | `true` |

## Execution

Run the script locally:

```bash
npm start
```

### Docker Usage

You can also run this application inside Docker. First, build the Docker image:

```bash
docker build -t cuil-check .
```

Then, run the container passing your `.env` file containing the environment variables:

```bash
docker run --env-file .env cuil-check
```

### Script Behavior
1. **Validation**: Checks if all necessary environment variables are set.
2. **Navigation**: Launches a Chromium instance and navigates to the ANSES CUIL form page.
3. **Offline Check**: Scans for the message "El servicio no está disponible momentáneamente". If the site is offline, it immediately sends a Discord warning notification and exits cleanly.
4. **Filling Form**: Fills out the document type, number, name, surname, sex, and date of birth according to the environment variables.
5. **Submission**: Clicks **CONSULTAR** and waits for navigation.
6. **Success Verification**: Waits up to 30 seconds for the button `"DESCARGAR CONSTANCIA"` to appear.
7. **Discord Webhook**: Sends a rich text message containing the status and details.
