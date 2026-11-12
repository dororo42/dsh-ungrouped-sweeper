/**
 * Client half of dsh-ungrouped-sweeper: mounts a 🧹 button next to the
 * sidebar's Settings row that opens the sweeper page in a new tab. The web
 * app is already authenticated (cookie), so the page needs no token.
 *
 * Zero build step: served as the package's `./client` export and materialized
 * by the host's client module system. The sweeper page itself is an
 * independent route (`/ungrouped-sweeper`), so this file only needs to place
 * the launcher — no React or slot contract required.
 *
 * The sidebar DOM is hashed (`.hHd-Xa_settingsArea`); rather than pin a hash,
 * the button is appended to the footer settings area by locating it through
 * stable text (`Settings`/`设置`) inside the sidebar foot, with a
 * MutationObserver re-mounting it if the shell re-renders.
 * @module dsh-ungrouped-sweeper/client
 */

const BUTTON_ID = 'dsh-ungrouped-sweeper-open';

/** Find the sidebar's footer settings row: an element whose accessible text is Settings/设置. */
function findSettingsRow() {
  for (const element of document.querySelectorAll('button, [role="button"], a')) {
    const text = (element.textContent ?? '').trim();
    if (text === 'Settings' || text === '设置') {
      // Climb to the row the sidebar foot area owns (its parent is the seat).
      return element.parentElement ?? element;
    }
  }
  return undefined;
}

/** Append the launcher button beside the settings row, once. */
function mountButton() {
  if (document.getElementById(BUTTON_ID) !== null) return false;
  const row = findSettingsRow();
  if (row === undefined || row.parentElement === null) return false;
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.title = '会话清扫器 · Ungrouped Sweeper';
  button.setAttribute('aria-label', '会话清扫器');
  button.textContent = '🧹';
  Object.assign(button.style, {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    fontSize: '16px',
    lineHeight: '1',
    padding: '6px 8px',
    borderRadius: '8px',
    flex: 'none',
  });
  button.addEventListener('mouseenter', () => { button.style.background = 'color-mix(in srgb, currentColor 10%, transparent)'; });
  button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
  button.addEventListener('click', () => {
    window.open('/ungrouped-sweeper', '_blank', 'noopener');
  });
  // Sit just before the settings row, inside the same foot area.
  row.parentElement.insertBefore(button, row);
  return true;
}

/** @param ctx - cordis client context. */
export function apply(ctx) {
  ctx.effect(() => {
    if (typeof document === 'undefined') return;
    let tries = 0;
    let timer;
    const attempt = () => {
      if (mountButton() || ++tries > 100) {
        clearInterval(timer);
        // Keep the button present if the shell re-renders the foot.
        const observer = new MutationObserver(() => { mountButton(); });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };
    timer = setInterval(attempt, 300);
    return () => {
      clearInterval(timer);
      document.getElementById(BUTTON_ID)?.remove();
    };
  }, 'ungrouped-sweeper: sidebar launcher');
}
