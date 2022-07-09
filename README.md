# @miqro/request

## async wrapper for native nodejs http.request

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
