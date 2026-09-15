import { CodegenConfig } from "@graphql-codegen/cli";

// Defaults to the committed snapshot so PR runs need no network. Only the
// nightly job sets SCHEMA_SOURCE, pointing this at the live endpoint.
const schema = process.env.SCHEMA_SOURCE || "./schema.graphql";

// Not codegen.ts's `client` preset: that requires globally unique operation
// names and six are duplicated today, so it fails for unrelated reasons.
const config: CodegenConfig = {
	schema,
	// Named, not globbed: CoreHeading and CoreButton ask for a textAlign our
	// schema does not have, and the templates spread these two by name.
	documents: [
		"src/**/*.{tsx,ts}",
		"node_modules/@faustwp/blocks/dist/mjs/blocks/CoreParagraph.js",
		"node_modules/@faustwp/blocks/dist/mjs/blocks/CoreImage.js",
	],
	generates: {
		// Gitignored throwaway. The check is that generation succeeds.
		"./src/__generated__/validate.ts": {
			plugins: ["typescript", "typescript-operations"],
		},
	},
	ignoreNoDocuments: true,
};

export default config;
