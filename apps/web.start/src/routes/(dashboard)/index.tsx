import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { authClient } from "@/lib/auth-client";

const App = () => {
	const navigate = Route.useNavigate();

	return (
		<div className="flex min-h-svh p-6">
			<div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
				<div>
					<h1 className="font-medium">Project ready!</h1>
					<p>You may now add components and start building.</p>
					<p>We&apos;ve already added the button component for you.</p>
					<Button
						className="mt-2 cursor-pointer"
						onClick={() => navigate({ to: "/checkout" })}
					>
						Open the checkout demo
					</Button>
					<Button
						className="mt-2 ml-2 cursor-pointer"
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
};

export const Route = createFileRoute("/(dashboard)/")({ component: App });
