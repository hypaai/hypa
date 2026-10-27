"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const { AndroidConfig, createRunOncePlugin, withAndroidManifest, withDangerousMod, } = require('@expo/config-plugins');
const PLUGIN_NAME = 'hypa-keyboard-android-ime';
const DEFAULT_CLASS = 'HypaKeyboardInputMethodService';
const FILE_PROVIDER_AUTHORITY = '${applicationId}.fileprovider';
const KEYBOARD_NAME_STRING = '  <string name="keyboard_name">Hypa Keyboard</string>\n';
const METHOD_XML = `<?xml version="1.0" encoding="utf-8"?>
<input-method xmlns:android="http://schemas.android.com/apk/res/android"
    android:supportsSwitchingToNextInputMethod="true">
    <subtype
        android:label="@string/keyboard_name"
        android:imeSubtypeLocale="en_US"
        android:imeSubtypeMode="keyboard" />
</input-method>
`;
const CLIP_PREFS_FILE = 'hypa_keyboard_clips.xml';
const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="sharedpref" path="${CLIP_PREFS_FILE}" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="sharedpref" path="${CLIP_PREFS_FILE}" />
  </device-transfer>
</data-extraction-rules>
`;
const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="sharedpref" path="${CLIP_PREFS_FILE}" />
</full-backup-content>
`;
async function ensureKeyboardNameString(valuesDir) {
    const stringsPath = node_path_1.default.join(valuesDir, 'strings.xml');
    let content;
    try {
        content = await promises_1.default.readFile(stringsPath, 'utf8');
    }
    catch {
        content = `<resources>\n${KEYBOARD_NAME_STRING}</resources>\n`;
        await promises_1.default.writeFile(stringsPath, content, 'utf8');
        return;
    }
    if (content.includes('name="keyboard_name"')) {
        return;
    }
    const updated = content.includes('</resources>')
        ? content.replace('</resources>', `${KEYBOARD_NAME_STRING}</resources>`)
        : `<resources>\n${KEYBOARD_NAME_STRING}</resources>\n`;
    await promises_1.default.writeFile(stringsPath, updated, 'utf8');
}
const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="shared_audio" path="." />
</paths>
`;
function hasFileProvider(providers) {
    if (!providers?.length) {
        return false;
    }
    return providers.some((provider) => provider.$['android:authorities'] === FILE_PROVIDER_AUTHORITY);
}
function hasImeService(services, className) {
    if (!services?.length) {
        return false;
    }
    const suffix = `.${className}`;
    return services.some((svc) => {
        const name = svc.$['android:name'];
        if (!name) {
            return false;
        }
        return name === `.${className}` || name.endsWith(suffix);
    });
}
const withAndroidImeNativeSources = (config) => {
    return withDangerousMod(config, [
        'android',
        async (cfg) => {
            if (cfg.modRequest.introspect) {
                return cfg;
            }
            if (!cfg.android?.package) {
                throw new Error(`${PLUGIN_NAME}: expo.android.package is required to install the IME.`);
            }
            const androidRoot = cfg.modRequest.platformProjectRoot;
            const resDir = node_path_1.default.join(androidRoot, 'app', 'src', 'main', 'res');
            const xmlDir = node_path_1.default.join(resDir, 'xml');
            const valuesDir = node_path_1.default.join(resDir, 'values');
            const methodPath = node_path_1.default.join(xmlDir, 'method.xml');
            const filePathsPath = node_path_1.default.join(xmlDir, 'file_paths.xml');
            await promises_1.default.mkdir(xmlDir, { recursive: true });
            await ensureKeyboardNameString(valuesDir);
            await promises_1.default.writeFile(methodPath, METHOD_XML, 'utf8');
            await promises_1.default.writeFile(filePathsPath, FILE_PATHS_XML, 'utf8');
            await promises_1.default.writeFile(node_path_1.default.join(xmlDir, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES_XML, 'utf8');
            await promises_1.default.writeFile(node_path_1.default.join(xmlDir, 'backup_rules.xml'), BACKUP_RULES_XML, 'utf8');
            return cfg;
        },
    ]);
};
const withAndroidImeManifest = (config, props) => {
    const className = (props ?? {}).serviceClassName ?? DEFAULT_CLASS;
    return withAndroidManifest(config, (cfg) => {
        const manifest = cfg.modResults;
        const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
        mainApplication.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
        mainApplication.$['android:fullBackupContent'] = '@xml/backup_rules';
        const providers = mainApplication.provider ?? [];
        if (!hasFileProvider(providers)) {
            mainApplication.provider = [
                ...providers,
                {
                    $: {
                        'android:name': 'androidx.core.content.FileProvider',
                        'android:authorities': FILE_PROVIDER_AUTHORITY,
                        'android:exported': 'false',
                        'android:grantUriPermissions': 'true',
                    },
                    'meta-data': [
                        {
                            $: {
                                'android:name': 'android.support.FILE_PROVIDER_PATHS',
                                'android:resource': '@xml/file_paths',
                            },
                        },
                    ],
                },
            ];
        }
        const services = mainApplication.service ?? [];
        const imeServiceLabel = '@string/keyboard_name';
        if (hasImeService(services, className)) {
            mainApplication.service = services.map((service) => {
                const attrs = service.$;
                const name = attrs['android:name'];
                if (!name) {
                    return service;
                }
                const isImeService = name === `.${className}` || name.endsWith(`.${className}`);
                if (!isImeService || attrs['android:label']) {
                    return service;
                }
                attrs['android:label'] = imeServiceLabel;
                return service;
            });
            return cfg;
        }
        const imeService = {
            $: {
                'android:name': `.${className}`,
                'android:label': imeServiceLabel,
                'android:permission': 'android.permission.BIND_INPUT_METHOD',
                'android:exported': 'true',
            },
            'intent-filter': [
                {
                    action: [{ $: { 'android:name': 'android.view.InputMethod' } }],
                },
            ],
            'meta-data': [
                {
                    $: {
                        'android:name': 'android.view.im',
                        'android:resource': '@xml/method',
                    },
                },
            ],
        };
        mainApplication.service = [...services, imeService];
        return cfg;
    });
};
const withAndroidImeKeyboardImpl = (config, props) => {
    config = withAndroidImeNativeSources(config, props);
    config = withAndroidImeManifest(config, props);
    return config;
};
const withAndroidImeKeyboard = createRunOncePlugin(withAndroidImeKeyboardImpl, PLUGIN_NAME, '1.0.0');
const withNModules = (config, props) => {
    return withAndroidImeKeyboard(config, props ?? {});
};
module.exports = withNModules;
