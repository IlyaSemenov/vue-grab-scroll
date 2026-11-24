import { expect, it } from "bun:test"

it("renders on the server", async () => {
  // A separate process, because the test preload registers a DOM window globally.
  const child = Bun.spawn([process.execPath, `${import.meta.dir}/fixtures/render-ssr.ts`], {
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(stderr).toBe("")
  expect(stdout.trim()).toBe("<!--[--><div>composable</div><div>directive</div><!--]-->")
})
