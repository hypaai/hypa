#!/bin/sh

set -eu

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
project_root="${PROJECT_DIR:+${PROJECT_DIR}/..}"
project_root="${project_root:-${script_dir}/..}"
env_file="${project_root}/.env"
target_build_dir="${TARGET_BUILD_DIR:-/tmp/hypa-keyboard-build}"
resources_folder="${UNLOCALIZED_RESOURCES_FOLDER_PATH:-Hypa Keyboard.appex}"
output_dir="${target_build_dir}/${resources_folder}"
output_file="${output_dir}/HypaEnvironment.plist"
api_base_url="${EXPO_PUBLIC_API_BASE_URL:-}"

if [ -z "${api_base_url}" ] && [ -f "${env_file}" ]; then
  api_base_url="$(
    sed -n 's/^[[:space:]]*EXPO_PUBLIC_API_BASE_URL[[:space:]]*=[[:space:]]*//p' "${env_file}" \
      | tail -n 1 \
      | sed 's/[[:space:]]*#.*$//' \
      | tr -d "\"'"
  )"
fi

api_base_url="${api_base_url:-https://api.hypaintelligence.com}"
api_base_url="${api_base_url%/}"

language_catalog_script="${project_root}/scripts/generate-keyboard-language-catalog.ts"
tsx_bin="${project_root}/../../node_modules/.bin/tsx"
if [ -x "${tsx_bin}" ] && [ -f "${language_catalog_script}" ]; then
  "${tsx_bin}" "${language_catalog_script}"
elif command -v npx >/dev/null 2>&1 && [ -f "${language_catalog_script}" ]; then
  npx tsx "${language_catalog_script}"
fi

mkdir -p "${output_dir}"
plutil -create xml1 "${output_file}"
plutil -insert HypaAPIBaseURL -string "${api_base_url}" "${output_file}"
