import { describe, expect, it } from "vitest";
import { sanitizeRenderedHtml } from "./sanitize";

const renderHtml = (html) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

describe("sanitizeRenderedHtml", () => {
  it("removes executable markup and unsafe urls", () => {
    const view = renderHtml(
      sanitizeRenderedHtml(`
        <p>safe text</p>
        <script>alert("xss")</script>
        <a href="javascript:alert(1)">bad link</a>
        <img src=x onerror=alert(1) />
      `),
    );

    expect(view.querySelector("script")).toBeNull();
    expect(view.querySelector("img")).toBeNull();
    expect(view.textContent).toContain("safe text");
    expect(view.querySelector("a")?.getAttribute("href")).toBeNull();
  });

  it("keeps http links but forces safe new-tab attributes", () => {
    const view = renderHtml(
      sanitizeRenderedHtml('<a href="https://example.com">Example</a>'),
    );
    const link = view.querySelector("a");

    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
  });
});
