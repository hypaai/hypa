// @ts-nocheck
import { alternateCaseForms, keyboardAlphabetRowsByCode, keyboardAlternatePopupsByCode } from './keyboard-layouts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEYBOARD_LAYOUT_READY_CODES,
  LANGUAGE_INFO_BY_CODE,
  LANGUAGE_INFO_BY_NAME,
  LEGACY_LANGUAGE_CODES,
} from '@hypa/config/language-metadata';
import { DEFAULT_MODEL_PROVIDER } from '@hypa/config/settings-resolvers';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appRoot, '../..');
const outputFile = path.join(appRoot, 'ios/Hypa Intelligence/KeyboardLanguageCatalog.swift');

import { PRODUCT_MODEL_OPTIONS_BY_CAPABILITY as modelsConfig } from "@hypa/config/models";
const languageInfoByName = LANGUAGE_INFO_BY_NAME;
const languageInfoByCode = LANGUAGE_INFO_BY_CODE;
const legacyCodes = LEGACY_LANGUAGE_CODES;

const configuredLayoutCodes = [...KEYBOARD_LAYOUT_READY_CODES].sort();
const generatedLayoutCodes = Object.keys(keyboardAlphabetRowsByCode).sort();
if (configuredLayoutCodes.join(',') !== generatedLayoutCodes.join(',')) {
  throw new Error(
    `KEYBOARD_LAYOUT_READY_CODES (${configuredLayoutCodes.join(', ')}) must match ` +
      `keyboardAlphabetRowsByCode (${generatedLayoutCodes.join(', ')})`
  );
}

const unique = (values) => [...new Set(values.filter(Boolean))];
const swiftString = (value) =>
  JSON.stringify(String(value ?? ''))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const modelsInGroup = (groupName) =>
  Object.values(modelsConfig[groupName] ?? {}).flatMap((models) => models ?? []);

const defaultModel = (groupName, providerName) =>
  (modelsConfig[groupName]?.[providerName] ?? []).find((model) => model.default) ??
  (modelsConfig[groupName]?.[providerName] ?? [])[0] ??
  modelsInGroup(groupName)[0];

const languageCodesForModel = (model) => {
  if (!model) return [];
  if (Array.isArray(model.languageCodes) && model.languageCodes.length > 0) {
    return unique(
      model.languageCodes.map((code) => languageInfoByCode[String(code).toLowerCase()]?.code)
    );
  }
  return unique(
    (model.languages ?? []).map(
      (name) => languageInfoByName[String(name).trim().toLowerCase()]?.code
    )
  );
};

const sortLanguagesByName = (languages) =>
  [...languages].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

const languagesFromCodes = (codes) =>
  sortLanguagesByName(
    unique(codes)
      .map((code) => languageInfoByCode[code])
      .filter(Boolean)
  );

const languageCodesByModel = {};
const translationLanguageCodesByModel = {};
const dictionaryLanguageCodesByModel = {};
for (const model of modelsInGroup('AC')) {
  const codes = languageCodesForModel(model);
  dictionaryLanguageCodesByModel[model.name] = codes;
  languageCodesByModel[model.name] = codes;
}
for (const model of modelsInGroup('MT')) {
  const codes = languageCodesForModel(model);
  translationLanguageCodesByModel[model.name] = codes;
  languageCodesByModel[model.name] = codes;
}

const sttLanguageCodesByModel = {};
for (const model of modelsInGroup('ASR')) {
  sttLanguageCodesByModel[model.name] = languageCodesForModel(model);
}

const ttsLanguageCodesByModel = {};
const voicesByModelAndCode = {};
for (const model of modelsInGroup('TTS')) {
  const codes = languageCodesForModel(model);
  ttsLanguageCodesByModel[model.name] = codes;
  voicesByModelAndCode[model.name] = {};
  for (const [languageName, voices] of Object.entries(model.voices ?? {})) {
    const code = languageInfoByName[languageName.toLowerCase()]?.code;
    if (code) voicesByModelAndCode[model.name][code] = voices;
  }
}

