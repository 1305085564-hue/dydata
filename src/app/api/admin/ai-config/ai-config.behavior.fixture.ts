import { NextRequest } from "next/server";

export type Row = Record<string, unknown>;
export type TableName = "ai_providers" | "ai_provider_keys" | "ai_provider_key_models" | "ai_feature_bindings" | "audit_logs";

export type MemoryOptions = {
  failUpdate?: TableName;
  failRpc?: string;
};

class MemoryQuery implements PromiseLike<{ data: Row[] | Row | null; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private singleMode: "many" | "single" | "maybeSingle" = "many";
  private limitValue: number | null = null;

  constructor(
    private readonly db: MemorySupabase,
    private readonly table: TableName,
  ) {}

  select(columns?: string) {
    this.operation = "select";
    if (columns) this.db.selectCalls.push(`${this.table}:${columns}`);
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push((row) => row[field] !== value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  or(expression: string) {
    const alternatives = expression.split(",").map((clause) => {
      const [field, operator, rawValue] = clause.split(".");
      if (operator !== "eq") return () => false;
      return (row: Row) => String(row[field]) === rawValue;
    });
    this.filters.push((row) => alternatives.some((match) => match(row)));
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  then<TResult1 = { data: Row[] | Row | null; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    try {
      const result = this.execute();
      return Promise.resolve(result).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }

  private execute() {
    const rows = this.db.tables[this.table];
    const matches = () => rows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.operation === "select") {
      const selected = matches().slice(0, this.limitValue ?? Number.POSITIVE_INFINITY).map((row) => ({ ...row }));
      if (this.singleMode === "single") {
        return { data: selected[0] ?? null, error: selected.length === 1 ? null : { message: "expected one row" } };
      }
      if (this.singleMode === "maybeSingle") return { data: selected[0] ?? null, error: null };
      return { data: selected, error: null };
    }

    if (this.operation === "insert") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const inserted = input.map((row, index) => ({
        ...row,
        id: row.id ?? `${this.table}-generated-${this.db.nextId++}-${index}`,
      }));
      rows.push(...inserted);
      return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
    }

    const matchingRows = matches();
    if (this.operation === "update") {
      if (this.db.options.failUpdate === this.table) {
        this.db.options.failUpdate = undefined;
        return { data: null, error: { message: `simulated ${this.table} update failure` } };
      }
      for (const row of matchingRows) Object.assign(row, this.payload ?? {});
      return { data: matchingRows, error: null };
    }

    const deletedIds = new Set(matchingRows.map((row) => row.id));
    this.db.tables[this.table] = rows.filter((row) => !deletedIds.has(row.id));
    this.db.cascade(this.table, matchingRows);
    return { data: null, error: null };
  }
}

export class MemorySupabase {
  nextId = 1;
  readonly selectCalls: string[] = [];
  readonly rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  readonly tables: Record<TableName, Row[]>;
  readonly options: MemoryOptions;

  constructor(input: Partial<Record<TableName, Row[]>> = {}, options: MemoryOptions = {}) {
    this.tables = {
      ai_providers: (input.ai_providers ?? []).map((row) => ({ ...row })),
      ai_provider_keys: (input.ai_provider_keys ?? []).map((row) => ({ ...row })),
      ai_provider_key_models: (input.ai_provider_key_models ?? []).map((row) => ({ ...row })),
      ai_feature_bindings: (input.ai_feature_bindings ?? []).map((row) => ({ ...row })),
      audit_logs: (input.audit_logs ?? []).map((row) => ({ ...row })),
    };
    this.options = options;
  }

  from(table: TableName) {
    return new MemoryQuery(this, table);
  }

  async rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args: { ...args } });
    if (this.options.failRpc === fn) {
      this.options.failRpc = undefined;
      return { data: null, error: { message: `simulated ${fn} RPC failure` } };
    }

    const nextId = (prefix: string) => `${prefix}-generated-${this.nextId++}`;
    if (fn === "sync_ai_config_models") {
      const keyId = String(args.p_key_id ?? "");
      const key = this.tables.ai_provider_keys.find((row) => row.id === keyId);
      if (!key) return { data: null, error: { message: "key not found" } };

      const availableModels = Array.isArray(args.p_available_models)
        ? [...new Set(args.p_available_models.map(String))]
        : [];
      const availableModelIds = new Set(availableModels);
      const payloadModels = Array.isArray(args.p_models) ? args.p_models as Row[] : [];
      key.available_models = availableModels;

      for (const model of payloadModels) {
        const modelId = String(model.model_id ?? "");
        if (!modelId) continue;
        const existing = this.tables.ai_provider_key_models.find((row) => row.key_id === keyId && row.model_id === modelId);
        if (!existing) {
          this.tables.ai_provider_key_models.push({
            id: nextId("supply"),
            key_id: keyId,
            model_id: modelId,
            display_name: model.display_name,
            is_enabled: false,
          });
          continue;
        }
        if (typeof model.display_name === "string" && model.display_name &&
          (!existing.display_name || existing.display_name === modelId)) {
          existing.display_name = model.display_name;
        }
      }

      if (args.p_verified === true) {
        key.invalidated_at = null;
        key.unhealthy_until = null;
        for (const model of this.tables.ai_provider_key_models) {
          if (model.key_id === keyId && availableModelIds.has(String(model.model_id))) {
            model.invalidated_at = null;
            model.unhealthy_until = null;
          }
        }
      }
      return { data: null, error: null };
    }

