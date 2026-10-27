/**
 * Cost Footer - footer showing session tokens, session cost, and OpenRouter key balance.
 *
 * The session transcript records the virtual model (openrouter/pareto-code), which
 * has no catalog price, so usage.cost is always 0. Instead, cost is measured from
 * the OpenRouter key's lifetime usage (GET /api/v1/key): session cost = usage
 * delta since session start. Caveat: any concurrent use of the same OpenRouter key
 * (other machines/sessions) is counted into "session cost" too.
 *
 * Toggle with /cost-footer, force a balance refresh with /cost-footer refresh.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

let requestRender: (() => void) | undefined;
let keyUsage: number | undefined; // lifetime spend on the key
let keyLimit: number | null | undefined; // null = unlimited
let sessionBaseline: number | undefined; // keyUsage at session start
let fetching: Promise<void> | undefined;

// Cache model reasoning capabilities: modelId -> supported_efforts
const modelCapabilities = new Map<string, string[] | null>();
let warnedUnsupported: string | undefined; // track what we've already warned about
let physicalModel: string | undefined; // responseModel of the latest assistant message

async function fetchModelCapabilities(modelId: string): Promise<string[] | null> {
	if (modelCapabilities.has(modelId)) {
		return modelCapabilities.get(modelId)!;
	}
	try {
		const res = await fetch("https://openrouter.ai/api/v1/models");
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = (await res.json()) as {
			data?: Array<{ id: string; reasoning?: { supported_efforts?: string[] } }>;
		};
		for (const m of body.data ?? []) {
			const efforts = m.reasoning?.supported_efforts ?? null;
			modelCapabilities.set(m.id, efforts);
		}
		// Cache negative results too, or an uncatalogued model (variants, presets)
		// would trigger a full catalog refetch after every assistant message.
		if (!modelCapabilities.has(modelId)) modelCapabilities.set(modelId, null);
		return modelCapabilities.get(modelId)!;
	} catch {
		// Remember the miss so a failing endpoint isn't refetched after every reply.
		modelCapabilities.set(modelId, null);
		return null;
	}
}

async function fetchKeyBalance() {
	if (fetching) return fetching;
	fetching = (async () => {
		const key = process.env.OPENROUTER_API_KEY;
		if (!key) return;
		try {
			const res = await fetch("https://openrouter.ai/api/v1/key", {
				headers: { Authorization: `Bearer ${key}` },
			});
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { usage?: number; limit?: number | null } };
			if (typeof body.data?.usage === "number") {
				keyUsage = body.data.usage;
				// First successful fetch becomes the baseline if session_start's fetch failed.
				sessionBaseline ??= keyUsage;
			}
			if (body.data && "limit" in body.data) keyLimit = body.data.limit ?? null;
		} catch {
			// offline or proxy-blocked: keep last values
		}
		requestRender?.();
	})().finally(() => {
		fetching = undefined;
	});
	return fetching;
}

function installFooter(ctx: ExtensionContext) {
	ctx.ui.setFooter((tui, theme) => {
		requestRender = () => tui.requestRender();

		return {
			dispose() {
				requestRender = undefined;
			},
			invalidate() {},
			render(width: number): string[] {
				// Context tokens (minimal: just the number)
				const usage = ctx.getContextUsage();
				const tokens = usage?.tokens ?? 0;
				const fmtTokens = (n: number) => {
					if (n < 1000) return `${n}`;
					if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
					return `${Math.round(n / 1000)}k`;
				};
				const ctxStr = fmtTokens(tokens);

				// Session cost: delta of the key's lifetime usage since session start.
				// Adaptive precision: sub-cent spends still show up.
				const sessionCost =
					keyUsage !== undefined && sessionBaseline !== undefined
						? Math.max(0, keyUsage - sessionBaseline)
						: undefined;
				const fmtCost = (n: number) => `$${n.toFixed(n > 0 && n < 0.01 ? 3 : 2)}`;

				const remaining =
					typeof keyLimit === "number" && keyUsage !== undefined ? keyLimit - keyUsage : undefined;

				const sep = () => theme.fg("dim", " · ");
				const parts = [
					theme.fg("dim", ctxStr),
					theme.fg("accent", sessionCost !== undefined ? fmtCost(sessionCost) : "$…"),
				];
				if (remaining !== undefined) parts.push(theme.fg("dim", `$${remaining.toFixed(2)}`));
				else if (keyLimit === null) parts.push(theme.fg("dim", "∞"));

				const left = parts.join(sep());
				// Prefer the physical model over the virtual router
				const displayModel = physicalModel || ctx.model?.id || "no-model";
				const modelId = displayModel.split("/").pop()!;

				// Show thinking level with validation warning
				const level = ctx.thinkingLevel && ctx.thinkingLevel !== "off" ? ctx.thinkingLevel : null;
				let levelStr = "";
				if (level) {
					const supported = modelCapabilities.get(displayModel);
					const isUnsupported = !!supported?.length && !supported.includes(level);
					levelStr = `:${level}${isUnsupported ? "⚠" : ""}`;

					// One-time warning notification
					if (isUnsupported && warnedUnsupported !== `${displayModel}:${level}`) {
						warnedUnsupported = `${displayModel}:${level}`;
						const supportedList = supported!.join(", ");
						ctx.ui.notify(
							`⚠ "${level}" not supported by ${modelId}. Use: ${supportedList}`,
							"warning",
						);
					}
				}
				const right = theme.fg("muted", `${modelId}${levelStr}`);

				const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
				return [truncateToWidth(left + pad + right, width)];
			},
		};
	});
}

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;

	pi.on("session_start", async (_event, ctx) => {
		if (enabled) installFooter(ctx);
		sessionBaseline = undefined;
		// Resumed sessions: pick up the physical model once instead of per render.
		physicalModel = undefined;
		for (const e of ctx.sessionManager.getBranch()) {
			if (e.type === "message" && e.message.role === "assistant") {
				const m = e.message as AssistantMessage & { responseModel?: string };
				if (m.responseModel) physicalModel = m.responseModel;
			}
		}
		await fetchKeyBalance();

		// Pre-fetch model capabilities for validation
		const startModel = ctx.model?.id;
		if (startModel) {
			fetchModelCapabilities(startModel).then(() => requestRender?.());
		}

		// Safety-net refresh every 5 minutes (timers belong to the session, not the factory)
		refreshTimer ??= setInterval(fetchKeyBalance, 5 * 60 * 1000);
	});

	pi.on("session_shutdown", () => {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	});

	// After each assistant reply, refresh the key usage and check for new physical models.
	// Fire-and-forget: awaiting would delay the run loop on a slow proxy fetch.
	pi.on("message_end", (event) => {
		requestRender?.();
		if (event.message?.role === "assistant") {
			void fetchKeyBalance();
			// Fetch capabilities for the physical model that handled this request
			const m = event.message as AssistantMessage & { responseModel?: string };
			if (m.responseModel) physicalModel = m.responseModel;
			if (m.responseModel && !modelCapabilities.has(m.responseModel)) {
				fetchModelCapabilities(m.responseModel).then(() => requestRender?.());
			}
		}
	});

	pi.registerCommand("cost-footer", {
		description: "Toggle the cost footer; '/cost-footer refresh' re-fetches the OpenRouter balance",
		handler: async (args, ctx) => {
			if (args === "refresh") {
				await fetchKeyBalance();
				ctx.ui.notify(
					keyUsage !== undefined ? `Key usage: $${keyUsage.toFixed(2)}` : "Balance unavailable",
					"info",
				);
				return;
			}
			enabled = !enabled;
			if (enabled) {
				installFooter(ctx);
				ctx.ui.notify("Cost footer enabled", "info");
			} else {
				ctx.ui.setFooter(undefined);
				ctx.ui.notify("Default footer restored", "info");
			}
		},
	});
}