const defaultProviderName = DEFAULT_MODEL_PROVIDER;
const serviceGroupNames = ['MT', 'AC', 'TTS', 'ASR'];
const modelNamesByServiceAndProvider = Object.fromEntries(
  serviceGroupNames.map((groupName) => [
    groupName,
    Object.fromEntries(
      Object.entries(modelsConfig[groupName] ?? {}).map(([providerName, models]) => [
        providerName,
        (models ?? []).map((model) => model.name),
      ])
    ),
  ])
);

const fallbackModel = (groupName) => modelsConfig[groupName]?.[defaultProviderName]?.[0];
const defaultTranslationModel = fallbackModel('MT');
const defaultDictionaryModel = fallbackModel('AC');
const defaultTtsModel = fallbackModel('TTS');
const defaultSttModel = fallbackModel('ASR');

for (const [groupName, model] of [
  ['MT', defaultTranslationModel],
  ['AC', defaultDictionaryModel],
  ['TTS', defaultTtsModel],
  ['ASR', defaultSttModel],
]) {
  if (!model) {
    throw new Error(
      `models.json must define at least one ${defaultProviderName} ${groupName} model`
    );
  }
}
const defaultTranslationCodes = languageCodesForModel(defaultTranslationModel);
const defaultTtsCodes = languageCodesForModel(defaultTtsModel);
const defaultSttCodes = languageCodesForModel(defaultSttModel);
const defaultTranslationModelName = defaultTranslationModel?.name ?? "";
const defaultDictionaryModelName = defaultTranslationModelName;
const defaultTtsModelName = defaultTtsModel?.name ?? "";
const defaultSttModelName = defaultSttModel?.name ?? "";

const allLanguageCodes = unique([
  ...Object.values(languageCodesByModel).flat(),
  ...Object.values(sttLanguageCodesByModel).flat(),
  ...Object.values(ttsLanguageCodesByModel).flat(),
]);

const allLanguages = languagesFromCodes(allLanguageCodes);
const defaultSourceLanguage = languageInfoByCode.en ?? allLanguages[0];
const defaultTargetLanguage =
  languageInfoByCode.yo ??
  allLanguages.find((language) => language.code !== defaultSourceLanguage.code) ??
  defaultSourceLanguage;
const defaultDictionaryLanguage = defaultSourceLanguage;

const defaultVoice =
  voicesByModelAndCode[defaultTtsModel?.name]?.[defaultSourceLanguage.code]?.[0] ??
  voicesByModelAndCode[defaultTtsModel?.name]?.[defaultTargetLanguage.code]?.[0] ??
  '';

const renderLanguage = (language) =>
  `TranslationLanguage(code: ${swiftString(language.code)}, name: ${swiftString(language.name)})`;

const renderCodeList = (codes) =>
  `[\n${codes.map((code) => `      ${swiftString(code)},`).join('\n')}\n    ]`;

const renderStringList = (values) => `[${values.map(swiftString).join(', ')}]`;
const renderRows = (rows) => `[${rows.map(renderStringList).join(', ')}]`;

const renderModelCodeMap = (values) =>
  Object.entries(values)
    .map(([model, codes]) => `    ${swiftString(model)}: ${renderCodeList(codes)},`)
    .join('\n');

const renderSwiftServiceProviderModels = () =>
  Object.entries(modelNamesByServiceAndProvider)
    .map(([service, providers]) => {
      const rows = Object.entries(providers)
        .map(([provider, models]) => `      ${swiftString(provider)}: ${renderStringList(models)},`)
        .join('\n');
      return `    ${swiftString(service)}: [\n${rows}\n    ],`;
    })
    .join('\n');

