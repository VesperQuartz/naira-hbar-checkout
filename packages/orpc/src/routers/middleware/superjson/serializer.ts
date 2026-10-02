import {
	createORPCErrorFromJson,
	ErrorEvent,
	isORPCErrorJson,
	mapEventIterator,
	toORPCError,
} from "@orpc/client";
import type { StandardRPCSerializer } from "@orpc/client/standard";
import { isAsyncIteratorObject } from "@orpc/shared";
import SuperJSON from "superjson";

export class SuperJSONSerializer
	implements Pick<StandardRPCSerializer, keyof StandardRPCSerializer>
{
	serialize(data: unknown): object {
		if (isAsyncIteratorObject(data)) {
			return mapEventIterator(data, {
				value: async (value: unknown) => SuperJSON.serialize(value),
				error: async (e) => {
					return new ErrorEvent({
						data: SuperJSON.serialize(toORPCError(e).toJSON()),
						cause: e,
					});
				},
			});
		}

		return SuperJSON.serialize(data);
	}

	deserialize(data: any): unknown {
		if (isAsyncIteratorObject(data)) {
			return mapEventIterator(data, {
				value: async (value) => SuperJSON.deserialize(value),
				error: async (e) => {
					if (!(e instanceof ErrorEvent)) return e;

					const deserialized = SuperJSON.deserialize(e.data as any);

					if (isORPCErrorJson(deserialized)) {
						return createORPCErrorFromJson(deserialized, { cause: e });
					}

					return new ErrorEvent({
						data: deserialized,
						cause: e,
					});
				},
			});
		}

		return SuperJSON.deserialize(data);
	}
}
