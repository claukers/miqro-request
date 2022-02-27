# @miqro/request

## async wrapper for native nodejs http.request and fetch on the browser.

```typescript
import { request } from "@miqro/request";

console.dir(await request({
	url: ...,
	query: {
		...
	},
	method: ...,
	headers: {
		...
	},
	data: ...,
	...
}))
```
