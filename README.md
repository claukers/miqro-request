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

## browser bundle ( not recommended )

if you use the module in the browser the ```request``` function will use the built-in ```fetch``` function instead of the native nodejs ```http``` module. 

Tested with ```webpack's``` vanilla configuration.
