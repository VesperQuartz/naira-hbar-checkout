import { onError } from "@orpc/server";
import { CompressionPlugin, RPCHandler } from "@orpc/server/fetch";
import {
	CORSPlugin,
	RequestHeadersPlugin,
	ResponseHeadersPlugin,
} from "@orpc/server/plugins";
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
