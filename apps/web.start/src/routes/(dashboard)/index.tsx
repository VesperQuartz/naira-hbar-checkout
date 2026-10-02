import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/(dashboard)/")({ component: App });

function App() {
	const navigate = Route.useNavigate();
	const todo = useQuery(orpc.todos.list.queryOptions());

	console.log("Todo State:", {
		data: todo.data,
		status: todo.status,
		isPending: todo.isPending,
		isError: todo.isError,
		error: todo.error,
	});

	return (
		<div className="flex min-h-svh p-6">
			<div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
				{todo.isError && (
					<div className="text-tomato">Error: {todo.error.message}</div>
				)}
				{todo.isPending && <div>Loading...</div>}
				<pre className="text-tomato">{JSON.stringify(todo?.data, null, 2)}</pre>
				<div>
					<h1 className="font-medium">Project ready!</h1>
					<p>You may now add components and start building.</p>
					<p>We&apos;ve already added the button component for you.</p>
					<Button
						className="mt-2 cursor-pointer"
						onClick={async () => {
							await authClient.signOut();
							navigate({
								to: "/login",
								search: {
									redirect: location?.href,
								},
							});
						}}
					>
						log out
					</Button>
				</div>
			</div>
		</div>
	);
}
