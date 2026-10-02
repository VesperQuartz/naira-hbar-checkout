import type { AnyFieldApi } from "@tanstack/react-form";

export const FieldError = ({ field }: { field: AnyFieldApi }) => {
	return (
		<div className="flex flex-col gap-1">
			{field.state.meta?.errors?.map((e, i) => {
				return (
					<div key={i.toString()} className="flex flex-row items-center">
						<p className="font-poppins text-start text-xs text-red-600">
							{e?.message}
						</p>
					</div>
				);
			})}
		</div>
	);
};
