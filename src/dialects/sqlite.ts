import {
  expandResult,
  fieldNames,
  type Fields,
  isExec,
  isInsert,
  isMany,
  isOne,
  type Query,
} from "../compile"
import { renderInsert } from "./common"

const namedParam = (name: string): `:${string}` => `:${name}`

export function renderSQLite(
  structs: Record<string, Fields>,
  q: Query,
): string {
  switch (true) {
    case isInsert(q): {
      const values = fieldNames(q.params).map(namedParam).join(", ")
      return renderInsert(q, values)
    }

    case isExec(q):
      return q.exec

    case isOne(q):
      return expandResult(structs, q.one, q.result)

    case isMany(q):
      return expandResult(structs, q.many, q.result)

    default:
      throw new Error(`Invalid query: ${JSON.stringify(q, null, 2)}`)
  }
}
