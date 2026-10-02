import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { router } from "../routers";

const generator = new OpenAPIGenerator({
	schemaConverters: [new ZodToJsonSchemaConverter()],
});

const spec = await generator.generate(router, {
	info: {
		title: "Planet API",
		version: "1.0.0",
	},
});

console.log(JSON.stringify(spec, null, 2));
