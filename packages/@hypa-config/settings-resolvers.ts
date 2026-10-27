export const DEFAULT_MODEL_PROVIDER = "hypaai";

interface ProviderModel {
  name: string;
  default?: boolean;
}

export type ProviderMap<TModel extends ProviderModel = ProviderModel> = Record<
  string,
  TModel[]
>;

function getProviderModelsFromProviderMap<TModel extends ProviderModel>(
  providerMap: ProviderMap<TModel> | undefined,
  provider = DEFAULT_MODEL_PROVIDER,
): TModel[] {
  if (!providerMap) return [];
  return providerMap[provider] ?? [];
}

export function flattenModelsFromProviderMap<TModel extends ProviderModel>(
  providerMap: ProviderMap<TModel> | undefined,
): TModel[] {
  if (!providerMap) return [];
  return Object.values(providerMap).flat();
}

export function resolveDefaultModelFromModels<TModel extends ProviderModel>(
  models: TModel[],
): TModel | undefined {
  return models.find((model) => model.default) ?? models[0];
}

function resolveDefaultModelFromProviderMap<
  TModel extends ProviderModel,
>(
  providerMap: ProviderMap<TModel> | undefined,
  provider = DEFAULT_MODEL_PROVIDER,
): TModel | undefined {
  return resolveDefaultModelFromModels(
    getProviderModelsFromProviderMap(providerMap, provider),
  );
}

export function resolveDefaultModelNameFromProviderMap<
  TModel extends ProviderModel,
>(
  providerMap: ProviderMap<TModel> | undefined,
  provider = DEFAULT_MODEL_PROVIDER,
): string {
  return resolveDefaultModelFromProviderMap(providerMap, provider)?.name ?? "";
}

export function resolveProviderForModelFromProviderMap<
  TModel extends ProviderModel,
>(
  providerMap: ProviderMap<TModel> | undefined,
  modelName: string,
  fallback = "hypaai",
): string {
  if (!providerMap || !modelName) return fallback;

  return (
    Object.entries(providerMap).find(([, models]) =>
      models.some((model) => model.name === modelName),
    )?.[0] ?? fallback
  );
}

