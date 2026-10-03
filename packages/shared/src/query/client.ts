import { QueryClient } from "@tanstack/react-query";

export const getContext = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				experimental_prefetchInRender: true,
			},
		},
	});
	return {
		queryClient,
	};
};
