import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadStore,
  saveStore,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  getActiveTemplate,
  setActiveTemplateId,
  getQuickSendRules,
  addQuickSendRule,
  updateQuickSendRule,
  deleteQuickSendRule,
  reorderQuickSendRules,
  getTheme,
  setTheme,
  migrateFromLegacy,
} from "../src/store.js";

describe("store", () => {
  let storage;

  beforeEach(() => {
    storage = {};
    global.chrome = {
      storage: {
        local: {
          get: vi.fn((keys) => {
            const result = {};
            const keyList = typeof keys === "string" ? [keys] : keys;
            for (const k of keyList) {
              if (storage[k] !== undefined) result[k] = storage[k];
            }
            return Promise.resolve(result);
          }),
          set: vi.fn((data) => {
            Object.assign(storage, data);
            return Promise.resolve();
          }),
        },
      },
    };
  });

  describe("loadStore / saveStore", () => {
    it("should return default store when empty", async () => {
      const store = await loadStore();
      expect(store).toEqual({
        templates: [],
        activeTemplateId: null,
        quickSendRules: [],
        theme: "system",
      });
    });

    it("should save and load store data", async () => {
      const data = {
        templates: [
          { id: "t1", name: "Test", url: "https://x.com", method: "POST", params: [] },
        ],
        activeTemplateId: "t1",
      };
      await saveStore(data);
      const loaded = await loadStore();
      expect(loaded).toEqual(data);
    });
  });

  describe("createTemplate", () => {
    it("should add a new template with generated id", async () => {
      const tpl = await createTemplate("My Hook");
      expect(tpl.id).toBeDefined();
      expect(tpl.name).toBe("My Hook");
      expect(tpl.url).toBe("");
      expect(tpl.method).toBe("POST");
      expect(tpl.params).toEqual([]);

      const store = await loadStore();
      expect(store.templates).toHaveLength(1);
      expect(store.templates[0].id).toBe(tpl.id);
    });

    it("should set first created template as active", async () => {
      await createTemplate("First");
      const store = await loadStore();
      expect(store.activeTemplateId).toBe(store.templates[0].id);
    });

    it("should not override active when adding second template", async () => {
      const first = await createTemplate("First");
      await createTemplate("Second");
      const store = await loadStore();
      expect(store.templates).toHaveLength(2);
      expect(store.activeTemplateId).toBe(first.id);
    });
  });

  describe("updateTemplate", () => {
    it("should update an existing template by id", async () => {
      const tpl = await createTemplate("Original");
      await updateTemplate(tpl.id, {
        name: "Updated",
        url: "https://api.com/hook",
        method: "PUT",
        params: [{ key: "a", value: "b" }],
      });
      const store = await loadStore();
      const updated = store.templates[0];
      expect(updated.name).toBe("Updated");
      expect(updated.url).toBe("https://api.com/hook");
      expect(updated.method).toBe("PUT");
      expect(updated.params).toEqual([{ key: "a", value: "b" }]);
    });

    it("should only update provided fields", async () => {
      const tpl = await createTemplate("Original");
      await updateTemplate(tpl.id, { name: "Renamed" });
      const store = await loadStore();
      expect(store.templates[0].name).toBe("Renamed");
      expect(store.templates[0].method).toBe("POST"); // unchanged
    });

    it("should throw when template not found", async () => {
      await expect(updateTemplate("nonexistent", { name: "X" })).rejects.toThrow(
        "Template not found",
      );
    });
  });

  describe("deleteTemplate", () => {
    it("should remove a template by id", async () => {
      const t1 = await createTemplate("A");
      const t2 = await createTemplate("B");
      await deleteTemplate(t1.id);
      const store = await loadStore();
      expect(store.templates).toHaveLength(1);
      expect(store.templates[0].id).toBe(t2.id);
    });

    it("should update activeTemplateId to next template when active is deleted", async () => {
      const t1 = await createTemplate("A");
      const t2 = await createTemplate("B");
      await setActiveTemplateId(t1.id);
      await deleteTemplate(t1.id);
      const store = await loadStore();
      expect(store.activeTemplateId).toBe(t2.id);
    });

    it("should set activeTemplateId to null when last template deleted", async () => {
      const t1 = await createTemplate("A");
      await deleteTemplate(t1.id);
      const store = await loadStore();
      expect(store.activeTemplateId).toBeNull();
    });
  });

  describe("getTemplate", () => {
    it("should return template by id", async () => {
      const tpl = await createTemplate("Find Me");
      const found = await getTemplate(tpl.id);
      expect(found.name).toBe("Find Me");
    });

    it("should return null for unknown id", async () => {
      const found = await getTemplate("nope");
      expect(found).toBeNull();
    });
  });

  describe("getActiveTemplate", () => {
    it("should return the active template", async () => {
      const t1 = await createTemplate("Active One");
      await createTemplate("Other");
      const active = await getActiveTemplate();
      expect(active.id).toBe(t1.id);
      expect(active.name).toBe("Active One");
    });

    it("should return null when no templates exist", async () => {
      const active = await getActiveTemplate();
      expect(active).toBeNull();
    });
    it("should return null when activeTemplateId references non-existent template", async () => {
      await createTemplate("Test");
      const store = await loadStore();
      store.activeTemplateId = "non-existent-id";
      await saveStore(store);
      const active = await getActiveTemplate();
      expect(active).toBeNull();
    });
  });

  describe("setActiveTemplateId", () => {
    it("should update the active template", async () => {
      const t1 = await createTemplate("A");
      const t2 = await createTemplate("B");
      expect((await loadStore()).activeTemplateId).toBe(t1.id);
      await setActiveTemplateId(t2.id);
      expect((await loadStore()).activeTemplateId).toBe(t2.id);
    });
  });

  describe("theme", () => {
    it("should default to system", async () => {
      expect(await getTheme()).toBe("system");
    });

    it("should fallback to system when theme is empty string", async () => {
      storage.hooky = { templates: [], activeTemplateId: null, theme: "" };
      expect(await getTheme()).toBe("system");
    });

    it("should save and retrieve theme setting", async () => {
      await setTheme("dark");
      expect(await getTheme()).toBe("dark");
      await setTheme("light");
      expect(await getTheme()).toBe("light");
      await setTheme("system");
      expect(await getTheme()).toBe("system");
    });
  });

  describe("quickSendRules", () => {
    it("should default to empty array", async () => {
      const rules = await getQuickSendRules();
      expect(rules).toEqual([]);
    });

    it("should add a rule with generated id", async () => {
      const rule = await addQuickSendRule({
        field: "url",
        operator: "contains",
        value: "github.com",
        templateId: "tpl_1",
      });
      expect(rule.id).toBeDefined();
      expect(rule.field).toBe("url");
      expect(rule.operator).toBe("contains");
      expect(rule.value).toBe("github.com");
      expect(rule.templateId).toBe("tpl_1");
      expect(rule.enabled).toBe(true);

      const rules = await getQuickSendRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(rule.id);
    });

    it("should add multiple rules in order", async () => {
      await addQuickSendRule({ field: "url", operator: "contains", value: "github.com", templateId: "tpl_1" });
      await addQuickSendRule({ field: "title", operator: "contains", value: "PR", templateId: "tpl_2" });
      const rules = await getQuickSendRules();
      expect(rules).toHaveLength(2);
      expect(rules[0].value).toBe("github.com");
      expect(rules[1].value).toBe("PR");
    });

    it("should update a rule by id", async () => {
      const rule = await addQuickSendRule({ field: "url", operator: "contains", value: "github.com", templateId: "tpl_1" });
      await updateQuickSendRule(rule.id, { value: "gitlab.com", operator: "startsWith" });
      const rules = await getQuickSendRules();
      expect(rules[0].value).toBe("gitlab.com");
      expect(rules[0].operator).toBe("startsWith");
      expect(rules[0].field).toBe("url"); // unchanged
    });

    it("should throw when updating non-existent rule", async () => {
      await expect(updateQuickSendRule("nonexistent", { value: "x" })).rejects.toThrow("Rule not found");
    });

    it("should delete a rule by id", async () => {
      const r1 = await addQuickSendRule({ field: "url", operator: "contains", value: "github.com", templateId: "tpl_1" });
      const r2 = await addQuickSendRule({ field: "url", operator: "contains", value: "gitlab.com", templateId: "tpl_2" });
      await deleteQuickSendRule(r1.id);
      const rules = await getQuickSendRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(r2.id);
    });

    it("should reorder rules by id array", async () => {
      const r1 = await addQuickSendRule({ field: "url", operator: "contains", value: "a.com", templateId: "tpl_1" });
      const r2 = await addQuickSendRule({ field: "url", operator: "contains", value: "b.com", templateId: "tpl_2" });
      const r3 = await addQuickSendRule({ field: "url", operator: "contains", value: "c.com", templateId: "tpl_3" });
      await reorderQuickSendRules([r3.id, r1.id, r2.id]);
      const rules = await getQuickSendRules();
      expect(rules[0].value).toBe("c.com");
      expect(rules[1].value).toBe("a.com");
      expect(rules[2].value).toBe("b.com");
    });

    it("should clean up rules when a template is deleted", async () => {
      const tpl = await createTemplate("Test");
      await addQuickSendRule({ field: "url", operator: "contains", value: "github.com", templateId: tpl.id });
      await addQuickSendRule({ field: "url", operator: "contains", value: "gitlab.com", templateId: "other_tpl" });
      await deleteTemplate(tpl.id);
      const rules = await getQuickSendRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].templateId).toBe("other_tpl");
    });

    it("should not clean up rules when a different template is deleted", async () => {
      const t1 = await createTemplate("A");
      const t2 = await createTemplate("B");
      await addQuickSendRule({ field: "url", operator: "contains", value: "github.com", templateId: t1.id });
      await deleteTemplate(t2.id);
      const rules = await getQuickSendRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].templateId).toBe(t1.id);
    });

    it("should handle deleteTemplate when quickSendRules is undefined", async () => {
      const tpl = await createTemplate("Test");
      // Manually remove quickSendRules from store to trigger the falsy branch
      const store = storage.hooky;
      delete store.quickSendRules;
      storage.hooky = store;

      await deleteTemplate(tpl.id);
      const result = await loadStore();
      expect(result.templates).toHaveLength(0);
    });
  });

  describe("migrateFromLegacy", () => {
    it("should migrate single webhook config to templates", async () => {
      storage.webhook = {
        url: "https://old.com/hook",
        method: "POST",
        params: [{ key: "x", value: "y" }],
      };

      await migrateFromLegacy();
      const store = await loadStore();

      expect(store.templates).toHaveLength(1);
      expect(store.templates[0].url).toBe("https://old.com/hook");
      expect(store.templates[0].method).toBe("POST");
      expect(store.templates[0].params).toEqual([{ key: "x", value: "y" }]);
      expect(store.activeTemplateId).toBe(store.templates[0].id);
    });

    it("should not migrate if templates already exist", async () => {
      const tpl = await createTemplate("Existing");
      storage.webhook = {
        url: "https://old.com/hook",
        method: "POST",
        params: [],
      };
      await migrateFromLegacy();
      const store = await loadStore();
      expect(store.templates).toHaveLength(1);
      expect(store.templates[0].id).toBe(tpl.id);
    });

    it("should skip migration when no legacy data", async () => {
      await migrateFromLegacy();
      const store = await loadStore();
      expect(store.templates).toHaveLength(0);
    });

    it("should handle legacy data with missing fields", async () => {
      storage.webhook = {
        url: undefined,
        // method, params, quickSend all missing
      };

      await migrateFromLegacy();
      const store = await loadStore();

      expect(store.templates).toHaveLength(1);
      expect(store.templates[0].url).toBe("");
      expect(store.templates[0].method).toBe("POST");
      expect(store.templates[0].params).toEqual([]);
    });
  });
});
