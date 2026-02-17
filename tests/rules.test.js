import { describe, it, expect } from "vitest";
import { matchRule, findMatchingRule } from "../src/rules.js";

describe("matchRule", () => {
  const page = {
    url: "https://github.com/nocoo/hooky/pull/42",
    title: "Add Quick Send Rules by nocoo · Pull Request #42",
  };

  describe("contains operator", () => {
    it("matches when field contains value", () => {
      const rule = { field: "url", operator: "contains", value: "github.com" };
      expect(matchRule(rule, page)).toBe(true);
    });

    it("does not match when field does not contain value", () => {
      const rule = { field: "url", operator: "contains", value: "gitlab.com" };
      expect(matchRule(rule, page)).toBe(false);
    });

    it("is case-insensitive", () => {
      const rule = {
        field: "url",
        operator: "contains",
        value: "GitHub.COM",
      };
      expect(matchRule(rule, page)).toBe(true);
    });
  });

  describe("equals operator", () => {
    it("matches when field equals value exactly", () => {
      const rule = {
        field: "url",
        operator: "equals",
        value: "https://github.com/nocoo/hooky/pull/42",
      };
      expect(matchRule(rule, page)).toBe(true);
    });

    it("does not match partial equality", () => {
      const rule = {
        field: "url",
        operator: "equals",
        value: "https://github.com",
      };
      expect(matchRule(rule, page)).toBe(false);
    });

    it("is case-insensitive", () => {
      const rule = {
        field: "title",
        operator: "equals",
        value: "add quick send rules by nocoo · pull request #42",
      };
      expect(matchRule(rule, page)).toBe(true);
    });
  });

  describe("startsWith operator", () => {
    it("matches when field starts with value", () => {
      const rule = {
        field: "url",
        operator: "startsWith",
        value: "https://github.com",
      };
      expect(matchRule(rule, page)).toBe(true);
    });

    it("does not match when field does not start with value", () => {
      const rule = {
        field: "url",
        operator: "startsWith",
        value: "https://gitlab.com",
      };
      expect(matchRule(rule, page)).toBe(false);
    });

    it("is case-insensitive", () => {
      const rule = {
        field: "title",
        operator: "startsWith",
        value: "ADD QUICK",
      };
      expect(matchRule(rule, page)).toBe(true);
    });
  });

  describe("endsWith operator", () => {
    it("matches when field ends with value", () => {
      const rule = {
        field: "url",
        operator: "endsWith",
        value: "/pull/42",
      };
      expect(matchRule(rule, page)).toBe(true);
    });

    it("does not match when field does not end with value", () => {
      const rule = {
        field: "url",
        operator: "endsWith",
        value: "/pull/99",
      };
      expect(matchRule(rule, page)).toBe(false);
    });

    it("is case-insensitive", () => {
      const rule = {
        field: "title",
        operator: "endsWith",
        value: "REQUEST #42",
      };
      expect(matchRule(rule, page)).toBe(true);
    });
  });

  describe("matches (regex) operator", () => {
    it("matches when field matches regex", () => {
      const rule = {
        field: "url",
        operator: "matches",
        value: "github\\.com/.+/pull/\\d+",
      };
      expect(matchRule(rule, page)).toBe(true);
    });

    it("does not match when regex fails", () => {
      const rule = {
        field: "url",
        operator: "matches",
        value: "gitlab\\.com/.+/pull/\\d+",
      };
      expect(matchRule(rule, page)).toBe(false);
    });

    it("is case-insensitive", () => {
      const rule = {
        field: "title",
        operator: "matches",
        value: "PULL REQUEST #\\d+",
      };
      expect(matchRule(rule, page)).toBe(true);
    });

    it("returns false for invalid regex", () => {
      const rule = { field: "url", operator: "matches", value: "[invalid" };
      expect(matchRule(rule, page)).toBe(false);
    });
  });

  describe("title field", () => {
    it("matches against page title", () => {
      const rule = {
        field: "title",
        operator: "contains",
        value: "Quick Send Rules",
      };
      expect(matchRule(rule, page)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns false for unknown operator", () => {
      const rule = { field: "url", operator: "unknown", value: "test" };
      expect(matchRule(rule, page)).toBe(false);
    });

    it("returns false for unknown field", () => {
      const rule = {
        field: "description",
        operator: "contains",
        value: "test",
      };
      expect(matchRule(rule, page)).toBe(false);
    });

    it("returns false when page field is undefined", () => {
      const rule = { field: "url", operator: "contains", value: "test" };
      expect(matchRule(rule, {})).toBe(false);
    });

    it("returns false when value is empty string", () => {
      const rule = { field: "url", operator: "contains", value: "" };
      expect(matchRule(rule, page)).toBe(false);
    });
  });
});

describe("findMatchingRule", () => {
  const page = {
    url: "https://github.com/nocoo/hooky",
    title: "Hooky GitHub Repo",
  };

  it("returns the first matching rule", () => {
    const rules = [
      {
        id: "1",
        field: "url",
        operator: "contains",
        value: "gitlab.com",
        templateId: "tpl_a",
        enabled: true,
      },
      {
        id: "2",
        field: "url",
        operator: "contains",
        value: "github.com",
        templateId: "tpl_b",
        enabled: true,
      },
      {
        id: "3",
        field: "url",
        operator: "contains",
        value: "github.com",
        templateId: "tpl_c",
        enabled: true,
      },
    ];
    expect(findMatchingRule(rules, page)).toEqual(rules[1]);
  });

  it("returns null when no rules match", () => {
    const rules = [
      {
        id: "1",
        field: "url",
        operator: "contains",
        value: "gitlab.com",
        templateId: "tpl_a",
        enabled: true,
      },
    ];
    expect(findMatchingRule(rules, page)).toBeNull();
  });

  it("skips disabled rules", () => {
    const rules = [
      {
        id: "1",
        field: "url",
        operator: "contains",
        value: "github.com",
        templateId: "tpl_a",
        enabled: false,
      },
      {
        id: "2",
        field: "url",
        operator: "contains",
        value: "github.com",
        templateId: "tpl_b",
        enabled: true,
      },
    ];
    expect(findMatchingRule(rules, page)).toEqual(rules[1]);
  });

  it("returns null for empty rules array", () => {
    expect(findMatchingRule([], page)).toBeNull();
  });

  it("returns null for undefined rules", () => {
    expect(findMatchingRule(undefined, page)).toBeNull();
  });

  it("returns null for null rules", () => {
    expect(findMatchingRule(null, page)).toBeNull();
  });
});