    if (fn === "create_ai_config_channel") {
      const providerId = typeof args.p_provider_id === "string" ? args.p_provider_id : nextId("provider");
      const keyId = nextId("key");
      const providerExists = this.tables.ai_providers.some((row) => row.id === providerId);
      if (typeof args.p_provider_id !== "string") {
        this.tables.ai_providers.push({
          id: providerId,
          name: args.p_provider_name,
          base_url: args.p_base_url,
          is_enabled: true,
        });
      } else if (!providerExists) {
        return { data: null, error: { message: "provider not found" } };
      }

      this.tables.ai_provider_keys.push({
        id: keyId,
        provider_id: providerId,
        label: args.p_label,
        api_key: args.p_api_key,
        available_models: args.p_available_models,
        is_enabled: args.p_enabled,
      });
      const modelRows = Array.isArray(args.p_models) ? args.p_models as Row[] : [];
      for (const model of modelRows) {
        this.tables.ai_provider_key_models.push({
          id: nextId("supply"),
          key_id: keyId,
          model_id: model.model_id,
          display_name: model.display_name,
          is_enabled: model.is_enabled,
        });
      }
      return { data: { keyId, providerId, affectedCount: modelRows.length }, error: null };
    }

    if (fn === "set_ai_channel_model_selection") {
      const keyId = String(args.p_key_id ?? "");
      const selectedIds = new Set(Array.isArray(args.p_model_ids) ? args.p_model_ids.map(String) : []);
      const displayNames = args.p_display_names && typeof args.p_display_names === "object"
        ? args.p_display_names as Record<string, unknown>
        : {};
      const existingRows = this.tables.ai_provider_key_models.filter((row) => row.key_id === keyId);
      let created = 0;
      let disabled = 0;
      for (const modelId of selectedIds) {
        const existing = existingRows.find((row) => row.model_id === modelId);
        if (existing) {
          existing.is_enabled = true;
          if (Object.prototype.hasOwnProperty.call(existing, "disabled_by_model")) existing.disabled_by_model = false;
          if (typeof displayNames[modelId] === "string") existing.display_name = displayNames[modelId];
        } else {
          this.tables.ai_provider_key_models.push({
            id: nextId("supply"), key_id: keyId, model_id: modelId,
            display_name: typeof displayNames[modelId] === "string" ? displayNames[modelId] : modelId,
            is_enabled: true,
          });
          created += 1;
        }
      }
      for (const row of existingRows) {
        if (selectedIds.has(String(row.model_id)) || row.is_enabled === false) continue;
        row.is_enabled = false;
        if (Object.prototype.hasOwnProperty.call(row, "disabled_by_model")) row.disabled_by_model = false;
        disabled += 1;
      }
      return { data: { created, disabled, removed: 0 }, error: null };
    }

    if (fn === "update_ai_config_model") {
      const supplyId = String(args.p_supply_id ?? "");
      const patch = args.p_patch && typeof args.p_patch === "object" ? args.p_patch as Row : {};
      const target = this.tables.ai_provider_key_models.find((row) => row.id === supplyId);
      if (!target) return { data: null, error: { message: "supply not found" } };
      const affectedRows = patch.display_name !== undefined
        ? this.tables.ai_provider_key_models.filter((row) => row.model_id === target.model_id)
        : [target];
      for (const row of affectedRows) {
        if (patch.display_name !== undefined) row.display_name = patch.display_name;
      }
      for (const field of ["is_enabled", "key_id"] as const) {
        if (patch[field] !== undefined) target[field] = patch[field];
      }
      if (patch.is_enabled !== undefined && Object.prototype.hasOwnProperty.call(target, "disabled_by_model")) {
        target.disabled_by_model = false;
      }
      return { data: { affectedCount: affectedRows.length }, error: null };
    }

    if (fn === "update_ai_config_key") {
      const keyId = String(args.p_key_id ?? "");
      const key = this.tables.ai_provider_keys.find((row) => row.id === keyId);
      if (!key) return { data: null, error: { message: "key not found" } };
      const patch = args.p_patch && typeof args.p_patch === "object" ? args.p_patch as Row : {};
      const provider = typeof args.p_base_url === "string"
        ? this.tables.ai_providers.find((row) => row.id === key.provider_id)
        : undefined;
      if (typeof args.p_base_url === "string" && !provider) {
        return { data: null, error: { message: "provider not found" } };
      }
      Object.assign(key, patch);
      if (typeof args.p_base_url === "string") {
        provider!.base_url = args.p_base_url;
      }
      return { data: null, error: null };
    }

