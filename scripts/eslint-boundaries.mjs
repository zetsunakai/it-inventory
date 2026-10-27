import path from "node:path"

// Resolve dahulu agar alias dan import relatif (termasuk ../ yang dinormalisasi) punya aturan sama.
export const moduleBoundaries = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      forbidden: "{{owner}} tidak boleh mengimpor {{target}}. Rakit lintas modul di src/app.",
    },
  },
  create(context) {
    const root = path.resolve(context.cwd, "src")
    const filename = context.physicalFilename
    const relative = (file) => path.relative(root, file).split(path.sep).join("/")
    const ownerPath = relative(filename)
    const base = /^(components|lib|hooks|server)\//.test(ownerPath)
    const schema = ownerPath.startsWith("server/db/schema/")
    const inventory = ownerPath.startsWith("modules/inventory/")
    const customs = ownerPath.startsWith("modules/it-inventory/")

    function check(node) {
      const source = node.source
      const value =
        source?.type === "Literal"
          ? source.value
          : source?.type === "TemplateLiteral" && source.expressions.length === 0
            ? source.quasis[0].value.cooked
            : null
      if (typeof value !== "string") return
      const resolved = value.startsWith("@/")
        ? path.resolve(root, value.slice(2))
        : value.startsWith(".")
          ? path.resolve(path.dirname(filename), value)
          : null
      if (!resolved) return
      const target = relative(resolved)
      const app = target === "app" || target.startsWith("app/")
      const domain = target === "modules" || target.startsWith("modules/")
      const schemaConstant = schema && /^modules\/(inventory|it-inventory)\/lib\//.test(target)
      const itInventory =
        target === "modules/it-inventory" || target.startsWith("modules/it-inventory/")
      if (
        (base && (app || (domain && !schemaConstant))) ||
        (inventory && (app || itInventory)) ||
        (customs && app)
      ) {
        context.report({
          node: source,
          messageId: "forbidden",
          data: { owner: base ? "Base" : inventory ? "Inventory" : "IT Inventory", target },
        })
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    }
  },
}
