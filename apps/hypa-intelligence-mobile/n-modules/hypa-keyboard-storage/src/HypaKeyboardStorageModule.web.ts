const memoryKey = 'hypa_keyboard_store.settings_json';
const sharedStoreKey = 'hypa_keyboard_store.shared_store_json';

const emptySharedStoreJson = '{"version":1,"updatedAt":0,"entries":{},"lexicon":[]}';

const defaultJson =
  '{"languageId":"en","appearance":"system","themeDark":{"surface":"#1A1A1A","toolbar":"#515151","key":"#515151","keyPressed":"#444444","label":"#FFFFFF","accent":"#515151","pill":"#FFFFFF","pillLabel":"#111111"},"themeLight":{"surface":"#D1D5DB","toolbar":"#FFFFFF","key":"#FFFFFF","keyPressed":"#E5E7EB","label":"#111111","accent":"#6B7280","pill":"#111111","pillLabel":"#FFFFFF"},"predictiveBarEnabled":true,"autocorrectEnabled":true,"hapticsEnabled":true,"popupPreviewEnabled":true}';

export function getSettingsJson(): string {
  if (typeof localStorage === 'undefined') {
    return defaultJson;
  }
  return localStorage.getItem(memoryKey) ?? defaultJson;
}

export async function setSettingsJson(json: string): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(memoryKey, json);
  }
}

export function addSettingsChangedListener(): { remove: () => void } {
  return { remove: () => {} };
}

export function getSharedStoreJson(): string {
  if (typeof localStorage === 'undefined') {
    return emptySharedStoreJson;
  }
  return localStorage.getItem(sharedStoreKey) ?? emptySharedStoreJson;
}

export async function setSharedStoreJson(json: string): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(sharedStoreKey, json);
  }
}

export function addSharedStoreChangedListener(): { remove: () => void } {
  return { remove: () => {} };
}

const webStub = {
  getSettingsJson,
  setSettingsJson,
  getSharedStoreJson,
  setSharedStoreJson,
  addListener: () => ({ remove: () => {} }),
};

export default webStub;
