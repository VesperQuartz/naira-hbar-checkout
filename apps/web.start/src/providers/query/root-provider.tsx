import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const Provider = ({
	children,
	queryClient,
}: {
	children: React.ReactNode;
	queryClient: QueryClient;
}) => {
	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
};
