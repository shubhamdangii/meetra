// One page-scroll lock shared by every popup. Each open popup holds a lock; the page scrolls again
// only when the last one closes. (Two popups closing in the same moment used to restore each other's
// "locked" state and leave the page stuck.)
let holders = 0;
export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  holders++;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  let done = false;
  return () => {
    if (done) return; done = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) { document.documentElement.style.overflow = ""; document.body.style.overflow = ""; }
  };
}
