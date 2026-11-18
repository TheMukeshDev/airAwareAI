import { describe, expect, it } from "vitest";
import { classifyAqi } from "../lib/aqi";

describe("classifyAqi", () => {
  it("classifies US AQI band boundaries correctly", () => {
    expect(classifyAqi(0, "us").label).toBe("Good");
    expect(classifyAqi(50, "us").label).toBe("Good");
    expect(classifyAqi(51, "us").label).toBe("Moderate");
    expect(classifyAqi(100, "us").label).toBe("Moderate");
    expect(classifyAqi(101, "us").label).toBe("Unhealthy for sensitive groups");
    expect(classifyAqi(150, "us").label).toBe("Unhealthy for sensitive groups");
    expect(classifyAqi(151, "us").label).toBe("Unhealthy");
    expect(classifyAqi(200, "us").label).toBe("Unhealthy");
    expect(classifyAqi(201, "us").label).toBe("Very unhealthy");
    expect(classifyAqi(300, "us").label).toBe("Very unhealthy");
    expect(classifyAqi(301, "us").label).toBe("Hazardous");
  });

  it("does not apply a US fallback when scale is explicitly india", () => {
    const result = classifyAqi(80, "india");
    expect(result.scale).toBe("india");
    expect(result.label).toBe("Satisfactory");
    expect(result.label).not.toBe("Moderate");
  });

  it("returns unavailable state for missing values", () => {
    expect(classifyAqi(null, "us").label).toBe("Unavailable");
    expect(classifyAqi(undefined, "us").value).toBeNull();
  });
});