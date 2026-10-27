export const DEFAULT_MODEL_PROVIDER = "hypaai";

export interface ProviderModel {
  name: string;
  default?: boolean;
}

export type ProviderMap<TModel extends ProviderModel = ProviderModel> = Record<
  string,
  TModel[]
>;

export function getProviderModelsFromProviderMap<TModel extends ProviderModel>(
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

export function resolveDefaultModelFromProviderMap<
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