const renderVoiceMap = () =>
  Object.entries(voicesByModelAndCode)
    .map(([model, voicesByCode]) => {
      const rows = Object.entries(voicesByCode)
        .map(([code, voices]) => `      ${swiftString(code)}: ${renderStringList(voices)},`)
        .join('\n');
      return `    ${swiftString(model)}: [\n${rows}\n    ],`;
    })
    .join('\n');

const renderKeyboardAlphabetRows = () =>
  Object.entries(keyboardAlphabetRowsByCode)
    .map(([code, rows]) => `    ${swiftString(code)}: ${renderRows(rows)},`)
    .join('\n');

const renderKeyboardAlternatePopups = () =>
  Object.entries(keyboardAlternatePopupsByCode)
    .map(([code, keyMap]) => {
      const rows = Object.entries(keyMap)
        .map(([key, values]) => `      ${swiftString(key)}: ${renderStringList(values)},`)
        .join('\n');
      return `    ${swiftString(code)}: [\n${rows}\n    ],`;
    })
    .join('\n');

const swift = `import Foundation

enum KeyboardLanguageCatalog {
  struct ServiceModelSelection {
    let provider: String
    let model: String
  }

  static let defaultProviderName = ${swiftString(defaultProviderName)}
  static let defaultTranslationModelName = ${swiftString(defaultTranslationModel?.name)}
  static let defaultDictionaryModelName = ${swiftString(defaultDictionaryModel?.name)}
  static let defaultTtsModelName = ${swiftString(defaultTtsModel?.name)}
  static let defaultSttModelName = ${swiftString(defaultSttModel?.name)}
  static let defaultSourceLanguage = ${renderLanguage(defaultSourceLanguage)}
  static let defaultTargetLanguage = ${renderLanguage(defaultTargetLanguage)}
  static let defaultDictionaryLanguage = ${renderLanguage(defaultDictionaryLanguage)}
  static let autoDetect = TranslationLanguage(code: "auto", name: "Auto-Detect")
  static let defaultVoice = ${swiftString(defaultVoice)}

  static let allLanguages: [TranslationLanguage] = [
${allLanguages.map((language) => `    ${renderLanguage(language)},`).join('\n')}
  ]

  static let translationLanguages = languages(codes: ${renderCodeList(defaultTranslationCodes)})
  static let sttLanguages = [autoDetect] + languages(codes: ${renderCodeList(defaultSttCodes)})

  private static let translationLanguageCodesByModel: [String: [String]] = [
${renderModelCodeMap(translationLanguageCodesByModel)}
  ]

  private static let dictionaryLanguageCodesByModel: [String: [String]] = [
${renderModelCodeMap(dictionaryLanguageCodesByModel)}
  ]

  private static let languageCodesByModel: [String: [String]] = [
${renderModelCodeMap(languageCodesByModel)}
  ]

  private static let sttLanguageCodesByModel: [String: [String]] = [
${renderModelCodeMap(sttLanguageCodesByModel)}
  ]

  private static let ttsLanguageCodesByModel: [String: [String]] = [
${renderModelCodeMap(ttsLanguageCodesByModel)}
  ]

  private static let voicesByModelAndCode: [String: [String: [String]]] = [
${renderVoiceMap()}
  ]

  private static let keyboardAlphabetRowsByCode: [String: [[String]]] = [
${renderKeyboardAlphabetRows()}
  ]

  private static let keyboardAlternatePopupsByCode: [String: [String: [String]]] = [
${renderKeyboardAlternatePopups()}
  ]

  private static let legacyCodes: [String: String] = [
${Object.entries(legacyCodes)
  .map(([from, to]) => `    ${swiftString(from)}: ${swiftString(to)},`)
  .join('\n')}
  ]

  static func canonicalCode(_ code: String) -> String {
    let normalized = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return legacyCodes[normalized] ?? normalized
  }

  static func language(code: String) -> TranslationLanguage? {
    let canonical = canonicalCode(code)
    if canonical == autoDetect.code { return autoDetect }
    return allLanguages.first { $0.code == canonical }
  }

  static func language(name: String) -> TranslationLanguage? {
    if name.caseInsensitiveCompare(autoDetect.name) == .orderedSame
      || name.caseInsensitiveCompare("Auto Detect") == .orderedSame
    {
      return autoDetect
    }
    return allLanguages.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
  }

  static func languages(model: String) -> [TranslationLanguage] {
    let selected = languages(codes: translationLanguageCodesByModel[model] ?? languageCodesByModel[model] ?? ${renderCodeList(defaultTranslationCodes)})
    return selected.isEmpty ? translationLanguages : selected
  }

  static func translationSourceLanguages(model: String) -> [TranslationLanguage] {
    [autoDetect] + languages(model: model)
  }

  static func translationTargetLanguages(model: String) -> [TranslationLanguage] {
    languages(model: model)
  }

  static func keyboardLayoutLanguages(model: String) -> [TranslationLanguage] {
    languages(model: model)
  }

  static func dictionaryLanguages(model: String) -> [TranslationLanguage] {
    let selected = languages(codes: dictionaryLanguageCodesByModel[model] ?? languageCodesByModel[model] ?? ${renderCodeList(defaultTranslationCodes)})
    return selected.isEmpty ? translationLanguages : selected
  }

  static func sttLanguages(model: String) -> [TranslationLanguage] {
    let selected = languages(codes: sttLanguageCodesByModel[model] ?? ${renderCodeList(defaultSttCodes)})
    return [autoDetect] + (selected.isEmpty ? languages(codes: ${renderCodeList(defaultSttCodes)}) : selected)
  }

  static func ttsLanguages(model: String) -> [TranslationLanguage] {
    let selected = languages(codes: ttsLanguageCodesByModel[model] ?? ${renderCodeList(defaultTtsCodes)})
    return selected.isEmpty ? languages(codes: ${renderCodeList(defaultTtsCodes)}) : selected
  }

  static func voices(languageCode: String, model: String) -> [String] {
    voicesByModelAndCode[model]?[canonicalCode(languageCode)] ?? []
  }

  static func ttsVoices(languageCode: String, model: String) -> [String] {
    let availableVoices = voices(languageCode: languageCode, model: model)
    if !availableVoices.isEmpty { return availableVoices }
    for language in ttsLanguages(model: model) {
      let fallbackVoices = voices(languageCode: language.code, model: model)
      if !fallbackVoices.isEmpty { return fallbackVoices }
    }
    return []
  }

  static func voices(languageCode: String) -> [String] {
    ttsVoices(languageCode: languageCode, model: defaultTtsModelName)
  }

  static func voices(languageName: String) -> [String] {
    guard let language = language(name: languageName) else { return [] }
    return voices(languageCode: language.code)
  }

  static func alphabetRows(languageCode: String) -> [[String]] {
    keyboardAlphabetRowsByCode[canonicalCode(languageCode)] ?? keyboardAlphabetRowsByCode["en"] ?? []
  }

  static func hasCustomLayout(languageCode: String) -> Bool {
    keyboardAlphabetRowsByCode[canonicalCode(languageCode)] != nil
  }

  private static let modelNamesByServiceAndProvider: [String: [String: [String]]] = [
${renderSwiftServiceProviderModels()}
  ]

  static func resolveServiceModel(
    service: String,
    selectedProvider: String,
    selectedModel: String
  ) -> ServiceModelSelection {
    let provider = selectedProvider.trimmingCharacters(in: .whitespacesAndNewlines)
    let model = selectedModel.trimmingCharacters(in: .whitespacesAndNewlines)
    let providerModels = modelNamesByServiceAndProvider[service]?[provider] ?? []
    if !providerModels.isEmpty {
      return ServiceModelSelection(
        provider: provider,
        model: providerModels.contains(model) ? model : providerModels[0])
    }
    let fallbackModels = modelNamesByServiceAndProvider[service]?[defaultProviderName] ?? []
    return ServiceModelSelection(provider: defaultProviderName, model: fallbackModels[0])
  }

  static func resolveTranslation(
    selectedProvider: String,
    selectedModel: String
  ) -> ServiceModelSelection {
    resolveServiceModel(service: "MT", selectedProvider: selectedProvider, selectedModel: selectedModel)
  }

  static func resolveDictionary(
    selectedProvider: String,
    selectedModel: String
  ) -> ServiceModelSelection {
    resolveServiceModel(service: "AC", selectedProvider: selectedProvider, selectedModel: selectedModel)
  }

  static func resolveTts(
    selectedProvider: String,
    selectedModel: String
  ) -> ServiceModelSelection {
    resolveServiceModel(service: "TTS", selectedProvider: selectedProvider, selectedModel: selectedModel)
  }

  static func resolveStt(
    selectedProvider: String,
    selectedModel: String
  ) -> ServiceModelSelection {
    resolveServiceModel(service: "ASR", selectedProvider: selectedProvider, selectedModel: selectedModel)
  }

  private static let alternateCaseForms: [String: [String]] = [
${Object.entries(alternateCaseForms).map(([key, forms]) => `    ${swiftString(key)}: ${renderStringList(forms)},`).join('\n')}
  ]

  static func alternateKeys(languageCode: String, key: String, shifted: Bool = false, capsLocked: Bool = false) -> [String] {
    let canonicalLanguage = canonicalCode(languageCode)
    let canonicalKey = key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let variants = keyboardAlternatePopupsByCode[canonicalLanguage]?[canonicalKey] ?? []
    guard shifted || capsLocked else { return variants }
    return variants.map { alternateCaseForms[$0]![capsLocked ? 1 : 0] }
  }

  private static func languages(codes: [String]) -> [TranslationLanguage] {
    codes.compactMap(language(code:)).sorted {
      $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
  }
}
`;

