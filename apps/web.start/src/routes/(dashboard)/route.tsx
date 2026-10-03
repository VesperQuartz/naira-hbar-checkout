// import { redirect } from "@tanstack/react-router";
// import { authServerFn } from "@/actions/auth";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(dashboard)")({
	component: DashboardRoute,
	beforeLoad: async () => {
		// Auth gate is disabled while developing: log in check goes back here.
		// const session = await authServerFn();
		// if (!session) {
		// 	throw redirect({
		// 		to: "/login",
		// 		search: {
		// 			redirect: location?.href,
		// 		},
		// 	});
		// }
	},
});

function DashboardRoute() {
	return <Outlet />;
}
