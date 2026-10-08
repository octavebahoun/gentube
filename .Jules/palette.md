
## 2023-10-08 - [Keyboard Focus for Custom Radio Cards]
**Learning:** In GenTube's UI, styling `<label>` elements to look like cards/buttons for custom radio inputs can hide native focus if not carefully managed. Native nested `<input>` elements often receive focus but their default focus outline gets obscured by the surrounding `<label>` styling or clipping.
**Action:** Always use the `has-focus-visible:outline-*` utilities on the parent `<label>` to propagate the focus ring visually, and remember to disable the inner input's focus ring with `focus-visible:outline-none` to prevent double focus rings.
