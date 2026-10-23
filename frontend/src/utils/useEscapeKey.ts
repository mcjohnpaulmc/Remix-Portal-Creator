/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";

/**
 * useEscapeKey — closes a popup when Escape is pressed.
 *
 * `active` must be whatever decides the popup is currently open, so the listener
 * is only bound while it is: a listener left bound by a closed popup would steal
 * Escape from whichever popup is actually on screen. Stacked popups therefore
 * resolve correctly on their own — only the open ones are listening, and the
 * handler is bound in the capture phase so the topmost mounted popup can call
 * stopPropagation if it ever needs to keep Escape to itself.
 */
export function useEscapeKey(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onClose]);
}
