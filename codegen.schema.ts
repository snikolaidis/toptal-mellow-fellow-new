import { CodegenConfig } from "@graphql-codegen/cli";

const wpUrl = (
	process.env.NEXT_PUBLIC_WORDPRESS_URL ||
	"https://mellowfellow1.wpenginepowered.com"
).replace(/\/$/, "");

const config: CodegenConfig = {
	schema: `${wpUrl}/graphql`,
	generates: {
		"./schema.graphql": {
			plugins: ["schema-ast"],
		},
	},
};

export default config;
