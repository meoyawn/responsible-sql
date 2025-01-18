import { describe, expect, test } from "vitest"
import { isObject } from "./lib"

describe("lib", () => {
  test("isObject", () => {
    expect(isObject({})).toEqual(true)

    expect(isObject([])).toEqual(false)
    expect(isObject(null)).toEqual(false)
    expect(isObject("s")).toEqual(false)
    expect(isObject(0)).toEqual(false)

    expect(isObject(new Date())).toEqual(false)
    expect(isObject(new Error())).toEqual(false)

    const fn = function foo() {}
    fn["bar"] = 1
    expect(isObject(fn)).toEqual(false)

    class Foo {
      // noinspection JSUnusedGlobalSymbols
      bar = 1
    }

    expect(isObject(new Foo())).toEqual(false)
  })
})
