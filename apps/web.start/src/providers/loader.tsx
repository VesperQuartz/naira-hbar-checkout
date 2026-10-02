import { BProgress } from "@bprogress/core";
import {
	ProgressProvider,
	type RouterProgressProviderProps,
} from "@bprogress/react";

BProgress.configure({ showSpinner: false });

import {
	type RouterProgressProps,
	useProgress,
	withMemo,
} from "@bprogress/react";
import type { ListenerFn, RouterEvents } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

export type TanStackRouterProgressProps = RouterProgressProps;

const TanStackRouterProgressComponent = ({
	delay = 0,
	disableSameURL = true,
	startPosition = 0,
	stopDelay = 0,
}: RouterProgressProps) => {
	const { start, stop } = useProgress();
	const router = useRouter();

	useEffect(() => {
		const handleRouteStart: ListenerFn<RouterEvents["onBeforeLoad"]> = (
			event,
		) => {
			// If the URL is the same, we don't want to start the progress bar
			if (!event.hrefChanged && disableSameURL) {
				return;
			}

			start(startPosition, delay);
		};

		const handleRouteDone = () => stop(stopDelay);

		const unsubscribeStart = router.subscribe("onBeforeLoad", handleRouteStart);
		const unsubscribeStop = router.subscribe("onResolved", handleRouteDone);

		return () => {
			unsubscribeStart();
			unsubscribeStop();
		};
	}, [router, start, stop, disableSameURL, startPosition, delay, stopDelay]);

	return null;
};

export const TanStackRouterProgress = withMemo(TanStackRouterProgressComponent);

TanStackRouterProgress.displayName = "TanStackRouterProgress";

export type TanStackRouterProgressProviderProps = RouterProgressProviderProps;

export const LoadingProvider = ({
	children,
	color,
	delay,
	disableSameURL,
	disableStyle,
	height,
	nonce,
	options,
	spinnerPosition,
	startPosition,
	stopDelay,
	style,
}: TanStackRouterProgressProviderProps) => {
	return (
		<ProgressProvider
			color={color}
			disableStyle={disableStyle}
			height={height}
			nonce={nonce}
			options={options}
			spinnerPosition={spinnerPosition}
			style={style}
		>
			<TanStackRouterProgress
				delay={delay}
				disableSameURL={disableSameURL}
				startPosition={startPosition}
				stopDelay={stopDelay}
			/>
			{children}
		</ProgressProvider>
	);
};
