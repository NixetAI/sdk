# @nixet/contracts

Request, response and event schemas for the Nixet API, as [Zod](https://zod.dev) schemas and the TypeScript types inferred from them.

Most applications want [`@nixet/sdk`](https://www.npmjs.com/package/@nixet/sdk), which depends on this package for its types. Use this one directly to validate payloads yourself — for example a run event received over a stream.

```ts
import { runEventSchema } from "@nixet/contracts";

const event = runEventSchema.parse(JSON.parse(line));
```

MIT licensed.
