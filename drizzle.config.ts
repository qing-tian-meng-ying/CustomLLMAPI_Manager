import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/storage/database/shared/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url: './data/api-gateway.db',
	},
});
