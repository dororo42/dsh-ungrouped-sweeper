/**
 * Client half of dsh-ungrouped-sweeper: mounts a 🧹 button next to the
 * sidebar's Settings row that opens the sweeper page in a new tab. The web
 * app is already authenticated (cookie), so the page needs no token.
 *
 * Zero build step: served as the package's `./client` export and materialized
 * by the host's client module system, which expects exactly this CJS factory
 * shape (`window.__ModuleLoader__.load({id, factory})`, `require` handed in,
 * `module.exports` returned). The sweeper page itself is an independent
 * route (`/ungrouped-sweeper`), so this file only places the launcher —
 * no React or slot contract required.
 * @module dsh-ungrouped-sweeper/client
 */

window.__ModuleLoader__.load({
	id: "dsh-ungrouped-sweeper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		var BUTTON_ID = "dsh-ungrouped-sweeper-open";

		/** Find the sidebar's footer settings row: a control labelled Settings/设置. */
		function findSettingsRow() {
			for (var element of document.querySelectorAll('button, [role="button"], a')) {
				var text = (element.textContent ?? "").trim();
				if (text === "Settings" || text === "设置") {
					// Climb to the row the sidebar foot area owns.
					return element.parentElement ?? element;
				}
			}
			return undefined;
		}

		/** Append the launcher button beside the settings row, once. */
		function mountButton() {
			if (document.getElementById(BUTTON_ID) !== null) return false;
			var row = findSettingsRow();
			if (row === undefined || row.parentElement === null) return false;
			var button = document.createElement("button");
			button.id = BUTTON_ID;
			button.type = "button";
			button.title = "会话清扫器 · Ungrouped Sweeper";
			button.setAttribute("aria-label", "会话清扫器");
			button.textContent = "🧹";
			var hover = "color-mix(in srgb, currentColor 10%, transparent)";
			Object.assign(button.style, {
				cursor: "pointer",
				border: "none",
				background: "transparent",
				color: "inherit",
				fontSize: "16px",
				lineHeight: "1",
				padding: "6px 8px",
				borderRadius: "8px",
				flex: "none",
			});
			button.addEventListener("mouseenter", function () { button.style.background = hover; });
			button.addEventListener("mouseleave", function () { button.style.background = "transparent"; });
			button.addEventListener("click", function () {
				window.open("/ungrouped-sweeper", "_blank", "noopener");
			});
			// Sit just before the settings row, inside the same foot area.
			row.parentElement.insertBefore(button, row);
			return true;
		}

		function apply(ctx) {
			ctx.effect(function () {
				if (typeof document === "undefined") return;
				var tries = 0;
				var timer = setInterval(function () {
					if (mountButton() || ++tries > 100) {
						clearInterval(timer);
						// Keep the button present if the shell re-renders the foot.
						var observer = new MutationObserver(function () { mountButton(); });
						observer.observe(document.body, { childList: true, subtree: true });
					}
				}, 300);
				return function () {
					clearInterval(timer);
					var button = document.getElementById(BUTTON_ID);
					if (button !== null) button.remove();
				};
			}, "ungrouped-sweeper: sidebar launcher");
		}

		exports.apply = apply;
		return module.exports;
	}
});