const kotlinString = (value) => JSON.stringify(String(value ?? ''));

const renderKotlinCodeList = (codes) =>
  `listOf(${codes.map((code) => kotlinString(code)).join(', ')})`;

const renderKotlinLanguage = (language) =>
  `TranslationLanguage(${kotlinString(language.code)}, ${kotlinString(language.name)})`;

const renderKotlinModelCodeMap = (values) =>
  Object.entries(values)
    .map(([model, codes]) => `    ${kotlinString(model)} to ${renderKotlinCodeList(codes)},`)
    .join('\n');

const renderKotlinServiceProviderModels = () =>
  Object.entries(modelNamesByServiceAndProvider)
    .map(([service, providers]) => {
      const rows = Object.entries(providers)
        .map(
          ([provider, models]) =>
            `      ${kotlinString(provider)} to listOf(${models.map(kotlinString).join(', ')}),`
        )
        .join('\n');
      return `    ${kotlinString(service)} to mapOf(\n${rows}\n    ),`;
    })
    .join('\n');

const renderKotlinVoiceMap = () =>
  Object.entries(voicesByModelAndCode)
    .map(([model, voicesByCode]) => {
      const rows = Object.entries(voicesByCode)
        .map(
          ([code, voices]) =>
            `      ${kotlinString(code)} to listOf(${voices.map(kotlinString).join(', ')}),`
        )
        .join('\n');
      return `    ${kotlinString(model)} to mapOf(\n${rows}\n    ),`;
    })
    .join('\n');

