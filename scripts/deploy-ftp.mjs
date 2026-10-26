// drAW3D'nin web sürümünü (dist/) FTPS ile madematik.com'a yükler: `npm run deploy`.
// Bağlantı bilgileri .env'de: FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD, FTP_REMOTE_DIR.
// Sıra: yeni/değişen dosyalar → index.html en son → sunucuda artık kullanılmayan dosyalar silinir.
// Böylece ziyaretçi yükleme sırasında yarım bir sürüm görmez.
// `npm run deploy -- --dry-run`: hiçbir şey yüklemeden/silmeden ne yapılacağını listeler.

import { Client } from "basic-ftp";
import "dotenv/config";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP_DIR = "drAW3D";
const dryRun = process.argv.includes("--dry-run");
const localDir = path.resolve("dist");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function env(name) {
  return process.env[name]?.trim() || fail(`.env içinde ${name} yok.`);
}

const host = env("FTP_HOST");
const port = Number(process.env.FTP_PORT || 21);
const user = env("FTP_USER");
const password = env("FTP_PASSWORD");
const remoteDir = env("FTP_REMOTE_DIR").replace(/\/+$/, "");
// Sunucu TLS desteklemiyorsa ("500 This security scheme is not implemented") .env'de FTP_SECURE=false.
const secure = process.env.FTP_SECURE?.trim() !== "false";

// Yanlış bir klasörü temizlememek için hedef yalnız drAW klasörü olabilir.
if (path.posix.basename(remoteDir) !== APP_DIR) {
  fail(`FTP_REMOTE_DIR "${remoteDir}" bir ${APP_DIR} klasörü değil; hiçbir şey yüklenmedi.`);
}
if (!existsSync(path.join(localDir, "index.html"))) {
  fail("dist/index.html yok; önce `npm run build` çalıştırın.");
}

/** dist/ içindeki dosyalar: göreli yol → boyut. */
function localFiles(dir = localDir, prefix = "") {
  const files = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [file, size] of localFiles(full, `${rel}/`)) files.set(file, size);
    } else {
      files.set(rel, statSync(full).size);
    }
  }
  return files;
}

/** Sunucudaki dosyalar (göreli yol → boyut) ve klasörler. */
async function remoteTree(client, dir, prefix = "", files = new Map(), dirs = []) {
  for (const item of await client.list(dir)) {
    if (item.name === "." || item.name === "..") continue;
    const rel = prefix + item.name;
    if (item.isDirectory) {
      dirs.push(rel);
      await remoteTree(client, `${dir}/${item.name}`, `${rel}/`, files, dirs);
    } else if (item.isFile) {
      files.set(rel, item.size);
    }
  }
  return { files, dirs };
}

function parentDirs(file) {
  const parts = file.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

// assets/ içindeki adlar içerik özeti taşır (Vite): aynı ad ve boyut varsa dosya aynıdır.
// Diğer dosyalar (index.html, img/…) küçüktür ve her seferinde yüklenir.
const isHashed = (file) => file.startsWith("assets/");
const isHidden = (file) => path.posix.basename(file).startsWith(".");

const client = new Client(30_000);

try {
  if (!secure) console.warn("! Şifresiz FTP (FTP_SECURE=false): parola ağda açık gider.");
  await client.access({ host, port, user, password, secure });
  // Klasör yoksa durur; yeni klasör açılmaz (yanlış yol uyarısı).
  await client.cd(remoteDir);
  const base = await client.pwd();

  const local = localFiles();
  const remote = await remoteTree(client, base);
  const localDirs = new Set([...local.keys()].flatMap(parentDirs));

  const upload = [...local]
    .filter(([file, size]) => !isHashed(file) || remote.files.get(file) !== size)
    .map(([file]) => file)
    .sort((a, b) => (a === "index.html") - (b === "index.html"));
  const stale = [...remote.files.keys()].filter((file) => !local.has(file));
  const remove = stale.filter((file) => !isHidden(file));
  const keep = stale.filter(isHidden);
  const newDirs = [...localDirs].filter((dir) => !remote.dirs.includes(dir)).sort((a, b) => a.length - b.length);
  const removeDirs = remote.dirs.filter((dir) => !localDirs.has(dir)).sort((a, b) => b.length - a.length);

  console.log(`Sunucu klasörü: ${host}${base}`);
  console.log(`Yüklenecek: ${upload.length} dosya, silinecek: ${remove.length} dosya, ${removeDirs.length} klasör`);
  if (keep.length) console.log(`Gizli dosyalara dokunulmayacak: ${keep.join(", ")}`);

  if (dryRun) {
    for (const file of upload) console.log(`  ↑ ${file}`);
    for (const file of remove) console.log(`  ✗ ${file}`);
    for (const dir of removeDirs) console.log(`  ✗ ${dir}/`);
    console.log("Deneme (--dry-run): hiçbir şey yüklenmedi ya da silinmedi.");
  } else {
    for (const dir of newDirs) await client.ensureDir(`${base}/${dir}`);
    await client.cd(base);
    for (const file of upload) {
      await client.uploadFrom(path.join(localDir, file), `${base}/${file}`);
      console.log(`  ↑ ${file}`);
    }
    for (const file of remove) {
      await client.remove(`${base}/${file}`);
      console.log(`  ✗ ${file}`);
    }
    for (const dir of removeDirs) {
      try {
        await client.removeEmptyDir(`${base}/${dir}`);
        console.log(`  ✗ ${dir}/`);
      } catch {
        console.warn(`  ! ${dir}/ boş değil, bırakıldı.`);
      }
    }
    console.log(`✓ ${APP_DIR} yüklendi: https://madematik.com${base}/`);
  }
} catch (error) {
  console.error("✗ FTP yükleme hatası:");
  console.error(error);
  if (secure && error?.code === 500) {
    console.error("Sunucu şifreli FTP'yi desteklemiyor olabilir; .env'ye FTP_SECURE=false ekleyip yeniden deneyin.");
  }
  process.exitCode = 1;
} finally {
  client.close();
}
