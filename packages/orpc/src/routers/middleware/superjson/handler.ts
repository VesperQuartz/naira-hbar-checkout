import type { Context, Router } from "@orpc/server";
import type { FetchHandlerOptions } from "@orpc/server/fetch";
import { FetchHandler } from "@orpc/server/fetch";
import { StrictGetMethodPlugin } from "@orpc/server/plugins";
import type { StandardHandlerOptions } from "@orpc/server/standard";
import {
	StandardHandler,
	StandardRPCCodec,
	StandardRPCMatcher,
} from "@orpc/server/standard";
import { SuperJSONSerializer } from "#/routers/middleware/superjson/serializer";

export interface SuperJSONHandlerOptions<T extends Context>
	extends FetchHandlerOptions<T>,
		Omit<StandardHandlerOptions<T>, "plugins"> {
	/**
	 * Enable or disable the StrictGetMethodPlugin.
	 *
	 * @default true
	 */
	strictGetMethodPluginEnabled?: boolean;
}

export class SuperJSONHandler<T extends Context> extends FetchHandler<T> {
	constructor(
		router: Router<any, T>,
		options: NoInfer<SuperJSONHandlerOptions<T>> = {},
	) {
		options.plugins ??= [];

		const strictGetMethodPluginEnabled =
			options.strictGetMethodPluginEnabled ?? true;

		if (strictGetMethodPluginEnabled) {
			options.plugins.push(new StrictGetMethodPlugin());
		}

		const serializer = new SuperJSONSerializer();
		const matcher = new StandardRPCMatcher();
		const codec = new StandardRPCCodec(serializer as any);

		super(new StandardHandler(router, matcher, codec, options), options);
	}
}