    if (fn === "remove_ai_config_supply_with_audit") {
      const supplyId = String(args.p_supply_id ?? "");
      const supplyIndex = this.tables.ai_provider_key_models.findIndex((row) => row.id === supplyId);
      if (supplyIndex < 0) return { data: null, error: { message: "supply not found" } };
      this.tables.ai_provider_key_models.splice(supplyIndex, 1);
      this.tables.audit_logs.push({
        id: nextId("audit"),
        user_id: args.p_actor_id,
        action: "ai_provider_model_remove",
        target: supplyId,
        detail: args.p_audit_detail,
      });
      return { data: null, error: null };
    }

    if (fn === "enable_ai_config_supply") {
      const keyId = String(args.p_key_id ?? "");
      const modelId = String(args.p_model_id ?? "");
      let supply = this.tables.ai_provider_key_models.find((row) => row.key_id === keyId && row.model_id === modelId);
      if (supply) {
        supply.is_enabled = true;
        if (Object.prototype.hasOwnProperty.call(supply, "disabled_by_model")) supply.disabled_by_model = false;
      } else {
        supply = {
          id: nextId("supply"), key_id: keyId, model_id: modelId,
          display_name: args.p_display_name, is_enabled: true,
        };
        this.tables.ai_provider_key_models.push(supply);
      }
      const key = this.tables.ai_provider_keys.find((row) => row.id === keyId);
      if (key) Object.assign(key, {
        consecutive_failures: 0, first_failure_at: null, last_failure_at: null,
        last_error_message: null, invalidated_at: null, unhealthy_until: null, manual_sleep_until: null,
        last_success_at: new Date().toISOString(),
      });
      Object.assign(supply, {
        consecutive_failures: 0, first_failure_at: null, last_failure_at: null,
        last_error_message: null, last_failure_scope: null, invalidated_at: null, unhealthy_until: null,
        last_success_at: new Date().toISOString(),
      });
      return { data: supply.id, error: null };
    }

    return { data: null, error: { message: `unhandled RPC ${fn}` } };
  }

  cascade(table: TableName, rows: Row[]) {
    if (table === "ai_providers") {
      const providerIds = new Set(rows.map((row) => row.id));
      const keyRows = this.tables.ai_provider_keys.filter((row) => providerIds.has(row.provider_id));
      this.tables.ai_provider_keys = this.tables.ai_provider_keys.filter((row) => !providerIds.has(row.provider_id));
      const keyIds = new Set(keyRows.map((row) => row.id));
      this.tables.ai_provider_key_models = this.tables.ai_provider_key_models.filter((row) => !keyIds.has(row.key_id));
    }
    if (table === "ai_provider_keys") {
      const keyIds = new Set(rows.map((row) => row.id));
      this.tables.ai_provider_key_models = this.tables.ai_provider_key_models.filter((row) => !keyIds.has(row.key_id));
    }
  }
}

export function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function actor(db: MemorySupabase) {
  return {
    requireSystemActor: async () => ({
      supabase: db as never,
      actor: { userId: "admin-1", role: "owner" } as never,
    }),
    createAdminClient: () => db as never,
  };
}

export function configTables(overrides: Partial<Record<TableName, Row[]>> = {}, options: MemoryOptions = {}) {
  return new MemorySupabase({
    ai_providers: [{ id: "provider-1", name: "Provider 1", base_url: "https://provider.test", priority: 1, is_enabled: true }],
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "key-1", api_key: "secret", priority: 1, is_enabled: true }],
    ai_provider_key_models: [],
    ai_feature_bindings: [],
    ...overrides,
  }, options);
}

export function dependencyScenario() {
  return configTables({
    ai_provider_key_models: [
      { id: "target-row", key_id: "key-1", model_id: "target-model", display_name: "目标模型", is_enabled: true, disabled_by_model: false },
      { id: "default-row", key_id: "key-1", model_id: "default-model", display_name: "默认模型", is_enabled: false, disabled_by_model: false },
      { id: "unrelated-row", key_id: "key-1", model_id: "unrelated-model", display_name: "其他模型", is_enabled: true, disabled_by_model: false },
    ],
    ai_feature_bindings: [
      { id: "default-binding", feature_key: "default", label: "全局默认", model_id: "default-model", provider_key_model_id: "unrelated-row", is_enabled: true, lifecycle_state: "active" },
      { id: "business-binding", feature_key: "content_analysis", label: "内容分析", model_id: "target-model", provider_key_model_id: "unrelated-row", is_enabled: true, lifecycle_state: "active" },
    ],
  });
}
