# Third-party notices

Cloudflare Kit's first-party license is in [LICENSE](LICENSE). The notices below
preserve attribution for code and declaration lineage carried through the
Sawkill extraction. They do not replace the first-party copyright holder or
apply that holder's name to upstream work.

## EdgeKit.js

Cloudflare Kit's request-context, environment, KV, and KV-cache utilities were
reworked from Sawkill's Cloudflare Kit, which adapted EdgeKit.js. Sawkill's
`storage.server.ts` explicitly references EdgeKit's storage implementation;
its environment, KV pagination/value wrappers, and read-through cache also
follow the corresponding upstream implementations. The extracted factories,
validation, and request-scope APIs have since changed. This notice preserves
the upstream attribution for that lineage, not a claim that the complete
EdgeKit package or its dependencies are bundled.

Relevant current modules: `src/context.ts`, `src/env.ts`, `src/kv.ts`, and
`src/kv-cache.ts`, including their compiled output and declarations.

Audit references (not a claim about the original import revision):
[EdgeKit source](https://github.com/edgefirst-dev/kit/tree/7607529690d045228cb5ea80dfcca3b60350d50e/src/lib)
and [MIT license](https://github.com/edgefirst-dev/kit/blob/7607529690d045228cb5ea80dfcca3b60350d50e/LICENSE).

```text
MIT License

Copyright (c) 2024 Sergio Xalambrí

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Type-Fest JSON declarations

Sawkill's `types/json-value.d.ts` explicitly references Type-Fest and reproduces
its JSON definitions and documentation. Cloudflare Kit's `src/types.ts` replaces
that file with narrower `JsonPrimitive`, `JsonObject`, and `JsonValue` definitions.
The original `Jsonifiable` implementation and its examples are not shipped.
This notice retains attribution for the adapted JSON declaration lineage; it
does not mean the Type-Fest package is a dependency or bundled wholesale.

Audit references (not a claim about the original import revision):
[JSON declarations](https://github.com/sindresorhus/type-fest/blob/e9f614f191aa039e4aefa2d41d62c2a3fd070cfd/source/json-value.d.ts)
and [MIT license](https://github.com/sindresorhus/type-fest/blob/e9f614f191aa039e4aefa2d41d62c2a3fd070cfd/license-mit).
Type-Fest offers MIT or CC0-1.0; the MIT option is retained here.

```text
MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Audit scope and distribution boundary

This focused review compared the extracted `src` tree and history with Sawkill's
Cloudflare Kit, the upstream references above, and the compiled package file
list. No additional copied or bundled third-party implementation was identified
in the HTTP-cache modules, tests, or guide examples during this review. That
finding is limited to the inspected material, not a guarantee about every
historical contribution.

The build uses TypeScript compilation, not dependency bundling. Node's
`node:async_hooks` remains a platform import; Cloudflare bindings and web APIs
are supplied by the runtime. React Router, Wrangler, Workers/Node declarations,
and the other development tools are external development/test dependencies.
Their implementations, generated Worker declarations, and test fixtures are not
included in the compiled distribution. Their licenses remain with those
dependencies and are not duplicated here merely because they are installed.

The package includes this entire notice file alongside LICENSE. Revisit this
audit when copying new code, introducing bundling, or changing shipped files.
