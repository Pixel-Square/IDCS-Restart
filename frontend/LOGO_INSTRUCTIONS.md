# Adding the IDCS Logo

To complete the logo integration, please save the IDCS logo image file as:

**`f:\Github\IDCS-Restart\frontend\public\idcs-logo.png`**

The logo should be:

- In PNG format with transparent background (preferred)
- Recommended dimensions: 150-200px height, proportional width
- The logo will automatically scale to fit the navbar (40px height)

The logo is already referenced in the Navbar component at:
`frontend/src/components/Navbar.tsx`

If the image file is not found, the navbar will fallback to showing just the text "IDCS".

## Alternative Locations

You can also save the logo in:

- `frontend/public/` (recommended for static assets)
- `frontend/src/assets/` (if you prefer importing it)

If you save it in `src/assets/`, update the import in Navbar.tsx:

```tsx
import logo from "../assets/idcs-logo.png";
// Then use: src={logo}
```
