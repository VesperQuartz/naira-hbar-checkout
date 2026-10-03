type StepPanelProps = {
	/** Two-digit stage number — the checkout is a real sequence (01→03). */
	readonly index: string;
	readonly title: string;
	readonly right?: React.ReactNode;
	readonly children: React.ReactNode;
};

/** One stage of the settlement rail. */
export const StepPanel = ({
	index,
	title,
	right,
	children,
}: StepPanelProps) => (
	<section className="relative border border-border/70 bg-card/60">
		<header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5 sm:px-5">
			<div className="flex items-center gap-3">
				<span className="font-mono text-[11px] font-bold text-primary">
					{index}
				</span>
				<h2 className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
					{title}
				</h2>
			</div>
			{right}
		</header>
		<div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
	</section>
);

type RailPanelProps = {
	readonly eyebrow: string;
	readonly children: React.ReactNode;
};

/** A card on the instrument rail (right column). */
export const RailPanel = ({ eyebrow, children }: RailPanelProps) => (
	<section className="border border-border/70 bg-card/60">
		<header className="border-b border-border/70 px-4 py-2.5">
			<h2 className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
				{eyebrow}
			</h2>
		</header>
		<div className="px-4 py-4">{children}</div>
	</section>
);

type PillTone = "live" | "wait" | "off";

const PILL_TONES: Record<PillTone, string> = {
	live: "border-primary/40 text-primary",
	wait: "border-signal/50 text-signal",
	off: "border-border text-muted-foreground",
};

/** Small mono status chip — live feed, waiting, idle. */
export const StatusPill = ({
	tone,
	children,
}: {
	readonly tone: PillTone;
	readonly children: React.ReactNode;
}) => (
	<span
		className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase ${PILL_TONES[tone]}`}
	>
		{children}
	</span>
);

type LogTone = "ok" | "wait" | "err";

const LOG_GLYPHS: Record<LogTone, string> = {
	ok: "✓",
	wait: "→",
	err: "✕",
};

/** One line of the settlement log — the terminal's running transcript. */
export const LogLine = ({
	tone,
	children,
}: {
	readonly tone: LogTone;
	readonly children: React.ReactNode;
}) => (
	<p
		className={`flex gap-2 font-mono text-[11px] leading-relaxed ${
			tone === "ok"
				? "text-primary/90"
				: tone === "err"
					? "text-destructive"
					: "text-muted-foreground"
		}`}
	>
		<span aria-hidden="true">{LOG_GLYPHS[tone]}</span>
		<span className="min-w-0 break-all">{children}</span>
	</p>
);
