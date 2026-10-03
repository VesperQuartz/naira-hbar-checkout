type OdometerProps = {
	/** Full readout string; digits roll on change, punctuation stays put. */
	readonly value: string;
	readonly className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Split-flap style readout: every digit is a column of 0–9 that slides to
 * the current value with a per-column delay, so a fresh quote lands like a
 * departure board flipping. The string's shape (decimal point, sign) is
 * preserved; screen readers get the flat value via visually-hidden text.
 */
export const Odometer = ({ value, className }: OdometerProps) => (
	<span className={className}>
		<span className="sr-only">{value}</span>
		{value.split("").map((char, index) => {
			if (!/\d/.test(char)) {
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: cells are positional — the readout is a fixed-width digit tape, not a list.
					<span key={index} aria-hidden="true">
						{char}
					</span>
				);
			}
			const digit = Number(char);
			return (
				// biome-ignore lint/suspicious/noArrayIndexKey: cells are positional — digit columns must keep their slot when the value length changes.
				<span key={index} className="odo-cell" aria-hidden="true">
					<span
						className="odo-strip"
						style={{
							transform: `translateY(-${digit * 10}%)`,
							transitionDelay: `${index * 35}ms`,
						}}
					>
						{DIGITS.map((d) => (
							<span key={d} className="odo-digit">
								{d}
							</span>
						))}
					</span>
				</span>
			);
		})}
	</span>
);
