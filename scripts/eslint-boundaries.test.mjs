import path from "node:path"
import { describe, it } from "node:test"
import { RuleTester } from "eslint"

import { moduleBoundaries } from "./eslint-boundaries.mjs"

const filename = (file) => path.resolve("src", file)
const tester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } })
RuleTester.describe = describe
RuleTester.it = it

tester.run("module-boundaries", moduleBoundaries, {
  valid: [
    { filename: filename("app/page.tsx"), code: 'import x from "@/modules/it-inventory/lib/x"' },
    {
      filename: filename("modules/it-inventory/server/x.ts"),
      code: 'import x from "@/modules/inventory/lib/x"',
    },
    {
      filename: filename("modules/inventory/components/x.tsx"),
      code: 'import x from "../lib/x"',
    },
    {
      filename: filename("components/x.tsx"),
      code: 'import { action } from "@/server/actions/settings"',
    },
    {
      filename: filename("server/db/schema/x.ts"),
      code: 'import x from "@/modules/inventory/lib/x"',
    },
    { filename: filename("lib/x.ts"), code: 'import x from "node:path"' },
  ],
  invalid: [
    ["components/x.tsx", 'import x from "@/modules/inventory/lib/x"'],
    ["hooks/x.ts", 'import x from "../modules/inventory/lib/x"'],
    ["lib/x.ts", 'export * from "../app/page"'],
    ["server/db/x.ts", 'export { x } from "../../modules/inventory/lib/x"'],
    ["modules/inventory/lib/x.ts", 'import x from "../../it-inventory/lib/x"'],
    ["modules/inventory/lib/x.ts", 'import x from "@/modules/it-inventory"'],
    ["modules/inventory/lib/x.ts", 'import x from "@/modules/inventory/../it-inventory/lib/x"'],
    ["modules/it-inventory/lib/x.ts", 'import("../../../app/page")'],
    ["lib/x.ts", "import(`../modules/inventory/lib/x`)"],
    ["server/db/schema/x.ts", 'import x from "../../../app/page"'],
    ["server/db/schema/x.ts", 'import x from "@/modules/inventory/actions/transfers"'],
  ].map(([file, code]) => ({
    filename: filename(file),
    code,
    errors: [{ messageId: "forbidden" }],
  })),
})
