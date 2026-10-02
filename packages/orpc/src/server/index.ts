import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { CompressionPlugin, RPCHandler } from "@orpc/server/fetch";
import {
	CORSPlugin,
	RequestHeadersPlugin,
	ResponseHeadersPlugin,
} from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { env } from "@repo/shared";
import { SuperJSONHandler } from "#/routers/middleware/superjson/handler";
import { router } from "../routers";

export const rpcHandler = new RPCHandler(router, {
	plugins: [
		new CORSPlugin(),
		new RequestHeadersPlugin(),
		new ResponseHeadersPlugin(),
		new CompressionPlugin(),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const handler = new SuperJSONHandler(router, {
	plugins: [
		new CORSPlugin(),
		new RequestHeadersPlugin(),
		new ResponseHeadersPlugin(),
		new OpenAPIReferencePlugin({
			docsProvider: "scalar", // default: 'scalar'
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: {
				info: {
					title: "ORPC Playground",
					version: "1.0.0",
				},
				servers: [
					// or let the plugin auto-infer from the request
					{ url: `${env.BETTER_AUTH_URL}/api/rpc` },
					{ url: `http://localhost:4747/api/rpc` },
				],
			},
		}),
		new CompressionPlugin(),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});
