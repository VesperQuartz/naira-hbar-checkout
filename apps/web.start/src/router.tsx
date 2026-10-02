import * as TanstackQuery from "@repo/shared/query/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRouter as createTanStackRouter,
	parseSearchWith,
	stringifySearchWith,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { parse, stringify } from "jsurl2";
import { DefaultCatchBoundary } from "@/components/catch-boundary";
import { NotFound } from "@/components/not-found";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	const router = createTanStackRouter({
		routeTree,
		parseSearch: parseSearchWith(parse),
		stringifySearch: stringifySearchWith(stringify),
		scrollRestoration: true,
		context: { ...rqContext },
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: DefaultCatchBoundary,
		defaultNotFoundComponent: () => {
			return <NotFound />;
		},
		Wrap: (props: { children: React.ReactNode }) => {
			return (
				<QueryClientProvider client={rqContext.queryClient}>
					{props.children}
				</QueryClientProvider>
			);
		},
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	});

	return router;
};