const renderKotlinAlphabetRows = () =>
  Object.entries(keyboardAlphabetRowsByCode)
    .map(([code, rows]) => {
      const renderedRows = rows
        .map((row) => `listOf(${row.map(kotlinString).join(', ')})`)
        .join(', ');
      return `    ${kotlinString(code)} to listOf(${renderedRows}),`;
    })
    .join('\n');

const renderKotlinAlternatePopups = () =>
  Object.entries(keyboardAlternatePopupsByCode)
    .map(([code, keyMap]) => {
      const rows = Object.entries(keyMap)
        .map(
          ([key, values]) =>
            `      ${kotlinString(key)} to listOf(${values.map(kotlinString).join(', ')}),`
        )
        .join('\n');
      return `    ${kotlinString(code)} to mapOf(\n${rows}\n    ),`;
    })
    .join('\n');

const kotlin = `package com.hypaintelligence.hypaintelligence

object KeyboardLanguageCatalog {
  data class ServiceModelSelection(val provider: String, val model: String)

  val defaultProviderName = ${kotlinString(defaultProviderName)}
  val defaultTranslationModelName = ${kotlinString(defaultTranslationModel?.name)}
  val defaultDictionaryModelName = ${kotlinString(defaultDictionaryModel?.name)}
  val defaultTtsModelName = ${kotlinString(defaultTtsModel?.name)}
  val defaultSttModelName = ${kotlinString(defaultSttModel?.name)}
  val defaultSourceLanguage = ${renderKotlinLanguage(defaultSourceLanguage)}
  val defaultTargetLanguage = ${renderKotlinLanguage(defaultTargetLanguage)}
  val defaultDictionaryLanguage = ${renderKotlinLanguage(defaultDictionaryLanguage)}
  val autoDetect = TranslationLanguage("auto", "Auto-Detect")
  val defaultVoice = ${kotlinString(defaultVoice)}

  val allLanguages: List<TranslationLanguage> = listOf(
${allLanguages.map((language) => `    ${renderKotlinLanguage(language)},`).join('\n')}
  )

  private val translationLanguageCodesByModel: Map<String, List<String>> = mapOf(
${renderKotlinModelCodeMap(translationLanguageCodesByModel)}
  )

  private val dictionaryLanguageCodesByModel: Map<String, List<String>> = mapOf(
${renderKotlinModelCodeMap(dictionaryLanguageCodesByModel)}
  )

  private val languageCodesByModel: Map<String, List<String>> = mapOf(
${renderKotlinModelCodeMap(languageCodesByModel)}
  )

  private val sttLanguageCodesByModel: Map<String, List<String>> = mapOf(
${renderKotlinModelCodeMap(sttLanguageCodesByModel)}
  )

  private val ttsLanguageCodesByModel: Map<String, List<String>> = mapOf(
${renderKotlinModelCodeMap(ttsLanguageCodesByModel)}
  )

  private val voicesByModelAndCode: Map<String, Map<String, List<String>>> = mapOf(
${renderKotlinVoiceMap()}
  )

  private val keyboardAlphabetRowsByCode: Map<String, List<List<String>>> = mapOf(
${renderKotlinAlphabetRows()}
  )

  private val keyboardAlternatePopupsByCode: Map<String, Map<String, List<String>>> = mapOf(
${renderKotlinAlternatePopups()}
  )

  private val legacyCodes: Map<String, String> = mapOf(
${Object.entries(legacyCodes)
  .map(([from, to]) => `    ${kotlinString(from)} to ${kotlinString(to)},`)
  .join('\n')}
  )

  fun canonicalCode(code: String): String {
    val normalized = code.trim().lowercase()
    return legacyCodes[normalized] ?: normalized
  }

  fun language(code: String): TranslationLanguage? {
    val canonical = canonicalCode(code)
    if (canonical == autoDetect.code) return autoDetect
    return allLanguages.firstOrNull { it.code.equals(canonical, ignoreCase = true) }
  }

  fun languageByName(name: String): TranslationLanguage? {
    if (
      name.equals(autoDetect.name, ignoreCase = true) ||
        name.equals("Auto Detect", ignoreCase = true)
    ) {
      return autoDetect
    }
    return allLanguages.firstOrNull { it.name.equals(name, ignoreCase = true) }
  }

  fun languages(model: String): List<TranslationLanguage> {
    val codes =
      translationLanguageCodesByModel[model]
        ?: languageCodesByModel[model]
        ?: ${renderKotlinCodeList(defaultTranslationCodes)}
    val selected = languagesFromCodes(codes)
    return selected.ifEmpty { languagesFromCodes(${renderKotlinCodeList(defaultTranslationCodes)}) }
  }

  fun translationSourceLanguages(model: String): List<TranslationLanguage> =
    listOf(autoDetect) + languages(model)

  fun translationTargetLanguages(model: String): List<TranslationLanguage> = languages(model)

  fun keyboardLayoutLanguages(model: String): List<TranslationLanguage> = languages(model)

  fun dictionaryLanguages(model: String): List<TranslationLanguage> {
    val codes =
      dictionaryLanguageCodesByModel[model]
        ?: languageCodesByModel[model]
        ?: ${renderKotlinCodeList(defaultTranslationCodes)}
    val selected = languagesFromCodes(codes)
    return selected.ifEmpty { languagesFromCodes(${renderKotlinCodeList(defaultTranslationCodes)}) }
  }

  fun sttLanguages(model: String): List<TranslationLanguage> {
    val codes = sttLanguageCodesByModel[model] ?: ${renderKotlinCodeList(defaultSttCodes)}
    val selected = languagesFromCodes(codes)
    return listOf(autoDetect) +
      selected.ifEmpty { languagesFromCodes(${renderKotlinCodeList(defaultSttCodes)}) }
  }

  fun ttsLanguages(model: String): List<TranslationLanguage> {
    val codes = ttsLanguageCodesByModel[model] ?: ${renderKotlinCodeList(defaultTtsCodes)}
    val selected = languagesFromCodes(codes)
    return selected.ifEmpty { languagesFromCodes(${renderKotlinCodeList(defaultTtsCodes)}) }
  }

  fun voices(languageCode: String, model: String): List<String> =
    voicesByModelAndCode[model]?.get(canonicalCode(languageCode)).orEmpty()

  fun ttsVoices(languageCode: String, model: String): List<String> {
    val available = voices(languageCode, model)
    if (available.isNotEmpty()) return available
    for (language in ttsLanguages(model)) {
      val fallback = voices(language.code, model)
      if (fallback.isNotEmpty()) return fallback
    }
    return emptyList()
  }

  fun alphabetRows(languageCode: String): List<List<String>> =
    keyboardAlphabetRowsByCode[canonicalCode(languageCode)]
      ?: keyboardAlphabetRowsByCode["en"]
      ?: emptyList()

  fun hasCustomLayout(languageCode: String): Boolean =
    keyboardAlphabetRowsByCode.containsKey(canonicalCode(languageCode))

  private val modelNamesByServiceAndProvider: Map<String, Map<String, List<String>>> = mapOf(
${renderKotlinServiceProviderModels()}
  )

  fun resolveServiceModel(
    service: String,
    selectedProvider: String,
    selectedModel: String,
  ): ServiceModelSelection {
    val provider = selectedProvider.trim()
    val model = selectedModel.trim()
    val providerModels = modelNamesByServiceAndProvider[service]?.get(provider).orEmpty()
    if (providerModels.isNotEmpty()) {
      return ServiceModelSelection(
        provider,
        if (providerModels.contains(model)) model else providerModels.first(),
      )
    }
    val fallbackModels = modelNamesByServiceAndProvider[service]?.get(defaultProviderName).orEmpty()
    return ServiceModelSelection(defaultProviderName, fallbackModels.first())
  }

  fun resolveTranslation(selectedProvider: String, selectedModel: String): ServiceModelSelection =
    resolveServiceModel("MT", selectedProvider, selectedModel)

  fun resolveDictionary(selectedProvider: String, selectedModel: String): ServiceModelSelection =
    resolveServiceModel("AC", selectedProvider, selectedModel)

  fun resolveTts(selectedProvider: String, selectedModel: String): ServiceModelSelection =
    resolveServiceModel("TTS", selectedProvider, selectedModel)

  fun resolveStt(selectedProvider: String, selectedModel: String): ServiceModelSelection =
    resolveServiceModel("ASR", selectedProvider, selectedModel)

  private val alternateCaseForms: Map<String, List<String>> = mapOf(
${Object.entries(alternateCaseForms).map(([key, forms]) => `    ${kotlinString(key)} to listOf(${forms.map(kotlinString).join(', ')}),`).join('\n')}
  )

  fun alternateKeys(languageCode: String, key: String, shifted: Boolean = false, capsLocked: Boolean = false): List<String> {
    val canonicalLanguage = canonicalCode(languageCode)
    val canonicalKey = key.trim().lowercase()
    val variants = keyboardAlternatePopupsByCode[canonicalLanguage]?.get(canonicalKey).orEmpty()
    return if (shifted || capsLocked) variants.map { alternateCaseForms.getValue(it)[if (capsLocked) 1 else 0] } else variants
  }

  fun languageName(code: String): String =
    language(code)?.name
      ?: if (canonicalCode(code) == autoDetect.code) autoDetect.name else code

  private fun languagesFromCodes(codes: List<String>): List<TranslationLanguage> =
    codes.mapNotNull(::language).sortedBy { it.name.lowercase() }
}
`;

