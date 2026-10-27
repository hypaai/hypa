import type { ConfigPlugin } from '@expo/config-plugins';
import type { ManifestApplication } from '@expo/config-plugins/build/android/Manifest';
import fs from 'node:fs/promises';
import path from 'node:path';

const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins') as typeof import('@expo/config-plugins');

const PLUGIN_NAME = 'hypa-keyboard-android-ime';
const DEFAULT_CLASS = 'HypaKeyboardInputMethodService';

export type AndroidImeKeyboardPluginProps = {
  serviceClassName?: string;
};

type ManifestServiceEntry = NonNullable<ManifestApplication['service']>[number];

type ManifestProviderEntry = {
  $: Record<string, string>;
  'meta-data'?: { $: Record<string, string> }[];
};
type ManifestApplicationWithProvider = ManifestApplication & {
  provider?: ManifestProviderEntry[];
};

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

async function ensureKeyboardNameString(valuesDir: string): Promise<void> {
  const stringsPath = path.join(valuesDir, 'strings.xml');
  let content: string;

  try {
    content = await fs.readFile(stringsPath, 'utf8');
  } catch {
    content = `<resources>\n${KEYBOARD_NAME_STRING}</resources>\n`;
    await fs.writeFile(stringsPath, content, 'utf8');
    return;
  }

  if (content.includes('name="keyboard_name"')) {
    return;
  }

  const updated = content.includes('</resources>')
    ? content.replace('</resources>', `${KEYBOARD_NAME_STRING}</resources>`)
    : `<resources>\n${KEYBOARD_NAME_STRING}</resources>\n`;

  await fs.writeFile(stringsPath, updated, 'utf8');
}

const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="shared_audio" path="." />
</paths>
`;

function hasFileProvider(providers: ManifestProviderEntry[] | undefined): boolean {
  if (!providers?.length) {
    return false;
  }
  return providers.some(
    (provider) => provider.$['android:authorities'] === FILE_PROVIDER_AUTHORITY,
  );
}

function hasImeService(
  services: ManifestApplication['service'],
  className: string,
): boolean {
  if (!services?.length) {
    return false;
  }
  const suffix = `.${className}`;
  return services.some((svc: ManifestServiceEntry) => {
    const name = svc.$['android:name'];
    if (!name) {
      return false;
    }
    return name === `.${className}` || name.endsWith(suffix);
  });
}

const withAndroidImeNativeSources: ConfigPlugin<AndroidImeKeyboardPluginProps | void> = (config) => {
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
      const resDir = path.join(androidRoot, 'app', 'src', 'main', 'res');
      const xmlDir = path.join(resDir, 'xml');
      const valuesDir = path.join(resDir, 'values');
      const methodPath = path.join(xmlDir, 'method.xml');
      const filePathsPath = path.join(xmlDir, 'file_paths.xml');

      await fs.mkdir(xmlDir, { recursive: true });
      await ensureKeyboardNameString(valuesDir);
      await fs.writeFile(methodPath, METHOD_XML, 'utf8');
      await fs.writeFile(filePathsPath, FILE_PATHS_XML, 'utf8');
      await fs.writeFile(
        path.join(xmlDir, 'data_extraction_rules.xml'),
        DATA_EXTRACTION_RULES_XML,
        'utf8',
      );
      await fs.writeFile(path.join(xmlDir, 'backup_rules.xml'), BACKUP_RULES_XML, 'utf8');

      return cfg;
    },
  ]);
};

const withAndroidImeManifest: ConfigPlugin<AndroidImeKeyboardPluginProps | void> = (
  config,
  props,
) => {
  const className = (props ?? {}).serviceClassName ?? DEFAULT_CLASS;

  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifest,
    ) as ManifestApplicationWithProvider;

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
      mainApplication.service = services.map((service: ManifestServiceEntry) => {
        const attrs = service.$ as Record<string, string>;
        const name = attrs['android:name'];
        if (!name) {
          return service;
        }

        const isImeService =
          name === `.${className}` || name.endsWith(`.${className}`);

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
        'android:exported': 'true' as const,
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

    mainApplication.service = [...services, imeService as ManifestServiceEntry];
    return cfg;
  });
};

const withAndroidImeKeyboardImpl: ConfigPlugin<AndroidImeKeyboardPluginProps | void> = (
  config,
  props,
) => {
  config = withAndroidImeNativeSources(config, props);
  config = withAndroidImeManifest(config, props);
  return config;
};

const withAndroidImeKeyboard = createRunOncePlugin(
  withAndroidImeKeyboardImpl,
  PLUGIN_NAME,
  '1.0.0',
);

const withNModules: ConfigPlugin<AndroidImeKeyboardPluginProps | void> = (config, props) => {
  return withAndroidImeKeyboard(config, props ?? {});
};

module.exports = withNModules;
