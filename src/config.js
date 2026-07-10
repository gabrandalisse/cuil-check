const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  TIPO_DOCUMENTO: z.string().default('DU'),
  NUMERO_DOC: z.string().min(1, 'NUMERO_DOC is required'),
  NOMBRE: z.string().min(1, 'NOMBRE is required'),
  APELLIDO: z.string().min(1, 'APELLIDO is required'),
  SEXO: z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    z.enum(['F', 'M', 'X'], {
      errorMap: () => ({ message: "SEXO must be 'F', 'M', or 'X'" }),
    })
  ),
  FECHA_NACIMIENTO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'FECHA_NACIMIENTO must be in YYYY-MM-DD format'),
  DISCORD_WEBHOOK_URL: z.string().url('DISCORD_WEBHOOK_URL must be a valid URL'),
  HEADLESS: z.preprocess(
    (val) => val !== 'false',
    z.boolean()
  ).default(true),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Configuration validation failed:');
  result.error.errors.forEach((err) => {
    console.error(`- ${err.path.join('.')}: ${err.message}`);
  });
  process.exit(1);
}

module.exports = result.data;
