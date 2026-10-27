import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const modelsDir = fileURLToPath(new URL('../models/', import.meta.url));
const MODEL_REPO = 'hypaai/hypa-tiny-keys';
const MODEL_COMMIT = '075762b3dd0421ae2696392073c764a0655cd982';
const SOURCE_FILE = 'model-source.json';
const MODEL_FILE = 'model.int8.onnx';
const TOKENIZER_FILE = 'tokenizer.json';
const REQUIRED_TOKENS = {
  '<|begin_of_text|>': undefined,
  '<|start_header_id|>': undefined,
  '<|end_header_id|>': undefined,
  '<|eot_id|>': 5,
} as const;

async function isCurrent() {
  try {
    const source = JSON.parse(await readFile(join(modelsDir, SOURCE_FILE), 'utf8'));
    await access(join(modelsDir, MODEL_FILE));
    return source.repo === MODEL_REPO && source.commit === MODEL_COMMIT;
  } catch {
    return false;
  }
}

async function main() {
  if (await isCurrent()) return;

  const headers: Record<string, string> = process.env.HF_TOKEN
    ? { Authorization: `Bearer ${process.env.HF_TOKEN}` }
    : {};
  const base = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_COMMIT}`;
  async function get(name: string) {
    const response = await fetch(`${base}/${name}`, { headers });
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} (${base}/${name})`);
    return response;
  }

  console.log(`Downloading Tiny Keys from ${MODEL_REPO}@${MODEL_COMMIT}...`);
  const [tokenizer, model] = await Promise.all([
    get(TOKENIZER_FILE).then((response) => response.json()),
    get(MODEL_FILE).then((response) => response.arrayBuffer()),
  ]);

  const tokenIds = new Map<string, number>(
    tokenizer.added_tokens.map((token: { content: string; id: number }) => [token.content, token.id]),
  );
  for (const [token, expectedId] of Object.entries(REQUIRED_TOKENS)) {
    const id = tokenIds.get(token);
    if (id === undefined) throw new Error(`Missing prompt token: ${token}`);
    if (expectedId !== undefined && id !== expectedId) {
      throw new Error(`${token} is ${id}, the keyboards expect ${expectedId}.`);
    }
  }

  await mkdir(modelsDir, { recursive: true });
  const staging = await mkdtemp(join(modelsDir, '.download-'));
  try {
    const files: Record<string, string | Uint8Array> = {
      [TOKENIZER_FILE]: `${JSON.stringify(tokenizer, null, 2)}\n`,
      [MODEL_FILE]: new Uint8Array(model),
      [SOURCE_FILE]: `${JSON.stringify({ repo: MODEL_REPO, commit: MODEL_COMMIT }, null, 2)}\n`,
    };
    for (const [name, data] of Object.entries(files)) await writeFile(join(staging, name), data);
    for (const name of Object.keys(files)) await rename(join(staging, name), join(modelsDir, name));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`Updated Tiny Keys from ${MODEL_REPO}@${MODEL_COMMIT}.`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
