import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { FieldError } from "@workspace/ui/form-error";
import type { ChangeEvent } from "react";
import { useTanStackFormMask } from "use-mask-input";
import { z } from "zod";

const formSchema = z.object({
	email: z.email(),
	password: z.string().min(6),
	phone: z.string(),
});

export const Route = createFileRoute("/(auth)/login")({
	component: RouteComponent,
	validateSearch: z.object({
		redirect: z.string().optional(),
	}),
});

function RouteComponent() {
	const maskField = useTanStackFormMask();
	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
			phone: "",
		},
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: (value) => {
			console.log(JSON.stringify(value.value, null, 2));
		},
	});
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			<div className="m-10 flex w-fit flex-col gap-3">
				<form.Field name="email">
					{(field) => {
						return (
							<div>
								<Input
									name={field.name}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="email"
									type="email"
									className="border border-accent"
								/>
								<FieldError field={field} />
							</div>
						);
					}}
				</form.Field>
				<form.Field name="phone">
					{(field) => {
						const phoneProps = maskField(
							["+234 999 999 9999", "999 9999 9999"],
							{
								name: field.name,
								value: field.state.value,
								onChange: (
									event: ChangeEvent<HTMLInputElement, HTMLInputElement>,
								) => field.handleChange(event.target.value),
								onBlur: field.handleBlur,
							},
							{
								placeholder: "",
							},
						);
						return (
							<div>
								<Input
									{...phoneProps}
									type="tel"
									className="border border-accent"
								/>
								<FieldError field={field} />
							</div>
						);
					}}
				</form.Field>
				<form.Field name="password">
					{(field) => {
						return (
							<div>
								<Input
									name={field.name}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="password"
									type="password"
									className="border border-accent"
								/>
								<FieldError field={field} />
							</div>
						);
					}}
				</form.Field>
				<form.Subscribe
					selector={(item) => [item.isSubmitting, item.canSubmit]}
				>
					{([isSubmitting, canSubmit]) => {
						return (
							<Button disabled={!canSubmit} type="submit">
								{isSubmitting ? "Logging in..." : "Login"}
							</Button>
						);
					}}
				</form.Subscribe>
			</div>
		</form>
	);
}
