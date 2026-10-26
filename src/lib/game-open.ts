/**
 * "A game is open" — so app-level housekeeping (an update reload, the installed
 * app's return-to-Home) never restarts a game the member is in the middle of.
 * Set by the game player while it is mounted.
 */
export const GAME_CLOSED_EVENT = "rt:game-closed";

export function isGameOpen(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.rtGame === "1";
}

export function markGameOpen(open: boolean) {
  if (typeof document === "undefined") return;
  if (open) {
    document.documentElement.dataset.rtGame = "1";
  } else {
    delete document.documentElement.dataset.rtGame;
    window.dispatchEvent(new Event(GAME_CLOSED_EVENT));
  }
}
