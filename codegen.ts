import { CodegenConfig } from "@graphql-codegen/cli";
 
const config: CodegenConfig = {
	// The live WP Engine schema — the same endpoint the app queries (see
	// NEXT_PUBLIC_WORDPRESS_URL). NOTE: new ACF-block types only appear here
	// after the mu-plugins deploy to main, so run `npm run generate:types`
	// only once a new block's type exists in the live schema.
	schema: "https://mellowfellow1.wpenginepowered.com/graphql",
	documents: ["src/**/*.{tsx,ts}"],
	generates: {
		"./src/__generated__/": {
			preset: "client",
			plugins: [],
			presetConfig: {
				gqlTagName: "gql",
			},
		},
	},
	ignoreNoDocuments: true,
};
 
export default config;