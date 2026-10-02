import { os } from "@orpc/server";
import type {
	RequestHeadersPluginContext,
	ResponseHeadersPluginContext,
} from "@orpc/server/plugins";

type ORPCContext = RequestHeadersPluginContext & ResponseHeadersPluginContext;
export const base = os.$context<ORPCContext>();
