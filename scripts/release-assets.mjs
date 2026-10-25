// GitHub sürümü için SHA256SUMS.txt ve RELEASE_NOTES.md üretir.
// Dosya adlarında sürüm yoktur; releases/latest/download/<ad> bağlantısı hep son sürümü indirir.
// drAW, drAW2D ve drAW3D aynı dosyayı kullanır; ad, sürüm ve depo package.json'dan okunur.
// Kullanım: node scripts/release-assets.mjs <paket-klasörü>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = process.argv[2];
if (!directory) {
    console.error("Kullanım: node scripts/release-assets.mjs <paket-klasörü>");
    process.exit(1);
}

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const name = manifest.build?.productName ?? manifest.productName;
const { version } = manifest;
const repository = String(manifest.repository?.url ?? manifest.repository ?? "")
    .match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
if (!name || !repository) {
    console.error("package.json içinde productName ve GitHub repository adresi olmalı.");
    process.exit(1);
}

const packages = [
    { file: `${name}-linux-x86_64.AppImage`, label: "AppImage", platform: "Linux x86_64" },
    { file: `${name}-linux-amd64.deb`, label: "DEB", platform: "Linux amd64" },
    { file: `${name}-win-x64.exe`, label: "exe", platform: "Windows x64" }
];
const [appImage, deb, exe] = packages.map(({ file }) => file);

// android/ klasörü olan projeler APK da yayımlar; en düşük Android sürümü projeden okunur.
const androidProject = new URL("../android/", import.meta.url);
const apk = existsSync(androidProject) ? `${name}-android.apk` : null;
let minSdk = 0;
if (apk) {
    packages.push({ file: apk, label: "APK", platform: "Android" });
    const variables = await readFile(new URL("variables.gradle", androidProject), "utf8").catch(() => "");
    minSdk = Number(variables.match(/minSdkVersion\s*=\s*(\d+)/)?.[1] ?? 0);
}
const ANDROID_RELEASES = { 23: "6.0", 24: "7.0", 25: "7.1", 26: "8.0", 27: "8.1", 28: "9", 29: "10", 30: "11", 31: "12", 32: "12L", 33: "13", 34: "14", 35: "15", 36: "16" };

const present = new Set(await readdir(directory));
const missing = packages.filter(({ file }) => !present.has(file)).map(({ file }) => file);
if (missing.length > 0) {
    console.error(`Eksik paket: ${missing.join(", ")}`);
    process.exit(1);
}

const sums = [];
const rows = [];
const sizes = {};
for (const item of packages) {
    const file = path.join(directory, item.file);
    const hash = createHash("sha256").update(await readFile(file)).digest("hex");
    sizes[item.file] = (await stat(file)).size;
    sums.push(`${hash}  ${item.file}`);
    rows.push(`| ${item.label} | ${item.platform} | ${sizes[item.file].toLocaleString("tr-TR")} bayt |`);
}
await writeFile(path.join(directory, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);

// Bağımlılıklar ve kurulu boyut paketin kendisinden okunur (dpkg-deb yoksa satırlar atlanır).
function debField(field) {
    try {
        return execFileSync("dpkg-deb", ["--field", path.join(directory, deb), field], { encoding: "utf8" }).trim();
    } catch {
        return "";
    }
}
const megabytes = (bytes) => Math.round(bytes / 1_000_000).toLocaleString("tr-TR");
const depends = debField("Depends");
const recommends = debField("Recommends");
const installedKb = Number(debField("Installed-Size"));
const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
const base = `https://github.com/${repository}`;

const notes = `${name} ${version} — Linux${apk ? ", Windows ve Android" : " ve Windows"} paketleri. Paketler ${date} tarihinde GitHub Actions ile hazırlandı.

| Paket | Platform / mimari | Dosya boyutu |
| --- | --- | --- |
${rows.join("\n")}

### Kalıcı indirme bağlantıları

Bu bağlantılar her zaman en son sürümü indirir:

${packages.map(({ file, label }) => `- **${label}:** ${base}/releases/latest/download/${file}`).join("\n")}

### Sistem gereksinimleri

- **Windows:** Windows 10 veya 11 (64-bit). Kurulum dosyası yaklaşık ${megabytes(sizes[exe])} MB.
- **Linux:** 64-bit x86_64; Debian/Ubuntu türevi dağıtım (Pardus gibi).${installedKb > 0 ? ` DEB kurulumu yaklaşık ${megabytes(installedKb * 1024)} MB,` : ""} AppImage yaklaşık ${megabytes(sizes[appImage])} MB yer kaplar.
${depends ? `- **DEB bağımlılıkları:** ${depends}${recommends ? ` (önerilen: ${recommends})` : ""}. Paket yöneticisi bunları otomatik kurar.\n` : ""}- **AppImage:** FUSE 2 gerektirir. Sistemde FUSE 2 yoksa \`./${appImage} --appimage-extract-and-run\` ile çalıştırılabilir.${apk ? `\n- **Android:** ${minSdk ? `Android ${ANDROID_RELEASES[minSdk] ?? `API ${minSdk}`} veya üstü` : "Android"} yüklü bir telefon veya tablet. APK yaklaşık ${megabytes(sizes[apk])} MB.` : ""}

### Kurulum

- **AppImage:** Dosyayı indirin, \`chmod +x ${appImage}\` ile çalıştırma izni verin ve açın.
- **DEB:** \`sudo apt install ./${deb}\` komutuyla veya dosyayı çift tıklayıp paket yöneticisiyle kurun.
${apk ? `- **APK (Android):** Dosyayı telefonda indirip açın. Uygulama Play Store dışından kurulduğu için Android "bilinmeyen uygulamaları yükleme" izni ister; tarayıcıya veya dosya yöneticisine bir kez izin verin. Sonraki sürümler aynı şekilde üzerine kurulur, çizimler silinmez.\n` : ""}- **exe:** Dosyayı indirip çalıştırın; yönlendirmeli kurulum açılır. Yönetici yetkisi gerekmez, masaüstü ve başlangıç menüsü kısayolları oluşturulur. Paket dijital imzalı olmadığı için Windows SmartScreen "bilinmeyen yayıncı" uyarısı gösterebilir; **Ek bilgi > Yine de çalıştır** ile devam edin.

### Dosya bütünlüğü

SHA-256 değerleri \`SHA256SUMS.txt\` dosyasındadır.

- **Linux:** \`sha256sum -c SHA256SUMS.txt\`
- **Windows (PowerShell):** \`Get-FileHash .\\${exe} -Algorithm SHA256\` çıktısını \`SHA256SUMS.txt\` ile karşılaştırın.

**Full Changelog**: ${base}/commits/v${version}
`;
await writeFile(path.join(directory, "RELEASE_NOTES.md"), notes);
console.log(`${name} ${version}: ${packages.length} paket, SHA256SUMS.txt ve RELEASE_NOTES.md hazır.`);
