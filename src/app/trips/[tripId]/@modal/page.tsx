// The popup slot on the trip's own address. On a navigation inside the app a
// slot keeps what it showed unless the new address matches something in it,
// so without this a link from a stop back to the trip — "Ask about it" — would
// leave the stop open over the screen it went to.
export default function NoPopup() {
  return null;
}
