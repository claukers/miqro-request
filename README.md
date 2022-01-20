# @miqro/request

## async wrapper for native nodejs http.request

```typescript
import { request } from "@miqro/request";

const response = await request({
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
})
```