import type { ClientContext } from "@orpc/client";
import type { LinkFetchClientOptions } from "@orpc/client/fetch";
import { LinkFetchClient } from "@orpc/client/fetch";
import type {
	StandardLinkOptions,
	StandardRPCLinkCodecOptions,
} from "@orpc/client/standard";
import { StandardLink, StandardRPCLinkCodec } from "@orpc/client/standard";
import { SuperJSONSerializer } from "#/routers/middleware/superjson/serializer";

export interface SuperJSONLinkOptions<T extends ClientContext>
	extends LinkFetchClientOptions<T>,
		Omit<StandardLinkOptions<T>, "plugins">,
		StandardRPCLinkCodecOptions<T> {}

export class SuperJSONLink<T extends ClientContext> extends StandardLink<T> {
	constructor(options: SuperJSONLinkOptions<T>) {
		const linkClient = new LinkFetchClient(options);
		const serializer = new SuperJSONSerializer();
		const linkCodec = new StandardRPCLinkCodec(serializer as any, options);

		super(linkCodec, linkClient, options);
	}
}