const androidOutputFile = path.join(
  appRoot,
  'android/app/src/main/java/com/hypaintelligence/hypaintelligence/KeyboardLanguageCatalog.kt'
);

const storageSwiftOutputFile = path.join(
  appRoot,
  'n-modules/hypa-keyboard-storage/ios/HypaKeyboardGeneratedDefaults.swift'
);
const storageSwift = `enum HypaKeyboardGeneratedDefaults {
  static let provider = ${swiftString(defaultProviderName)}
  static let translationModel = ${swiftString(defaultTranslationModel?.name)}
  static let dictionaryModel = ${swiftString(defaultDictionaryModel?.name)}
  static let ttsModel = ${swiftString(defaultTtsModel?.name)}
  static let sttModel = ${swiftString(defaultSttModel?.name)}
  static let voice = ${swiftString(defaultVoice)}
  static let translateSourceLanguage = "Auto-Detect"
}
`;

const storageKotlinOutputFile = path.join(
  appRoot,
  'n-modules/hypa-keyboard-storage/android/src/main/java/expo/modules/hypakeyboardstorage/HypaKeyboardGeneratedDefaults.kt'
);
const storageKotlin = `package expo.modules.hypakeyboardstorage

object HypaKeyboardGeneratedDefaults {
  const val provider = ${kotlinString(defaultProviderName)}
  const val translationModel = ${kotlinString(defaultTranslationModel?.name)}
  const val dictionaryModel = ${kotlinString(defaultDictionaryModel?.name)}
  const val ttsModel = ${kotlinString(defaultTtsModel?.name)}
  const val sttModel = ${kotlinString(defaultSttModel?.name)}
  const val voice = ${kotlinString(defaultVoice)}
  const val translateSourceLanguage = "Auto-Detect"
}
`;

fs.writeFileSync(outputFile, swift);
fs.writeFileSync(androidOutputFile, kotlin);
fs.writeFileSync(storageSwiftOutputFile, storageSwift);
fs.writeFileSync(storageKotlinOutputFile, storageKotlin);
console.log(`Wrote ${path.relative(repoRoot, outputFile)}`);
console.log(`Wrote ${path.relative(repoRoot, androidOutputFile)}`);
console.log(`Wrote ${path.relative(repoRoot, storageSwiftOutputFile)}`);
console.log(`Wrote ${path.relative(repoRoot, storageKotlinOutputFile)}`);
