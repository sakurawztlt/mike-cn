import { describe, expect, it } from "vitest";
import { searchChinaLegalSources } from "./chinaLegalSources";

describe("China legal sources", () => {
  it("returns official case and law leads for labor termination", () => {
    const result = searchChinaLegalSources("违纪解除通知 劳动合同法");
    expect(result.coverage).toContain("检索线索");
    expect(result.hits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "guiding_case",
        url: "https://www.court.gov.cn/shenpan/xiangqing/364641.html",
      }),
      expect.objectContaining({ kind: "statute" }),
    ]));
  });

  it("reports zero coverage for unrelated issues and rejects invalid input", () => {
    expect(searchChinaLegalSources("海事货运").hits).toEqual([]);
    expect(searchChinaLegalSources(" ").error).toBeTruthy();
    expect(searchChinaLegalSources("案".repeat(301)).error).toBeTruthy();
  });
});
