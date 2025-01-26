import * as v from "valibot"
import { describe, expect, test } from "vitest"
import { Version } from "./compile"

describe("compile", () => {
  test("version", () => {
    expect(v.parse(Version, "1")).toEqual("1")
    expect(v.parse(Version, "1.0.0")).toEqual("1.0.0")
    expect(v.parse(Version, "0.1")).toEqual("0.1")
    expect(v.safeParse(Version, "ha").success).toEqual(false)
  })
})
